# Adding a certification to ciso

`ciso` is built as **generic tracking core + one module per certification** (today HITRUST and
SOC 2). This doc makes that boundary explicit so a further certification (ISO 27001, PCI DSS, ...)
can reuse the core instead of re-inventing it. It is a map and a contract, not a drop-in wizard: the
generic *functions* already support multiple certifications, but some wrappers and data locations
are still HITRUST-homed (see "What a clean split would still move").

**SOC 2 is the worked example.** It was added against this contract without modifying a single core
script -- `skills/soc2/` is a structure file, a `SKILL.md`, four references, one 100-line
`record-scope.js`, and a catalog entry. Read it alongside this document; where the two disagree, the
code is right. Two things it deliberately did *not* do, both of which a third certification should
think just as hard about before doing:

- **No research/verify/reconcile agent fan-out.** See "A canonical identifier is read, never
  researched" below -- this is the single most important sourcing decision for a new certification.
- **No new maturity model.** SOC 2's design-vs-operating-effectiveness split looks like the trigger
  named below for extracting r2's PRISMA threading behind an adapter. It isn't: that distinction is
  a property of the *engagement*, so it lives in `tier.scope.reportType` and the tier keeps a flat
  `assessment.status` (where `met` means designed **and** operating effectively across the period).
  Adding a maturity model is a core change; prefer scope metadata whenever the distinction is
  per-engagement rather than per-control.

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
| Attach evidence (a PR, commit, CI run, scan, doc) to a control | `skills/_shared/record-evidence.js` (`recordEvidence(statePath, certKey, tier, id, record)`) |
| Render the dashboards (generic rollups over every cert/tier/domain) | `skills/_shared/render-dashboard.js` + `assets/dashboard-template.html` |
| The catalog of certifications the meta index advertises | `assets/certifications.json` |
| **Every org-facing verb** (`register`, `scope`, `import`, `interview`, `roadmap`, `upgrade`, `review`, `evidence`, `audit`) | `skills/<verb>/SKILL.md` -- generic, resolves `certKey` at runtime |

**Per-certification module** — provide these for each certification:

| Concern | HITRUST | SOC 2 |
|---|---|---|
| The control data (shipped, public, non-authoritative) | `skills/hitrust/controls/*.structure.json` | `skills/soc2/controls/type2.v2017tsc.structure.json` |
| **Always-loaded invariants** (content authority, core discipline) -- **required** | `skills/hitrust/references/invariants.md` | `skills/soc2/references/invariants.md` |
| One reference file per verb the certification supports | `references/` (register/import/interview/roadmap/upgrade + r2-maturity) | `references/` (register/scope/interview/roadmap) |
| Whatever per-certification writer the flow needs | `lib/merge-import.js` + `lib/xlsx-lite.js` (MyCSF export import) | `lib/record-scope.js` (engagement scope) |
| Maintainer compile of the shipped structure | `skills/hitrust-controls-compiler/` | *(none — hand-compiled; see above)* |
| Research/verification agent personas | `agents/` (fixed roster -- see note) | *(none — reuses `vendor-researcher`)* |

## Which certification next, and why not the other two

Recorded so the decision isn't re-litigated from scratch. ISO 27001 was chosen as #3 on audience:
SOC 2 + ISO 27001 is the most common dual pursuit, and the two share roughly 80% of their controls,
which is what finally exercises the "one shared state.json makes overlap visible" claim beyond the
healthcare-only HITRUST + SOC 2 pairing.

- **PCI DSS v4.0.1 — the strongest candidate for #4.** Doctrinally cleaner than ISO: the catalog is a
  free download, so it belongs in the left column and 100% canonical mapping is achievable exactly as
  SOC 2 achieved 61/61. Its SAQ-type selection is a better fit for the `record-scope.js` precedent
  than ISO's scoping was. Passed over only on audience breadth — it applies solely to organizations
  handling card payments.
- **NIST CSF 2.0 — deliberately not a module.** Public domain, no login, machine-readable from NIST:
  by far the cheapest compile, and the only candidate whose actual subcategory text could ship. It is
  not certifiable — no assessor, no report, no pass/fail — so it dilutes the plugin's thesis as a
  certification module. Its value is as a future cross-framework spine, which is a different feature.

## A canonical identifier is read, never researched

The first question for a new certification is not "how do we research this" but **"is the
publisher's own catalog reachable?"** That answer decides everything downstream.

| | Catalog freely published | Catalog gated, enumeration closed | Catalog gated, enumeration unknowable |
|---|---|---|---|
| Examples | AICPA Trust Services Criteria (free account); PCI DSS v4.0.1 (free download) | ISO/IEC 27001:2022 Annex A (paid per standard) | HITRUST MyCSF (licensing agreement) |
| Approach | **Extract identifiers directly from the document.** Require every control to carry its canonical id plus a `codeVerifiedBy` citation. | **Reconstruct the identifier set, then prove it closes.** Canonical id plus a `codeCorroboratedBy` citation naming ≥2 independent sources. | Canonical ids are **not publicly obtainable.** Ship honestly-scoped topics and route the org to its own licensed export. |
| What ships | 100% canonically mapped (SOC 2: 61/61) | Canonically mapped, provenance marked weaker (ISO 27001: 93/93 Annex A) | Topic-level entries, most without a canonical id |

### The middle column is narrow, and has an admission test

Do not read "gated but reconstructable" as a general licence to research identifiers — that is the
thing the rest of this section forbids. A certification earns the middle column only by meeting
**both** of these, not either one:

1. **The enumeration is arithmetically closed.** Each block publishes a count that equals its own
   terminal integer, and the blocks sum to a stated total. That is what makes a wrong source
   *detectable* rather than merely outvoted.
2. **The closure is checkable against a publisher artifact**, named and reachable in the structure
   file — the publisher's own document or an authorized reproduction of it, not secondary commentary.

Condition 1 alone is not enough, and the gap is the reason condition 2 exists: arithmetic closure
proves the published counts are *mutually consistent*, not that they are *right*. If every secondary
source inherited the same number from one upstream copy, the arithmetic still closes on wrong data.
Closure detects disagreement; it cannot detect shared error. Only an artifact the publisher controls
breaks that loop, because it cannot inherit a consultancy's mistake.

ISO 27001's Annex A qualifies on both: four themes of 37/8/14/34 terminating at A.5.37, A.6.8,
A.7.14 and A.8.34, summing to 93, and an official ISO/IEC 27002:2022 preview whose numbered contents
correspond one-to-one with Annex A. HITRUST cannot qualify on either — no published count to check a
reconstruction against, and no reachable artifact, so a fan-out there produces consensus with nothing
to falsify it.

**Say what you actually did with the artifact, and what it covers.** Naming it obliges you to be
exact twice over. First, on your own verification: whether you read its contents, or only confirmed
it is the document you claim and that a reader can reach it. Both beat secondary agreement alone;
they are not the same claim, and `coverageNote` must not blur them. Second, on scope: an artifact
that settles the *enumeration* usually does not settle the *subjects*, and saying "checked against
the publisher" without that split silently upgrades everything downstream of it.

ISO's records both. A maintainer read the ISO/IEC 27002:2022 preview and confirmed the four terminal
numbers, so the closure rests on the publisher — but the per-control subjects still come from two
secondary lists, the `A.` prefix is 27001's labelling of 27002's numbering, and ISO 27001 itself was
never obtained. That is why the entries stay on `codeCorroboratedBy`: a verified enumeration does not
promote a reconstructed identifier set to a read one.

The lock is not theoretical. Compiling ISO 27001 turned up two live vendor pages carrying wrong
Annex A data, and the arithmetic caught both: one printed a physical-controls range ending at 7.13
while stating "14 controls" three lines away, and another listed A.8.1 as data masking while its own
body text put data masking at A.8.11. Six or more independent sources agreed against each. A
count-only or list-only check would have caught neither.

Two obligations that come with the column:

- **`codeCorroboratedBy`, never `codeVerifiedBy`.** The latter means specifically "read out of the
  publisher's own document." Filling it with secondary URLs silently downgrades the stronger claim
  into the weaker one while keeping the stronger name. Keep the fields distinct, and say which one
  a module uses in its `coverageNote` and its `SKILL.md`.
- **Scope the claim to the part that actually closes.** ISO's Annex A closes; ISO's clauses 4-10 do
  not — no primary source was reachable for them and there is no count to check, so the ISO module
  claims only the subclause number for clause entries and makes no canonical-id claim beyond it.
  A certification can sit in the middle column for one half of its control set and the right column
  for the other.

**A research fan-out cannot produce a canonical identifier.** It aggregates secondary sources into a
confident consensus, and on precisely this kind of exact-enumeration question those sources are
unreliable. Worked example from the SOC 2 compile: three independent write-ups gave three different
answers for the Privacy criteria — one said 15 with P6 ending at P6.2, another "approximately 18", a
third conflated the 8 series with 8 criteria. Reading the AICPA document settled it in minutes: 18,
with P6 running P6.1–P6.7. More searching produced more contradiction, not convergence. That is the
signal to stop searching and read the source.

`hitrust-controls-compiler` exists because HITRUST's catalog is genuinely unreachable, and
`e1.v11.8.structure.json`'s `coverageNote` records what reconstruction cost even done carefully.
It is the right tool for an unreachable catalog and the wrong tool for a reachable one.

**Extraction method**, when a publisher PDF has to be read: inflate its `FlateDecode` content streams
with `zlib`, pull the parenthesized string literals, and normalize whitespace before matching (PDF
text is kerning-split, so word boundaries are unreliable). Write the string-literal pattern as
`\((?:[^()\\]|\\.)*\)` — excluding the backslash from the negated class. The obvious
`\((?:[^()]|\\.)*\)` lets both branches match a backslash, which backtracks catastrophically the
moment a binary stream happens to inflate cleanly; it ran fine on one copy of the TSC and hung
indefinitely on another. Two habits that matter more than the code:
verify that structural tokens are what you assume — the TSC's `P<n>.0` entries are *section headers*,
not criteria — and **never anchor the identifier regex to the answer you expect**. The first SOC 2
pass used `CC[1-9]|A1|C1|PI1|P[1-8]`, which could not have found a `CC10` or `P9`; re-running it
unanchored is what turned "probably complete" into verified. Known limit: some publisher PDFs use
filters this approach cannot read and need `pdftotext`. Don't commit the script — it runs once every
few years and rots faster than twenty lines can be rewritten.

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
5. **List yourself in `assets/certifications.json`** -- `{ certKey, displayName, skill, tiers,
   summary }`. This is what the meta index (`dashboard.html`) renders a card from, including for a
   project that hasn't registered you yet, where the card shows your `summary` and tells the user to
   run your `skill` (`ciso:register` for every certification today). `certKey` must equal your
   module's directory name under `skills/` and be `[a-z0-9-]` only;
   `test/certifications-catalog.test.js` enforces both directions (every shipped
   `<tier>.v*.structure.json` is claimed by an entry, and every declared tier ships a file).
6. **Render** with `render-dashboard.js` -- it discovers your certification/tiers/domains
   automatically and writes your page as `cert-<certKey>.html`. Per-control fields it doesn't know
   about (SOC 2's `requiredPolicies`/`evidenceExamples`, say) render automatically in an "Additional
   detail" block, so shipping richer control data needs no template change.
7. **Ship `references/invariants.md`, plus one reference file per verb you support.**
   **Do not write a `SKILL.md`** -- a certification module is not a skill. The org-facing surface is
   verbs (`ciso:register`, `ciso:interview`, ...), and each one resolves `certKey` at runtime and
   then reads `skills/<certKey>/references/<verb>.md`. Adding a certification therefore adds **zero**
   skills.

   `references/invariants.md` is mandatory and is the one file every verb reads, on every
   invocation, immediately after resolving `certKey`. It carries what used to live in a
   certification's always-loaded `SKILL.md`: the content-authority statements (what your shipped
   control set is and is not, and what must be said to the user before they rely on it) and your
   core discipline. A verb-first surface has many entry points instead of one, so this file is the
   only thing standing between a user and acting on a non-authoritative control set without being
   told it is one. `test/skills-frontmatter.test.js` enforces that it exists, that no certification
   module ships a `SKILL.md`, and that every cert-aware verb still reads it.

   Only ship a reference file for a verb your certification actually supports. `ciso:scope` is SOC 2
   only; `ciso:import` and `ciso:upgrade` are HITRUST only. A verb with no matching file says so
   plainly and names the certifications that do support it -- do not scaffold an empty file to make
   the matrix look full. `ciso:review`, `ciso:evidence` and `ciso:audit` read assessment data rather
   than certification mechanics and need no reference file at all (with one exception: `ciso:audit`
   reads `iso27001/references/soa.md` when producing ISO's Statement of Applicability).

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
