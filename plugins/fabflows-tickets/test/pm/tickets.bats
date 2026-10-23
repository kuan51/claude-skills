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

@test "the body template survives Jira, and so do tables and task-list text" {
  run -0 createJiraIssue "$(jq -nc --arg d "$TEMPLATE" '{projectKey: "ABC", issueTypeName: "Task", summary: "s", description: $d}')"
  [ "$(getJiraIssue '{"issueIdOrKey": "ABC-1"}' | jq -r '.fields.description')" = "$TEMPLATE" ]
  # Real Jira kept a table and returned task-list text as sent; it only renders the task
  # list as plain bullets (TEST-210, 2026-09-26; SKILL.md:78).
  body="$TEMPLATE"$'\n| a | b |\n- [ ] todo'
  editJiraIssue "$(jq -nc --arg d "$body" '{issueIdOrKey: "ABC-1", fields: {description: $d}}')"
  [ "$(getJiraIssue '{"issueIdOrKey": "ABC-1"}' | jq -r '.fields.description')" = "$body" ]
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

@test "github: one login that cannot be assigned refuses the whole call" {
  issue_write '{"method": "create", "owner": "acme", "repo": "app", "title": "t", "assignees": ["dev"]}'
  # Live: octocat on #90 gave Validation Failed and kept kuan51; [] then cleared the list.
  run -1 issue_write '{"method": "update", "owner": "acme", "repo": "app", "issue_number": 1, "assignees": ["alice", "octocat"]}'
  [ "$(state '.github.issues[0].assignees')" = '["dev"]' ]
  issue_write '{"method": "update", "owner": "acme", "repo": "app", "issue_number": 1, "assignees": []}'
  [ "$(state '.github.issues[0].assignees')" = '[]' ]
}

@test "github state_reason: completed by default, reopened on reopen, ignored without a state change" {
  issue_write '{"method": "create", "owner": "acme", "repo": "app", "title": "t"}'
  issue_write '{"method": "create", "owner": "acme", "repo": "app", "title": "t"}'
  up() { issue_write "{\"method\": \"update\", \"owner\": \"acme\", \"repo\": \"app\", $1}" >/dev/null; }
  why() { state ".github.issues[$1] | [.state, .state_reason]"; }
  # #93 closed with no reason, then reopened; #91 got a reason while open.
  up '"issue_number": 1, "state": "closed"'
  [ "$(why 0)" = '["closed","completed"]' ]
  up '"issue_number": 1, "state": "open"'
  [ "$(why 0)" = '["open","reopened"]' ]
  up '"issue_number": 2, "state_reason": "not_planned"'
  [ "$(why 1)" = '["open",null]' ]
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

lin() { get_issue "{\"id\": \"$1\"}" | jq -c "$2"; }

@test "linear status: forward only, done and cancelled found by type" {
  save_issue '{"team": "FAB", "title": "t"}'
  linear_move FAB-1 "in progress"
  linear_move FAB-1 "in review"
  linear_move FAB-1 "in progress"
  [ "$(lin FAB-1 .status)" = '"In Review"' ]
  linear_move FAB-1 done
  linear_move FAB-1 "in review"
  [ "$(lin FAB-1 .status)" = '"Done"' ]
  # OPS names them Shipped and Dropped, which no name list has; Duplicate is never picked.
  save_issue '{"team": "OPS", "title": "t"}'
  save_issue '{"team": "OPS", "title": "t"}'
  linear_move OPS-1 done
  linear_move OPS-2 cancelled
  [ "$(state '[.linear.issues["OPS-1", "OPS-2"].status]')" = '["Shipped","Dropped"]' ]
}

@test "linear labels: only labels that exist are added, the rest are reported" {
  save_issue '{"team": "FAB", "title": "t", "labels": ["Bug", "class-a"]}'
  printf '%s\n' '## Why' 'x' '## Compliance' '- Controls: soc2-cc8.1' '- Change: normal' '- Class: B' >"$BATS_TEST_TMPDIR/spec.md"
  run -0 cli labels <"$BATS_TEST_TMPDIR/spec.md"
  want=$(jq -c -R -s 'split("\n") | map(select(. != ""))' <<<"$output")
  # One unknown label refuses the whole call (FAB-4): ctl-soc2-cc8-1 does not exist here.
  run -1 save_issue "{\"id\": \"FAB-1\", \"addLabels\": $want}"
  [ "$(lin FAB-1 .labels)" = '["Bug","class-a"]' ]
  have=$(list_issue_labels '{"team": "FAB"}' | jq -c '[.labels[].name]')
  cur=$(lin FAB-1 .labels)
  fab='^(ctl-.*|change-(normal|standard|emergency)|class-(a|b|c|na))$'
  add=$(jq -nc --argjson w "$want" --argjson h "$have" '$w - ($w - $h)')
  rm=$(jq -nc --argjson c "$cur" --argjson w "$want" --arg re "$fab" '[$c[] | select(test($re))] - $w')
  missing=$(jq -nc --argjson w "$want" --argjson h "$have" '$w - $h')
  save_issue "{\"id\": \"FAB-1\", \"addLabels\": $add, \"removeLabels\": $rm}"
  [ "$(lin FAB-1 '.labels | sort')" = '["Bug","change-normal","class-b"]' ]
  [ "$missing" = '["ctl-soc2-cc8-1"]' ]
}

@test "linear assignee: me when unassigned or mine, never over someone else" {
  assign() {
    local cur
    cur=$(lin "$1" '.assignee // ""' | jq -r .)
    [ -z "$cur" ] || [ "$cur" = lin-dev ] || return 0
    save_issue "{\"id\": \"$1\", \"assignee\": \"me\"}" >/dev/null
  }
  save_issue '{"team": "FAB", "title": "t"}'
  save_issue '{"team": "FAB", "title": "t", "assignee": "bob"}'
  assign FAB-1
  assign FAB-2
  [ "$(state '[.linear.issues[] | .assignee]')" = '["lin-dev","bob"]' ]
}
