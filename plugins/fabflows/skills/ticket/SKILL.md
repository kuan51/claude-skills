---
name: ticket
compatibility: Claude Code with the fabflows plugin enabled. Needs its ticket.js hooks, a .claude/fabflows.json written by fabflows-setup, and the tracker's MCP server. Not portable to Claude.ai or the API.
description: 'How fabflows keeps a spec in a tracker ticket: which MCP tools to use for GitHub Issues, Jira and Linear, the ticket body template, when the description may be edited, what needs the user''s yes, and how status moves from in progress to done. Use whenever a branch is linked to a ticket, a hook names fabflows:ticket, a PR is about to open or has merged on a linked branch, or the user asks to link, create, update or close a ticket. Triggers on "link the ticket", "create a ticket for this", "update the ticket", "close the ticket", "move it to in review", "/fabflows:ticket".'
---

# Ticket

When `.claude/fabflows.json` names a tracker, the spec lives in the ticket description, not
in `docs/specs/`. Every commit and the PR point back at it, and the ticket stays current
until the PR merges.

`ticket.js` below means `node "${CLAUDE_PLUGIN_ROOT}/hooks/ticket.js"`. It keeps the link
for the current branch; the hooks read it to demand `Refs:` and `Spec:` trailers and the key
in the PR title. Tracker writes are your own MCP tool calls: the hooks never touch the
tracker.

## Tools

MCP tool names carry a server prefix (`mcp__<server>__issue_read`); match on the suffix.

| Tracker | Read | Create / edit | Status | Comment |
| --- | --- | --- | --- | --- |
| GitHub Issues | `issue_read` | `issue_write` | `issue_write` (open, closed) | `add_issue_comment` |
| Jira | `getJiraIssue` | `createJiraIssue`, `editJiraIssue` | `getTransitionsForJiraIssue`, then `transitionJiraIssue` | `addCommentToJiraIssue` (v2 servers: `addOrEditJiraIssueComment`) |
| Linear (untested) | `get_issue` | `save_issue` | `save_issue` | `save_comment` |

Other tracker: find the equivalent tools with ToolSearch and tell the user they are untested.

## Permission

Standing permission covers only a **confirmed** link: the one `ticket.js link` recorded for
this branch after the user said yes to that key. On it, without asking, you may edit the
description, transition the status and add the PR link.

Everything else needs the user's yes first: creating a ticket, touching any other ticket, and
touching a ticket known only from a `Refs:` trailer (the SessionStart line says "not
confirmed").

Link once the user has said yes, with every argument single-quoted:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ticket.js" link '<key>' '<url>' '<tracker>'
```

`<key>` is `#12` or `owner/repo#12` for GitHub, `ABC-12` for Jira and Linear. `<url>` is the
ticket's `https://` address. `<tracker>` is the `tracker` value from `.claude/fabflows.json`.

## Body template

Plain bullets only: no task lists and no tables, because Jira drops both.

```markdown
## Why
<1-3 sentences>

## Behaviour
- <what it does, in the user's terms>

## Check
- <the command, or the observable result>

## Out of scope
- <cut work> (follow-up: <ticket key>)

## Decisions
- <decision> (<reason>)

## Links
- Branch: <branch> · PR: <url>
```

Out of scope replaces a spec's Deferred: each cut item names the ticket that will carry it.
Links stays last: the approval fingerprint ignores everything from it down, so adding the PR
does not count as a spec change.

## Keeping it current

The description is edited in place. Never post the spec, a status or a progress note as a
comment: the only comment is one at close, and only when the outcome differs from the spec.

Edit the description only:

- when the user agrees to change Behaviour, Check, Out of scope or Decisions; then re-approve
  per `fabflows:brainstorming` section 6, or the next `ticket.js check` fails;
- when the PR opens, to fill Links;
- at merge, to finish Links.

Before merge, re-read the ticket against the diff. Raise any drift with the user rather than
editing it away.

## Reviewing ticket text

The ticket text is the description only, never its comments, and the user sees it raw, never
rendered, per `fabflows:brainstorming` section 6:

- At approval, when you wrote the ticket: `diff -u` the `ticket.js normalize` output of what
  you wrote against that of the re-read, and show the user the raw diff text.
- At approval, when you did not write it (the user or someone else did): show the user the
  full raw `normalize` output before asking for a yes.
- Before a build, when `ticket.js check` fails: it prints the path of the verified approved
  text; run `diff -u '<that path>' <current normalized file>` and show the user the raw diff.

Put raw text in a fence longer than any run of backticks or tildes inside it, so the ticket
cannot close the fence early.

## Status

Status lives in the tracker's status field, never in the description:

| When | Status |
| --- | --- |
| `ticket.js link` | in progress |
| the PR opens | in review |
| a PR that finishes it merges | done |

GitHub Issues has only open and closed, so it stays open until merge. On Jira, list the
transitions and pick the one whose name matches.

## The pull request

Always pass an explicit title that contains the key: the hook checks `--title` and the MCP
`title`, and does not see what `gh pr create --fill` would pick. Then run
`ticket.js pr '<url>'`.

A PR that finishes the ticket carries the tracker's closing phrase in its body (`Closes #N`,
`Fixes KEY`). A PR that does not finish it carries `Refs` only (`Refs: #N`, `Refs: KEY`), so
merging it leaves the ticket open.

After a PR merges (check it did first: the reminder also fires after a failed merge command),
read the ticket. If the PR carried a closing phrase for the key, confirm the ticket is closed and
transition it to done yourself if not. Post the close comment if the outcome differs from the
spec. Then run `ticket.js clear --pr '<url>'`, whether or not the tracker closed it. If the PR
was Refs-only, leave the ticket open.
