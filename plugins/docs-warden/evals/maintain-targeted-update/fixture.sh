#!/usr/bin/env bash
. "$(dirname "$0")/../_lib/seed.sh"
seed repo-it-tooling
commit_fixture
# The rename stays uncommitted so maintain mode's git diff sees it.
sed -i 's/HubName/TargetHub/g' src/CertRotate.psm1
