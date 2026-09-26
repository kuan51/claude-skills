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

@test "jira epic parent: Task accepted, and Jira takes a Sub-task too" {
  jira_new '{"issueTypeName": "Epic"}'
  run -0 getJiraIssue '{"issueIdOrKey": "ABC-1"}'
  run -0 jira_new '{"issueTypeName": "Task", "parent": "ABC-1"}'
  # Real Jira accepted this (TEST-220), so the type choice rests on the skill alone.
  run -0 jira_new '{"issueTypeName": "Sub-task", "parent": "ABC-1"}'
  [ "$(state '[.jira.issues[] | [.key, .issuetype, .parent]]')" = '[["ABC-1","Epic",null],["ABC-2","Task","ABC-1"],["ABC-3","Sub-task","ABC-1"]]' ]
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
  createJiraIssue '{"projectKey": "XYZ", "summary": "s", "issueTypeName": "Story"}'
  before=$(state '.')
  run -1 jira_new '{"issueTypeName": "Sub-task", "parent": "ABC-2"}'
  [[ $output == *"cannot be a parent"* ]]
  run -1 jira_new '{"issueTypeName": "Sub-task", "parent": "XYZ-1"}'
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

@test "linear: created in the project under the parent; the project is not inherited" {
  save_issue '{"team": "FAB", "project": "Test", "title": "parent"}'
  # Pass the project with the parent (FAB-2): a child without one gets none (FAB-11).
  run -0 save_issue '{"team": "FAB", "project": "Test", "title": "t", "parentId": "FAB-1"}'
  run -0 save_issue '{"team": "FAB", "title": "t", "parentId": "FAB-1"}'
  [ "$(state '[.linear.issues[] | [.id, .project, .parentId]]')" = '[["FAB-1","Test",null],["FAB-2","Test","FAB-1"],["FAB-3",null,"FAB-1"]]' ]
  run -1 save_issue '{"team": "FAB", "project": "Ops", "title": "t"}'
  [[ $output == *"not in team"* ]]
}

@test "linear: a missing or circular parent is refused and leaves no issue" {
  save_issue '{"team": "FAB", "project": "Test", "title": "parent"}'
  save_issue '{"team": "FAB", "project": "Test", "title": "child", "parentId": "FAB-1"}'
  before=$(state '.')
  run -1 save_issue '{"team": "FAB", "project": "Test", "title": "t", "parentId": "FAB-9"}'
  run -1 save_issue '{"id": "FAB-1", "parentId": "FAB-2"}'
  [[ $output == *"circular"* ]]
  [ "$(state '.')" = "$before" ]
}

@test "linear takes a canceled parent: only setup's check keeps it out" {
  save_issue '{"team": "FAB", "title": "parent", "state": "canceled"}'
  # Accepted live (FAB-12 under FAB-6), so fabflows-setup must refuse a closed parent itself.
  run -0 save_issue '{"team": "FAB", "title": "t", "parentId": "FAB-1"}'
  [ "$(state '.linear.issues["FAB-2"].parentId')" = '"FAB-1"' ]
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
