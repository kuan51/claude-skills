#!/usr/bin/env bats
# The pull request and what follows it, with the real ticket.js hooks and CLI
# (skills/ticket/SKILL.md:196-267).

setup() {
  load helpers
  load fake-tracker
  tracker_init
  repo
}

JIRA_URL='https://example.atlassian.net/browse/ABC-1'
PR1='https://github.com/acme/app/pull/1'

# A Jira ticket ABC-1 at in progress, linked to this branch.
linked_jira() {
  createJiraIssue '{"projectKey": "ABC", "issueTypeName": "Task", "summary": "s"}' >/dev/null
  jira_move ABC-1 "in progress"
  cli link 'ABC-1' "$JIRA_URL" 'jira'
}
open_pr() { # <body>
  create_pull_request "$(jq -nc --arg b "$1" '{owner: "acme", repo: "app", title: "ABC-1: add drafts", body: $b, head: "feature", base: "main"}')" | jq -r .html_url
}
pr_get() { pull_request_read "{\"method\": \"get\", \"owner\": \"acme\", \"repo\": \"app\", \"pullNumber\": $1}"; }
jira_status() { getJiraIssue '{"issueIdOrKey": "ABC-1"}' | jq -r '.fields.status.name'; }

# Web link steps 1-2 (SKILL.md:278-282): read first, since create has no duplicate check.
web_link() {
  getJiraIssueRemoteIssueLinks '{"issueIdOrKey": "ABC-1"}' | jq -e --arg u "$1" 'any(.[]; .object.url == $u)' >/dev/null && return 0
  jira_create_remote_issue_link "$(jq -nc --arg u "$1" '{issue_key: "ABC-1", url: $u, title: "ABC-1: add drafts"}')"
}

@test "gh pr create without the key is denied" {
  linked_jira
  run -0 pre_bash 'gh pr create --title "add drafts" --body x'
  [[ $output == deny* ]]
  run -0 pre_bash 'gh pr create --title "ABC-1: add drafts" --body x'
  [ -z "$output" ]
}

@test "gh pr create --fill or --web is denied" {
  linked_jira
  run -0 pre_bash 'gh pr create --fill'
  [[ $output == deny* ]]
  run -0 pre_bash 'gh pr create --web'
  [[ $output == deny* ]]
}

@test "MCP create_pull_request with the key is allowed and PostToolUse reminds" {
  linked_jira
  input='{"owner": "acme", "repo": "app", "title": "ABC-1: add drafts", "head": "feature", "base": "main"}'
  run -0 pre_tool mcp__github__create_pull_request "$input"
  [ -z "$output" ]
  run -0 pre_tool mcp__github__create_pull_request '{"title": "add drafts"}'
  [[ $output == deny* ]]
  open_pr "Closes ABC-1"
  run -0 post_tool mcp__github__create_pull_request "$input"
  [ "$output" = "fabflows: update ticket ABC-1: Links, web link, assignees and status, per fabflows:ticket." ]
}

@test "ticket.js pr records the URL, and the web link is added once" {
  linked_jira
  url=$(open_pr "Closes ABC-1")
  [ "$url" = "$PR1" ]
  web_link "$url"
  run -0 cli pr "$url"
  [ "$(cli status | jq -r .pr)" = "$PR1" ]
  jira_move ABC-1 "in review"
  # A retried create no longer names the web link, and the steps add no duplicate.
  run -0 post_bash 'gh pr create --title "ABC-1: add drafts" --body x'
  [[ $output != *"web link"* ]]
  web_link "$url"
  [ "$(state '.jira.links["ABC-1"] | length')" = 1 ]
  [ "$(jira_status)" = "In Review" ]
}

@test "merge: reminder, ticket to done, clear --pr" {
  linked_jira
  url=$(open_pr "Adds drafts. Closes ABC-1")
  cli pr "$url"
  jira_move ABC-1 "in review"
  merge_pull_request '{"owner": "acme", "repo": "app", "pullNumber": 1}'
  run -0 post_bash 'gh pr merge 1 --squash'
  [[ $output == *"PR $PR1 merged"* && $output == *"ticket.js clear --pr '$PR1'"* ]]
  # After a PR closes, steps 1, 2, 4 and 7 (SKILL.md:237-267).
  [ "$(pr_get 1 | jq -r .merged)" = true ]
  closes "$(pr_get 1 | jq -r .body)" ABC-1
  jira_move ABC-1 done
  run -0 cli clear --pr "$url"
  [ "$(jira_status)" = Done ]
  run -1 cli status
  run -0 cli prs
  [ -z "$output" ]
}

@test "gh pr close and an MCP close give no reminder (documented gap)" {
  linked_jira
  url=$(open_pr "Closes ABC-1")
  cli pr "$url"
  update_pull_request '{"owner": "acme", "repo": "app", "pullNumber": 1, "state": "closed"}'
  # No hook fires, so Claude follows the steps itself (SKILL.md:231-233).
  run -0 pre_bash 'gh pr close 1'
  [ -z "$output" ]
  run -0 post_bash 'gh pr close 1'
  [ -z "$output" ]
  run -0 post_tool mcp__github__update_pull_request '{"owner": "acme", "repo": "app", "pullNumber": 1, "state": "closed"}'
  [ -z "$output" ]
}

@test "closed unmerged with Closes KEY: the cancel status is picked, never Done" {
  linked_jira
  open_pr "Closes ABC-1"
  update_pull_request '{"owner": "acme", "repo": "app", "pullNumber": 1, "state": "closed"}'
  [ "$(pr_get 1 | jq -c '[.state, .merged]')" = '["closed",false]' ]
  closes "$(pr_get 1 | jq -r .body)" ABC-1
  # The user said yes (SKILL.md:250-262). Jira: by the transition's to.
  jira_move ABC-1 cancelled
  [ "$(jira_status)" = "Won't Do" ]
  # GitHub: closed as not planned; closing the PR alone closed nothing.
  issue_write '{"method": "create", "owner": "acme", "repo": "app", "title": "ticket"}'
  create_pull_request '{"owner": "acme", "repo": "app", "title": "#2: x", "body": "Closes #2", "head": "f", "base": "main"}'
  update_pull_request '{"owner": "acme", "repo": "app", "pullNumber": 3, "state": "closed"}'
  [ "$(state '.github.issues[1].state')" = '"open"' ]
  issue_write '{"method": "update", "owner": "acme", "repo": "app", "issue_number": 2, "state": "closed", "state_reason": "not_planned"}'
  [ "$(state '.github.issues[1] | [.state, .state_reason]')" = '["closed","not_planned"]' ]
  # Linear: the Canceled state.
  save_issue '{"team": "ENG", "title": "t", "state": "In Review"}'
  cancel=$(list_issue_statuses '{"team": "ENG"}' | jq -r "$_MATCH"'[.[] | select(.name | norm | IN(names("cancelled")[]))][0].name')
  save_issue "{\"id\": \"ENG-1\", \"state\": \"$cancel\"}"
  [ "$(state '.linear.issues["ENG-1"].state')" = '"Canceled"' ]
}

@test "closed unmerged, no cancel-type status: the status stays, never Done" {
  createJiraIssue '{"projectKey": "TST", "issueTypeName": "Task", "summary": "s"}' >/dev/null
  jira_move TST-1 "in review"
  # The user said yes, but the workflow has no cancel status (SKILL.md:261-262).
  run -0 jira_move TST-1 cancelled
  [ "$output" = "no fit" ]
  [ "$(getJiraIssue '{"issueIdOrKey": "TST-1"}' | jq -r '.fields.status.name')" = "In Review" ]
}

@test "Refs-only: the ticket stays open" {
  issue_write '{"method": "create", "owner": "acme", "repo": "app", "title": "ticket"}'
  cli link '#1' 'https://github.com/acme/app/issues/1' 'github'
  url=$(create_pull_request '{"owner": "acme", "repo": "app", "title": "#1: part one", "body": "Refs: #1", "head": "feature", "base": "main"}' | jq -r .html_url)
  cli pr "$url"
  merge_pull_request '{"owner": "acme", "repo": "app", "pullNumber": 2}'
  run -0 post_bash "gh pr merge $url --squash"
  [[ $output == *"If it was Refs-only, leave #1 open"* ]]
  # Step 6, then step 7 (SKILL.md:265-267).
  run -1 closes "$(pr_get 2 | jq -r .body)" '#1'
  cli clear --pr "$url"
  [ "$(state '.github.issues[0].state')" = '"open"' ]
  run -0 cli prs
  [ -z "$output" ]
}

@test "a PR closed outside the session: SessionStart names it and prs lists it" {
  g checkout -q -b other
  cli link 'ABC-2' 'https://example.atlassian.net/browse/ABC-2' 'jira'
  cli pr "$PR1"
  g checkout -q feature
  run -0 session_start
  [[ $output == *"1 other linked ticket(s) have a recorded PR (ABC-2)"* ]]
  run -0 cli prs
  [ "$(jq -c '[.key, .pr]' <<<"$output")" = "[\"ABC-2\",\"$PR1\"]" ]
}

@test "a retry after the ticket is already closed does no harm" {
  issue_write '{"method": "create", "owner": "acme", "repo": "app", "title": "ticket"}'
  cli link '#1' 'https://github.com/acme/app/issues/1' 'github'
  url=$(create_pull_request '{"owner": "acme", "repo": "app", "title": "#1: x", "body": "Closes #1", "head": "feature", "base": "main"}' | jq -r .html_url)
  cli pr "$url"
  merge_pull_request '{"owner": "acme", "repo": "app", "pullNumber": 2}'
  # Step 3 (SKILL.md:246-247): already closed, so only clear. Run it twice.
  steps() {
    [ "$(pr_get 2 | jq -r .merged)" = true ] || return 1
    [ "$(issue_read '{"method": "get", "owner": "acme", "repo": "app", "issue_number": 1}' | jq -r .state)" = closed ] || return 1
    cli clear --pr "$url"
  }
  before=$(state '.')
  run -0 steps
  run -0 steps
  [ "$(state '.')" = "$before" ]
  [ "$(state '.github.issues[0] | [.state, .state_reason]')" = '["closed","completed"]' ]
  run -0 cli prs
  [ -z "$output" ]
}
