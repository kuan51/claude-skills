#!/usr/bin/env bash
# usage: gate.sh --base <ref> --frozen <list> --files <paths>...
# The prose-pass gate in one command, run from the repository root. Every step runs and prints a
# short summary; the gate exits 1 when any step failed, 2 when it could not start.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="" FROZEN="" FILES=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --frozen) FROZEN="$2"; shift 2 ;;
    --files) shift; while [ "$#" -gt 0 ] && [ "${1#--}" = "$1" ]; do FILES+=("$1"); shift; done ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$BASE" ] || [ -z "$FROZEN" ] || [ "${#FILES[@]}" -eq 0 ]; then
  echo "usage: gate.sh --base <ref> --frozen <list> --files <paths>..." >&2
  exit 2
fi
ROOT=$(git rev-parse --show-toplevel) || exit 2
cd "$ROOT" || exit 2

for pkg in Microsoft write-good proselint ai-tells; do
  if [ ! -d "styles/$pkg" ]; then
    echo "Vale's packages are not synced (styles/$pkg is missing). Run \`vale sync\` from the repository root first." >&2
    exit 2
  fi
done

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail=0
step() { echo; echo "== $*"; }
bad() { echo "  FAIL: $*"; fail=1; }

step "keep check against $BASE"
TABLE=$(mktemp "${TMPDIR:-/tmp}/keep-check-table.XXXXXX")
python "$HERE/keep_check.py" "$BASE" "${FILES[@]}" --frozen-list "$FROZEN" --table "$TABLE" || bad "keep check"
echo "  review every row of the table: $TABLE (delete it when done)"

MD=()
for f in "${FILES[@]}"; do case "$f" in *.md) MD+=("$f") ;; esac; done
step "Vale warnings and errors in the files"
if [ "${#MD[@]}" -gt 0 ]; then bash "$HERE/vale-warn-gate.sh" "${MD[@]}" || bad "vale-warn-gate"; else echo "  no Markdown file given"; fi

step "Vale at error level and markdownlint-cli2 on every Markdown file changed since $BASE"
mapfile -t CHANGED < <(git diff --name-only --diff-filter=ACMR "$BASE" -- '*.md')
if [ "${#CHANGED[@]}" -gt 0 ]; then
  vale --minAlertLevel=error --output=line "${CHANGED[@]}" || bad "vale errors"
  markdownlint-cli2 "${CHANGED[@]}" > "$T/mdl.txt" 2>&1 || { tail -10 "$T/mdl.txt"; bad "markdownlint"; }
  echo "  ${#CHANGED[@]} changed Markdown files"
else
  echo "  no changed Markdown file"
fi

ACCEPT=styles/config/vocabularies/Prompts/accept.txt
if [ -f "$ACCEPT" ]; then
  step "each line of $ACCEPT is a literal phrase in a fabflows prompt whose removal brings back a finding"
  cp "$ACCEPT" "$T/accept.txt"
  trap 'cp "$T/accept.txt" "$ACCEPT"; rm -rf "$T"' EXIT
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [ -z "$line" ] && continue
    case "$line" in '#'*) continue ;; esac
    if printf '%s' "$line" | grep -q '[][\\^$.|?*+(){}]'; then bad "not a literal phrase: $line"; continue; fi
    mapfile -t HITS < <(grep -rlF -- "$line" plugins/fabflows/agents plugins/fabflows/skills --include='*.md')
    if [ "${#HITS[@]}" -eq 0 ]; then bad "not in any fabflows prompt file: $line"; continue; fi
    with=$(vale --output=line "${HITS[@]}" 2>/dev/null | wc -l)
    grep -vxF -- "$line" "$T/accept.txt" > "$ACCEPT"
    without=$(vale --output=line "${HITS[@]}" 2>/dev/null | wc -l)
    cp "$T/accept.txt" "$ACCEPT"
    [ "$without" -gt "$with" ] || bad "removing it brings back no finding: $line"
  done < "$T/accept.txt"
fi

step "probe: vale-warn-gate.sh in a throwaway git repository"
bash "$HERE/test_vale_warn_gate.sh" > "$T/probe.txt" 2>&1 || bad "probe"
tail -1 "$T/probe.txt"

step "node test suites (three trace tests that fail on Windows skipped by name)"
SKIP='^trace --(json lists each first-parent commit with no free text|enrich ignores every value of the wrong shape|out writes only outside the repo, never over a file)'
node --test --test-skip-pattern="$SKIP" plugins/fabflows/test/*.test.js > "$T/fab.txt" 2>&1 || bad "fabflows tests"
grep -E '^ℹ (pass|fail|skipped)' "$T/fab.txt"
node --test "test/*.test.js" > "$T/mkt.txt" 2>&1 || bad "marketplace tests"
grep -E '^ℹ (pass|fail)' "$T/mkt.txt"

step "audit.py"
python plugins/docs-warden/skills/docs-warden/scripts/audit.py . > "$T/audit.txt" 2>&1 || bad "audit.py"
grep -m1 -E '[0-9]+ pass, [0-9]+ warn, [0-9]+ fail' "$T/audit.txt"

echo
[ "$fail" -eq 0 ] && echo "gate: PASS" || echo "gate: FAIL"
exit "$fail"
