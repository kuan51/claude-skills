#!/usr/bin/env bash
# Self-test for the Prompting Vale style: bash test_prompting_style.sh
# In a throwaway directory using the tracked styles/Prompting rule files, each rule must flag its
# planted sentences and stay silent on the near misses. No `vale sync` is needed.
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/styles/Prompting"
cp "$ROOT"/styles/Prompting/*.yml "$T/styles/Prompting/"
cd "$T" || exit 2
printf 'StylesPath = styles\nMinAlertLevel = suggestion\n\n[*.md]\nBasedOnStyles = Prompting\n' > .vale.ini
fail=0
# check RULE EXPECT TEXT: EXPECT is "hit" or "none".
check() {
  printf '# Probe\n\n%s\n' "$3" > probe.md
  n=$(vale --output=line probe.md | grep -c "Prompting\.$1:")
  if { [ "$2" = hit ] && [ "$n" -ge 1 ]; } || { [ "$2" = none ] && [ "$n" -eq 0 ]; }; then
    echo "ok: $1 $2 on: $3"
  else
    echo "FAIL: $1 expected $2, got $n on: $3"; fail=1
  fi
}
check NegativeOnly hit 'Never push to master.'
check NegativeOnly hit 'Do not merge the branch.'
check NegativeOnly hit "Don't rebase the branch."
check NegativeOnly hit '- **Never commit secrets.** Keep them out of the diff.'
check NegativeOnly none 'You should never push to master.'
check NegativeOnly none 'Never push to master, and open a pull request instead.'
check NegativeOnly none 'Do not merge the branch rather than rebase it.'
for w in MUST NEVER ALWAYS CRITICAL IMPORTANT; do
  check CapsEmphasis hit "You $w read the file."
done
check CapsEmphasis none 'You must read the file.'
[ "$fail" -eq 0 ] && echo "PASS" || echo "FAIL"
exit "$fail"
