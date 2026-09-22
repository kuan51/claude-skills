#!/usr/bin/env bash
. "$(dirname "$0")/../_lib/seed.sh"
seed repo-it-tooling
# Plant the typo in the accepted record before committing, so it is part of history.
sed -i 's/^# DEC-0001: Preview every certificate/# DEC-0001: Preview every certficate/' docs/decisions/DEC-0001-*.md
commit_fixture
