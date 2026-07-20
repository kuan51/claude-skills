# Adding a certification to ciso

`ciso` is built as **generic tracking core + one certification module** (today only HITRUST). This
doc makes that boundary explicit so a second certification (SOC 2, ISO 27001, ...) can reuse the
core instead of re-inventing it. It is a map and a contract, not a drop-in wizard: the generic
*functions* already support multiple certifications, but some wrappers and data locations are still
HITRUST-homed (see "What a clean split would still move").

## The boundary

**Certification-agnostic core** — already parameterized by `certKey` / control id, iterates state
with `Object.keys`, and needs no code change to serve another certification:

| Concern | File |
|---|---|
| Scaffold state.json + dashboard, gitignore | `skills/init/lib/init-project.js` |
| Register a tier's control set into `state.certifications[certKey]` | `skills/hitrust/lib/register-tier.js` (`registerTier(statePath, structure, certKey, certDisplayName)`) |
| Record an assessment (mechanical gate: no "met" without justification) | `skills/hitrust/lib/apply-assessment.js` (`applyAssessment(statePath, certKey, tier, id, payload)`) |
| Merge background vendor research | `skills/hitrust/lib/roadmap/merge-roadmap.js`, `roadmap/workflow.js`, `roadmap/sanitize-control.js` |
| Reconcile a control-set version bump | `skills/hitrust/lib/versioning/*.js` |
| Render the dashboard (generic rollups over every cert/tier/domain) | `skills/_shared/render-dashboard.js` + `assets/dashboard-template.html` |

**HITRUST-specific module** — replace these per certification:

| Concern | File |
|---|---|
| The control data (shipped, public, non-authoritative) | `skills/hitrust/controls/*.structure.json` |
| The org-facing flow (register/import/interview/roadmap/upgrade) | `skills/hitrust/SKILL.md` + `skills/hitrust/references/` |
| Licensed-export import (MyCSF shape) | `skills/hitrust/lib/merge-import.js` + `lib/xlsx-lite.js` |
| Maintainer compile of the shipped structure | `skills/hitrust-controls-compiler/` |
| Research/verification agent personas | `agents/` (fixed roster -- see note) |

## The contract for a new certification

1. **Ship a control structure** as `<tier>.v<version>.structure.json`:
   `{ tier, controlSetVersion, sourceAuthority, controls: [...] }`, each control
   `{ id, domain, domainKey, topicLabel, topicSummary, citations }` (plus whatever else your
   framework needs -- `register-tier.js` preserves unknown fields by spread). `domainKey` is the
   grouping key the dashboard rolls up by.
2. **Register** it with `registerTier(statePath, structure, "<certKey>", "<Display Name>")`. This
   seeds every control's `assessment`/`roadmap` to the state.json contract and creates the interview
   session -- no per-cert code.
3. **Assess** through `applyAssessment(...)` -- never hand-write `state.json`. The gate (met needs a
   justification; in_progress needs current-state + closeness) applies to every certification.
4. **Research** gaps via the roadmap workflow -- it's certification-agnostic and already sanitizes
   posture prose out of what leaves the machine (`sanitize-control.js`).
5. **Render** with `render-dashboard.js` -- it discovers your certification/tiers/domains
   automatically.
6. Write your own org-facing `SKILL.md` (model your routing on `skills/hitrust/SKILL.md`).

## What a clean split ("option a") would still move

The generic functions are reusable now, but a physically clean `core/` vs `certifications/<name>/`
layout would additionally require:

- **Path rewiring.** `register-tier.js` resolves structure files via a `__dirname`-relative
  `../controls/` and defaults to e1; `render-dashboard.js` resolves the template via a
  `__dirname`-relative `../../assets/`. Relocating these scripts means parameterizing those paths
  (or resolving them from `CLAUDE_PLUGIN_ROOT`) -- a logic change, and their tests move with them.
- **The r2 PRISMA maturity model** (five dimensions: Policy/Procedure/Implemented/Measured/Managed)
  is currently threaded through `register-tier`/`apply-assessment`/`render-dashboard` as an optional
  per-control maturity model. It is HITRUST-specific but lives in the core scripts. A second
  certification that wants a *different* maturity model (or none) is the trigger to extract it behind
  an adapter; until then it stays put, guarded by its existing tests.

## Note: the agent roster is fixed

`agents/` (hitrust-topic-researcher, hitrust-controls-verifier, hitrust-controls-reconciler,
vendor-researcher) is an intentional fixed roster enforced by `test/agents-frontmatter.test.js`. Add
new certification-specific personas as new files; don't parameterize the existing ones into a
dynamic mechanism.
