#!/usr/bin/env bats
# Body, labels, assignees and status of a ticket (skills/ticket/SKILL.md:76-128, 161-223).

setup() {
  load helpers
  load fake-tracker
  tracker_init
  repo
}

TEMPLATE='## Why
Users lose drafts.

## Behaviour
- Drafts save every 10 seconds.

## Check
- `npm test` passes.

## Out of scope
- Sync across devices (follow-up: ABC-9)

## Decisions
- Local storage only (no server change)

## Links
- Branch: feature · PR: none'

status() { getJiraIssue "{\"issueIdOrKey\": \"$1\"}" | jq -r '.fields.status.name'; }
task() { createJiraIssue "{\"projectKey\": \"$1\", \"issueTypeName\": \"Task\", \"summary\": \"s\"}" >/dev/null; }

@test "the body template survives Jira: no tables or task lists" {
  run -0 createJiraIssue "$(jq -nc --arg d "$TEMPLATE" '{projectKey: "ABC", issueTypeName: "Task", summary: "s", description: $d}')"
  [ "$(getJiraIssue '{"issueIdOrKey": "ABC-1"}' | jq -r '.fields.description')" = "$TEMPLATE" ]
  # The replica drops both, as Jira does (SKILL.md:78).
  editJiraIssue "$(jq -nc --arg d "$TEMPLATE"$'\n| a | b |\n- [ ] todo' '{issueIdOrKey: "ABC-1", fields: {description: $d}}')"
  [ "$(getJiraIssue '{"issueIdOrKey": "ABC-1"}' | jq -r '.fields.description')" = "$TEMPLATE" ]
}

@test "ticket.js labels are applied and non-fabflows labels kept" {
  issue_write '{"method": "create", "owner": "acme", "repo": "app", "title": "t",
    "labels": ["bug", "ctl-soc2-cc6-1", "change-emergency", "class-a", "needs-review"]}'
  printf '%s\n' '## Why' 'x' '## Compliance' '- Controls: soc2-cc8.1' '- Change: normal' '- Class: B' >"$BATS_TEST_TMPDIR/spec.md"
  run -0 cli labels <"$BATS_TEST_TMPDIR/spec.md"
  printed=$output
  # Keep every label but fabflows' own, then add what labels printed (SKILL.md:117-123).
  keep=$(issue_read '{"method": "get", "owner": "acme", "repo": "app", "issue_number": 1}' |
    jq -c '[.labels[] | select(test("^(ctl-.*|change-(normal|standard|emergency)|class-(a|b|c|na))$") | not)]')
  labels=$(jq -c --argjson k "$keep" -R -s 'split("\n") | map(select(. != "")) | $k + .' <<<"$printed")
  issue_write "{\"method\": \"update\", \"owner\": \"acme\", \"repo\": \"app\", \"issue_number\": 1, \"labels\": $labels}"
  [ "$(state '.github.issues[0].labels | sort')" = '["bug","change-normal","class-b","ctl-soc2-cc8-1","needs-review"]' ]
}

@test "assigning the PR keeps its existing assignees" {
  create_pull_request '{"owner": "acme", "repo": "app", "title": "ABC-1: x", "head": "feature", "base": "main"}'
  issue_write '{"method": "update", "owner": "acme", "repo": "app", "issue_number": 1, "assignees": ["alice"]}'
  # get_me, issue_read, then issue_write with those plus me (SKILL.md:204-210).
  me=$(get_me | jq -r .login)
  now=$(issue_read '{"method": "get", "owner": "acme", "repo": "app", "issue_number": 1}' | jq -c --arg me "$me" '.assignees + [$me] | unique')
  issue_write "{\"method\": \"update\", \"owner\": \"acme\", \"repo\": \"app\", \"issue_number\": 1, \"assignees\": $now}"
  [ "$(state '.github.issues[0].assignees')" = '["alice","dev"]' ]
}

@test "a ticket held by someone else is not reassigned" {
  # Only when unassigned or already mine (SKILL.md:220-221).
  assign() {
    local cur
    cur=$(getJiraIssue "{\"issueIdOrKey\": \"$1\"}" | jq -r '.fields.assignee.accountId // ""')
    [ -z "$cur" ] || [ "$cur" = acc-dev ] || return 0
    editJiraIssue "{\"issueIdOrKey\": \"$1\", \"fields\": {\"assignee\": {\"accountId\": \"acc-dev\"}}}"
  }
  task ABC
  task ABC
  editJiraIssue '{"issueIdOrKey": "ABC-2", "fields": {"assignee": {"accountId": "acc-bob"}}}'
  assign ABC-1
  assign ABC-2
  [ "$(state '[.jira.issues[] | .assignee]')" = '["acc-dev","acc-bob"]' ]
}

@test "status moves forward only: in progress, in review, done" {
  task ABC
  jira_move ABC-1 "in progress"
  [ "$(status ABC-1)" = "In Progress" ]
  jira_move ABC-1 "in review"
  [ "$(status ABC-1)" = "In Review" ]
  jira_move ABC-1 "in progress"
  [ "$(status ABC-1)" = "In Review" ]
  jira_move ABC-1 done
  [ "$(status ABC-1)" = Done ]
  jira_move ABC-1 "in review"
  [ "$(status ABC-1)" = Done ]
}

@test "a Jira workflow without In Review falls back to in progress" {
  task BAS
  jira_move BAS-1 "in review"
  [ "$(status BAS-1)" = "In Progress" ]
  run -0 jira_move BAS-1 "in review"
  [ "$(status BAS-1)" = "In Progress" ]
}

@test "blocked is left alone" {
  task ABC
  transitionJiraIssue '{"issueIdOrKey": "ABC-1", "transition": {"id": "61"}}'
  for t in "in progress" "in review" done; do jira_move ABC-1 "$t"; done
  [ "$(status ABC-1)" = Blocked ]
}

@test "status is chosen by the transition's to, never its name" {
  task ABC
  jira_move ABC-1 "in progress"
  # The transition named Reviewed leads to Working as Designed (SKILL.md:176-177).
  getTransitionsForJiraIssue '{"issueIdOrKey": "ABC-1"}' | jq -e '.transitions[] | select(.name == "Reviewed" and .to.name == "Working as Designed")'
  jira_move ABC-1 "in review"
  [ "$(status ABC-1)" = "In Review" ]
}

@test "done is never chosen from Won't Fix or another work-dropping status" {
  task NDN
  jira_move NDN-1 "in review"
  [ "$(status NDN-1)" = "In Review" ]
  # The transition named Done leads to Won't Fix; Duplicate also drops the work (SKILL.md:184-185).
  run -0 jira_move NDN-1 done
  [ "$output" = "no fit" ]
  [ "$(status NDN-1)" = "In Review" ]
}
