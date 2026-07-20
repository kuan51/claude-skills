# Design: `ciso` r2 PRISMA maturity architecture

**Date:** 2026-07-19
**Status:** Approved (brainstorming phase complete)

## Context

The `ciso` plugin (HITRUST CSF tracking, `plugins/ciso/`) tracks certification progress across three tiers: e1, i1, r2. e1 and i1 are fully built and content-compiled (32 and 92 public-sourced controls respectively). r2 currently has only 12 illustrative entries, and — notably — those entries mostly describe HITRUST's risk-tailoring *mechanism* (e.g. "BYOD is a risk factor that can pull in more controls") rather than being concrete, assessable controls the way e1/i1's topics are.

The project owner wants to substantially expand r2's content to the most generalizable, highest-value controls applicable across the largest number of businesses — r2's real pool exceeds 2,000 tailored requirements, per public research the owner supplied. **That content-expansion work is explicitly out of scope for this pass** (it is a separate future spec, sequenced after this one). This pass addresses a prerequisite surfaced during brainstorming: r2 is the only HITRUST tier that scores five PRISMA maturity dimensions (Policy, Procedure, Implemented, Measured, Managed) rather than a single Implemented-only bar. This is confirmed by the owner's own research doc: e1 and i1 are officially "Implemented only"; only r2 scores all five. The plugin's current assessment model — one flat `status` per control — is a faithful proxy for e1/i1 (which genuinely only measure Implemented), but it flattens away r2's real structure. Retrofitting maturity dimensions onto e1/i1 would misrepresent what those two tiers actually assess, so this design touches r2 alone.

**Brainstorming process note:** several architecture forks were resolved interactively, including one instance where a proposed direction (add PRISMA scoring to e1/i1 first) was corrected by checking the supplied research doc, which showed e1/i1 don't use PRISMA at all — so the fork was reframed around r2 alone. A UI mockup (rendered ledger-styled control row, two layout variants) was used to settle the dashboard rendering approach. Full option analysis is not reproduced here in full; this document records the approved outcome.

## Goals

- Model r2's five PRISMA maturity dimensions per control, using the plugin's existing `met/in_progress/gap/not_applicable/not_assessed` status vocabulary applied once per dimension — not HITRUST's actual weighted percentage scale.
- Keep the default interview cost identical to e1/i1 (one question per control), with the four non-Implemented dimensions available only via an explicit, opt-in deepening pass.
- Encode HITRUST's own documented rule that Managed can never score higher than Measured, as a hard validation (matching the project's existing mechanical-backstop pattern).
- Extend the dashboard to show per-control maturity depth and a domain-level depth gauge, reusing the existing ledger visual language exactly (status-tag colors, disclosure/roadmap-row patterns) — validated via a rendered mockup before implementation.
- Leave e1 and i1's schema, interview flow, and dashboard rendering completely untouched.

## Non-Goals

- **No percentage/weighted PRISMA scoring.** HITRUST's real model scores each dimension on its own five-level compliance percentage (Non-Compliant 0% / Somewhat 25% / Partially 50% / Mostly 75% / Fully 100%), then weight-averages dimensions (Policy 15, Procedure 20, Implemented 40, Measured 10, Managed 15) into a domain score. Replicating this would let the dashboard show something that looks like a real HITRUST PRISMA score, which risks the exact "overclaiming precision" problem this project has been careful to avoid everywhere else (no fabricated control codes, everything labeled non-authoritative). The status-vocabulary substitute above is the deliberate, simpler choice.
- **No per-dimension `not_applicable`.** If a control doesn't apply to an organization, that is a whole-control fact — all five dimensions become `not_applicable` together, via one call. There is no scenario modeled where one dimension is N/A while a sibling dimension is actively assessed.
- **No e1/i1 changes of any kind.** Both tiers remain exactly as they are — this is additive to r2's own schema only.
- **No r2 content expansion.** The 12 existing entries are reshaped to the new schema (concrete/assessable framing, new `applicabilityTier` field) only to prove the schema and rendering pipeline end-to-end. Researching and shipping the large generalizable-controls set the project owner actually wants is a separate, later spec that depends on this one landing first.

## 1. Structure file schema (`r2.v11.8.structure.json`)

Same flat array shape as e1/i1 today: `id, domain, domainKey, topicLabel, topicSummary, citations, nonAuthoritative`, optional `relatedControlCode`/`legacyCategoryPrefix` when a public citation verifies a real code (same "never invent, only ever cite" discipline already used for e1/i1).

Two changes from the current r2 file:
- **Concrete framing.** The 12 existing entries are rewritten so each describes a specific, assessable control/practice (mirroring i1's style) rather than a tailoring mechanism. E.g. today's "BYOD Risk Factor Expanding Endpoint-Related Requirements (r2 example)" becomes a concrete control such as "Documented BYOD security baseline enforced on personally-owned devices accessing in-scope systems," still citing the same public sources, still `nonAuthoritative: true`.
- **New field:** `applicabilityTier: "universal" | "conditional"`, with a short `conditionalOn` string (e.g. `"applies if handling payment card data"`) present only when `conditional`. This lets the dashboard and future roadmap tooling surface "applies to almost any organization pursuing r2" before conditional, risk-factor-dependent topics — independent of the maturity-dimension work, but bundled into this pass since it touches the same file.
- **Removed fields:** `baselineOverlap` (every existing entry sets this to `"unsure"`; it stops being meaningful once r2 entries concretely build on i1's Core rather than describing tailoring in the abstract) and `exampleOnly` (superseded by the concrete framing — these are no longer illustrations of a mechanism, they are the shipped, if still small, r2 content).

## 2. `state.json` assessment shape for r2 controls

r2 controls get a `maturity` object in place of e1/i1's flat `assessment.status`:

```jsonc
"assessment": {
  "status": null,           // set to "not_applicable" to short-circuit all 5 dimensions; otherwise null
  "maturity": {
    "policy":      { "status": "not_assessed", "justification": null, "inProgress": { "currentState": null, "estimatedCloseness": null }, "assessedAt": null },
    "procedure":   { "status": "not_assessed", "justification": null, "inProgress": { "currentState": null, "estimatedCloseness": null }, "assessedAt": null },
    "implemented": { "status": "not_assessed", "justification": null, "inProgress": { "currentState": null, "estimatedCloseness": null }, "assessedAt": null },
    "measured":    { "status": "not_assessed", "justification": null, "inProgress": { "currentState": null, "estimatedCloseness": null }, "assessedAt": null },
    "managed":     { "status": "not_assessed", "justification": null, "inProgress": { "currentState": null, "estimatedCloseness": null }, "assessedAt": null }
  }
}
```

Each dimension's `status` uses the identical vocabulary as e1/i1's control-level status (`not_assessed | met | in_progress | gap | not_applicable`) — just scoped to one dimension instead of one control. `roadmap` is unchanged and stays control-level (not per-dimension) across all tiers, since vendor/budget research targets the control's overall gap, not a specific maturity dimension.

`register-tier.js`'s `defaultControl` must seed this `maturity` shape for r2 specifically (tier-branched), while continuing to seed e1/i1's existing flat shape unchanged.

## 3. `apply-assessment.js` changes

The function branches on tier:

- **e1/i1 calls are byte-identical to today** — same signature, same validation, same write path into `control.assessment` directly.
- **r2 calls take an added `dimension` argument** (`policy|procedure|implemented|measured|managed`) and write into `control.assessment.maturity[dimension]`.
- **Per-dimension validation** mirrors e1/i1's existing rules exactly, evaluated per dimension: `met` requires a non-empty `justification`; `in_progress` requires both `currentState` and `estimatedCloseness`.
- **New hard validation:** attempting to mark `managed` as `met` throws unless `measured` is already `met` on that control — encodes HITRUST's documented rule that Managed can never score higher than Measured. This is a mechanical backstop consistent with the project's existing "met requires justification" style gate, not merely a documentation note.
- **Whole-control not_applicable:** a separate call path sets top-level `assessment.status = "not_applicable"` and all five `maturity[*].status = "not_applicable"` in one write, stamping one shared `assessedAt`. Once a control is in this state, per-dimension calls are rejected until the whole-control not_applicable is explicitly reversed first (prevents a confusing partial state where some dimensions are N/A and others aren't).
- **`markCategoryComplete`'s domain-done gate** (the check that a domain's every control has been touched before it can move to `domainsCompleted`) only requires the `implemented` dimension (or whole-control not_applicable) to be resolved on every control in the domain. Deepening the other four dimensions is opt-in progress that never blocks marking a domain done — consistent with Goal 2 (default interview cost unchanged).

## 4. Interview flow changes (`hitrust/SKILL.md`)

The r2-specific interview subsection is added alongside the existing e1/i1 flow (which is unchanged): the default pass asks only the **Implemented** dimension per control, identical in shape and cost to today's e1/i1 flow — one `AskUserQuestion` per control, same 4-6-control sub-batch commit granularity introduced in the prior hardening pass. This keeps r2's baseline interview no more expensive than i1's despite the richer schema underneath.

The other four dimensions are reachable only through an explicit "deepen this control" (or "deepen this domain") follow-up the user invokes separately, at any time, per control or per domain — mirroring the pattern already used once in this project to deepen three thin i1 domains after the initial compile. The deepening flow reuses the same `apply-assessment.js` per-control loop; only the `dimension` argument and the targeted control set differ from the default pass.

## 5. Dashboard changes

Validated interactively via a rendered mockup reusing the dashboard's actual CSS variables and classes (dark ledger aesthetic: `--ink`/`--paper`/`--gold` palette, serif type, clipped-corner panels, existing `.status-tag.st-*` color system) rather than a generic UI kit, to confirm the addition reads as native to the existing design rather than bolted on. Two layout variants were compared; **Variant B (badge + expandable disclosure)** was chosen over an always-visible 5-chip strip, because it keeps the default row density identical to e1/i1's rows (most r2 controls will show only the Implemented dimension assessed, matching Goal 2) and only asks for more visual space once a control has actually been deepened.

- **Control row:** each r2 control shows a compact `N / 5 maturity dims` badge (gold, reusing the existing `.tag`/status-tag styling — no new color tokens), which expands via a `<details>` disclosure (matching the existing `.category-group` pattern already used for domain groups) into the full five-dimension breakdown. Each dimension line shows its label, a status chip (reusing `.status-tag.st-*` classes exactly, including the dashed `not_assessed` treatment), and its justification/in-progress detail where present — mirroring the existing `.roadmap-row` layout (label + value row, `.roadmap-label` styling).
- **Domain overview gauges** (`.gauge`, the existing "compliance %" and "assessed %" bars) keep their current meaning for r2 domains: computed from the `implemented` dimension only, so e1/i1/r2 gauges remain directly comparable to each other at the overview level.
- **New gauge, r2 domains only: average maturity depth** — mean count of the five dimensions with a non-`not_assessed` status, averaged across a domain's controls. Surfaces deepening progress as a distinct signal from Implemented-only compliance, without conflating the two.
- `computeRollups` (`render-dashboard.js`, server-side) and the client-side rollup/grouping logic in `dashboard-template.html`'s embedded script must compute the new depth gauge identically — this project has already hit exactly this class of bug once (a grouping-key divergence between server and client caused duplicate dashboard groups, fixed in a prior commit and now covered by `dashboard-template.test.js`'s cross-consistency test). That test file gets a new case for maturity-depth specifically.

## Verification

1. Full existing `node --test` suite across `plugins/ciso/**/test/**` stays green, plus new/extended cases:
   - `apply-assessment.test.js`: r2 per-dimension writes, the Managed-requires-Measured validation error, whole-control not_applicable short-circuit and its interaction with subsequent per-dimension calls.
   - `register-tier.test.js`: r2's `defaultControl` seeds the full five-dimension `maturity` object correctly; e1/i1 seeding is unchanged.
   - `reconcile-state-version.test.js`: an added r2 control seeds the not_assessed maturity object; a removed r2 control archives its maturity data intact (not flattened/lost).
   - `dashboard-template.test.js`: new maturity-depth cross-consistency case (server `computeRollups` vs. client `groupBy`-adjacent depth calculation agree on a fixture with mixed dimension-assessment states); badge/disclosure smoke render for both a shallow (1/5) and fully-deepened (5/5) control.
2. Manual: register r2 in a scratch project, run the default interview for a few controls (Implemented-only), and confirm the resulting `state.json` matches the shape in section 2 exactly.
3. Manual: run a deepening pass on one control across all five dimensions, including one case that deliberately attempts to mark Managed as `met` before Measured is `met`, to confirm the validation error fires with a clear message.
4. Browser smoke-test: open the regenerated dashboard and confirm the `N / 5 maturity dims` badge and its disclosure render correctly for both a shallow and a deepened control, and that the new domain-level depth gauge shows a sane, correctly-computed value.
5. Grep `plugins/ciso/` for any Xenter-specific or PII string (standing project discipline) — expected to already be clean since this pass introduces no organization-specific content.
6. `git diff --stat` confirms `e1.v11.8.structure.json` and `i1.v11.8.structure.json` are byte-identical/untouched by this pass.
