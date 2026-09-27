#!/usr/bin/env bash
# usage: vale-warn-gate.sh <files>...
# Prints every Vale warning or error in the files and exits 1 when there is one. Vale itself
# exits 0 on warnings, so a step that trusts its exit status lets warnings through. Vale reads
# the .vale.ini of the directory it runs in or the nearest parent. Exit 2 is Vale failing to run.
set -u
[ "$#" -gt 0 ] || { echo "usage: vale-warn-gate.sh <files>..." >&2; exit 2; }
out=$(vale --minAlertLevel=warning --output=line "$@" 2>&1)
status=$?
[ -n "$out" ] && printf '%s\n' "$out"
[ "$status" -le 1 ] || exit 2
[ -z "$out" ]
