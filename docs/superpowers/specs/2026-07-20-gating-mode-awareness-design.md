---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Design: `data-analysis-review` gating flow mode-awareness

**Date:** 2026-07-20
**Status:** Approved (brainstorming phase complete)

## Context

`data-analysis-review`'s gating flow (`SKILL.md` Part 1) forces plan mode: step 1 calls
`EnterPlanMode` "if not already active," and step 7 always ends at an `ExitPlanMode`
approval gate. This overrides the mode the user chose for the session. The skill should
instead respect the ambient mode:

- **Plan mode:** gather inputs, then present the reviewer roster + agent fan-out +
  workflow for approval via `ExitPlanMode` — an explicit gate before the (token-heavy)
  engine runs.
- **All other modes:** run the same gathering + confirmation steps and start the engine
  directly, with no `EnterPlanMode`/`ExitPlanMode` ceremony.

The user chose "keep all confirmations": the thesis / roster / save-preference
`AskUserQuestion` prompts (steps 3–5) still run in every mode. Only the plan-mode
ceremony is conditional.

## Goals

- Stop forcing plan mode; detect it and branch only the ceremony (steps 1 and 7).
- Preserve every information-gathering and confirmation step across all modes.
- In plan mode, the presented plan explicitly includes the agent fan-out across the three
  engine phases (Independent EDA → Reconcile → Cross-Compare), not just the roster.

## Non-Goals

- **No change to `workflow.js`** — control flow, schemas, sandboxing untouched.
- **No change to the hard thesis rule** — "do not proceed on a guessed thesis" stays in
  force in every mode.
- **No change to steps 2–6** — they are already mode-independent.

## Changes (one file: `skills/data-analysis-review/SKILL.md`, Process section)

1. **L19 (overview):** remove "(this conversation, plan mode)"; state the gating phase is
   the same in every mode, differing only in whether it ends at a plan-mode approval gate
   or proceeds straight into the engine.
2. **L21 (Part 1 header):** "### Part 1: Gating flow" (drop "(plan mode)").
3. **L23 (step 1):** replace the forced `EnterPlanMode` with a mode-detect step — if
   already in plan mode, present for approval at step 7; if not, do NOT call
   `EnterPlanMode`, run steps 2–6 identically, and start the engine directly at step 7.
4. **L45 (step 7):** conditional. Plan mode → `ExitPlanMode` with a plan restating
   thesis/goals, hierarchy findings, skills to load, reviewer roster (with citations for
   deep-research extras), the agent fan-out across the three engine phases, and save
   preference; approval → Part 2. Other modes → restate that same summary in the
   conversation for the record, then proceed directly to Part 2 with no gate.
5. **L47 (Part 2 header):** "(after gating)" instead of "(after `ExitPlanMode` approval)".

## Files Touched

- `skills/data-analysis-review/SKILL.md` — Process section prose only.
- Untouched: `workflow.js`, all agent files, `report-builder.js`, templates, references.

## Verification

- `node --test test/skill-frontmatter.test.js` — passes (frontmatter/`description`
  unchanged).
- End-to-end read: steps 1→7 coherent in both branches; no residual plan-mode assumption
  in Part 2 or Guarantees.
- Live: plan mode on → skill waits at `ExitPlanMode`; plan mode off → skill still runs
  the confirmation prompts, then starts the `Workflow` with no gate.
