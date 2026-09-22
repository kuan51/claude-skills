#!/usr/bin/env bash
. "$(dirname "$0")/../_lib/seed.sh"
seed repo-it-tooling
sed -i 's/^# DEC-0001: Preview every certificate/# DEC-0001: Preview every certficate/' docs/decisions/DEC-0001-*.md
commit_fixture
