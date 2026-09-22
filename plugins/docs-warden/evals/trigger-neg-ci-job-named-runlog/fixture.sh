#!/usr/bin/env bash
. "$(dirname "$0")/../_lib/seed.sh"
# Negatives run in the SAME documented repo as the positives. In an empty directory
# there is no CODEOWNERS, no run log and no glossary for the prompt to collide with,
# so a quiet skill proves nothing. Here the keywords are genuinely present.
seed repo-it-tooling
commit_fixture
