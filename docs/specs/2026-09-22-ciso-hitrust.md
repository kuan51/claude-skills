---
owner: kuan51
review_by: 2027-03-22
generated: false
---

# ciso HITRUST module: hardening, r2 maturity model, rubric conformance

Design record for the HITRUST certification module of the `ciso` plugin (version 1.1.4). It
replaces three retired superpowers specs (2026-07-19 hitrust hardening, r2 PRISMA maturity
architecture, rubric-driven refactor) and two plans, all of whose work shipped. Fabflows format;
the Check line is the plugin's real suite. Code comments that cite the r2 maturity design point
here.

## Behaviour

**Module shape.** `plugins/ciso/skills/hitrust/` is a certification module, not a skill: it holds
`controls/` (e1, i1, r2 structure files at framework version 11.8, with 33, 92 and 62
public-sourced, non-authoritative topics), `lib/` (`register-tier.js`, `apply-assessment.js`,
`merge-import.js`, `xlsx-lite.js`, `roadmap/`, `versioning/`) and `references/` (`register`,
`import`, `interview`, `roadmap`, `upgrade`, `r2-maturity`, `invariants`). The user-facing verbs
are separate skills (`ciso:init`, `ciso:register`, `ciso:scope`, `ciso:import`, `ciso:interview`,
`ciso:roadmap`, `ciso:upgrade`, `ciso:evidence`, `ciso:audit`, `ciso:review`) that read these
references. Shared
rendering lives in `skills/_shared/render-dashboard.js` and `record-evidence.js`.

**Certification key is explicit.** `registerTier`, `applyAssessment` and the version reconciler
take a required `certKey` argument and CLI positional; nothing defaults to `hitrust`. State lands
under `certifications.<certKey>.tiers.<tier>`. `merge-import.js` and `xlsx-lite.js` stay
HITRUST-e1/MyCSF-specific by design and say so in their header comments.

**Interview commits in sub-batches.** The control-by-control interview works through a domain in
sub-batches of 4-6 controls, calling `ExitPlanMode` per sub-batch to apply that batch through the
per-control `apply-assessment.js` loop, then re-entering plan mode for the next. The domain-done
call runs once every control in the domain has an assessment. An interruption loses at most one
sub-batch (`references/interview.md`).

**r2 scores five maturity dimensions.** e1 and i1 keep one flat `assessment.status` per control.
r2 controls carry `assessment.maturity.{policy,procedure,implemented,measured,managed}`, each
using the same vocabulary (`not_assessed | met | in_progress | gap | not_applicable`) and the same
validation (`met` needs a justification; `in_progress` needs current state and closeness).
`managed` cannot be `met` until `measured` is `met`. `not_applicable` is whole-control only: one
call sets the top-level status and all five dimensions, and per-dimension calls are rejected until
it is reversed. The default r2 interview asks only the `implemented` dimension, so it costs the
same as i1; the other four are an opt-in deepening pass (`references/r2-maturity.md`). The
domain-done gate requires only `implemented` (or whole-control N/A). The r2 structure file adds
`applicabilityTier: universal | conditional` with `conditionalOn` on conditional entries.

**Dashboard.** The overview compliance and assessed gauges use `implemented` only for r2, so the
three tiers compare directly. r2 domains add an average maturity-depth gauge. Each r2 control row
shows an `N / 5` badge that expands to the five-dimension breakdown. `computeRollups` (server) and
the template's embedded script (client) must group and compute depth identically;
`_shared/test/dashboard-template.test.js` extracts the `<script>` block and runs it under Node's
`vm` to assert that.

**Vendor research egress.** `lib/roadmap/sanitize-control.js` exports a fail-closed
`SUBJECT_FIELDS` allowlist (`relatedControlCode`, `relatedControlName`, `legacyCategoryPrefix`,
`topicLabel`, `topicSummary`, `domain`, `domainKey`); the roadmap workflow's `buildPrompt` inlines
the same list. A control's `justification` and `inProgressNotes` never reach the
`vendor-researcher` agent, which holds `WebSearch` and `WebFetch`.

**Fixed agent roster.** Four agents (`hitrust-topic-researcher`, `hitrust-controls-reconciler`,
`hitrust-controls-verifier`, `vendor-researcher`), pinned by `test/agents-frontmatter.test.js`.

## Check

```bash
node --test "plugins/ciso/**/test/*.test.js"
```

295 tests pass at the time of writing. Behavioural checks: `apply-assessment.js` throws when
`managed` is marked `met` before `measured`; `sanitize-control.test.js` proves a control's
justification never appears in the assembled research prompt; the dashboard cross-consistency
test fails if server and client grouping keys diverge.

## Out of scope

- A certification plug-in or adapter interface; parameterising the key was enough for four
  certifications (`ADDING-A-CERTIFICATION.md` is the contract).
- A generic licensed-export importer; a future certification writes its own sibling module.
- HITRUST's weighted PRISMA percentage scoring; the dashboard must not look like a real PRISMA
  score.
- Per-dimension `not_applicable`.
- Zero-loss interview checkpointing into the plan file.
- Changes to e1 or i1 schema, interview or rendering.
- Marketplace-governance artefacts (hidden-Unicode scanners, authoring-review skills).

## Decisions

- Sub-batches over checkpointing: more plan-mode round trips in exchange for bounded loss and no
  new persistence machinery (DEC-0020).
- Egress fix defaults to subject-only with no opt-in (DEC-0019). Opt-in for richer research
  context is deferred until asked for.
- Status vocabulary per dimension instead of a percentage scale, to avoid overclaiming precision
  the way the plugin avoids invented control codes.
- `managed` requires `measured` as a hard validation, matching the existing "met requires
  justification" mechanical-backstop pattern.
- Badge plus disclosure (not an always-visible five-chip strip) keeps r2 row density equal to
  e1/i1 until a control is deepened.
- `R2_DIMENSIONS` is duplicated in four files (`register-tier.js`, `apply-assessment.js`,
  `reconcile-state-version.js`, `sync-tasks/lib/diff-tasks.js`) because workflow scripts have no
  `require`; the duplication is the accepted precedent, and `SUBJECT_FIELDS` follows it.
- Dashboard tests run the shipped template's script under `vm` with a minimal stub rather than
  adding jsdom; the plugin stays dependency-free.
- HITRUST's verbatim requirement wording is not hardcoded (licensed MyCSF content); only the topic
  framework is. The `import` path is the sanctioned way to load it.
- The rubric refactor's "do not split hitrust into several skills" was later reversed: the verbs
  became separate skills and `hitrust` became a certification module, once SOC 2, ISO 27001 and
  CMMC made the verb/module split real. The fixed roster and the "invariants stay in the body"
  rules survived.
- The eval corpus under `evals/` is fixtures plus a runbook, not CI infrastructure.

## Deferred

- The large, generalisable r2 control set (the real pool exceeds 2,000 requirement statements;
  62 shipped to prove the schema).
- Opt-in richer vendor-research context beyond subject fields.
- Extracting the maturity model into an adapter, only if a second certification with a
  different per-control model arrives.
- Physical relocation of core scripts out of `hitrust/lib/` (ADDING-A-CERTIFICATION.md
  "option a").
