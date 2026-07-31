# Scope (flow b)

Read this when the routing step in `../SKILL.md` picks Scope (the `type2` tier exists but its `scope` is missing or incomplete).

Scope is the set of decisions made **before** any criterion is assessed. It is worth its own flow because SOC 2 engagements fail on scope more often than on any single control: scope too broad and cost and timeline balloon; too narrow and the report omits a system where customer data actually lives, which the service auditor will find.

## What to collect

Ask with `AskUserQuestion`, one topic at a time. Nothing here is a control, so none of it goes through `apply-assessment.js`.

1. **Report type.** Type I (controls suitably *designed* at a point in time) or **Type II** (controls *operated effectively* over a period). Type II is what enterprise buyers ask for; Type I is a stepping stone. → `reportType: "type1" | "type2"`
2. **Trust Services Categories.** Security is the Common Criteria and is mandatory in every SOC 2 -- `record-scope.js` rejects a selection that omits it. Availability, Confidentiality, Processing Integrity and Privacy are opt-in. Push back on adding a category without a stated business or customer reason: each one adds criteria, controls and evidence for the whole period. → `tscCategories: [...]`
3. **Observation period** (Type II only). 3 months minimum, 6 common for a first Type II, 12 for renewals. → `observationPeriodStart` / `observationPeriodEnd` (ISO dates)
4. **System description and boundary.** Which products, environments, data flows, people and third parties are in scope. Keep it to a few sentences here; the real Section III description is written with the auditor. → `systemDescription`, `systemBoundary`
5. **Subservice organizations.** Which vendors operate controls relevant to the report (cloud hosting, payment processing, managed services), and whether they are treated **carve-out** (excluded from scope, their controls described but not tested -- by far the common choice) or **inclusive** (their controls tested as part of this report). → `subserviceMethod`, `subserviceOrganizations`
6. **Complementary user entity controls (CUECs).** Controls your *customers* must operate for your controls to be effective. → `complementaryUserEntityControls`
7. **Service auditor**, if a CPA firm is already engaged. → `serviceAuditor`

## Recording it

```
node "${CLAUDE_PLUGIN_ROOT}/skills/soc2/lib/record-scope.js" <docs/ciso-dir> soc2 type2 '<jsonScope>'
```
Writes only `tiers.type2.scope`; it never touches `controls`, `archivedControls` or `interviewSessions`, and merges into any scope already recorded -- so it is safe to run once per topic as the conversation goes, rather than collecting everything before writing anything. It rejects unknown field names outright rather than storing a typo somewhere nothing reads.

## Marking out-of-scope categories

Once `tscCategories` is recorded, every entry whose `tscCategory` is **not** in that list should be marked `not_applicable`, with the justification naming the scope decision. Do this through the normal gate, one call per control -- never by hand-editing `state.json`:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json soc2 type2 <controlId> '{"status":"not_applicable","justification":"Privacy category not in scope for this engagement (scope recorded <date>)."}'
```

This is what keeps the compliance percentage honest: `not_applicable` controls are excluded from the compliance denominator but still counted in the total, so an org scoped to Security alone shows 33 in-scope criteria rather than appearing to fail 18 it never selected.

Then regenerate the dashboard and continue into [Interview](interview.md):
```
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
```
