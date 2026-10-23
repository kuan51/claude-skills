# fabflows-tickets

Companion to [fabflows](../fabflows/). Keeps each fabflows spec in a GitHub Issues, Jira or
Linear ticket and writes audit trace reports. Requires fabflows 2.x, and does nothing on its
own.

> **This plugin installs an active hook.** `ticket.js` runs on every `Bash` and `PowerShell`
> call and on PR tools: once a branch is linked to a ticket it can block commits with an
> inline message that lacks the ticket's trailers and PR creation whose title lacks its key,
> and it adds context at SessionStart and after pushes, PR creation and merges. See
> [Tickets](#tickets).

## Upgrading from fabflows 1.x

Ticketing moved out of fabflows in fabflows 2.0.0. A repository whose `.claude/fabflows.json`
names a tracker needs `fabflows-tickets` installed and enabled wherever fabflows runs,
including a project's own plugin settings (project threads load plugins only from there).
Without it, builds stop, and plain commits and PRs on a linked branch are no longer checked
for trailers. `.claude/fabflows.json` and the ticket state in the git dir keep their names
and formats, so links recorded by fabflows 1.x still work.

## What's included

- The `setup` skill (`/fabflows-tickets:setup`) points the repository at a tracker.
- The `ticket` skill (`fabflows-tickets:ticket`) keeps the linked ticket current; see
  [Tickets](#tickets).
- The `trace` skill (`/fabflows-tickets:trace`) writes an audit report of merged changes with
  their tickets, specs and approvals; see [Compliance](#compliance).
- The `ticket.js` hook, wired to SessionStart, PreToolUse and PostToolUse.

## Tickets

A repository can keep its specs in a tracker ticket instead of `docs/specs/`, so a PR diff
carries no spec file and the spec sits where managers track the work.

**Setup.** Run `/fabflows-tickets:setup` once. It asks for GitHub Issues, Jira, Linear or none,
checks that the tracker's MCP tools are loaded, asks for the project (for Linear, the team
and then the project, usually named after the repository) and an optional parent
epic, story or issue that every new ticket is filed under, and writes
`.claude/fabflows.json`, which is committed. It never connects a server and never handles a
secret: connect the tracker's MCP server yourself first. `fabflows-tickets:ticket` carries the
rules after that: the tool table, the ticket body template, what a confirmed link lets
Claude do without asking, and how status moves from in progress to in review to done, or to cancelled when that PR
closes unmerged.
When a workflow names its statuses differently, Claude picks the closest match and only
moves a ticket forward; if nothing fits, it leaves the status alone and tells you.
On Jira it also adds the PR to the ticket's Web links panel, when the MCP server has a tool
that creates a remote issue link. mcp-atlassian has one in its `jira_links` toolset, which
`TOOLSETS=default` leaves out. The Atlassian Rovo server has none, so there Claude gives you
the PR URL to add by hand.
On Linear it attaches the PR to the issue with `save_issue`.
When the PR opens, Claude also assigns the PR, and an unassigned ticket, to the developer
the MCP server or `gh` is signed in as. It adds that user rather than replacing anyone, and
asks you before taking a ticket someone else holds.

**Hooks.** `hooks/ticket.js` keeps a per-branch link: one state file per branch under
`fabflows/tickets` in the common git dir (`git rev-parse --git-common-dir`), named by a hash
of the branch, never in the working tree. Every worktree of the repository sees the same
links. It reads only that local state; every tracker write is Claude's own MCP
call. `ticket.js status` prints the current branch's link, `ticket.js prs` prints every
link with a recorded PR (key, URL, tracker and PR, never a branch name), and
`ticket.js clear --pr '<url>'` forgets a link after its branch is gone.

**A fresh clone.** Links are local, so a new clone or project thread starts with none.
After each approval Claude adds a `- Spec: <hash>` bullet to the ticket's Links section, so
the approved fingerprint is visible on the tracker. In a new clone, `ticket.js recover`
rebuilds the link from the ticket text. It records the approval only when that Links Spec,
the text's fingerprint and the newest `Refs:` plus `Spec:` commit trailer on the branch all
agree. Otherwise Claude shows you the text and asks you to approve it again. The steps are
under "Recover a link" in `fabflows-tickets:ticket`.

- SessionStart prints this branch's line: the linked ticket, a link found only in a `Refs:` trailer
  (unconfirmed, so Claude asks first), or a reminder that the branch has none. At startup
  only (not resume, clear or compact), on any checkout, it adds a line naming the other
  confirmed links with a recorded PR, so a PR merged or closed in the GitHub UI still gets
  its ticket handled. Claude runs `ticket.js prs`, reads each PR's state, and follows the
  "After a PR closes" steps in `fabflows-tickets:ticket`. For a PR closed without merging whose body
  has a closing phrase, Claude asks you before it cancels the ticket (Won't Do, not planned,
  Canceled) with one comment, and it never marks that ticket Done. A Refs-only PR leaves
  the ticket open. For a PR whose state can't be read, Claude asks you what happened and
  keeps the link until you answer.
  Both lines together stay within 600 characters.
- PreToolUse denies a `git commit` with an inline message that lacks `Refs: <key>` (and
  `Spec: <hash>` once the spec is approved), and a PR creation whose title lacks the key. It
  splits a command at `&&`, `||`, `;`, `|`, `&`, parentheses and newlines, minding quotes,
  heredocs and comments, and also reads the commands inside `$(...)` and backticks, up to
  eight levels deep. Each commit needs the lines in its own message: a trailer in an `echo`
  or in another commit does not count.
- PostToolUse reminds Claude to update the ticket after a push and a PR creation, and after a
  PR creation on a Jira ticket to add the web link, which a push never repeats. After a
  merge (not `gh pr merge --auto` or `--disable-auto`) it finds the ticket by the PR the merge
  named, or, for a bare `gh pr merge`, by the branch it started on. It asks Claude to check
  the merge happened, and closes the ticket only for a PR with a closing phrase: a Refs-only
  PR leaves it open.

**Approval.** The user approves the ticket description as raw text, never rendered: a raw
diff of what Claude wrote against what the tracker holds, or the full raw text when Claude
did not write it. `ticket.js normalize` removes only HTML comments outside fences, invisible
and control characters, and the Links section, so the build gets exactly the text approved.
A `<!--` inside inline code is kept. An unclosed `<!--` removes everything after it, as a
renderer hides it, so `ticket.js approve` refuses that text and names the line.
The approval fingerprint (`ticket.js approve`) and the `Spec:` trailer on every commit tie
the build to that text: `ticket.js check` fails if the ticket changed since, and names the
stored approved text so Claude can show the raw diff.

**Fail-open limits.** The hooks fail open, like the guard, so these pass unchecked:

- The plugin is disabled: no hook runs at all.
- The tracker's MCP server is disconnected: the hooks still demand trailers, but nothing
  updates the ticket.
- SessionStart does not fire on your surface: no reminder line, so Claude learns of the
  link only from a later hook.

**Key-matching limits.** A `Refs:` or `Spec:` trailer must stand on its own message line,
and its key or hash must match exactly (`ABC-12` does not satisfy `ABC-1`, `#70` does not
satisfy `#7`). Only an inline message (`-m`, `--message`, `-F -`) is checked; a commit
written in the editor or from a file (`-F <file>`) is not. A trailer nested inside another
quoted string still passes, and the hook does not look inside `bash -c`, `eval`, an alias,
a heredoc body, or a backtick nested in backticks.
A command whose quotes don't balance is read whole, as one command. A `gh pr create` without
`--title`/`-t` (`--fill`, `--web`) is denied on a linked branch, because its title can't be
checked. The merge reminder also fires after a failed merge command, so it asks Claude to
check first.

## Compliance

Auditors (SOC 2 CC8.1, ISO 27001 A.8.32, IEC 62304) sample merged changes and trace each
one to a ticket, an approved spec and an approval. fabflows keeps that record in the ticket
and writes the trace as a report.

**Setup.** After the tracker, `/fabflows-tickets:setup` asks which frameworks apply: SOC 2, ISO
27001, IEC 62304, or your own. It writes them to `compliance.frameworks` in
`.claude/fabflows.json`. Choosing none leaves compliance off.

**The Compliance section.** With compliance on, each ticket spec carries a `## Compliance`
section before Links:

```markdown
## Compliance
- Controls: soc2-cc8.1
- Change: normal
- Class: B
- Traces: REQ-AUTH-1
```

Controls is a list of control IDs or `none`, Change is `normal`, `standard` or `emergency`,
Class is `A`, `B`, `C` or `n/a`, and Traces is optional. Claude asks you for the values and
never guesses them. The section sits inside the approval fingerprint, and `ticket.js
approve` refuses a spec without a valid one.

**Labels.** `ticket.js labels` turns the section into tracker labels: `ctl-soc2-cc8-1`,
`change-normal`, `class-b` (`n/a` becomes `na`). Claude sets them with the tracker's MCP
tools. The section is the record, and the labels are a copy for filtering.

**The trace report.** `/fabflows-tickets:trace` asks for a range (the newest tag on the default
branch to its tip by default) and an output directory. `ticket.js trace` defaults `<to>` to
`origin/HEAD`, else `main`, `master`, `origin/main` or `origin/master`. `--out` must be an
absolute path outside the checkout, the main worktree and the git dir. The skill runs
`ticket.js trace`, adds each PR's author, approvers and merge commit (`mergeCommit`) from
GitHub and each ticket's body and labels from the tracker, and writes `trace.md` and
`trace.csv`. It is never committed. The columns are commit, date, author, AI, PR, PR
author, approvers, tickets, key source, spec hashes, ticket fingerprints, controls, change,
class, traces, expected labels, actual labels and flags. A PR whose `mergeCommit` is not the
row's commit is flagged `pr-mismatch`. Each flag is defined once, in the
[trace skill's flag table](skills/trace/SKILL.md#flags).

Commit messages can carry instructions, so they go into the files and never back into the
session. `trace --json` carries no git free text, and Claude reads only the summary and each
flagged row's SHA, PR, key and flags from the report. PR titles, PR bodies and review bodies
do reach Claude through the GitHub tools, the same accepted path as ticket bodies.

**Limits.**

- Labels are best-effort. A tracker may reject a label or lack it, and GitHub's MCP server
  cannot create one. Claude reports a label it could not set and carries on.
- AI authorship is detected by trailer and author name only (`Co-Authored-By` and the
  commit author). The trailer is opt-out, so a `no` proves nothing.
- A re-approved ticket marks earlier commits `spec-changed`, because the report compares
  each commit's `Spec:` with the ticket as it is now.
- The report is no proof of review quality. It shows that an approval happened, not that
  the review was careful.
- `trace` needs git 2.24 or later, for `--end-of-options`.

## Tests

```bash
node --test "plugins/fabflows-tickets/test/*.test.js"
```

`ticket.test.js` drives `ticket.js` in temporary git repositories. `ticket-skills.test.js`,
`required-rules.test.js`, `frontmatter.test.js` and `trigger-corpus.test.js` check that the
skills still state their rules and carry valid frontmatter.

### PM suite

```bash
bats plugins/fabflows-tickets/test/pm
```

An offline Bash suite for the ticket and PR flows. It replays the steps the `ticket` skill
prescribes against in-memory fakes of GitHub Issues, Jira and Linear, and runs the real
`ticket.js` hooks and CLI in a temporary git repository. Each test checks the final tracker
state and the hook output. It makes no model or network calls, so it checks the steps, not
whether Claude follows them. It needs bats-core 1.13 or later (for example
`npm install -g bats`) and jq.
