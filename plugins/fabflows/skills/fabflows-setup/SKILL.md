---
name: fabflows-setup
compatibility: Claude Code with the fabflows plugin enabled. Needs the AskUserQuestion and ToolSearch tools and, for a tracker, that tracker's MCP server. Not portable to Claude.ai or the API.
description: 'Choose where this repository keeps its specs: a GitHub Issues, Jira or Linear ticket, or docs/specs/ as before. Asks where specs live, checks that the tracker''s MCP tools are connected, asks for the project and an optional parent epic or story, and writes .claude/fabflows.json for fabflows:ticket and fabflows:brainstorming to read. Never connects a server and never handles a secret. Triggers on "/fabflows-setup", "set up fabflows", "connect fabflows to Jira", "use GitHub issues for specs", "configure the tracker", "where should specs live".'
---

# fabflows setup

Once per repository. The answer lands in a committed `.claude/fabflows.json`: plugin
`userConfig` is per-user, and a cloud container is thrown away after the session.

## 1. Ask

Run this in the main thread, never in a worker: a worker cannot ask the user. Ask one
AskUserQuestion question, "Where should specs for this repository live?" with four
options: **GitHub Issues**, **Jira**, **Linear**, **None (keep `docs/specs/`)**. The
built-in "Other" answer takes a free-text tracker name.

**None:** write no file. If `.claude/fabflows.json` exists, offer to delete it and commit
the removal. Stop: `fabflows:brainstorming` keeps writing to `docs/specs/`.

## 2. Check the tools are loaded

Search with ToolSearch for the tracker's tools, named in `fabflows:ticket`'s tool table:
`issue_write` for GitHub, `getJiraIssue` for Jira (also search `discover` and `execute`:
some Atlassian servers expose only those two), `save_issue` for Linear, the tracker's name
for Other.

Nothing found: say which server is missing, then tell the user to connect it themselves:
`/mcp` to authenticate a server that is already configured, or the tracker's own MCP setup
guide to add one. Then stop. This skill never runs `claude mcp add`, and never asks for,
reads or stores a token, key or password: a secret typed into chat stays in the transcript.

## 3. Ask for the project

| Tracker | Ask for | Default to offer |
| --- | --- | --- |
| GitHub | `owner/repo` | from `git remote get-url origin` |
| Jira | project key, and optionally the site (`example.atlassian.net`) | none |
| Linear | team key | none |
| Other | whatever names the project in that tracker | none |

For GitHub, Jira or Linear, then ask whether new tickets should be filed under a parent: an
epic or story (`ABC-7`) for Jira, an issue (`#7`, or `owner/repo#7` in another repository)
for GitHub, a parent issue (`ABC-7`) for Linear. It is optional, so offer "none" first. An
Other tracker gets no parent.

When given, read it once with the tracker's read tool from `fabflows:ticket`'s tool table
and check it can hold child tickets. Refuse one not found, a GitHub pull request or closed
issue, a Jira sub-task, and a Jira story or task outside `project`, since its sub-tasks must
share its project. For GitHub, also check that `issue_write` takes `parent_issue_number`. An
older server without it cannot attach a parent. On any refusal, say why, then ask again or
go on without one.

## 4. Ask for compliance frameworks

Ask one multi-select AskUserQuestion question, "Which compliance frameworks apply to this
repository?" It has three options: **SOC 2** (`soc2`), **ISO 27001** (`iso27001`) and
**IEC 62304** (`iec62304`). The built-in "Other" answer takes free text: lowercased, with
spaces turned into `-`, and it must match `^[a-z0-9-]{1,30}$`. Ask again for a value that
does not.

The chosen values go into `compliance.frameworks`. Choosing no framework
leaves compliance off: write no `compliance` key. With compliance on, every ticket spec
needs a Compliance section, per `fabflows:ticket`.

## 5. Write and commit

Write `.claude/fabflows.json` with the Write tool:

```json
{"tracker": "jira", "project": "ABC", "site": "example.atlassian.net", "parent": "ABC-7", "compliance": {"frameworks": ["soc2", "iso27001"]}}
```

`tracker` is `github`, `jira`, `linear`, or the Other name in lowercase with dashes.
`site` and `parent` are `""` when there is none.

Tell the user the file will be committed, so in a public repository the site name becomes
public. Offer to commit it on the current branch (never the default branch). Then point
them at `fabflows:ticket` for how tickets are linked and kept current.
