#!/usr/bin/env bash
# Seed an eval workspace from one of docs-warden's test fixtures.
#
# From a case's fixture.sh:
#   . "$(dirname "$0")/../_lib/seed.sh"
#   seed repo-it-tooling [path-to-strip ...]   # copy the fixture into $PWD, drop the named paths
#   commit_fixture                             # git init + commit, so the skill's git calls work
#
# Every behavioral case needs a committed repository: maintain mode runs git diff,
# compact mode runs git mv, and _common.py has git helpers. An uncommitted
# fixture fails those for reasons that have nothing to do with the skill.
# Anything you change between seed and commit_fixture is part of the fixture;
# anything you change after commit_fixture shows up as an uncommitted diff.
set -euo pipefail

_lib="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES="$(cd "$_lib/../../test/fixtures" && pwd)"

seed() {
  local fixture="$1"; shift
  cp -R "$FIXTURES/$fixture/." .
  for p in "$@"; do rm -rf -- "$p"; done
  echo "seed: $fixture from $FIXTURES into $PWD" >&2
}

commit_fixture() {
  git init -q -b main
  git add -A
  git -c user.name=eval -c user.email=eval@example.invalid commit -q -m "fixture"
}
