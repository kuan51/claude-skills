# In-memory replicas of GitHub Issues, Jira and Linear, as fabflows:ticket drives them.
# Tool names are the suffixes in skills/ticket/SKILL.md:22-27. Each takes one JSON argument
# and prints its result as JSON. A refused call prints why on stderr, returns 1, and leaves
# the state file ($BATS_TEST_TMPDIR/tracker.json) unchanged.

_DEFS='
def gh_find($o; $r; $n): [.github.issues[] | select(.owner == $o and .repo == $r and .number == $n)][0];
def gh_next($o; $r): ([.github.issues[] | select(.owner == $o and .repo == $r) | .number] | max // 0) + 1;
def gh_put($i): .github.issues |= map(if .owner == $i.owner and .repo == $i.repo and .number == $i.number then $i else . end);
def pr_url: "https://github.com/\(.owner)/\(.repo)/pull/\(.number)";
# Jira drops tables and task lists (skills/ticket/SKILL.md:78).
def jira_view: {key, fields: {summary, description, project: {key: .project}, issuetype: {name: .issuetype},
  status: {name: .status}, parent: (if .parent then {key: .parent} else null end), labels,
  assignee: (if .assignee then {accountId: .assignee} else null end)}};
def jira_get($k): .jira.issues[$k] // error("issue \($k) does not exist");
def jira_moves($s; $i): [$s.jira.workflows[$s.jira.projects[$i.project].workflow][] | select(.to != $i.status)];
'

_call() { # <jq filter from {s: state} to {s: new state, out: result}> <args JSON>
  local f="$BATS_TEST_TMPDIR/tracker.json" r
  r=$(jq -c --argjson a "$2" "$_DEFS try ({s: .} | $1) catch {error: .}" "$f") || return 1
  if jq -e 'has("error")' <<<"$r" >/dev/null; then
    jq -r '.error' <<<"$r" >&2
    return 1
  fi
  jq '.s' <<<"$r" >"$f.new" && mv "$f.new" "$f"
  jq -c '.out // empty' <<<"$r"
}

tracker_init() {
  jq -n --arg ap "'" '{
    github: {me: "dev", issues: []},
    jira: {
      me: "acc-dev",
      projects: {ABC: {workflow: "review"}, XYZ: {workflow: "review"}, BAS: {workflow: "basic"}, NDN: {workflow: "nodone"}},
      # Transition names differ from their `to` status (skills/ticket/SKILL.md:176-177).
      workflows: {
        review: [
          {id: "11", name: "Start", to: "In Progress"},
          {id: "21", name: "Reviewed", to: "Working as Designed"},
          {id: "31", name: "Submit", to: "In Review"},
          {id: "41", name: "Finish", to: "Done"},
          {id: "51", name: "Drop", to: "Won\($ap)t Do"},
          {id: "61", name: "Hold", to: "Blocked"}],
        # No In Review status (skills/ticket/SKILL.md:183).
        basic: [
          {id: "11", name: "Start", to: "In Progress"},
          {id: "41", name: "Finish", to: "Done"},
          {id: "51", name: "Drop", to: "Won\($ap)t Do"}],
        # No done-type status; the one named Done drops the work (skills/ticket/SKILL.md:184-185).
        nodone: [
          {id: "11", name: "Start", to: "In Progress"},
          {id: "31", name: "Submit", to: "In Review"},
          {id: "41", name: "Done", to: "Won\($ap)t Fix"},
          {id: "42", name: "Dupe", to: "Duplicate"}]
      },
      issues: {}, links: {}
    },
    # Team states include Canceled (skills/ticket/SKILL.md:259).
    linear: {me: "lin-dev", teams: {ENG: {states: ["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled"]}}, issues: {}}
  }' >"$BATS_TEST_TMPDIR/tracker.json"
}

# ------------------------------------------------------------------ GitHub
get_me() { _call '{s: .s, out: {login: .s.github.me}}' '{}'; }

issue_read() { # {method: "get", owner, repo, issue_number}
  _call '.s as $s | {s: $s, out: ($s | gh_find($a.owner; $a.repo; $a.issue_number) // error("issue not found"))}' "$1"
}

issue_write() { # {method: "create" | "update", owner, repo, issue_number, title, body, labels, assignees, state, state_reason, parent_issue_number, parent_owner, parent_repo}
  _call '.s as $s |
    if $a.method == "create" then
      (if $a.parent_issue_number == null then null
       # A parent in another repository needs parent_owner and parent_repo (skills/ticket/SKILL.md:67-68).
       elif ($a.parent_owner == null) != ($a.parent_repo == null) then error("parent_owner and parent_repo go together")
       else ($a.parent_owner // $a.owner) as $po | ($a.parent_repo // $a.repo) as $pr
         | ($s | gh_find($po; $pr; $a.parent_issue_number)) as $p
         # Not a PR, not closed (skills/fabflows-setup/SKILL.md:49-50).
         | if $p == null then error("parent issue not found")
           elif $p.pull_request then error("parent is a pull request")
           elif $p.state != "open" then error("parent is closed")
           else "\($po)/\($pr)#\($p.number)" end
       end) as $parent
      | {owner: $a.owner, repo: $a.repo, number: ($s | gh_next($a.owner; $a.repo)), title: $a.title, body: ($a.body // ""),
         state: "open", state_reason: null, labels: ($a.labels // []), assignees: ($a.assignees // []),
         pull_request: false, merged: false, parent: $parent} as $i
      | {s: ($s | .github.issues += [$i]), out: $i}
    elif $a.method == "update" then
      ($s | gh_find($a.owner; $a.repo; $a.issue_number) // error("issue not found")) as $i
      # labels and assignees replace the whole list (skills/ticket/SKILL.md:120-121, 205).
      | ($i + ($a | with_entries(select(.key | IN("title", "body", "labels", "assignees", "state", "state_reason"))))) as $new
      # Only open and closed (skills/ticket/SKILL.md:172).
      | if ($new.state | IN("open", "closed")) | not then error("state must be open or closed") else . end
      | ($new | if .state == "open" then .state_reason = null else .state_reason //= "completed" end) as $new
      | if ($new.state_reason | IN(null, "completed", "not_planned", "duplicate")) | not then error("bad state_reason") else . end
      | {s: ($s | gh_put($new)), out: $new}
    else error("unknown method") end' "$1"
}

# A PR is an issue and shares its number space (skills/ticket/SKILL.md:210).
create_pull_request() { # {owner, repo, title, body, head, base}
  _call '.s as $s
    | {owner: $a.owner, repo: $a.repo, number: ($s | gh_next($a.owner; $a.repo)), title: $a.title, body: ($a.body // ""),
       state: "open", state_reason: null, labels: [], assignees: [], pull_request: true, merged: false, parent: null} as $i
    | {s: ($s | .github.issues += [$i]), out: {number: $i.number, html_url: ($i | pr_url)}}' "$1"
}

_pr() { printf '($s | gh_find($a.owner; $a.repo; $a.pullNumber)) as $p | if ($p | not) or ($p.pull_request | not) then error("pull request not found") else . end'; }

pull_request_read() { # {method: "get", owner, repo, pullNumber}
  _call ".s as \$s | $(_pr) | {s: \$s, out: {state: \$p.state, merged: \$p.merged, body: \$p.body, html_url: (\$p | pr_url)}}" "$1"
}

update_pull_request() { # {owner, repo, pullNumber, state}
  _call ".s as \$s | $(_pr) | if (\$a.state | IN(\"open\", \"closed\")) | not then error(\"bad state\") else . end
    | (\$p | .state = \$a.state) as \$n | {s: (\$s | gh_put(\$n)), out: {state: \$n.state}}" "$1"
}

# Merging closes the same-repository issues its body names with a closing phrase (skills/ticket/SKILL.md:225-227).
merge_pull_request() { # {owner, repo, pullNumber}
  _call ".s as \$s | $(_pr) | if \$p.state != \"open\" then error(\"pull request is not open\") else . end
    | [\$p.body | match(\"(?i)\\\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\\\\s+#([0-9]+)\\\\b\"; \"g\") | .captures[0].string | tonumber] as \$closes
    | {s: (\$s | gh_put(\$p | .state = \"closed\" | .merged = true)
        | .github.issues |= map(if .owner == \$p.owner and .repo == \$p.repo and (.number | IN(\$closes[])) and (.pull_request | not)
            then .state = \"closed\" | .state_reason = \"completed\" else . end)),
       out: {merged: true}}" "$1"
}

# ------------------------------------------------------------------ Jira
createJiraIssue() { # {projectKey, issueTypeName, summary, description, parent}
  _call '.s as $s
    | ($s.jira.projects[$a.projectKey] // error("no project \($a.projectKey)")) as $proj
    | if ($a.issueTypeName | IN("Epic", "Story", "Task", "Sub-task")) | not then error("unknown issue type") else . end
    # Epic > Story/Task > Sub-task (skills/ticket/SKILL.md:64-66). A story or task parent must share
    # the project, since its sub-tasks must (skills/fabflows-setup/SKILL.md:49-51); an epic may not.
    | (if $a.parent == null then
         (if $a.issueTypeName == "Sub-task" then error("a sub-task needs a parent") else null end)
       else ($s | jira_get($a.parent)) as $p
         | if ($p.issuetype | IN("Story", "Task")) and $p.project != $a.projectKey then error("the parent is in another project")
           elif $p.issuetype == "Sub-task" then error("a sub-task cannot be a parent")
           # Jira also nests a Sub-task under an epic (TEST-220, 2026-09-26): only the skill rule
           # "use Task or Story" (skills/ticket/SKILL.md:65) keeps sub-tasks off epics.
           elif $p.issuetype == "Epic" and ($a.issueTypeName | IN("Task", "Story", "Sub-task") | not) then error("an epic cannot sit under an epic")
           elif ($p.issuetype | IN("Story", "Task")) and $a.issueTypeName != "Sub-task" then error("under a story or task only Sub-task")
           else $a.parent end
       end) as $parent
    | "\($a.projectKey)-\([$s.jira.issues[] | select(.project == $a.projectKey)] | length + 1)" as $key
    | {key: $key, project: $a.projectKey, issuetype: $a.issueTypeName, summary: $a.summary,
       description: ($a.description // ""), status: "To Do", parent: $parent, labels: [], assignee: null} as $i
    | {s: ($s | .jira.issues[$key] = $i), out: {key: $key}}' "$1"
}

getJiraIssue() { # {issueIdOrKey}
  _call '.s as $s | {s: $s, out: ($s | jira_get($a.issueIdOrKey) | jira_view)}' "$1"
}

# Fields edit labels and assignee; status moves only by transition (skills/ticket/SKILL.md:25, 119, 175-177, 215).
editJiraIssue() { # {issueIdOrKey, fields: {summary, description, labels, assignee: {accountId}}}
  _call '.s as $s | ($s | jira_get($a.issueIdOrKey)) as $i
    | if ($a.fields | keys - ["summary", "description", "labels", "assignee"]) != [] then error("only summary, description, labels and assignee are editable; status moves by transition") else . end
    | $a.fields as $f
    | ($i
       | if $f | has("summary") then .summary = $f.summary else . end
       | if $f | has("description") then .description = $f.description else . end
       | if $f | has("labels") then .labels = $f.labels else . end
       | if $f | has("assignee") then .assignee = $f.assignee.accountId else . end) as $new
    | {s: ($s | .jira.issues[$i.key] = $new), out: {}}' "$1"
}

getTransitionsForJiraIssue() { # {issueIdOrKey}
  _call '.s as $s | ($s | jira_get($a.issueIdOrKey)) as $i
    | {s: $s, out: {transitions: [jira_moves($s; $i)[] | {id, name, to: {name: .to}}]}}' "$1"
}

transitionJiraIssue() { # {issueIdOrKey, transition: {id}}
  _call '.s as $s | ($s | jira_get($a.issueIdOrKey)) as $i
    | ([jira_moves($s; $i)[] | select(.id == $a.transition.id)][0] // error("transition \($a.transition.id) is not available")) as $t
    | {s: ($s | .jira.issues[$i.key].status = $t.to), out: {}}' "$1"
}

getJiraIssueRemoteIssueLinks() { # {issueIdOrKey}
  _call '.s as $s | ($s | jira_get($a.issueIdOrKey)) | {s: $s, out: ($s.jira.links[$a.issueIdOrKey] // [])}' "$1"
}

# No globalId, so no duplicate check (skills/ticket/SKILL.md:281-282).
jira_create_remote_issue_link() { # {issue_key, url, title}
  _call '.s as $s | ($s | jira_get($a.issue_key))
    | {s: ($s | .jira.links[$a.issue_key] += [{object: {url: $a.url, title: $a.title}}]), out: {}}' "$1"
}

# ------------------------------------------------------------------ Linear
# The parent is set on save_issue and must exist (skills/ticket/SKILL.md:69).
save_issue() { # {id} to update, else {team, title}; plus description, parentId, state, labels, assignee
  _call '.s as $s
    | (if $a.parentId then ($s.linear.issues[$a.parentId] // error("parent issue not found")) else null end)
    | (if $a.id then
         ($s.linear.issues[$a.id] // error("issue not found"))
         + ($a | with_entries(select(.key | IN("title", "description", "parentId", "state", "labels", "assignee"))))
       else
         ($s.linear.teams[$a.team] // error("team not found"))
         | {id: "\($a.team)-\([$s.linear.issues[] | select(.team == $a.team)] | length + 1)", team: $a.team,
            title: $a.title, description: ($a.description // ""), parentId: ($a.parentId // null),
            state: ($a.state // "Backlog"), labels: ($a.labels // []), assignee: ($a.assignee // null)}
       end) as $new
    | if ($new.state | IN($s.linear.teams[$new.team].states[])) | not then error("no state \($new.state) in team \($new.team)") else . end
    | {s: ($s | .linear.issues[$new.id] = $new), out: $new}' "$1"
}

get_issue() { # {id}
  _call '.s as $s | {s: $s, out: ($s.linear.issues[$a.id] // error("issue not found"))}' "$1"
}

list_issue_statuses() { # {team}
  _call '.s as $s | {s: $s, out: [($s.linear.teams[$a.team] // error("team not found")).states[] | {name: .}]}' "$1"
}
