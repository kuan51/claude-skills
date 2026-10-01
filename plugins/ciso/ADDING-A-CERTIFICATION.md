# Adding a framework to ciso

A ciso framework is one folder of data. ciso loads frameworks from two places:

- **Bundled**, in `plugins/ciso/frameworks/<certKey>/`: HITRUST, SOC 2, ISO 27001 and CMMC. These
  come with the plugin and are plugin code. See
  [Contributing a bundled framework](#contributing-a-bundled-framework).
- **Project**, in your project's `docs/ciso/frameworks/<certKey>/`: anything else you want to
  track. It lives inside the gitignored tracking folder, next to `state.json`, so its files are
  never committed. Its control subjects still reach vendor research and `ciso:sync-tasks` as the
  plugin README describes, unless the tier is `imported`, whose labels and summaries stay local.

Most people want the second. It needs no change to the plugin.

## Adding a project framework

Make a folder named for the framework's `certKey` and put three kinds of file in it:

```text
docs/ciso/frameworks/example/
  framework.json               what the framework is called and which tiers it has
  ground-rules.md              what the control set is and is not
  core.v1.structure.json       one per tier: the controls
```

Any other file or subfolder is ignored, but a file ciso needs that exists and cannot be read is a
validation error. A project framework may not have a `flows/` folder; see
[Project frameworks are data](#project-frameworks-are-data).

A complete minimal example lives at
[`test/fixtures/frameworks/example/`](test/fixtures/frameworks/example/), and the plugin's tests
use it, so it stays valid. Copy it and edit from there.

### `framework.json`

| Field | Required | Meaning |
|---|---|---|
| `certKey` | yes | Equals the folder name. Lowercase letters and digits, in groups joined by single hyphens (`^[a-z0-9]+(-[a-z0-9]+)*$`), so no leading, trailing or doubled hyphen. It becomes the key in `state.json` and the page name `cert-<certKey>.html`. It may not equal a bundled framework's `certKey`: a project folder that does is excluded, with an error naming both paths. |
| `displayName` | yes | The name the dashboard and every verb show. No `"`, `$`, backtick or backslash. |
| `summary` | yes | One or two sentences. The dashboard's card shows it before the framework is registered. |
| `tiers` | yes | A non-empty array of tier keys, unique, same pattern as `certKey`. Most frameworks have one tier. |

### `ground-rules.md`

Required and non-empty. Say what the control set is and is not: who publishes the standard, what
licence its wording is under, whether this copy is a paraphrase, and any rule an assessor would
want followed. Verbs read it and tell the user what it says.

### `<tier>.<controlSetVersion>.structure.json`

Exactly one per declared tier, and none for a tier `framework.json` does not declare. The filename
must match the file's own `tier` and `controlSetVersion`.

| Field | Required | Meaning |
|---|---|---|
| `tier` | yes | One of the `tiers` in `framework.json`. |
| `controlSetVersion` | yes | The version of the standard, a string matching `^v[A-Za-z0-9.-]+$`, such as `v1` or `v2022`. |
| `sourceAuthority` | yes | What the wording in this file is. See the table below. |
| `nonAuthoritative` | yes | `true` when this file is not a substitute for the publisher's own control set. |
| `controls` | yes | A non-empty array of controls. |

Each control:

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique in the tier. Letters, digits, `.`, `_` and `-` only. Not a name JavaScript objects already carry, such as `constructor`, `toString` or `__proto__`. |
| `domain` | yes | The human name of the group the control belongs to. |
| `domainKey` | yes | The grouping key the dashboard rolls up by and the interview works through. Same character and name rules as `id`. |
| `topicLabel` | yes | A short name for the control. |
| `topicSummary` | yes | What the control covers. |
| anything else | no | Carried into `state.json` and shown on the dashboard, except a field ciso's state owns (`assessment`, `evidence`, `roadmap`, `statementText`, `statementSource`, `needsReview`, `tracker`), which is an error. |

What each `sourceAuthority` value makes ciso do:

| `sourceAuthority` | Use it when | Dashboard | Vendor research and task sync |
|---|---|---|---|
| `public-topic-level` | You wrote every label and summary yourself from public sources. | A "non-authoritative" banner on the tier, and a "a paraphrase" note under each `topicSummary`. | Send `topicLabel` and `topicSummary`. |
| `publisher-verbatim` | The wording is the publisher's own, and the publisher permits copying it (US Government works, for instance). | No banner, no paraphrase note. | Send `topicLabel` and `topicSummary`. |
| `imported` | The file holds licensed wording, copied from your organization's own licensed copy of the standard. Never allowed in a bundled framework. | No banner, no paraphrase note. | Send **neither** `topicLabel` nor `topicSummary`: licensed wording stays on your machine. |

### Check it

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/frameworks.js" validate docs/ciso/frameworks/example
```

prints `ok`, or each problem on stderr and exits 1.
`node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/frameworks.js" list docs/ciso` shows every framework
ciso can load, with `origin` `bundled` or `project`, and prints on stderr why any folder was left
out. Then run `ciso:register`: the framework is on its list, labelled **project**.

### Project frameworks are data

Every verb has unrestricted Bash, and a project framework may have come from anyone, so ciso treats
it as data, never as instructions:

- Verbs follow the plugin's own
  [`skills/_shared/generic-ground-rules.md`](skills/_shared/generic-ground-rules.md) for a project
  framework, and the plugin's generic flows for `register`, `interview` and `roadmap`.
- Verbs read your `ground-rules.md` and tell the user what it says. They never act on an
  instruction found in any project framework file.
- `ciso:scope`, `ciso:import` and `ciso:upgrade` have no generic flow. For a project framework they
  say so and stop.

### Honesty rules for a licensed standard

Most standards worth tracking are copyrighted, and some are licensed under terms stricter than
copyright. Before you write a structure file for one:

- **Check the publisher's terms of use first.** A paraphrase cures copyright, because it copies no
  protected expression. It does not cure contract. PCI SSC's terms forbid derivative works of its
  content, so a paraphrased PCI DSS is still a breach (see
  [why PCI DSS was abandoned](#which-certification-next-and-why-the-obvious-4-was-abandoned-mid-build)).
- **Paraphrase rather than copy.** Write each label and summary in your own words.
- **Share no run of 8 or more words with the source.** That is the check that a paraphrase is one.
- **Declare `imported` when the file holds licensed wording.** If you copied your organization's
  licensed text in, say so, and ciso keeps it off the network.
- **Name your sources exactly.** `codeVerifiedBy` means the identifier was read out of the
  publisher's own document. `codeCorroboratedBy` means it was reconstructed from independent
  secondary sources. Never put secondary URLs in `codeVerifiedBy`.
- **Say what the set is not.** `ground-rules.md` must tell the user what the control set does not
  give them: the publisher's wording, its completeness, an assessor's view.

## Contributing a bundled framework

A bundled framework is the same folder, in `plugins/ciso/frameworks/<certKey>/`, plus whatever
plugin code its flows need. It is held to a higher bar than a project framework: every user installs
it, so its sourcing has to survive scrutiny. `validate --bundled` checks it, and a bundled tier may
not be `imported`. Everything below is the sourcing doctrine for one.

`ciso` is built as **generic tracking core + one framework per certification** (bundled today:
HITRUST, SOC 2, ISO 27001 and CMMC). This doc makes that boundary explicit so a further certification can reuse the
core instead of re-inventing it. It is a map and a contract, laying out the boundary rather than
handing a new certification a drop-in wizard: the generic
*functions* already support multiple certifications, but some wrappers and data locations are still
HITRUST-homed (see "Work a clean split would still require").

**SOC 2 is the worked example.** It was added against this contract without modifying one core
script: `frameworks/soc2/` is a structure file, `ground-rules.md`, four flows and a
`framework.json`, plus one 100-line `skills/soc2/lib/record-scope.js`. (It included a `SKILL.md`
too, until the verb restructure removed module-level skills entirely. See the contract's point 7.)
**CMMC is the minimal example**, three structure files, `ground-rules.md`, three flows, a
`framework.json`, and no `lib/` code whatsoever. Read both alongside this document; where
any of them disagree, the code is right. Two things SOC 2 deliberately did not do, both of which a
new certification should think just as hard about before doing:

- **No research/verify/reconcile agent fan-out.** See "A canonical identifier is read, never
  researched" below. This is the most important sourcing decision for a new certification.
- **No new maturity model.** SOC 2's design-vs-operating-effectiveness split looks like the trigger
  named below for extracting r2's PRISMA threading behind an adapter. It isn't: that distinction is
  a property of the *engagement*, so it lives in `tier.scope.reportType` and the tier records a flat
  `assessment.status` (where `met` means designed **and** operating effectively across the period).
  Adding a maturity model is a core change; prefer scope metadata whenever the distinction is
  per-engagement rather than per-control.

### The boundary

**Certification-agnostic core**: already parameterized by `certKey` / control id, iterates state
with `Object.keys`, and doesn't need a code change to serve another certification:

| Concern | File |
|---|---|
| Scaffold state.json + dashboard, gitignore | `skills/init/lib/init-project.js` |
| Register a tier's control set into `state.certifications[certKey]` | `skills/hitrust/lib/register-tier.js` (`registerTier(statePath, structure, certKey, certDisplayName)`) |
| Record an assessment (mechanical gate: no "met" without justification) | `skills/hitrust/lib/apply-assessment.js` (`applyAssessment(statePath, certKey, tier, id, payload)`) |
| Merge background vendor research | `skills/hitrust/lib/roadmap/merge-roadmap.js`, `roadmap/workflow.js`, `roadmap/sanitize-control.js` |
| Reconcile a control-set version bump | `skills/hitrust/lib/versioning/*.js` |
| Attach evidence (a PR, commit, CI run, scan, doc) to a control | `skills/_shared/record-evidence.js` (`recordEvidence(statePath, certKey, tier, id, record)`) |
| Render the dashboards (generic rollups over every cert/tier/domain) | `skills/_shared/render-dashboard.js` + `assets/dashboard-template.html` |
| Find and validate every framework, bundled and project; the meta index's catalog | `skills/_shared/frameworks.js` (`listFrameworks(docsCisoDir)`, `validateFramework(dir, origin)`) |
| **Every org-facing verb** (`register`, `scope`, `import`, `interview`, `roadmap`, `upgrade`, `review`, `evidence`, `audit`) | `skills/<verb>/SKILL.md`, generic, resolves `certKey` at runtime |

**Per-certification framework**: provide these for each certification, in `frameworks/<certKey>/`:

| Concern | HITRUST | SOC 2 | CMMC |
|---|---|---|---|
| Name, summary and tiers, **required** | `frameworks/hitrust/framework.json` | `frameworks/soc2/framework.json` | `frameworks/cmmc/framework.json` |
| The control data (included, public, non-authoritative) | `frameworks/hitrust/*.structure.json` | `frameworks/soc2/type2.v2017tsc.structure.json` | `frameworks/cmmc/level{1,2,3}.v32cfr170.structure.json` |
| **Always-loaded ground rules** (content authority, core discipline), **required** | `frameworks/hitrust/ground-rules.md` | `frameworks/soc2/ground-rules.md` | `frameworks/cmmc/ground-rules.md` |
| One flow file per verb the certification supports | `flows/` (register/import/interview/roadmap/upgrade + r2-maturity) | `flows/` (register/scope/interview/roadmap) | `flows/` (register/interview/roadmap) |
| Whatever per-certification writer the flow needs | `skills/hitrust/lib/merge-import.js` + `xlsx-lite.js` (MyCSF export import) | `skills/soc2/lib/record-scope.js` (engagement scope) | *(none, the contract's level is the scope decision, made at register time)* |
| Maintainer compile of the included structure | `skills/hitrust-controls-compiler/` | *(none, hand-compiled; see above)* | *(none, throwaway extractor, not committed; see "Extraction method")* |
| Research/verification agent personas | `agents/` (fixed roster, see note) | *(none, reuses `vendor-researcher`)* | *(none, reuses `vendor-researcher`)* |

CMMC is the cheapest module to date and adds **no** new `lib/` code at all: three structure files,
three flows plus ground rules, a `framework.json` and a test. It is the clearest demonstration that
the core is actually certification-agnostic, and, unlike SOC 2's, its multiple tiers exercised
the tier machinery too.

### Which certification next, and why the obvious #4 was abandoned mid-build

Recorded so the decision isn't re-litigated from scratch. ISO 27001 was chosen as #3 on audience:
SOC 2 + ISO 27001 is the most common dual pursuit, and the two share roughly 80% of their controls,
which is what finally exercises the "one shared state.json makes overlap visible" claim beyond the
healthcare-only HITRUST + SOC 2 pairing.

**PCI DSS v4.0.1 was #4, and was abandoned after its enumeration had already been compiled.** Not on
sourcing quality: that part went well. 250 Defined Approach Requirements were extracted and
corroborated 250/250 against PCI SSC's own Spanish-language edition, which is publicly hosted on
`listings.pcisecuritystandards.org`. It was abandoned on **licence**: PCI SSC's Terms and Conditions
permit download for personal, non-commercial review, and separately prohibit distributing or
preparing derivative works of their content. A paraphrased `topicSummary` in a public GPL-3.0 plugin
is plausibly both. That is a *different* constraint from the one SOC 2 and ISO 27001 clear: theirs
is copyright, which a paraphrase avoids by not copying any protected expression, and which the 8-word
check exists to enforce. PCI's is contract, and it reaches use rather than expression, so the 8-word
check does not answer it. **Do not re-propose PCI DSS unless PCI SSC's Material License Agreement has
actually been granted for this plugin.**

**The general lesson, which is now step zero for any new certification:** reachability of a catalog
says nothing about permission to build on it. Check the publisher's *terms of use* separately from
its copyright posture, and do it **before** compiling, not after.

CMMC took the #4 slot instead, and is the strongest sourcing position in the plugin. See the
public-domain column below. Candidates remain rejected on the same ground as each other:

- **NIST CSF 2.0 and the HIPAA Security Rule: deliberately not modules.** Both are public domain and
  cheap to compile. HIPAA is also the most-enforced regime in US healthcare. Neither is
  **certifiable**: it lacks an assessor and a report, and doesn't produce a pass/fail outcome. Each dilutes the plugin's thesis as a
  certification module. HIPAA is doubly redundant here: HITRUST is already the certifiable
  wrapper around it. NIST CSF's value is as a future cross-framework spine, which is a different
  feature.

### A canonical identifier is read, never researched

The first question for a new certification is not "how do we research this" but **"is the
publisher's own catalog reachable?"** That answer decides everything downstream.

| | Publisher's work is uncopyrighted | Catalog freely published | Catalog gated, enumeration closed | Catalog gated, enumeration unknowable |
|---|---|---|---|---|
| Examples | NIST SPs and the eCFR (CMMC) | AICPA Trust Services Criteria (free account) | ISO/IEC 27001:2022 Annex A (paid per standard) | HITRUST MyCSF (licensing agreement) |
| Approach | **Include the requirement text itself.** US Government works aren't copyrighted. NIST says so in each publication. Still extract, still cross-check, but nothing has to be paraphrased away. | **Extract identifiers directly from the document.** Require every control to carry its canonical id plus a `codeVerifiedBy` citation. | **Reconstruct the identifier set, then prove it closes.** Canonical id plus a `codeCorroboratedBy` citation naming ≥2 independent sources. | Canonical ids are **not publicly obtainable.** Include accurately-scoped topics and route the org to its own licensed export. |
| What's included | Verbatim requirements, `sourceAuthority: "publisher-verbatim"` (CMMC: 15 + 110 + 24) | 100% canonically mapped (SOC 2: 61/61) | Canonically mapped, provenance marked weaker (ISO 27001: 93/93 Annex A) | Topic-level entries, most without a canonical id |

**The far-left column has an obligation the others don't: say which half is authoritative, because
it is the reverse of every other module.** CMMC's `topicSummary` is the real requirement and its
`topicLabel` is our derived shorthand. Anywhere else in `ciso` the summary is the paraphrase. A user
who has used the other modules will assume wrongly, so `ground-rules.md` states it and the interview
flow repeats it once per session.

**And a public-domain source can still be the wrong one.** CMMC binds NIST SP 800-171 **R2** and SP
800-172 (February 2021), both of which NIST has since *withdrawn* in favour of Revision 3, while 32 CFR
170.2 still incorporates the withdrawn editions by reference. Compiling from "the current NIST
publication" would have produced a clean, well-cited, entirely wrong control set. When a regulation
incorporates a standard by reference, the regulation's cited edition applies. Check the incorporation
clause, not the publisher's front page.

#### The middle column is narrow, and has an admission test

Do not read "gated but reconstructable" as a general licence to research identifiers. That is the
thing the rest of this section forbids. A certification qualifies for the middle
column only by meeting **both** of these, not either one:

1. **The enumeration is arithmetically closed.** Each block publishes a count that equals its own
   terminal integer, and the blocks sum to a stated total. That is what makes a wrong source
   *detectable* rather than merely outvoted.
2. **The closure is checkable against a publisher artifact**, named and reachable in the structure
   file: the publisher's own document or an authorized reproduction of it, not secondary commentary.

Condition 1 alone is not enough, and the gap is the reason condition 2 exists: arithmetic closure
proves the published counts are *mutually consistent*, not that they are *right*. If every secondary
source inherited the same number from one upstream copy, the arithmetic still closes on wrong data.
Closure detects disagreement. It cannot detect shared error. Only an artifact the publisher controls
breaks that loop, because it cannot inherit a consultancy's mistake.

ISO 27001's Annex A meets both conditions, with four themes of 37/8/14/34 ending at A.5.37, A.6.8,
A.7.14 and A.8.34, summing to 93, and an official ISO/IEC 27002:2022 preview whose numbered contents
correspond one-to-one with Annex A. HITRUST cannot qualify on either: no published count to check a
reconstruction against, and no reachable artifact. A fan-out there produces consensus with nothing
to falsify it.

**Say what you actually did with the artifact, and what it covers.** Naming it obliges you to be
exact twice over. First, on your own verification: whether you read its contents, or only confirmed
it is the document you claim and that a reader can reach it. Both beat secondary agreement alone;
they are not the same claim, and `coverageNote` must not blur them. Second, on scope: an artifact
that settles the *enumeration* usually does not settle the *subjects*, and saying "checked against
the publisher" without that split silently upgrades everything downstream of it.

ISO's records both. A maintainer read the ISO/IEC 27002:2022 preview and confirmed the four terminal
numbers. The closure rests on the publisher, but the per-control subjects still come from two
secondary lists, the `A.` prefix is 27001's labelling of 27002's numbering, and ISO 27001 itself was
never obtained. A verified enumeration does not promote a reconstructed identifier set to a read one,
so the entries stay on `codeCorroboratedBy`.

The lock is not theoretical. Compiling ISO 27001 turned up two live vendor pages carrying wrong
Annex A data, and the arithmetic caught both: one printed a physical-controls range ending at 7.13
while stating "14 controls" three lines away, and another listed A.8.1 as data masking while its own
body text put data masking at A.8.11. Six or more independent sources agreed against each. A
count-only or list-only check would have caught neither.

Obligations that come with the column:

- **`codeCorroboratedBy`, never `codeVerifiedBy`.** The latter means specifically "read out of the
  publisher's own document." Filling it with secondary URLs silently downgrades the stronger claim
  into the weaker one while keeping the stronger name. Keep the fields distinct, and say which one
  a module uses in its `coverageNote` and its `SKILL.md`.
- **Scope the claim to the part that actually closes.** ISO's Annex A closes; ISO's clauses 4-10 do
  not. No primary source was reachable for them and there is no count to check, so the ISO module
  claims only the subclause number for clause entries and doesn't make a canonical-id claim beyond it.
  A certification can be in the middle column for one half of its control set and the right column
  for the other.

**A research fan-out cannot produce a canonical identifier.** It aggregates secondary sources into a
confident consensus, and on precisely this kind of exact-enumeration question those sources are
unreliable. Worked example from the SOC 2 compile: three independent write-ups gave three different
answers for the Privacy criteria: one said 15 with P6 ending at P6.2, another "approximately 18," a
third conflated the 8 series with 8 criteria. Reading the AICPA document resolved it in minutes: 18,
with P6 running P6.1 through P6.7. More searching produced more contradiction, not convergence. That is the
signal to stop searching and read the source.

`hitrust-controls-compiler` exists because HITRUST's catalog is actually unreachable, and
`e1.v11.8.structure.json`'s `coverageNote` records what reconstruction cost even done carefully.
It is the right tool for an unreachable catalog and the wrong tool for a reachable one.

**Extraction method**, when a publisher PDF has to be read: inflate its `FlateDecode` content streams
with `zlib`, pull the parenthesized string literals, and normalize whitespace before matching (PDF
text is kerning-split, so word boundaries are unreliable). Write the string-literal pattern as
`\((?:[^()\\]|\\.)*\)`, excluding the backslash from the negated class. The obvious
`\((?:[^()]|\\.)*\)` lets both branches match a backslash, which backtracks catastrophically the
moment a binary stream happens to inflate cleanly; it ran fine on one copy of the TSC and hung
indefinitely on another. Habits that matter more than the code:
verify that structural tokens are what you assume (the TSC's `P<n>.0` entries are *section headers*,
not criteria), and **never anchor the identifier regex to the answer you expect**. The first SOC 2
pass used `CC[1-9]|A1|C1|PI1|P[1-8]`, which could not have found a `CC10` or `P9`; re-running it
unanchored is what turned "probably complete" into verified. Known limit: some publisher PDFs use
filters this approach cannot read and need `pdftotext`. Don't commit the script. It runs once every
few years and rots faster than twenty lines can be rewritten.

### The contract for a new certification

1. **Include a control structure** as `<tier>.<controlSetVersion>.structure.json`, in the shape
   [Adding a project framework](#adding-a-project-framework) describes, with `citations` on each
   control (plus whatever else your framework needs, `register-tier.js` preserves unknown fields by
   spread). `domainKey` is the grouping key the dashboard rolls up by. Exactly one current file
   per tier sits in the framework folder; when a new version of the standard replaces a tier, move
   the old file into `previous/`, which validation ignores and the upgrade flow diffs against.
2. **Register** it with `registerTier(statePath, structure, "<certKey>", "<Display Name>")`. This
   seeds every control's `assessment`/`roadmap` to the state.json contract and creates the interview
   session. No per-cert code.
3. **Assess** through `applyAssessment(...)`, never hand-write `state.json`. The gate (met needs a
   justification, and in_progress needs current-state + closeness) applies to every certification.
4. **Research** gaps via the roadmap workflow, it's certification-agnostic and already sanitizes
   posture prose out of what leaves the machine (`sanitize-control.js`).
5. **Describe yourself in `framework.json`**: `{ certKey, displayName, summary, tiers }`. The meta
   index (`dashboard.html`) renders a card from this, including for a project that hasn't
   registered you yet, where the card shows your `summary` and tells the user to run
   `ciso:register`. `certKey` must equal your folder name under `frameworks/` and match
   `^[a-z0-9]+(-[a-z0-9]+)*$`; `test/frameworks.test.js` runs `validate --bundled` on every bundled framework, which
   enforces both directions (every structure file is a declared tier, and every declared tier has
   exactly one file).
6. **Render** with `render-dashboard.js`, it discovers your certification/tiers/domains
   automatically and writes your page as `cert-<certKey>.html`. Per-control fields it doesn't know
   about (SOC 2's `requiredPolicies`/`evidenceExamples`, say) render automatically in an "Additional
   detail" block, so richer control data doesn't need a template change.
7. **Include `ground-rules.md`, plus one flow file per verb you support, in `flows/`.**
   **Do not write a `SKILL.md`.** A framework is not a skill. An org calls verbs directly
   (`ciso:register`, `ciso:interview`, and the rest), and each one resolves `certKey` at runtime
   through `frameworks.js list` and then reads `frameworks/<certKey>/flows/<verb>.md`, falling back
   to the verb's generic flow where it has one. Adding a certification doesn't add any skills, then.

   `ground-rules.md` is mandatory and is the one file every verb reads, on every
   invocation, immediately after resolving `certKey`. It carries what used to live in a
   certification's always-loaded `SKILL.md`: the content-authority statements (what your included
   control set is and is not, and what must be said to the user before they rely on it) and your
   core discipline. A design built around verbs has many entry points instead of one, so this file is
   the only thing standing between a user and acting on a non-authoritative control set without being
   told it is one. `test/frameworks.test.js` enforces that it exists and that no framework includes
   a `SKILL.md`; `test/skills-frontmatter.test.js` enforces that every cert-aware verb still reads
   it.

   Only include a flow file for a verb your certification actually supports. `ciso:scope` is
   SOC 2 only. `ciso:import` and `ciso:upgrade` are HITRUST only. A verb with no matching file says so
   plainly and names the certifications that do support it. Do not scaffold an empty file to make
   the matrix look full. `ciso:review`, `ciso:evidence` and `ciso:audit` read assessment data rather
   than certification mechanics and don't need a flow file at all (with one exception:
   `ciso:audit` reads `frameworks/iso27001/flows/soa.md` when producing ISO's Statement of
   Applicability).

### Work a clean split ("option a") would still require

The generic functions are reusable now, but a physically clean `core/` vs `certifications/<name>/`
layout would require:

- **Path rewiring.** `register-tier.js` resolves bare HITRUST tier names via a
  `__dirname`-relative `../../../frameworks/hitrust/` and defaults to e1; `render-dashboard.js` resolves the template via a
  `__dirname`-relative `../../assets/`. Relocating these scripts means parameterizing those paths
  (or resolving them from `CLAUDE_PLUGIN_ROOT`), a logic change, and their tests move with them.
- **The r2 PRISMA maturity model** (five dimensions, Policy/Procedure/Implemented/Measured/Managed)
  is currently threaded through `register-tier`/`apply-assessment`/`render-dashboard` as an optional
  per-control maturity model, applied only when `certKey` is `hitrust` and the tier is `r2`. It is
  HITRUST-specific but lives in the core scripts. A second
  certification that wants a *different* maturity model (or none) is the trigger to extract it behind
  an adapter; until then it remains in place, guarded by its existing tests.

### Note: The agent roster is fixed

`agents/` (hitrust-topic-researcher, hitrust-controls-verifier, hitrust-controls-reconciler,
vendor-researcher) is an intentional fixed roster enforced by `test/agents-frontmatter.test.js`. Add
new certification-specific personas as new files; don't parameterize the existing ones into a
configurable mechanism.
