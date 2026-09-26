#!/usr/bin/env bats
# Creating a ticket under the configured parent (skills/ticket/SKILL.md:59-74).

setup() {
  load helpers
  load fake-tracker
  tracker_init
  repo
}

gh_new() { issue_write "$(jq -nc --argjson x "$1" '{method: "create", owner: "acme", repo: "app"} + $x')"; }
jira_new() { createJiraIssue "$(jq -nc --argjson x "$1" '{projectKey: "ABC", summary: "s"} + $x')"; }

@test "no parent configured: the ticket has no parent" {
  mkdir -p "$REPO/.claude"
  echo '{"tracker": "github", "project": "acme/app", "site": "", "parent": ""}' >"$REPO/.claude/fabflows.json"
  parent=$(jq -r '.parent' "$REPO/.claude/fabflows.json")
  [ -z "$parent" ]
  run -0 gh_new '{"title": "t"}'
  [ "$(state '.github.issues[0].parent')" = null ]
}

@test "jira epic parent: Task accepted, Sub-task rejected" {
  jira_new '{"issueTypeName": "Epic"}'
  run -0 getJiraIssue '{"issueIdOrKey": "ABC-1"}'
  run -0 jira_new '{"issueTypeName": "Task", "parent": "ABC-1"}'
  run -1 jira_new '{"issueTypeName": "Sub-task", "parent": "ABC-1"}'
  [ "$(state '[.jira.issues[] | [.key, .parent]]')" = '[["ABC-1",null],["ABC-2","ABC-1"]]' ]
}

@test "jira story parent: only Sub-task accepted" {
  jira_new '{"issueTypeName": "Story"}'
  run -1 jira_new '{"issueTypeName": "Task", "parent": "ABC-1"}'
  run -1 jira_new '{"issueTypeName": "Story", "parent": "ABC-1"}'
  run -0 jira_new '{"issueTypeName": "Sub-task", "parent": "ABC-1"}'
  [ "$(state '[.jira.issues[] | [.key, .issuetype, .parent]]')" = '[["ABC-1","Story",null],["ABC-2","Sub-task","ABC-1"]]' ]
}

@test "jira sub-task or cross-project parent: refused, no ticket left" {
  jira_new '{"issueTypeName": "Story"}'
  jira_new '{"issueTypeName": "Sub-task", "parent": "ABC-1"}'
  createJiraIssue '{"projectKey": "XYZ", "summary": "s", "issueTypeName": "Epic"}'
  before=$(state '.')
  run -1 jira_new '{"issueTypeName": "Sub-task", "parent": "ABC-2"}'
  [[ $output == *"cannot be a parent"* ]]
  run -1 jira_new '{"issueTypeName": "Task", "parent": "XYZ-1"}'
  [[ $output == *"another project"* ]]
  [ "$(state '.')" = "$before" ]
}

@test "github parent that is a PR or a closed issue: refused, no ticket left" {
  gh_new '{"title": "old"}'
  issue_write '{"method": "update", "owner": "acme", "repo": "app", "issue_number": 1, "state": "closed"}'
  create_pull_request '{"owner": "acme", "repo": "app", "title": "pr", "head": "x", "base": "main"}'
  before=$(state '.')
  run -1 gh_new '{"title": "t", "parent_issue_number": 2}'
  [[ $output == *"pull request"* ]]
  run -1 gh_new '{"title": "t", "parent_issue_number": 1}'
  [[ $output == *"closed"* ]]
  [ "$(state '.')" = "$before" ]
}

@test "cross-repo parent owner/repo#7 works only with parent_owner and parent_repo" {
  for n in 1 2 3 4 5 6 7; do issue_write "{\"method\": \"create\", \"owner\": \"other\", \"repo\": \"lib\", \"title\": \"p$n\"}" >/dev/null; done
  run -1 gh_new '{"title": "t", "parent_issue_number": 7}'
  run -1 gh_new '{"title": "t", "parent_issue_number": 7, "parent_owner": "other"}'
  [ "$(state '[.github.issues[] | select(.repo == "app")] | length')" = 0 ]
  run -0 gh_new '{"title": "t", "parent_issue_number": 7, "parent_owner": "other", "parent_repo": "lib"}'
  [ "$(state '.github.issues[] | select(.repo == "app") | [.number, .parent]')" = '[1,"other/lib#7"]' ]
}

@test "linear parent set" {
  save_issue '{"team": "ENG", "title": "parent"}'
  run -0 save_issue '{"team": "ENG", "title": "t", "parentId": "ENG-1"}'
  [ "$(state '.linear.issues["ENG-2"].parentId')" = '"ENG-1"' ]
  run -1 save_issue '{"team": "ENG", "title": "t", "parentId": "ENG-9"}'
  [ "$(state '.linear.issues | length')" = 2 ]
}

@test "linking an existing ticket never re-parents it" {
  mkdir -p "$REPO/.claude"
  echo '{"tracker": "jira", "project": "ABC", "site": "", "parent": "ABC-1"}' >"$REPO/.claude/fabflows.json"
  jira_new '{"issueTypeName": "Epic"}'
  jira_new '{"issueTypeName": "Task"}'
  before=$(state '.')
  run -0 cli link 'ABC-2' 'https://example.atlassian.net/browse/ABC-2' 'jira'
  run -0 cli status
  [ "$(jq -r .key <<<"$output")" = ABC-2 ]
  # Only tickets you create get the parent (SKILL.md:71): the tracker is untouched.
  [ "$(state '.')" = "$before" ]
  [ "$(state '.jira.issues["ABC-2"].parent')" = null ]
}
