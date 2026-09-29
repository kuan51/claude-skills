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
for w in MUST NEVER ALWAYS CRITICAL IMPORTANT NOT ONLY STOP "DON'T"; do
  check CapsEmphasis hit "You $w read the file."
done
check CapsEmphasis none 'You must read the file.'
check CapsEmphasis none 'The MUST-have list is short.'

# wire PATH PROMPTING: the real .vale.ini on a planted file at PATH. PROMPTING is "hit" or "none";
# Clarity must fire either way, which shows the base styles still apply there.
mkdir -p real
sed "s|^StylesPath = .*|StylesPath = $ROOT/styles|" "$ROOT/.vale.ini" > real/.vale.ini
wire() {
  mkdir -p "real/$(dirname "$1")"
  printf '# Probe\n\nNever push to master, then merge.\n' > "real/$1"
  out=$(cd real && vale --output=line "$1"); s=$?
  p=$(printf '%s\n' "$out" | grep -c 'Prompting\.NegativeOnly:')
  c=$(printf '%s\n' "$out" | grep -c 'Clarity\.OneInstructionPerStep:')
  if [ "$s" -ge 2 ]; then
    echo "FAIL: vale exited $s with the real config on $1: $out"; fail=1
  elif [ "$c" -ge 1 ] && { { [ "$2" = hit ] && [ "$p" -ge 1 ]; } || { [ "$2" = none ] && [ "$p" -eq 0 ]; }; }; then
    echo "ok: real config, Prompting $2 and Clarity kept on: $1"
  else
    echo "FAIL: real config on $1 gave Prompting $p and Clarity $c, expected Prompting $2: $out"; fail=1
  fi
}
wire plugins/fabflows/agents/probe.md hit
wire plugins/fabflows/skills/probe/SKILL.md hit
wire docs/probe.md none
[ "$fail" -eq 0 ] && echo "PASS" || echo "FAIL"
exit "$fail"
