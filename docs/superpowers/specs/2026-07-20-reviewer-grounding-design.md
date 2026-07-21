# Design: `data-analysis-review` reviewer grounding (fabrication guard, model pin, guidance routing)

**Date:** 2026-07-20
**Status:** Approved (brainstorming phase complete)

## Context

Follow-on to the prompt refactor (`docs/superpowers/specs/2026-07-20-data-analysis-prompt-refactor-design.md`).
The question raised: should the fixed reviewer agents carry a baseline of explicit
domain knowledge to avoid hallucinations? Two distinct concerns were separated:

- **A — knowledge gap:** an agent *doesn't know* enough to spot an issue (e.g. never
  thinks to check heteroscedasticity).
- **B — fabrication:** an agent *invents* a result — reports "residuals are non-normal"
  without ever running the test.

A third axis surfaced during design: the reviewers have **no `model:` pin** — not in
agent frontmatter, not in any `agent()` dispatch in `workflow.js` — so all seven agents
run on whatever model the skill is invoked from. Review rigor therefore varies silently
by caller (an Opus session and a Haiku session emit same-looking reports of different
quality).

Findings against the current code:

- `FINDING_ITEM_SCHEMA` (`workflow.js:17-26`) already has `required_execution: boolean`
  ("this claim needs a computation to trust") but **nothing records whether the agent
  actually ran that computation.** The dangerous quadrant — `required_execution: true`
  and not executed — is invisible, so an inferred/hallucinated result reaches the report
  looking confirmed. This is concern B, and it is the skill's entire value proposition
  ("independently *verified*").
- The `skillGuidanceExcerpts` plumbing at `workflow.js:139-142` is **already role-keyed**
  (`.statistical`, `.data_quality`, …). What's missing is `SKILL.md` step 4 telling the
  orchestrator to route each loaded installed-skill excerpt to its matching reviewer key.
- The execution-fallback prompt line (`workflow.js:90`) is soft ("where possible").

## Goals

- Close the fabrication gap (B): make "claim needed a computation but none was run"
  a visible, structured, down-weightable signal that never launders into a confirmed
  finding, and surface it to the reader in the report.
- Make reviewer rigor deterministic regardless of caller (pin the engine model).
- Route already-available, maintained methodology guidance to the right reviewer (A),
  with zero hardcoded knowledge and no new per-run bloat.

## Non-Goals

- **No hardcoded methodology corpus** inlined into agent files, and **no new
  `references/methodology-checklists.md`.** Both are redundant with a pinned strong
  model, both rot, both YAGNI until evals prove a real miss.
- **No change to the fixed-4-roles vs. dynamic-`extra-reviewer` architecture** — the
  5 EDA persona files, `extra-roles.md`, and `evals.md` are untouched (immutability
  boundary preserved).
- **No per-agent model micro-tuning** — one uniform pin, not a per-role model matrix.

## Changes

### 1. Fabrication guard (B) — `workflow.js`

- Add `verified: { type: 'boolean' }` to `FINDING_ITEM_SCHEMA` and its `required` list.
  Semantics: `true` only when a command/recomputation ran and its output is in `evidence`;
  `false` = inferred from reading.
- `FINDING_FORMAT` (line 15): note each finding also states whether it was `verified` by
  execution.
- Execution-line prompt (line 90): harden to — *"Never state a computed result you did
  not compute. When `required_execution` is true, set `verified: true` only if the
  command and its output appear in your evidence; otherwise set `verified: false`."*
- Add `verified: { type: 'boolean' }` to the reconciled topic item schema
  (`reconciled` array items, ~lines 43-48) so the flag survives into cross-compare and
  the report.

### 2. Consumer agents treat unverified findings as unconfirmed

- `agents/findings-reconciler.md`: a finding with `required_execution && !verified` is
  claimed-but-unconfirmed — carry it forward (reconciled topic `verified=false`), don't
  turn it into an established contradiction.
- `agents/thesis-auditor.md` + cross-compare prompt (~lines 178-185): pass `verified` in
  the payload; if the independent finding is unverified, do not assert the project's
  claim is *wrong* — frame as "independent check was not empirically confirmed." Prompt
  guidance only; no `CROSS_COMPARE_SCHEMA` change.

### 3. Model pin — `workflow.js`

- Add `model: 'opus'` (alias, not dated ID → rot-resistant) to the three engine
  `agent()` dispatches: EDA reviewers (~line 149-152), findings-reconciler (~line 168),
  thesis-auditor (~line 189). Uniform pin — simpler than special-casing the JSON-only
  reconciler. Justified: this skill is already heavyweight and explicitly
  not-for-quick-questions, so it is never the cheap path; determinism at a trust boundary
  wins.

### 4. Guidance routing (A) — `SKILL.md`

- Step 4: add a sentence — when keeping a skill excerpt, route it to the matching
  reviewer key in `skillGuidanceExcerpts` (statistical-analysis → `statistical`,
  data-quality/validation → `data_quality`, business/domain → `domain_alignment`,
  reproducibility tooling → `reproducibility`). No code change; plumbing already
  role-keyed.

### 5. Report surfaces verification — `lib/report-builder.js` + `references/report-template.md`

- Render each finding with its verification state; tag unverified findings distinctly
  (e.g. `⚠ unverified — inferred, not executed`) so the reader sees which findings are
  empirically backed.
- `SKILL.md` step 11: note the builder now distinguishes verified/unverified.

## Files Touched

- `skills/data-analysis-review/workflow.js` — schema field (findings + reconciled),
  two prompt lines, `model: 'opus'` on 3 dispatches.
- `agents/findings-reconciler.md`, `agents/thesis-auditor.md` — consumer wording
  (no frontmatter change).
- `skills/data-analysis-review/SKILL.md` — step 4 routing sentence, step 11 note.
- `skills/data-analysis-review/lib/report-builder.js` +
  `references/report-template.md` — verified/unverified rendering.
- Untouched: the 5 EDA persona files, `extra-roles.md`, `evals.md`.

## Open Questions / Follow-ups

- Confirm the alias `'opus'` resolves in the Workflow runtime's `agent()` model opt;
  fall back to the full model ID only if rejected.
- If future evals show real knowledge misses on weaker-than-Opus callers, revisit the
  rejected `references/methodology-checklists.md` (progressive-disclosure, pointed-to,
  never inlined).

## Verification

- `node --check` on `workflow.js` and `lib/report-builder.js`.
- `node --test test/skill-frontmatter.test.js test/agents-frontmatter.test.js` — must
  still pass (no frontmatter changed).
- Extend `report-builder.test.js`: a `verified: false` finding renders the unverified
  tag; a `verified: true` one does not.
- Re-read `findings-reconciler.md`, `thesis-auditor.md`, and the assembled `workflow.js`
  prompts to confirm the verified-flag semantics read coherently end-to-end.
