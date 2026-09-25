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

MCP tool names carry a server prefix (`mcp__<server>__issue_read`), so match on the suffix.

| Tracker | Read | Create / edit | Status | Comment | Web link |
| --- | --- | --- | --- | --- | --- |
| GitHub Issues | `issue_read` | `issue_write` | `issue_write` (open, closed) | `add_issue_comment` | none needed: the PR's closing phrase or `Refs` line links it |
| Jira | `getJiraIssue` | `createJiraIssue`, `editJiraIssue` | `getTransitionsForJiraIssue`, then `transitionJiraIssue` | `addCommentToJiraIssue` (v2 servers: `addOrEditJiraIssueComment`) | read: `getJiraIssueRemoteIssueLinks` (Atlassian Rovo), or `jira_get_issue` with `include: "remote_links"` (mcp-atlassian). Create: `jira_create_remote_issue_link` (mcp-atlassian only) |
| Linear (untested) | `get_issue` | `save_issue` | `save_issue` | `save_comment` | not covered |

Other tracker: find the equivalent tools with ToolSearch and tell the user they are untested.

## Permission

Standing permission covers only a **confirmed** link: the one `ticket.js link` recorded for
this branch after the user said yes to that key. On it, without asking, you may edit the
description, transition the status, add the PR link (in Links and, on Jira, as a web link),
and set the labels `ticket.js labels` prints, since they are computed from text the user
approved.

Everything else needs the user's yes first: creating a ticket, touching any other ticket, and
touching a ticket known only from a `Refs:` trailer (the SessionStart line says "not
confirmed").

Link once the user has said yes, with every argument single-quoted:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ticket.js" link '<key>' '<url>' '<tracker>'
```

`<key>` is `#12` or `owner/repo#12` for GitHub, `ABC-12` for Jira and Linear. `<url>` is the
ticket's `https://` address. `<tracker>` is the `tracker` value from `.claude/fabflows.json`.

## Parent

When `.claude/fabflows.json` has a non-empty `parent`, create every ticket under it in the
create call itself, so a refused parent leaves no ticket behind:

- Jira: read the parent with `getJiraIssue` first, then pass it as `parent` to
  `createJiraIssue`. Under an epic, use Task or Story. Under a story or task, use the
  project's sub-task type, the only type Jira nests there.
- GitHub: pass the parent's number as `parent_issue_number` to `issue_write` create. For a
  parent in another repository (`owner/repo#7`), also pass `parent_owner` and `parent_repo`.
- Linear (untested): set the parent issue on `save_issue`.

This applies only to tickets you create: linking an existing ticket never re-parents it.
Attaching the new ticket is the only change the parent gets, and the user's yes to create
the ticket covers it. Never edit the parent's description, status or fields. If the tracker
refuses the parent, say so and ask before creating the ticket without it.

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

When compliance is on (`.claude/fabflows.json` has a non-empty `compliance.frameworks`), add
a `## Compliance` section before `Links`:

```markdown
## Compliance
- Controls: <control IDs such as soc2-cc8.1, comma-separated, or none>
- Change: <normal, standard or emergency>
- Class: <A, B, C or n/a>
- Traces: <requirement IDs such as REQ-AUTH-1, comma-separated; drop the line if none>
```

Ask the user for Controls, Change and Class. Claude never guesses them: they are the
auditor's record of what the change touches and how risky it is. With compliance on,
`ticket.js approve` refuses a ticket without a valid Compliance section.

After writing the section, write the ticket text to a scratch file with the Write tool and
run `ticket.js labels < <file>`. Set the labels it prints with the tracker's label tools,
Jira `editJiraIssue` with `fields: { labels: [...] }` (confirmed from the tool schema),
GitHub `issue_write` with `labels`, which replaces the whole list (confirmed by a live
test), Linear untested. Pass the ticket's other labels too. When replacing labels, remove
only fabflows' own: any `ctl-` label, `change-normal`, `change-standard`,
`change-emergency`, `class-a`, `class-b`, `class-c` and `class-na`. Keep every other label.
Labels are a best-effort copy of the section: a label Claude cannot set (the tracker rejects
it, or it does not exist) is reported to the user and never blocks work.

Links stays last: the approval fingerprint ignores everything from it down, so adding the PR
does not count as a spec change.

## Keeping it current

The description is edited in place. Never post the spec, a status or a progress note as a
comment: the only comment is one at close, and only when the outcome differs from the spec.

Edit the description only:

- when the user agrees to change Behaviour, Check, Out of scope, Decisions or Compliance;
  then re-approve per `fabflows:brainstorming` section 6, or the next `ticket.js check` fails,
  and after a Compliance change set the labels again;
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
`title`, and denies `gh pr create --fill` or `--web`, whose title it can't see. Then run
`ticket.js pr '<url>'`, and on Jira add the web link (see Web link below).

A PR that finishes the ticket carries the tracker's closing phrase in its body (`Closes #N`,
`Fixes KEY`). A PR that does not finish it carries `Refs` only (`Refs: #N`, `Refs: KEY`), so
merging it leaves the ticket open.

After a PR merges (check it did first: the reminder also fires after a failed merge command),
read the ticket. If the PR carried a closing phrase for the key, confirm the ticket is closed and
transition it to done yourself if not. Post the close comment if the outcome differs from the
spec. Then run `ticket.js clear --pr '<url>'`, whether or not the tracker closed it. If the PR
was Refs-only, leave the ticket open.

## Web link

On Jira, the PR also goes in the ticket's Web links panel. That panel is a remote issue link,
a different API from the description. Do this only on a confirmed link (see Permission), and
only once, right after the PR is created, never after a later push. The reminder after a PR
is created names the web link. The one after a push does not.

1. Read the ticket's remote links with the Web link read tool from the tool table. If the PR
   URL is there, skip steps 2 and 3. If no tool can read them, go on.
2. Create the link with the Web link create tool, passing the PR URL and the PR title. Then
   read the links again to confirm it is there. The create tool takes no `globalId`, so
   Jira cannot catch a duplicate: step 1 is the only guard.
3. No create tool loaded: tell the user once to add the PR URL as a web link by hand, then
   go on. On mcp-atlassian (tools named `jira_*`), the create tool is in the `jira_links`
   toolset, which is not one of its default toolsets, so also tell the user that adding
   `jira_links` to its `TOOLSETS` setting lets Claude do it. The Atlassian Rovo server
   has none. Claude must never ask for, read or use an API token to work around this.

The key in the PR title also lets the GitHub for Jira app list the PR in the Development
panel, which is not a web link.
