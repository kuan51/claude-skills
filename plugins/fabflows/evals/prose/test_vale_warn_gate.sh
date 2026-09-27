#!/usr/bin/env bash
# Self-test for vale-warn-gate.sh: bash test_vale_warn_gate.sh
# In a throwaway git repository with its own one-rule style, the gate must exit 1 on a file with
# one warning and 0 on a clean file. The style is local, so no `vale sync` is needed.
set -u
GATE="$(cd "$(dirname "$0")" && pwd)/vale-warn-gate.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
cd "$T" || exit 2
git init -q .
mkdir -p styles/Probe
printf 'StylesPath = styles\nMinAlertLevel = suggestion\n\n[*.md]\nBasedOnStyles = Probe\n' > .vale.ini
printf 'extends: existence\nmessage: "Planted warning: %%s"\nlevel: warning\ntokens:\n  - plantedword\n' > styles/Probe/Planted.yml
printf '# Probe\n\nThis line has a plantedword in it.\n' > warn.md
printf '# Probe\n\nThis line is clean.\n' > clean.md
fail=0
bash "$GATE" warn.md > out.txt; s=$?
if [ "$s" -eq 1 ] && grep -q 'Probe.Planted' out.txt; then echo "ok: exit 1 on a planted warning"; else echo "FAIL: planted warning gave exit $s: $(cat out.txt)"; fail=1; fi
bash "$GATE" clean.md > out.txt; s=$?
if [ "$s" -eq 0 ] && [ ! -s out.txt ]; then echo "ok: exit 0 on a clean file"; else echo "FAIL: clean file gave exit $s: $(cat out.txt)"; fail=1; fi
[ "$fail" -eq 0 ] && echo "PASS" || echo "FAIL"
exit "$fail"
