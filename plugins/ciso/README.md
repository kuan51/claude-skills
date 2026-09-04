# ciso

Organizes work toward security certifications — today **HITRUST CSF** (e1/i1/r2),
**SOC 2 Type II**, **ISO/IEC 27001:2022** and **CMMC** (level1/level2/level3) — tracked in
persistent, local HTML dashboards you open directly in a browser (no server required). Ships
structural control metadata, plus verbatim requirement text in the one case where the publisher's
work carries no copyright (CMMC's NIST and eCFR sources). Licensed or copyrighted requirement
wording, and your organization's real assessment data, are imported/generated per-project and stored
only locally, gitignored by default — never in this repo.

Not installed yet? See the [repo root README](../../README.md) for how to add this marketplace
and install the plugin.

## When to use it

- You're starting or maintaining a HITRUST CSF, SOC 2 Type II, ISO 27001 or CMMC effort and want a
  durable, visual record of where every control stands — not just a chat transcript.
- You're pursuing more than one. They overlap heavily — SOC 2 and ISO 27001 especially — and one
  dashboard per certification over one shared state file is what makes that overlap visible
  instead of duplicated.
- You need to interrogate your own security posture control-by-control, with every "met" backed
  by a real justification, before an independent assessor ever sees it.
- You want budget-appropriate vendor/tooling suggestions for whatever controls are still gaps.

## When not to use it

- You already hold exact MyCSF licensed requirement-statement text and just need general research
  help — this plugin manages the *tracking project*, it isn't a MyCSF replacement.
- You want a one-off answer about a single control — just ask directly; the full interview flow
  is for building out a complete assessment.
- You want the actual audit. This plugin never produces a HITRUST certification, a SOC 2 report or
  an ISO 27001 certificate — only an authorized HITRUST assessor, a licensed CPA firm and an
  accredited certification body do that. It gets you ready for them.
- You want to know whether **one repository** holds the documents a standard requires — that is
  `docs-warden` in this same marketplace, which audits repository files against IEC 62304, the
  OSPS Baseline, the EU CRA and NIST SSDF. This plugin tracks organisational controls and their
  evidence; that one scores a repo's document set. They share no state and neither reads the
  other's.

## Quickstart

1. `cd` into the project where you want certification tracking to live (any project — this
   doesn't need to be a security-focused repo).
2. Run `ciso:init` — scaffolds `docs/ciso/state.json` and `docs/ciso/dashboard.html`, and adds
   `docs/ciso/` to that project's `.gitignore` so nothing sensitive ever gets committed.
   **Under the hood:** this is your scoreboard — plain HTML files you open directly in any
   browser (no server), and everything about your organization stays local to the project.
3. Run `ciso:register` — pick a certification and load its control set. **Under the hood:** each
   certification brings its own quirks and the verb handles them for you. HITRUST asks which of the
   three nested tiers you want (e1 ⊂ i1 ⊂ r2) and offers `ciso:import` if you hold a licensed MyCSF
   export with the exact requirement wording. SOC 2 sends you to `ciso:scope` next, because which
   Trust Services Categories are in scope decides which criteria even get asked. ISO 27001 registers
   both halves at once — the 30 management-system requirements from clauses 4–10 *and* all 93
   Annex A controls — since neither is optional. CMMC asks which level your *contract* requires
   (15 requirements at level1, 110 at level2, a further 24 at level3) and registers level2 alongside
   level3, because the enhanced requirements sit on top of all 110 rather than replacing them.
4. Run `ciso:interview` — the control-by-control conversation, inside a real plan-mode session and
   chunked so you can stop and resume across sittings. **Under the hood:** for each control it asks
   *met / in progress / gap / not applicable / defer*, and mechanically refuses to record a "met"
   without a written justification. For a SOC 2 Type II it keeps pushing on the question that
   actually decides the report — not "is this configured today" but "did it operate across the whole
   observation period." For ISO it takes the clauses first, because clause 6.1.3 is what selects
   your Annex A controls in the first place.
5. Run `ciso:roadmap` for whatever came out a gap — budget-appropriate vendor and open-source
   research, dispatched **in the background** so it never blocks the interview, merged into the
   dashboard once it lands.
6. Open `docs/ciso/dashboard.html` in any browser. That page is the **index**: one card per
   certification this plugin supports, showing birds-eye progress for the ones you track and how
   to start the ones you don't. Click a certification to open its own page
   (`docs/ciso/cert-<name>.html`) — per-tier gauges, per-domain progress, and a drill-down into
   every control's status, justification, evidence, and vendor research.
   **Under the hood:** every sub-batch of answers regenerates these files, so an interrupted
   session never loses more than the handful of controls in flight.

All certifications share one `state.json` and one set of verbs; each gets its own page.

## Keeping it current as you ship

The assessment is a snapshot. These three verbs are what stop it going stale, and they map onto the
points in a development cycle where a control's real status actually changes:

| When | Verb | What it does |
|---|---|---|
| A PR is up for review | `ciso:review` | Reads the diff against the controls you track and reports which ones it supports, which it might **regress**, and which open gaps sit in the same area. Read-only — it never records anything. |
| A PR merges, CI goes green | `ciso:evidence` | Attaches the PR, commit, CI run, scan or document to the controls it proves, as a durable record on the dashboard. |
| Before an audit, or periodically | `ciso:audit` | Reports what wouldn't survive an auditor: controls marked met with **no evidence**, assessments over 12 months old, thin justifications, unjustified exclusions, controls never assessed. For ISO 27001 it also produces the draft Statement of Applicability. |

`ciso:evidence` deliberately **never changes a control's status.** Assessment (the claim) and
evidence (what backs it up) are independent axes, which is exactly what lets `ciso:audit` surface
the interesting case — a control claimed as met with nothing behind it. Changing a status is always
`ciso:interview`.

Nothing here runs in CI. `state.json` is gitignored and stays that way; CI output is something you
feed in from your own machine.

## Guarantees

- **Nothing license-restricted ships in this repo.** HITRUST's verbatim requirement-statement
  wording lives only in your own local, gitignored project data, imported from your own MyCSF
  export — never hardcoded here. The same rule applies to AICPA's Trust Services Criteria text and
  points of focus: the SOC 2 module ships criterion *identifiers* and paraphrased topic summaries,
  never the copyrighted criterion wording. ISO 27001 is stricter still, because the standard is
  sold rather than published: its identifiers were *corroborated* from convergent public sources
  rather than read from ISO's own document (the field is `codeCorroboratedBy`, deliberately not
  SOC 2's `codeVerifiedBy`), and ISO's control titles and clause headings appear nowhere here.
  **CMMC is the deliberate exception, and it is not a loophole:** NIST states in each of its
  publications that the work "is not subject to copyright in the United States," and eCFR
  regulations are US Government works, so that module ships the real requirement text. Note the
  authority split runs the *opposite* way there — CMMC's `topicSummary` is the requirement itself
  and its `topicLabel` is our derived shorthand. (PCI DSS was compiled and then dropped for exactly
  this reason in reverse: its catalog is reachable, but PCI SSC's terms forbid derivative works.)
- **Your organization's posture never leaves your project.** Assessment status, your written
  justifications, in-progress notes, and vendor picks are stored only in your local, gitignored
  project data. The one flow that reaches the internet — background vendor research for gaps — is
  sent *only* a control's generic public subject (its topic label/code and domain), never your
  justifications or posture notes; a fail-closed allowlist in the research workflow enforces this.
- **No "met" without a reason.** The interview mechanically refuses to record a control as met
  without a justification, or as in-progress without a current-state and estimated-closeness note.
- **Evidence never fakes an assessment.** Attaching a PR or CI run writes only the evidence record —
  never the control's status, and never its `assessedAt` stamp. A script-level check and a test
  enforce it, so a control nobody has assessed can never be made to look assessed.

## Upgrading from 0.3.x

**1.0.0 replaced the per-certification skills with verbs.** Same flows, same data, different entry
points — nothing in your `docs/ciso/` needs migrating, and assessments carry across untouched.

| You used to run | Now run |
|---|---|
| `ciso:hitrust`, `ciso:soc2`, `ciso:iso27001` | the verb for what you actually want, below |
| …to register a control set | `ciso:register` |
| …to record SOC 2 engagement scope | `ciso:scope` |
| …to import a MyCSF export | `ciso:import` |
| …to run the assessment | `ciso:interview` |
| …to research vendors for gaps | `ciso:roadmap` |
| …to reconcile a framework version | `ciso:upgrade` |
| …to produce the ISO Statement of Applicability | `ciso:audit` |

`ciso:init` and `ciso:sync-tasks` are unchanged. `ciso:review`, `ciso:evidence` and `ciso:audit` are
new. Each verb resolves which certification you mean from your `state.json`, and only asks when more
than one is registered.

## Architecture

ciso is a **generic tracking core + one module per certification** (today, HITRUST, SOC 2,
ISO 27001 and CMMC). The core — scaffolding, registration, the assessment gate, versioning,
background vendor research, evidence, and the dashboards — is certification-agnostic and keyed by
`certKey`.

The org-facing surface is **verbs**: one skill per action, each resolving the certification at
runtime. A certification module ships no `SKILL.md` of its own — it is control data, reference
files, and whatever import or scope handling it needs, dispatched into by the verbs. Every verb
reads that module's `references/invariants.md` first, which is what guarantees a user is always told
what the shipped control set is and is not before acting on it.

That boundary is why a new certification costs no new skills. SOC 2 was built against it without
changing a single core script, and ISO 27001 without adding any runtime code at all. To see the
exact core/module boundary, how a certification's identifiers may and may not be sourced, and the
contract for adding a fifth, read
[ADDING-A-CERTIFICATION.md](ADDING-A-CERTIFICATION.md).
