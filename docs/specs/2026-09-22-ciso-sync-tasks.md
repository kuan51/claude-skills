---
owner: kuan51
review_by: 2027-03-22
generated: false
---

# ciso sync-tasks: push control gaps to JIRA or Linear

Design record for `plugins/ciso/skills/sync-tasks/` (ciso 1.1.4). It replaces the retired
2026-07-20 superpowers spec and plan for PM task sync, whose work shipped. Fabflows format.

## Behaviour

A user asks to sync their outstanding compliance gaps to a tracker. The skill turns every control
whose `assessment.status` is `gap` or `in_progress` (for r2, any control with at least one such
maturity dimension) into a ticket in JIRA or Linear, closes tickets for controls that have since
become `met` or `not_applicable`, and records the linkage back into `docs/ciso/state.json`.

**Trackers.** JIRA and Linear only, driven through the pre-installed MCP connectors. The skill
ships no HTTP client and handles no credentials; `references/jira.md` and `references/linear.md`
say which MCP tool to call and how to map fields.

**Hierarchy.** One epic per certification. Tier grouping: Linear nests a parent issue per tier;
JIRA uses a per-tier label or component by default, or a "Feature" issue per tier when the user
confirms Advanced Roadmaps is available. One task per eligible control, titled
`[<control.id>] <topicLabel>`. For r2, one subtask per gapped or in-progress dimension under the
control's task.

**State.** `sync.destination` (system, project or team, issue type, Advanced Roadmaps flag, epic
id, tier group ids) is asked once and persisted. Each synced control gains
`tracker: { system, id, url, status, syncedAt, subtasks? }`.

**Logic.** `lib/diff-tasks.js` is the only code: `classifyState` reads `state.json` and returns
create, update and close lists; `recordTracker`, `saveDestination` and `recordTierGroup` write
results back. No MCP call happens inside the library. The skill runs the classifier, performs the
MCP calls per the reference, writes the tracker blocks, and reports created, updated and closed
counts with links.

## Check

```bash
node --test "plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js"
```

Passes as part of the 295-test ciso suite at the time of writing. Behavioural check: a second
run against an unchanged `state.json` classifies nothing as create.

## Out of scope

- MS Project Online, SharePoint, Trello, Confluence.
- A generic cross-skill task-sync mechanism; the source is the ciso dashboard state only.
- Custom API clients or credential storage.
- Running sync automatically after an interview; it is an explicit user action.

## Decisions

- MCP connectors over custom clients, so the plugin never touches tokens.
- Linkage stored in `state.json`, not a side file, so one gitignored file holds all local state.
- One ticket per r2 control with dimension subtasks, not one ticket per dimension, so the parent
  closes only when every dimension is resolved.
- Plain-JIRA grouping by default because epic-to-feature nesting needs a paid add-on.
- The classifier is pure and dependency-free so it is testable with a fixture `state.json`.

## Deferred

- Further trackers, following the same reference-document pattern.
- An automated end-to-end test against a real JIRA project or Linear workspace; today that is a
  manual check after the user authorises the connectors.
