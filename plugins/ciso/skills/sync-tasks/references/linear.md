# Linear field mapping and hierarchy

Linear's MCP tool names aren't yet known in this environment (the `productivity:linear` connector requires the user to authorize it first). Before the first Linear call in a session, run `ToolSearch` with query `"linear"` to discover the actual tool names and their parameter schemas, then follow this mapping using whichever create/update/transition tools that search surfaces (Linear's MCP server conventionally exposes issue-create, issue-update, and issue-search/list tools scoped to a team).

## One-time setup (when `sync.destination` is unset)

1. List the user's Linear teams/projects (via whichever list/search tool `ToolSearch` surfaces) and ask which team to file tickets into (store as `destination.teamId`).
2. Create the certification parent issue: title `"<certDisplayName> <year or cycle, if known>"`, no parent. Store its id/url as `destination.epicId`/`destination.epicUrl`.
3. Leave `destination.tierGroupIds` empty (`{}`). Tier parent issues are **not** created here — they're created per tier, on the sync that first needs each one (see "Ensuring this tier's parent" below), so that a later `i1`/`r2` sync still creates its own tier parent even though the destination already exists. Unlike JIRA there's no add-on gate — Linear always uses tier parents — so `hasAdvancedRoadmaps` is not applicable here.

## Ensuring this tier's parent (every sync, before creating that tier's tasks)

Linear always groups controls under a per-tier parent issue. If `destination.tierGroupIds.<tier>` is unset for the tier being synced, create the tier parent: title `"<certDisplayName> — <tier> controls"`, `parentId` = the certification issue's id (`destination.epicId`). Then persist it with `recordTierGroup(stateJsonPath, certKey, tier, <new issue id>)`. This is also how the *first* tier's parent gets created — one-time setup no longer does it.

## Creating a control's task (action `create`)

- `title`: `"[<control.id>] <control.topicLabel>"`
- `description`: `<control.topicSummary>` (blank line) `Justification: <assessment.justification or inProgress.currentState>` (blank line, r2 only) `Outstanding dimensions: <comma-separated list from dimensionActions keys>`
  - r2 controls have no whole-control `assessment.justification`/`assessment.inProgress`. For r2, build the `Justification:` line(s) per gapped dimension instead, from `assessment.maturity.<dimension>.justification` (or `assessment.maturity.<dimension>.inProgress.currentState` when still in progress).
- `parentId`: `destination.tierGroupIds.<tier>`
- If `dimensionActions` is present (r2), after creating the parent task, create one sub-issue per `dimensionActions` entry whose value is `"create"`: `title: "[<control.id>] <dimension>"`, `parentId` = the just-created task's id.
- After every create, call `recordTracker(stateJsonPath, certKey, tierKey, controlId, { system: "linear", id, url, status: "open", syncedAt: <now> })`, with `subtasks: { <dimension>: {id, url, status: "open", syncedAt} }` added for each sub-issue created.

## Updating (action `update`)

- Flat tier: add a comment to the existing issue with the new `justification`/`inProgress` text; do not change its state. Then `recordTracker` with a refreshed `syncedAt`.
- r2: for each `dimensionActions` entry: if `"update"`, comment on that dimension's sub-issue the same way; if `"close"`, follow the Closing section below for that sub-issue only; if `"create"` (the control was already synced — it has a `tracker` and an existing issue — but this dimension newly became gapped and has no sub-issue yet), create the sub-issue exactly as described in "Creating a control's task" above (`parentId` = this control's existing issue id, same `title: "[<control.id>] <dimension>"` pattern), then call `recordTracker` to add `{ <dimension>: {id, url, status: "open", syncedAt} }` to the control's `tracker.subtasks`; if `"reopen"` (this dimension's sub-issue was closed after resolving and the dimension has since regressed, while the parent issue is still open), move that sub-issue's state back to an open/"Todo" state and add a comment noting the regression, then `recordTracker` its **full** subtask object `{ <dimension>: {id, url, status: "open", syncedAt} }` (as in the Closing section, the per-dimension merge replaces the whole value, so carry `id`/`url`, not just `status`/`syncedAt`).

## Closing (action `close`)

- Update the issue's (or, for r2, the specific dimension sub-issue's) state to Linear's "Completed" (or workspace-equivalent done) state. Then `recordTracker` setting that ticket's (or subtask's) `status: "closed"` and a refreshed `syncedAt`. `recordTracker`'s subtask merge replaces each dimension's whole value rather than deep-merging inside it, so for r2 the `subtasks.<dimension>` patch must carry the full object — `{id, url, status: "closed", syncedAt}` — not just `{status, syncedAt}`, or the previously-stored `id`/`url` for that sub-issue will be lost.
- r2 parent: only close the parent task itself once every dimension sub-issue is closed (this is already what `action: "close"` at the control level means, per `classifyR2Control`).

## Reopening (action `reopen`)

A control (r2: its parent) was closed after resolving, then reassessed back to `gap`/`in_progress`. The issue already exists — its `id`/`url` are in the tracker — so **move the existing issue back to an open state; never create a duplicate**.

- Flat tier: update the closed issue's state back to an open/"Todo" (or workspace-equivalent) state, then add a comment noting the control regressed, with the new `justification`/`inProgress` text. Then `recordTracker` with `status: "open"` and a refreshed `syncedAt`.
- r2: move the parent issue's state back to an open state and `recordTracker` the parent with `status: "open"` + refreshed `syncedAt`, then handle each `dimensionActions` entry exactly as in the Updating section — `"reopen"` moves that dimension's closed sub-issue back open + comment; `"create"` creates a new sub-issue (a dimension newly gapped since the parent closed) under this control's existing issue — each `recordTracker` carrying the **full** subtask object `{id, url, status: "open", syncedAt}`.
