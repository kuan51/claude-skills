---
name: hitrust
description: Use when registering HITRUST CSF controls (e1, i1, or r2) into ciso tracking, importing a MyCSF requirements export, running the control-by-control assessment interview, researching vendor solutions for gaps, or reconciling a HITRUST framework version upgrade.
allowed-tools: Read, Write, Bash, AskUserQuestion, EnterPlanMode, ExitPlanMode, Workflow
---

# HITRUST CSF

## Overview

Single entry point for all HITRUST CSF work inside a project's `docs/ciso/` tracking data, across all three nested tiers (e1 ⊂ i1 ⊂ r2): register a tier's control set, optionally import an organization's own MyCSF requirements export, run the control-by-control assessment interview, research budget-appropriate vendor solutions for whatever's a gap (in the background, without blocking the interview), and reconcile a new HITRUST framework version when one ships.

Each flow's step-by-step mechanics live in a reference file under `references/`, loaded only when you run that flow. This page is the always-loaded routing hub plus the invariants that hold no matter which flow you're in -- read the matching reference once Routing picks a flow.

**Tier authority and this must always be communicated to the user:**
- **e1 and i1** both ship `sourceAuthority: "public-topic-level"` content: topic-level structure compiled from public sources only (HITRUST advisories, public secondary write-ups, HITRUST-authorized-assessor write-ups) -- no licensed MyCSF export is used as an input to either shipped file. Explicitly non-authoritative; every entry citation-backed; a `relatedControlCode`/`legacyCategoryPrefix` is populated only on the minority of entries where a public citation actually verified that specific code, never invented for the rest. **Always tell the user this is non-authoritative and point them at MyCSF or an authorized assessor for exact scope, counts, and wording** before they rely on it for a real assessment. HITRUST's verbatim requirement-statement wording is licensed content and never lives in this plugin regardless.
- **r2** ships a small illustrative-only example set (not the real ~2000+-entry scope) pending its own dedicated compilation pass -- tell the user this explicitly if r2 comes up.
- If an org obtains its own licensed `<tier>` MyCSF export, importing it **replaces that tier's `controls` map wholesale** (this plugin's synthetic topic-level ids never line up with real per-statement MyCSF ids -- there's no field-level merge path). Whatever was previously registered is archived first, not deleted, tagged `archivedReason: "import-replaced"`, as a raw safety-net snapshot -- see [Import](references/import.md).

## Core discipline (holds in every flow)

These invariants always apply; the detailed mechanics live in the per-flow references, but never let a reference not being loaded be an excuse to skip one of these.

- **Never hand-edit `state.json` to record or change an assessment.** Every status write goes through `apply-assessment.js` (see [Interview](references/interview.md)) -- it's the mechanical gate that enforces the two rules below; hand-editing silently bypasses it.
- **"Met" always needs a real justification; "in progress" needs both a current-state and an estimated-closeness.** A one-word or evasive answer isn't enough -- ask again rather than record a placeholder.
- **Never silently skip a control.** Every control gets asked, even if the answer is "defer."
- **An org's posture stays local.** Justifications and in-progress notes never enter vendor research -- only a control's public subject does (see [Roadmap](references/roadmap.md)).

## Routing

Always start here, every invocation:

1. Determine the project's `docs/ciso/` path -- check the current working directory's `docs/ciso/state.json` first; if that's not obviously the right project, ask the user.
2. Read `<docs/ciso>/state.json`. **If it doesn't exist, tell the user to run `ciso:init` first and stop** -- do not scaffold it yourself.
3. **Pick a tier.** If `certifications.hitrust` doesn't exist yet, or the user hasn't said which tier they mean, ask (`AskUserQuestion`): e1 (recommended starting point), i1, or r2. Remind them of the authority difference above when i1/r2 is chosen. Everything below is parameterized by this tier choice (`<tier>` is `e1`, `i1`, or `r2`).
4. **Check for a version upgrade FIRST, unconditionally, before anything else below.** If `certifications.hitrust.tiers.<tier>` already exists AND the plugin's bundled `controls/<tier>.v*.structure.json` has a newer `controlSetVersion` than what's recorded in state, go straight to Upgrade -- do not offer Register/Import/Interview/Roadmap first. Interview and roadmap data may need reconciling against the new structure before any of those flows should touch it. (Not applicable to a brand-new tier registration -- there's nothing yet to upgrade.)
5. Otherwise, inspect `certifications.hitrust.tiers.<tier>`, pick the flow whose situation matches, and **open its reference file (path in the table) and follow it**:

| Situation | Flow | Read & follow |
|---|---|---|
| `<tier>` missing entirely | **Register** | `references/register.md` |
| Present, `sourceAuthority` is `structural-only`/`public-topic-level` | **Import** — offer it (recommended, not mandatory; the user may decline and go straight to Interview on topic labels alone) | `references/import.md` |
| Present, interview session not complete | **Interview** — resume the existing `interviewSessions` entry for `hitrust`/`<tier>` | `references/interview.md` |
| Any `domainsCompleted` domain has a `gap`/`in_progress` control with `roadmap.status` still `not_started`/`researching` | **Roadmap** — background vendor research; checked continuously as domains complete, never blocks the interview | `references/roadmap.md` |
| Bundled structure newer than state (step 4) | **Upgrade** | `references/upgrade.md` |

Reference paths are relative to this skill dir (`${CLAUDE_PLUGIN_ROOT}/skills/hitrust/references/<flow>.md`). The references cross-link each other along the common Register → Import → Interview → Roadmap path; read only the one for the flow you're running, not all of them.
