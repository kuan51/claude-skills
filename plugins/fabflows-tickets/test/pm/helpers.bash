# Shared helpers: a temp repo, the real ticket.js as hook and CLI, and the steps
# skills/ticket/SKILL.md prescribes, replayed against the fakes in fake-tracker.bash.

bats_require_minimum_version 1.13.0

TICKET="$BATS_TEST_DIRNAME/../../hooks/ticket.js"

# A repo on branch `feature` with origin/main and origin/HEAD, as repo() in test/ticket.test.js.
repo() {
  REPO="$BATS_TEST_TMPDIR/repo"
  git init -q -b main "$REPO"
  g config user.email test@example.com
  g config user.name test
  g config commit.gpgsign false
  g commit -q --allow-empty -m init
  g update-ref refs/remotes/origin/main HEAD
  g symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
  g checkout -q -b feature
}
g() { git -C "$REPO" "$@"; }

# ticket.js as a CLI in the repo.
cli() { (cd "$REPO" && node "$TICKET" "$@"); }

# ticket.js as a hook: <payload JSON>, cwd set to the repo. It must exit 0. Prints the
# permissionDecision and the additionalContext, each when present.
hook() {
  local out
  out=$(jq -c --arg cwd "$REPO" '. + {cwd: $cwd}' <<<"$1" | node "$TICKET") || {
    echo "hook exited $?" >&2
    return 1
  }
  [ -z "$out" ] || jq -r '.hookSpecificOutput | (.permissionDecision, .additionalContext) | select(.)' <<<"$out"
}
pre_bash() { hook "$(jq -nc --arg c "$1" '{hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {command: $c}}')"; }
post_bash() { hook "$(jq -nc --arg c "$1" '{hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {command: $c}}')"; }
pre_tool() { hook "$(jq -nc --arg t "$1" --argjson i "$2" '{hook_event_name: "PreToolUse", tool_name: $t, tool_input: $i}')"; }
post_tool() { hook "$(jq -nc --arg t "$1" --argjson i "$2" '{hook_event_name: "PostToolUse", tool_name: $t, tool_input: $i}')"; }
session_start() { hook '{"hook_event_name": "SessionStart", "source": "startup"}'; }

# A field of the tracker state, for assertions.
state() { jq -c "$1" "$BATS_TEST_TMPDIR/tracker.json"; }

# Status matching (skills/ticket/SKILL.md:180-193), always on a transition's `to`, never its
# name (SKILL.md:176-177). norm drops case and apostrophes, so Won't Fix is Wont Fix.
_MATCH='
def norm: ascii_downcase | explode | map(select(. != 39 and . != 8217)) | implode;
def names($t): {"in progress": ["in progress", "in development", "doing"],
  "in review": ["in review", "code review", "review"],
  "done": ["done", "closed", "resolved"],
  "cancelled": ["wont do", "wont fix", "cancelled", "canceled", "declined"]}[$t];
# How far along a status is: at or past the target stays put (SKILL.md:191-192).
def rank: norm as $n
  | if $n | IN("in progress", "in development", "doing") then 1
    elif $n | IN("in review", "code review", "review", "ready for testing", "qa") then 2
    elif $n | IN("done", "closed", "resolved", "wont do", "wont fix", "cancelled", "canceled", "declined",
                 "duplicate", "cannot reproduce", "working as designed") then 3
    else 0 end;
'

# Move a Jira ticket toward <in progress|in review|done|cancelled>, forward only. Prints
# "no fit" when nothing matches (SKILL.md:193), and leaves the status.
jira_move() {
  local key=$1 target=$2 cur id
  cur=$(getJiraIssue "{\"issueIdOrKey\": \"$key\"}" | jq -r '.fields.status.name') || return 1
  [ "$cur" = Blocked ] && return 0 # a holding status (SKILL.md:192)
  id=$(getTransitionsForJiraIssue "{\"issueIdOrKey\": \"$key\"}" | jq -r --arg cur "$cur" --arg t "$target" "$_MATCH"'
    def pick($t): [.transitions[] | select(.to.name | norm | IN(names($t)[]))][0].id;
    ($cur | rank) as $r
    | if $r >= {"in progress": 1, "in review": 2, "done": 3, "cancelled": 3}[$t] then empty
      # No review status: use in progress (SKILL.md:183).
      else pick($t) // (if $t == "in review" and $r < 1 then pick("in progress") else null end) // "no fit" end') || return 1
  case "$id" in
    "") ;;
    "no fit") echo "no fit" ;;
    *) transitionJiraIssue "{\"issueIdOrKey\": \"$key\", \"transition\": {\"id\": \"$id\"}}" >/dev/null ;;
  esac
}

# True when <body> carries a closing phrase for <key> (SKILL.md:225-227, 244-245).
closes() {
  local re='(^|[^A-Za-z])(close[sd]?|fix(e[sd])?|resolve[sd]?):?[[:space:]]+'
  grep -qiE "$re$2([^A-Za-z0-9-]|\$)" <<<"$1"
}

# Move a Linear issue toward <target>, forward only. Linear has no transitions: any status is
# reachable, even backwards (FAB-7 Done to Backlog), so the order is kept here. done and
# cancelled match on the status type, in progress and in review on the name (both are type
# started). Prints "no fit" when nothing matches.
linear_move() {
  local id=$1 target=$2 cur name
  cur=$(get_issue "{\"id\": \"$id\"}") || return 1
  name=$(list_issue_statuses "$(jq -c '{team}' <<<"$cur")" | jq -r --argjson cur "$cur" --arg t "$target" "$_MATCH"'
    def pick($t): if $t == "done" then [.[] | select(.type == "completed")][0].name
      elif $t == "cancelled" then [.[] | select(.type == "canceled")][0].name
      else [.[] | select(.name | norm | IN(names($t)[]))][0].name end;
    (if $cur.statusType | IN("completed", "canceled", "duplicate") then 3 else $cur.status | rank end) as $r
    | if $r >= {"in progress": 1, "in review": 2, "done": 3, "cancelled": 3}[$t] then empty
      else pick($t) // (if $t == "in review" and $r < 1 then pick("in progress") else null end) // "no fit" end') || return 1
  case "$name" in
    "") ;;
    "no fit") echo "no fit" ;;
    *) save_issue "$(jq -nc --arg id "$id" --arg s "$name" '{id: $id, state: $s}')" >/dev/null ;;
  esac
}
