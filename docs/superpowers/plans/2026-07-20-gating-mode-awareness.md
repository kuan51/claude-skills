# Gating Mode-Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `data-analysis-review`'s gating flow respect the ambient harness mode — approval gate in plan mode, straight-to-engine otherwise — without dropping any confirmation step.

**Architecture:** Prose-only edits to `SKILL.md`'s Process section. Steps 1 and 7 (the plan-mode ceremony) become conditional; steps 2–6 and the `Workflow` engine are untouched.

**Tech Stack:** Markdown skill prompt; `node:test` for frontmatter regression.

## Global Constraints

- Only `plugins/data-analysis-review/skills/data-analysis-review/SKILL.md` changes.
- `workflow.js`, agent files, `report-builder.js`, templates, references — untouched.
- Frontmatter (`name`, `description`) unchanged — only body prose.
- Hard rule preserved verbatim: "Do not proceed past this step on a guessed thesis."
- Commit style: `feat(data-analysis-review): …`.

---

### Task 1: Spec + plan docs

**Files:**
- Create: `docs/superpowers/specs/2026-07-20-gating-mode-awareness-design.md`
- Create: `docs/superpowers/plans/2026-07-20-gating-mode-awareness.md`

- [ ] **Step 1: Write both docs** (this file + the design doc).
- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-20-gating-mode-awareness-design.md docs/superpowers/plans/2026-07-20-gating-mode-awareness.md
git commit -m "docs(data-analysis-review): add spec and plan for gating mode-awareness"
```

---

### Task 2: Make the gating ceremony mode-aware in SKILL.md

**Files:**
- Modify: `plugins/data-analysis-review/skills/data-analysis-review/SKILL.md` (lines 19, 21, 23, 45, 47)

**Interfaces:** none — prose only. The `Workflow` `args` contract in step 9 is unchanged.

- [ ] **Step 1: Overview line (L19)** — replace:

> This is a two-part process: an interactive gating phase (this conversation, plan mode), then a `Workflow`-driven analysis engine.

with:

> This is a two-part process: an interactive gating phase, then a `Workflow`-driven analysis engine. The gating phase runs the same way in every mode -- the only difference is how it ends: in plan mode it presents the gathered plan for approval via `ExitPlanMode`; in every other mode it proceeds straight into the engine.

- [ ] **Step 2: Part 1 header (L21)** — replace `### Part 1: Gating flow (plan mode)` with `### Part 1: Gating flow`.

- [ ] **Step 3: Step 1 (L23)** — replace:

> 1. **Enter plan mode.** Call `EnterPlanMode` if not already active.

with:

> 1. **Detect the mode; don't force plan mode.** If the harness is already in plan mode, you'll present the gathered plan for approval at step 7. If it is not in plan mode, do NOT call `EnterPlanMode` -- run steps 2-6 exactly as written and start the engine directly at step 7. Steps 2-6 (build the file lists, confirm thesis, roster, and save preference via `AskUserQuestion`) run identically either way.

- [ ] **Step 4: Step 7 (L45)** — replace:

> 7. **Exit plan mode.** Call `ExitPlanMode` with a plan restating the confirmed thesis/goals, hierarchy findings, skills to load, reviewer roster (with citations for any deep-research-sourced extras), and save preference. Approval confirms everything at once.

with:

> 7. **Start the analysis engine.** Restate the gathered plan: confirmed thesis/goals, hierarchy findings, skills to load, reviewer roster (with citations for any deep-research-sourced extras), the agent fan-out you'll run across the three engine phases (Independent EDA -> Reconcile -> Cross-Compare), and save preference. In plan mode, deliver that restatement via `ExitPlanMode` -- approval confirms everything at once, then proceed to Part 2. In every other mode, state that same summary in the conversation for the record and proceed directly to Part 2 -- there is no approval gate.

- [ ] **Step 5: Part 2 header (L47)** — replace `### Part 2: Analysis engine (after `ExitPlanMode` approval)` with `### Part 2: Analysis engine (after gating)`.

- [ ] **Step 6: Frontmatter regression test**

Run: `node --test plugins/data-analysis-review/test/skill-frontmatter.test.js`
Expected: pass (only body prose changed).

- [ ] **Step 7: End-to-end read**

Read the whole `SKILL.md`. Confirm: steps 1→7 read coherently in both the plan-mode and
non-plan-mode branches; the "guessed thesis" rule in step 3 is intact; no residual
"plan mode" assumption remains in Part 2 (steps 8–12) or the Guarantees section.

- [ ] **Step 8: Commit**

```bash
git add plugins/data-analysis-review/skills/data-analysis-review/SKILL.md
git commit -m "feat(data-analysis-review): make gating flow mode-aware (plan-mode gate now optional)"
```

---

## Final Verification

- [ ] `node --test plugins/data-analysis-review/test/skill-frontmatter.test.js` passes.
- [ ] Optional live re-test with the locally-installed plugin: plan mode on → waits at
  `ExitPlanMode`; plan mode off → runs the confirmation prompts then starts the workflow
  with no gate.
