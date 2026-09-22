#!/usr/bin/env bash
. "$(dirname "$0")/../_lib/seed.sh"
seed repo-it-tooling docs .docs-warden.yml .github README.md CONTRIBUTING.md
commit_fixture
