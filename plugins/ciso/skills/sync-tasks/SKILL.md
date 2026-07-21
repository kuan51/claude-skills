---
name: sync-tasks
description: Use when pushing outstanding HITRUST control gaps from ciso's docs/ciso/state.json into JIRA or Linear as trackable tickets, or when re-running that sync to pick up newly-resolved or newly-gapped controls.
allowed-tools: Read, Bash, AskUserQuestion
---

# Sync Tasks

## Overview

Turns HITRUST controls with an unresolved `assessment.status` (`gap` or `in_progress`) into real tickets in JIRA or Linear, so compliance findings become actionable engineering work instead of living only in the static `dashboard.html`. Invoked explicitly by the user (e.g. "sync my HITRUST gaps to JIRA") — a separate concern from the `ciso:hitrust` assessment flow, never run automatically as part of it.

Tickets are created via the pre-installed `mcp__atlassian__*` (JIRA/Confluence) or Linear MCP connector tools — never via a custom HTTP client, and never with an API token handled by this skill's own code. If the relevant connector isn't authorized yet, tell the user to authorize it via their claude.ai connector settings (or `/mcp` in an interactive session) and stop.

**Scope:** JIRA and Linear only. If the user asks for MS Project Online, SharePoint, Trello, or Confluence-as-a-tracker, tell them that's not built yet.

## Ticket hierarchy

- **Epic** = the certification (e.g. "HITRUST 2026"), created once per certification, remembered in `state.json`.
- **Tier grouping** (e1/i1/r2):
  - Linear: a real parent issue per tier, nested under the certification issue.
  - JIRA: a "Feature" issue per tier under the epic *only if* the user confirms Advanced Roadmaps is available; otherwise (the default) tasks link directly to the epic and carry an `e1`/`i1`/`r2` label/component instead.
- **Task** = one per control with `assessment.status` in `{gap, in_progress}` (r2: any control with at least one gapped/in-progress PRISMA dimension).
- **Subtask** (r2 only) = one per gapped/in-progress PRISMA dimension (policy/procedure/implemented/measured/managed), nested under that control's task.

## Routing

1. Determine the project's `docs/ciso/` path the same way `ciso:hitrust` does — check the current working directory's `docs/ciso/state.json` first; if that's not obviously right, ask the user. **If `state.json` doesn't exist, tell the user to run `ciso:init` (and register a tier via `ciso:hitrust`) first, and stop.**
2. Ask which certification (`certKey`, e.g. `"hitrust"`) and tier (`e1`/`i1`/`r2`) to sync, if there's more than one registered in `state.json`.
3. Read `state.certifications.<certKey>.sync.destination` (see `lib/diff-tasks.js`'s `getDestination`). If it's not set:
   - Ask which tracker (JIRA or Linear), and the destination details for that tracker (JIRA: project key, issue type, whether Advanced Roadmaps is available; Linear: team/project).
   - Create the certification's epic issue in that tracker (see the matching reference doc), then call `saveDestination` to persist `{system, projectKey|teamId, issueType, hasAdvancedRoadmaps, epicId, epicUrl, tierGroupIds: {}}`.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/skills/sync-tasks/lib/diff-tasks.js" <state.json> <certKey> <tier>` to get `{creates, updates, closes}` (each entry shaped `{controlId, action, dimensionActions?}` — see `lib/diff-tasks.js`'s `classifyState`).
5. Load `references/jira.md` or `references/linear.md` (matching `destination.system`) and follow it exactly for how to create/update/close tickets for each entry, calling `recordTracker(stateJsonPath, certKey, tierKey, controlId, trackerPatch)` after every MCP call that creates, comments on, or transitions a ticket.
6. Report a summary to the user: N created, N updated, N closed, with ticket links.

## Core discipline

- Never hand-edit `state.json`'s `assessment` or `roadmap` data — this skill only reads those and writes to `tracker` / `sync`, via `lib/diff-tasks.js`'s functions.
- Never invent a ticket ID, URL, or ticket hierarchy relationship — every `tracker` field written must come from an actual MCP tool call's response.
- If an MCP call fails (auth, permissions, rate limit), stop and report the failure to the user rather than silently skipping the control or fabricating a result.
