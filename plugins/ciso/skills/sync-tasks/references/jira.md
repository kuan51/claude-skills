# JIRA field mapping and hierarchy

Use `mcp__atlassian__*` tools (confirm exact tool names for this connector instance with `ToolSearch` — query `"select:mcp__atlassian__createJiraIssue,mcp__atlassian__editJiraIssue,mcp__atlassian__transitionJiraIssue,mcp__atlassian__getJiraProjectIssueTypesMetadata,mcp__atlassian__getVisibleJiraProjects"` — before the first call, since the tool schemas are deferred until loaded).

## One-time setup (when `sync.destination` is unset)

1. Call `getVisibleJiraProjects` and ask the user to pick the target project (store its key as `destination.projectKey`).
2. Call `getJiraProjectIssueTypesMetadata` for that project; ask the user which issue type to use for control tasks (store as `destination.issueType`, typically `"Task"`).
3. Ask the user whether their JIRA site has Advanced Roadmaps enabled (store as `destination.hasAdvancedRoadmaps`, boolean).
4. Create the certification epic: `createJiraIssue` with `issueType: "Epic"`, `summary: "<certDisplayName> <year or cycle, if known>"`. Store the result's issue key/url as `destination.epicId`/`destination.epicUrl`.
5. If `hasAdvancedRoadmaps` is true, create one "Feature" issue per tier being synced (`summary: "<certDisplayName> — <tier> controls"`, parent = the epic) and store each tier's key in `destination.tierGroupIds.<tier>`. If false, leave `tierGroupIds` empty — tier grouping happens via label/component instead (see below).

## Creating a control's task (action `create`)

- `summary`: `"[<control.id>] <control.topicLabel>"`
- `description`: `<control.topicSummary>` (blank line) `Justification: <assessment.justification or inProgress.currentState>` (blank line, r2 only) `Outstanding dimensions: <comma-separated list from dimensionActions keys>`
- `issueType`: `destination.issueType`
- Parent: `destination.tierGroupIds.<tier>` if Advanced Roadmaps is available, else the epic (`destination.epicId`) directly.
- Labels/components (when not using Advanced Roadmaps): add a label or component named `<tier>` (e.g. `"e1"`) so tickets are still filterable by tier on a plain JIRA board.
- If `dimensionActions` is present (r2), after creating the parent task, create one subtask per `dimensionActions` entry whose value is `"create"`: `summary: "[<control.id>] <dimension>"`, parent = the just-created task's key.
- After every create, call `recordTracker(stateJsonPath, certKey, tierKey, controlId, { system: "jira", id, url, status: "open", syncedAt: <now> })`, with `subtasks: { <dimension>: {id, url, status: "open", syncedAt} }` added for each subtask created.

## Updating (action `update`)

- Flat tier: append a comment to the existing ticket (`addCommentToJiraIssue`) with the new `justification`/`inProgress` text; do not change the ticket status. Then `recordTracker` with a refreshed `syncedAt`.
- r2: for each `dimensionActions` entry, if `"update"`, comment on that dimension's subtask the same way; if `"close"`, follow the Closing section below for that subtask only.

## Closing (action `close`)

- Call `transitionJiraIssue` to move the ticket (or, for r2, the specific dimension subtask) to a "Done"/resolved transition. Then `recordTracker` setting that ticket's (or subtask's) `status: "closed"` and a refreshed `syncedAt`.
- r2 parent: only transition the parent task itself once every dimension subtask is closed (this is already what `action: "close"` at the control level means, per `classifyR2Control`).
