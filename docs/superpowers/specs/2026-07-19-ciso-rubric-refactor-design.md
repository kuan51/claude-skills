---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# ciso plugin — rubric-driven refactor (Approach C)

## Context

The user supplied a research brief on authoring/reviewing Claude Agent Skills (security, accuracy,
efficiency, progressive disclosure, evals) and asked to refactor the `ciso` plugin against that
guidance. The brief's *marketplace-governance* half (SECURITY.md, CONTRIBUTING, CI hidden-Unicode
scanners, an authoring/review skill) targets an untrusted third-party marketplace — a different
repo's problem — and is out of scope. What transfers is the brief's distilled best-practice
**rubric**, applied to a first-party plugin.

`ciso` already passes most of the rubric (deterministic scripts as mechanical gates, gitignored
local data, third-person what/when descriptions, exemplary grounding, largely certification-
agnostic core scripts). So this is **one real security fix + conformance/structure improvements**,
not a teardown.

**The one real finding:** the background vendor-roadmap egresses org-authored security-posture
prose. `buildPrompt` in `skills/hitrust/lib/roadmap/workflow.js` spreads every non-id field of a
control into the research prompt, and `hitrust/SKILL.md` Roadmap step 2 builds that control object
with `justification` and `inProgressNotes`. Those reach the `vendor-researcher` agent, which holds
`WebSearch, WebFetch` — the "lethal trifecta" shape, in tension with the README promise *"Nothing
about your organization ever leaves your project."*

## Scope decisions

1. **Leave r2 PRISMA maturity logic inside the core scripts** (threaded through register-tier /
   apply-assessment / render-dashboard). Document it as an optional per-control maturity model;
   defer adapter extraction until a second cert with a different model is real.
2. **Fixed 4-agent roster is untouchable** (`agents-frontmatter.test.js` enforces it). Reorganize
   scripts/skills only, never agents; never collapse the personas into a parameterized mechanism.
3. **Egress fix defaults to subject-only, no opt-in.** Vendor research gets the control's subject,
   never posture prose. Opt-in deferred until asked.
4. **Eval corpus = durable fixtures + run procedure, not CI infra.** Ship the corpus + the
   3×/≥90%/FP-FN runbook + a structural validator test. No model-invoking harness.

## Deliberately NOT doing

- Not splitting `hitrust` into 5 skills (its single-entry routing is correct).
- Not moving always-load discipline invariants into `references/`.
- Not building marketplace-governance artifacts.
- Not extracting PRISMA or adding a second certification.

## Phases

1. **Security — close the posture-text egress.** Add `roadmap/sanitize-control.js` (fail-closed
   `SUBJECT_FIELDS` allowlist + `sanitizeControlForResearch`); `workflow.js buildPrompt` inlines
   the same list (no require access — mirrors the repo's `R2_DIMENSIONS` duplication precedent);
   `SKILL.md` Roadmap stops passing justification/inProgressNotes; README guarantee reconciled.
   Tests: `sanitize-control.test.js` + inline-list sync check.
2. **Accuracy — compiler mis-trigger + frontmatter validator.** `disable-model-invocation: true`
   on the compiler; add `test/skills-frontmatter.test.js` (name/description validity; compiler
   flag).
3. **Efficiency — progressive-disclosure re-org.** Split `hitrust/SKILL.md` into a lean routing
   hub + `references/{register,import,interview,roadmap,upgrade,r2-maturity}.md`; discipline
   invariants + tier-authority stay in the body.
4. **Security/conformance — least-privilege `allowed-tools`** on each skill; extend the frontmatter
   test; manual smoke test for missing-tool prompts.
5. **Accuracy — full trigger-eval corpus.** `evals/` fixtures for init + hitrust (+ disambiguation
   + shared-keyword negatives), `evals/RUNBOOK.md`, `evals/test/corpus-shape.test.js`.
6. **Structure — make the certification boundary explicit (LAST).** The core scripts are API-
   generic but physically coupled to HITRUST data/asset locations via `__dirname` paths, so
   physical relocation is a path-logic change with co-edited tests. Default: option (b) — a
   `core/ADDING-A-CERTIFICATION.md` contract doc + a core-vs-HITRUST map, minimal/no relocation.
   Option (a) full relocation is opt-in, deferrable, independently revertable.

## Verification

- `node --test` green after each phase (existing suite + new sanitize/frontmatter/corpus tests).
- Manual skill smoke test (Phases 4 & 6): `ciso:init` → `ciso:hitrust` register e1 → one interview
  sub-batch → open dashboard.html.
- Egress proof (Phase 1): a control carrying a justification never surfaces that text in the
  assembled research prompt.

Rollout: one commit per phase on branch `claude/ciso-skill-refactor-91e878`, each green before the
next. Phases 1–2 are independently shippable; Phase 6 is deferrable/revertable on its own.
