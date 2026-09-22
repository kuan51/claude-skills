#!/usr/bin/env bash
. "$(dirname "$0")/../_lib/seed.sh"
seed repo-it-tooling

# Plant the drift the prompt asserts. Without this the repo has no environment
# variables and no deploy script at all, so Claude finds nothing, answers in a
# handful of turns and never needs a skill -- which is what the first run of this
# case measured. The premise has to be in the fixture for the case to test anything.
cat >> README.md <<'MD'

## Configuration

Set these three environment variables before running a rotation:

- `CERT_HUB_URL` - the management endpoint of the hub
- `CERT_CA_NAME` - the internal certificate authority to request from
- `CERT_ROLE` - the rotation role to authenticate as
MD

cat > src/Deploy.ps1 <<'MD'
# Synthetic fixture script. Does nothing real.
# Reads seven settings; the README documents only the first three.
$hubUrl    = $env:CERT_HUB_URL
$caName    = $env:CERT_CA_NAME
$role      = $env:CERT_ROLE
$timeout   = $env:CERT_TIMEOUT_SECONDS
$retries   = $env:CERT_MAX_RETRIES
$logPath   = $env:CERT_LOG_PATH
$dryRun    = $env:CERT_DRY_RUN

Write-Output "would deploy to $hubUrl as $role via $caName"
Write-Output "timeout=$timeout retries=$retries log=$logPath dryRun=$dryRun"
MD

commit_fixture
