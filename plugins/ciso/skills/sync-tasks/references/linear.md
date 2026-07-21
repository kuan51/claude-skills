# Linear field mapping and hierarchy

Linear's MCP tool names aren't yet known in this environment (the `productivity:linear` connector requires the user to authorize it first). Before the first Linear call in a session, run `ToolSearch` with query `"linear"` to discover the actual tool names and their parameter schemas, then follow this mapping using whichever create/update/transition tools that search surfaces (Linear's MCP server conventionally exposes issue-create, issue-update, and issue-search/list tools scoped to a team).

## One-time setup (when `sync.destination` is unset)

1. List the user's Linear teams/projects (via whichever list/search tool `ToolSearch` surfaces) and ask which team to file tickets into (store as `destination.teamId`).
2. Create the certification parent issue: title `"<certDisplayName> <year or cycle, if known>"`, no parent. Store its id/url as `destination.epicId`/`destination.epicUrl`.
3. Create one parent issue per tier being synced (title `"<certDisplayName> — <tier> controls"`, `parentId` = the certification issue's id) and store each in `destination.tierGroupIds.<tier>`. Unlike JIRA, this always happens for Linear — there's no add-on gate — so `hasAdvancedRoadmaps` is not applicable here.

## Creating a control's task (action `create`)

- `title`: `"[<control.id>] <control.topicLabel>"`
- `description`: `<control.topicSummary>` (blank line) `Justification: <assessment.justification or inProgress.currentState>` (blank line, r2 only) `Outstanding dimensions: <comma-separated list from dimensionActions keys>`
  - r2 controls have no whole-control `assessment.justification`/`assessment.inProgress`. For r2, build the `Justification:` line(s) per gapped dimension instead, from `assessment.maturity.<dimension>.justification` (or `assessment.maturity.<dimension>.inProgress.currentState` when still in progress).
- `parentId`: `destination.tierGroupIds.<tier>`
- If `dimensionActions` is present (r2), after creating the parent task, create one sub-issue per `dimensionActions` entry whose value is `"create"`: `title: "[<control.id>] <dimension>"`, `parentId` = the just-created task's id.
- After every create, call `recordTracker(stateJsonPath, certKey, tierKey, controlId, { system: "linear", id, url, status: "open", syncedAt: <now> })`, with `subtasks: { <dimension>: {id, url, status: "open", syncedAt} }` added for each sub-issue created.

## Updating (action `update`)

- Flat tier: add a comment to the existing issue with the new `justification`/`inProgress` text; do not change its state. Then `recordTracker` with a refreshed `syncedAt`.
- r2: for each `dimensionActions` entry: if `"update"`, comment on that dimension's sub-issue the same way; if `"close"`, follow the Closing section below for that sub-issue only; if `"create"` (the control was already synced — it has a `tracker` and an existing issue — but this dimension newly became gapped and has no sub-issue yet), create the sub-issue exactly as described in "Creating a control's task" above (`parentId` = this control's existing issue id, same `title: "[<control.id>] <dimension>"` pattern), then call `recordTracker` to add `{ <dimension>: {id, url, status: "open", syncedAt} }` to the control's `tracker.subtasks`.

## Closing (action `close`)

- Update the issue's (or, for r2, the specific dimension sub-issue's) state to Linear's "Completed" (or workspace-equivalent done) state. Then `recordTracker` setting that ticket's (or subtask's) `status: "closed"` and a refreshed `syncedAt`. `recordTracker`'s subtask merge replaces each dimension's whole value rather than deep-merging inside it, so for r2 the `subtasks.<dimension>` patch must carry the full object — `{id, url, status: "closed", syncedAt}` — not just `{status, syncedAt}`, or the previously-stored `id`/`url` for that sub-issue will be lost.
- r2 parent: only close the parent task itself once every dimension sub-issue is closed (this is already what `action: "close"` at the control level means, per `classifyR2Control`).
