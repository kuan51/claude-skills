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
      projects: {ABC: {workflow: "review"}, XYZ: {workflow: "review"}, BAS: {workflow: "basic"}, NDN: {workflow: "nodone"}, TST: {workflow: "nocancel"}},
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
          {id: "42", name: "Dupe", to: "Duplicate"}],
        # No cancel-type status, names equal to their to; as the real TEST project (2026-09-26).
        nocancel: [
          {id: "11", name: "To Do", to: "To Do"},
          {id: "21", name: "In Progress", to: "In Progress"},
          {id: "31", name: "In Review", to: "In Review"},
          {id: "41", name: "Done", to: "Done"}]
      },
      issues: {}, links: {}
    },
    # FAB has the statuses and labels of the live Fabflows team (2026-09-26). OPS names its done
    # and cancel statuses so that only their type finds them.
    linear: {
      me: "lin-dev",
      teams: {
        FAB: {
          states: [
            {name: "Backlog", type: "backlog"}, {name: "Todo", type: "unstarted"},
            {name: "In Progress", type: "started"}, {name: "In Review", type: "started"},
            {name: "Duplicate", type: "duplicate"}, {name: "Done", type: "completed"},
            {name: "Canceled", type: "canceled"}],
          labels: ["Bug", "Feature", "Improvement", "change-normal", "class-a", "class-b"]},
        OPS: {
          states: [
            {name: "Backlog", type: "backlog"}, {name: "Doing", type: "started"},
            {name: "Duplicate", type: "duplicate"}, {name: "Shipped", type: "completed"},
            {name: "Dropped", type: "canceled"}],
          labels: []}},
      projects: {Test: {teams: ["FAB"]}, Ops: {teams: ["OPS"]}},
      issues: {}}
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
# As the live Fabflows team behaved (FAB-1 to FAB-12, 2026-09-26).
_LIN='
def lin_get($id): .linear.issues[$id] // error("Could not find issue \"\($id)\"");
def lin_chain($id): if $id == null then empty else $id, lin_chain(.linear.issues[$id].parentId) end;
# By name, else by type: "canceled" finds Canceled, never Duplicate (FAB-6).
def lin_state($t; $v): ([.linear.teams[$t].states[] | select(.name == $v)] + [.linear.teams[$t].states[] | select(.type == $v)])[0]
  // error("no state \($v) in team \($t)");
# One unknown label refuses the whole call, and no label changes (FAB-4, labels, addLabels and removeLabels).
def lin_labels($t; $l): .linear.teams[$t].labels as $have
  | ($l // []) | map(. as $n | if $n | IN($have[]) then $n else error("Could not find label \"\($n)\"") end);
'

save_issue() { # {id} to update, else {team, title}; plus project, description, parentId, state, labels or addLabels/removeLabels, assignee, links
  _call "$_LIN"'.s as $s
    | (if $a.id then ($s | lin_get($a.id)) else
         ($s.linear.teams[$a.team] // error("team not found")) as $t
         | {id: "\($a.team)-\([$s.linear.issues[] | select(.team == $a.team)] | length + 1)", team: $a.team,
            title: ($a.title // error("title is required")), description: null, project: null, parentId: null,
            status: "Backlog", statusType: "backlog", labels: [], assignee: null, attachments: []}
       end) as $i
    # The parent must exist and must not be a descendant (FAB-999 and FAB-1 under FAB-7 refused).
    # A closed parent is accepted (FAB-12 under Canceled FAB-6): only setup refuses one.
    | (if $a.parentId then ($s | lin_get($a.parentId)) | if $i.id | IN($s | lin_chain($a.parentId)) then
         error("Cannot set parent because it would create a circular issue hierarchy.") else . end else . end)
    # The project is not inherited from the parent (FAB-11): only a passed one is set.
    | (if $a.project then ($s.linear.projects[$a.project] // error("project not found"))
         | .teams as $ts | if ($i.team | IN($ts[])) | not then error("project is not in team \($i.team)") else . end else . end)
    | if ($a | has("labels")) and (($a | has("addLabels")) or ($a | has("removeLabels"))) then error("labels cannot be combined with addLabels or removeLabels") else . end
    | ($s | lin_labels($i.team; $a.labels)) as $set
    | ($s | lin_labels($i.team; $a.addLabels)) as $add
    | ($s | lin_labels($i.team; $a.removeLabels)) as $rm
    | ($i
       | if $a.title then .title = $a.title else . end
       | if $a | has("description") then .description = $a.description else . end
       | if $a | has("parentId") then .parentId = $a.parentId else . end
       | if $a | has("project") then .project = $a.project else . end
       | if $a.state then ($s | lin_state($i.team; $a.state)) as $st | .status = $st.name | .statusType = $st.type else . end
       # labels replaces the set; addLabels and removeLabels go in one call (FAB-4).
       | if $a | has("labels") then .labels = $set else .labels = ((.labels - $rm) + ($add - .labels)) end
       # One assignee; "me" is the signed-in user (FAB-5).
       | if $a | has("assignee") then .assignee = (if $a.assignee == "me" then $s.linear.me else $a.assignee end) else . end
       # links attach once per URL: a second save with the same URL keeps the first (FAB-5).
       | reduce ($a.links // [])[] as $l (.; if $l.url | IN(.attachments[].url) then . else .attachments += [$l] end)) as $new
    | {s: ($s | .linear.issues[$new.id] = $new), out: $new}' "$1"
}

get_issue() { # {id}
  _call "$_LIN"'.s as $s | {s: $s, out: ($s | lin_get($a.id))}' "$1"
}

list_issue_statuses() { # {team}
  _call '.s as $s | {s: $s, out: ($s.linear.teams[$a.team] // error("team not found")).states}' "$1"
}

list_issue_labels() { # {team}
  _call '.s as $s | {s: $s, out: {labels: [($s.linear.teams[$a.team] // error("team not found")).labels[] | {name: .}]}}' "$1"
}
