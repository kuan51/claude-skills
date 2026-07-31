# ciso

Organizes work toward security certifications — today **HITRUST CSF** (e1/i1/r2) and
**SOC 2 Type II** — tracked in persistent, local HTML dashboards you open directly in a browser
(no server required). Ships only structural control metadata; actual requirement wording and your
organization's real assessment data are imported/generated per-project and stored only locally,
gitignored by default — never in this repo.

Not installed yet? See the [repo root README](../../README.md) for how to add this marketplace
and install the plugin.

## When to use it

- You're starting or maintaining a HITRUST CSF or SOC 2 Type II effort and want a durable, visual
  record of where every control stands — not just a chat transcript.
- You're pursuing both. They overlap heavily, and one dashboard per certification over one shared
  state file is what makes that overlap visible instead of duplicated.
- You need to interrogate your own security posture control-by-control, with every "met" backed
  by a real justification, before an independent assessor ever sees it.
- You want budget-appropriate vendor/tooling suggestions for whatever controls are still gaps.

## When not to use it

- You already hold exact MyCSF licensed requirement-statement text and just need general research
  help — this plugin manages the *tracking project*, it isn't a MyCSF replacement.
- You want a one-off answer about a single control — just ask directly; the full interview flow
  is for building out a complete assessment.
- You want the actual audit. This plugin never produces a HITRUST certification or a SOC 2 report —
  only an authorized HITRUST assessor and a licensed CPA firm do that. It gets you ready for them.

## Quickstart

1. `cd` into the project where you want certification tracking to live (any project — this
   doesn't need to be a security-focused repo).
2. Run `ciso:init` — scaffolds `docs/ciso/state.json` and `docs/ciso/dashboard.html`, and adds
   `docs/ciso/` to that project's `.gitignore` so nothing sensitive ever gets committed.
   **Under the hood:** this is your scoreboard — plain HTML files you open directly in any
   browser (no server), and everything about your organization stays local to the project.
3. Run `ciso:hitrust` — registers the HITRUST e1 control set (public-sourced, topic-level, v11.8),
   optionally imports your own licensed MyCSF export to get the exact requirement wording, then
   walks you through a control-by-control interview (inside a real plan-mode session, chunked so
   you can stop and resume across multiple sittings). **Under the hood:** for each control it asks
   *met / in progress / gap / not applicable / defer*, and mechanically refuses to record a "met"
   without a written justification. As soon as a category turns up gaps, it kicks off
   budget-appropriate vendor/tooling research **in the background** — so it never blocks the
   interview — and merges the findings into the dashboard once they land.

   Or run `ciso:soc2` — registers the 2017 Trust Services Criteria (33 mandatory Common Criteria
   plus the opt-in Availability, Confidentiality, Processing Integrity and Privacy categories),
   records your engagement scope first (Type I vs II, which categories, observation period,
   subservice carve-out), then runs the same interview over the criteria. **Under the hood:** for a
   Type II it keeps pushing on the question that actually decides the report — not "is this
   configured today" but "did it operate across the whole observation period, and can you evidence
   every month of it."

   Both certifications share one `state.json` and one set of skills; each gets its own page.
4. Open `docs/ciso/dashboard.html` in any browser. That page is the **index**: one card per
   certification this plugin supports, showing birds-eye progress for the ones you track and how
   to start the ones you don't. Click a certification to open its own page
   (`docs/ciso/cert-<name>.html`) — per-tier gauges, per-domain progress, and a drill-down into
   every control's status, justification, and (once the roadmap research lands) vendor research.
   **Under the hood:** every sub-batch of answers regenerates these files, so an interrupted
   session never loses more than the handful of controls in flight.

## Guarantees

- **Nothing license-restricted ships in this repo.** HITRUST's verbatim requirement-statement
  wording lives only in your own local, gitignored project data, imported from your own MyCSF
  export — never hardcoded here. The same rule applies to AICPA's Trust Services Criteria text and
  points of focus: the SOC 2 module ships criterion *identifiers* and paraphrased topic summaries,
  never the copyrighted criterion wording.
- **Your organization's posture never leaves your project.** Assessment status, your written
  justifications, in-progress notes, and vendor picks are stored only in your local, gitignored
  project data. The one flow that reaches the internet — background vendor research for gaps — is
  sent *only* a control's generic public subject (its topic label/code and domain), never your
  justifications or posture notes; a fail-closed allowlist in the research workflow enforces this.
- **No "met" without a reason.** The interview mechanically refuses to record a control as met
  without a justification, or as in-progress without a current-state and estimated-closeness note.

## Architecture

ciso is a **generic tracking core + one module per certification** (today, HITRUST and SOC 2). The
core — scaffolding, registration, the assessment gate, versioning, background vendor research, and
the dashboards — is certification-agnostic and keyed by `certKey`; each module supplies only its
control data, its org-facing flow, and whatever import or scope handling it needs. SOC 2 was built
against that contract without changing a single core script. To see the exact core/module boundary
and the contract for adding a third certification (ISO 27001, PCI DSS, …), read
[ADDING-A-CERTIFICATION.md](ADDING-A-CERTIFICATION.md).
