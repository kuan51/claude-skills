---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# CISO Dashboard → PM Tool Task Sync (JIRA + Linear)

## Context

The `ciso` plugin (`plugins/ciso/`) assesses HITRUST controls (e1/i1/r2 tiers) into a project-local `docs/ciso/state.json`, rendered as `dashboard.html` via `skills/_shared/render-dashboard.js`. Right now the only outputs are that dashboard and MyCSF xlsx import/export — there's no way to push outstanding compliance gaps into the project management tools (JIRA, Linear, etc.) that engineering teams actually use to track remediation work. This design adds a new skill that turns "controls with unresolved gaps" into real tickets in JIRA or Linear, so compliance findings become actionable, trackable engineering tasks instead of living only in a static HTML dashboard.

Scope for this pass: JIRA and Linear only (the most common modern issue trackers). MS Project Online, SharePoint, Trello, and Confluence are explicitly deferred to a follow-up using the same pattern.

## Requirements gathered during brainstorming

- Source of tasks: the CISO/HITRUST dashboard only (not a generic cross-skill mechanism).
- Tool scope: JIRA and Linear now; other PM tools documented as future work.
- Which controls become tasks: `assessment.status` in `{gap, in_progress}` (r2: any control with at least one gapped/in-progress maturity dimension).
- Integration mechanism: drive PM tools through the pre-installed MCP connectors (`mcp__atlassian__*`, `mcp__linear__*`) already available in this environment — no custom HTTP clients, no credentials handled by our code.
- Trigger: a new skill invoked explicitly by the user, separate from the assessment/dashboard flow.
- Destination config (project/team, issue type, etc.): asked interactively on first run, then persisted in `state.json` so later runs don't re-ask.
- Ticket linkage storage: back into `docs/ciso/state.json` (not a separate file) as a `tracker` field per control.
- Resolution handling: when a control's status later becomes `met`/`not_applicable`, the sync skill automatically transitions/closes its linked ticket.
- r2 granularity: one ticket per control with subtasks per gapped/in-progress PRISMA maturity dimension, not one ticket per dimension.
- Hierarchy: tickets sit under an epic representing the certification (e.g. "HITRUST 2026"), grouped by tier (e1/i1/r2) inside that epic.
- JIRA tier grouping: JIRA epics only link directly to tasks without the paid Advanced Roadmaps add-on. Default to plain-JIRA-compatible grouping (label/component per tier); if Advanced Roadmaps is available, use a "Feature" issue per tier instead.

## Approach

**New skill**: `plugins/ciso/skills/sync-tasks/`, following the existing plugin conventions (`SKILL.md` + `lib/*.js` + `references/*.md`, same shape as `skills/hitrust/`). Invoked explicitly by the user (e.g. "sync my HITRUST gaps to JIRA") — a separate concern from the assessment/dashboard flow, not a step bolted onto it.

**No custom API clients.** All tracker calls go through the pre-installed MCP connectors already present in this environment — `mcp__atlassian__*` (createJiraIssue, editJiraIssue, transitionJiraIssue, addCommentToJiraIssue, etc.) and `mcp__linear__*` (once the user authorizes those connectors via claude.ai connector settings). The skill's `references/jira.md` and `references/linear.md` tell Claude exactly which MCP tool to call and how to map fields — no HTTP clients, no API tokens handled by our code.

**Ticket hierarchy** (mirrors the certification → tier → control → dimension structure already in state.json):
- **Epic** = the certification itself (e.g. "HITRUST 2026"), created once, id remembered.
- **Tier grouping** (e1/i1/r2):
  - Linear: a real nested parent issue per tier under the certification issue (Linear supports arbitrary parent/child nesting).
  - JIRA: if Advanced Roadmaps is available, use a "Feature" issue per tier under the epic; otherwise (default, since AR is a paid add-on) tasks link directly to the epic and carry a `e1`/`i1`/`r2` label/component for grouping/filtering.
- **Task** = one per control with `assessment.status` in `{gap, in_progress}` (r2: any control with at least one gapped/in-progress maturity dimension).
- **Subtasks** (r2 only) = one per gapped/in-progress PRISMA dimension (policy/procedure/implemented/measured/managed) under that control's task. Parent task only closes once all dimension subtasks are closed.

**Data model additions to `docs/ciso/state.json`** (gitignored, project-local — no schema migration needed elsewhere):
```
sync: {
  destination: {
    system: "jira" | "linear",
    projectKey | teamId, issueType,
    hasAdvancedRoadmaps: bool,       // jira only
    epicId, epicUrl,
    tierGroupIds: { e1, i1, r2 }     // linear features / jira "Feature" ids, when applicable
  }
}
control.tracker: {
  system, id, url, status: "open"|"closed", syncedAt,
  subtasks?: { <dimension>: { id, url, status } }   // r2 only
}
```
Destination config is asked once (tracker, project/team, issue type, AR availability) and persisted; later runs reuse it without re-asking.

**Core logic** — `lib/diff-tasks.js` (the one real piece of code; everything else is instructional reference docs for Claude to follow):
- Reads `state.json`, classifies every eligible control into **create** / **update** / **close**:
  - create: status is gap/in_progress and no `control.tracker` yet.
  - update: status/dimension states changed since `tracker.syncedAt`.
  - close: status is now met/not_applicable but `tracker` exists and isn't closed (same per-dimension logic for r2 subtasks).
- A companion function writes the `tracker` (and `subtasks`) blocks back into `state.json` after Claude reports what it created/closed via MCP calls.
- Pure, dependency-free classification logic — easy to unit test with a fixture `state.json`, no MCP calls involved.

**Flow**:
1. User invokes the skill. If `sync.destination` is unset, ask which tracker + project/team/issue-type (+ AR availability for JIRA), persist it, create the epic if it doesn't exist yet.
2. Run `lib/diff-tasks.js` → get create/update/close lists.
3. Creates: call the tracker's create-issue MCP tool per field mapping in `references/<system>.md` (title = `"[<control.id>] <topicLabel>"`, description = statementText + justification + roadmap recommendation, tier label/parent as designed above). r2: create parent, then subtask per gapped dimension.
4. Closes: call the tracker's transition tool to move the ticket (and any now-resolved subtasks) to Done/Completed.
5. Write resulting `tracker` blocks back into `state.json`.
6. Report a summary: N created, N updated, N closed, with links.

## Critical files
- `plugins/ciso/skills/sync-tasks/SKILL.md` — new, routing hub (frontmatter: name, description, allowed-tools)
- `plugins/ciso/skills/sync-tasks/lib/diff-tasks.js` — new, create/update/close classification + state.json writer
- `plugins/ciso/skills/sync-tasks/references/jira.md` — new, JIRA field/hierarchy mapping instructions
- `plugins/ciso/skills/sync-tasks/references/linear.md` — new, Linear field/hierarchy mapping instructions
- `plugins/ciso/skills/hitrust/lib/register-tier.js` — reference only, source of truth for the existing control/assessment shape being read (not modified)
- `plugins/ciso/test/skills-frontmatter.test.js` — extend to cover the new skill's frontmatter

## Testing

- Unit test `lib/diff-tasks.js`'s classification (create/update/close, including r2 per-dimension subtask logic) against a fixture `state.json` covering gap, in_progress, met, and previously-synced controls.
- Frontmatter test passes for the new skill (`npm test` in `plugins/ciso`, matching existing `test/skills-frontmatter.test.js` pattern).
- Manual end-to-end check: once the user authorizes the `atlassian`/`linear` connectors, run the skill against a real `state.json` with a mix of gap/in_progress/met controls and confirm epic → tier grouping → task → subtask tickets are created correctly in a real JIRA project and Linear workspace, and that a second run correctly no-ops creates, applies updates, and closes resolved tickets.
