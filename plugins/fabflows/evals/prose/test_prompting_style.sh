#!/usr/bin/env bash
# Self-test for the Prompting Vale style: bash test_prompting_style.sh
# In a throwaway directory using the tracked styles/Prompting rule files, each rule must flag its
# planted sentences and stay silent on the near misses. Then the repository's own .vale.ini must
# apply the style to the fabflows agents and skills, keep the other styles there, and leave other
# Markdown alone. That half needs the synced packages: run `vale sync` first, as CI's Vale step does.
# The style is repository config, not part of the plugin, so this runs only from a checkout.
set -u
ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)
if [ -z "$ROOT" ] || [ ! -f "$ROOT/.vale.ini" ] || [ ! -d "$ROOT/styles/Prompting" ]; then
  echo "FAIL: run this from a claude-skills checkout, where the style is at styles/Prompting"
  exit 2
fi
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/styles/Prompting"
cp "$ROOT"/styles/Prompting/*.yml "$T/styles/Prompting/"
cd "$T" || exit 2
printf 'StylesPath = styles\nMinAlertLevel = suggestion\n\n[*.md]\nBasedOnStyles = Prompting\n' > .vale.ini
fail=0
# check RULE EXPECT TEXT: EXPECT is "hit" or "none". Every Prompting rule is a suggestion, so any
# non-zero exit is Vale failing, and a failure must not pass as a near miss.
check() {
  printf '# Probe\n\n%s\n' "$3" > probe.md
  out=$(vale --output=line probe.md); s=$?
  n=$(printf '%s\n' "$out" | grep -c "Prompting\.$1:")
  if [ "$s" -ne 0 ]; then
    echo "FAIL: vale exited $s on: $3: $out"; fail=1
  elif { [ "$2" = hit ] && [ "$n" -ge 1 ]; } || { [ "$2" = none ] && [ "$n" -eq 0 ]; }; then
    echo "ok: $1 $2 on: $3"
  else
    echo "FAIL: $1 expected $2, got $n on: $3"; fail=1
  fi
}
check NegativeOnly hit 'Never push to master.'
check NegativeOnly hit 'Do not merge the branch.'
check NegativeOnly hit "Don't rebase the branch."
check NegativeOnly hit 'Don’t rebase the branch.'
check NegativeOnly hit '- **Never commit secrets.** Keep them out of the diff.'
check NegativeOnly hit '**Never commit** unless your brief says so.'
check NegativeOnly hit 'Do NOT edit the file.'
check NegativeOnly hit 'DO NOT edit the file.'
check NegativeOnly hit "DON'T rebase the branch."
check NegativeOnly hit 'NEVER edit the file.'
check NegativeOnly hit $'Read it first. Do\nnot edit the file.'
check NegativeOnly hit $'- Never push to master.\n- Open a pull request instead.'
check NegativeOnly hit 'Never push. Wait for review. Then open a pull request instead.'
check NegativeOnly none 'You should never push to master.'
check NegativeOnly none $'Read the file, and you should\nnever skip it.'
check NegativeOnly none 'Never push to master, and open a pull request instead.'
check NegativeOnly none 'Do not merge the branch rather than rebase it.'
check NegativeOnly none $'Never push to master, and open a pull request\ninstead.'
check NegativeOnly none $'Never edit the original, rather\nthan the copy.'
check NegativeOnly none 'Never edit the file. Instead, open a ticket.'
check NegativeOnly none 'Never push to master. Open a pull request instead.'
check NegativeOnly none 'Never delete a file: use an inert stand-in.'
check NegativeOnly none 'Never push to master; use a pull request.'
check NegativeOnly none 'Never edit SKILL.md, and write a copy instead.'
check NegativeOnly none 'Never-ending loops are bad.'
for w in MUST NEVER ALWAYS CRITICAL IMPORTANT NOT ONLY STOP "DON'T" 'DON’T'; do
  check CapsEmphasis hit "You $w read the file."
done
check CapsEmphasis none 'You must read the file.'
check CapsEmphasis none 'The MUST-have list is short.'

# The repository's own .vale.ini on the same planted text at three paths. docs/probe.md is the
# baseline: no Prompting alert, and whatever the base styles report. Each fabflows path must get
# every rule in styles/Prompting and exactly the baseline's other alerts, so a rule missing from
# the section, or a section that swaps out the base styles, fails here.
mkdir -p real
{ printf 'StylesPath = %s\n' "$ROOT/styles"; grep -v '^StylesPath' "$ROOT/.vale.ini"; } > real/.vale.ini
# lint PATH: plant the probe at PATH and print its alerts as LINE:COL:RULE, or fail on a Vale error.
lint() {
  mkdir -p "real/$(dirname "$1")"
  printf '# Probe\n\nNever push to master, then merge. You MUST check it.\n' > "real/$1"
  out=$(cd real && vale --output=line "$1"); s=$?
  if [ "$s" -ge 2 ]; then echo "FAIL: vale exited $s with the real config on $1: $out" >&2; return 1; fi
  printf '%s\n' "$out" | cut -d: -f2-4 | sort
}
if ! base=$(lint docs/probe.md); then
  fail=1
elif printf '%s\n' "$base" | grep -q ':Prompting\.'; then
  echo "FAIL: real config applied Prompting to docs/probe.md"; fail=1
elif ! printf '%s\n' "$base" | grep -q ':Clarity\.'; then
  echo "FAIL: real config applied no base style to docs/probe.md: $base"; fail=1
else
  echo "ok: real config, base styles and no Prompting on: docs/probe.md"
fi
for f in plugins/fabflows/agents/probe.md plugins/fabflows/skills/probe/SKILL.md; do
  got=$(lint "$f") || { fail=1; continue; }
  missing=""
  for r in "$ROOT"/styles/Prompting/*.yml; do
    r=$(basename "$r" .yml)
    printf '%s\n' "$got" | grep -q ":Prompting\.$r\$" || missing="$missing $r"
  done
  if [ -n "$missing" ]; then
    echo "FAIL: real config on $f missed Prompting rule(s):$missing"; fail=1
  elif [ "$(printf '%s\n' "$got" | grep -v ':Prompting\.')" != "$base" ]; then
    echo "FAIL: real config on $f changed the base styles' alerts"; fail=1
  else
    echo "ok: real config, every Prompting rule and the same base styles on: $f"
  fi
done
[ "$fail" -eq 0 ] && echo "PASS" || echo "FAIL"
exit "$fail"
