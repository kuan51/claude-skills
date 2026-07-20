# ciso

Organizes work toward security certifications — starting with HITRUST CSF e1 — tracked in a
persistent, local HTML dashboard you open directly in a browser (no server required). Ships
only structural control metadata; actual requirement wording and your organization's real
assessment data are imported/generated per-project and stored only locally, gitignored by
default — never in this repo.

Not installed yet? See the [repo root README](../../README.md) for how to add this marketplace
and install the plugin.

## When to use it

- You're starting or maintaining a HITRUST CSF certification effort and want a durable, visual
  record of where every control stands — not just a chat transcript.
- You need to interrogate your own security posture control-by-control, with every "met" backed
  by a real justification, before an independent assessor ever sees it.
- You want budget-appropriate vendor/tooling suggestions for whatever controls are still gaps.

## When not to use it

- You already hold exact MyCSF licensed requirement-statement text and just need general research
  help — this plugin manages the *tracking project*, it isn't a MyCSF replacement.
- You want a one-off answer about a single control — just ask directly; the full interview flow
  is for building out a complete assessment.

## Quickstart

1. `cd` into the project where you want certification tracking to live (any project — this
   doesn't need to be a security-focused repo).
2. Run `ciso:init` — scaffolds `docs/ciso/state.json` and `docs/ciso/dashboard.html`, and adds
   `docs/ciso/` to that project's `.gitignore` so nothing sensitive ever gets committed.
   **Under the hood:** this is your scoreboard — a plain HTML file you open directly in any
   browser (no server), and everything about your organization stays local to the project.
3. Run `ciso:hitrust` — registers the HITRUST e1 control set (public-sourced, topic-level, v11.8),
   optionally imports your own licensed MyCSF export to get the exact requirement wording, then
   walks you through a control-by-control interview (inside a real plan-mode session, chunked so
   you can stop and resume across multiple sittings). **Under the hood:** for each control it asks
   *met / in progress / gap / not applicable / defer*, and mechanically refuses to record a "met"
   without a written justification. As soon as a category turns up gaps, it kicks off
   budget-appropriate vendor/tooling research **in the background** — so it never blocks the
   interview — and merges the findings into the dashboard once they land.
4. Open `docs/ciso/dashboard.html` in any browser — birds-eye progress across all tracked
   certifications, and a drill-down into every control's status, justification, and (once the
   roadmap research lands) vendor research. **Under the hood:** every sub-batch of answers
   regenerates this file, so an interrupted session never loses more than the handful of controls
   in flight.

## Guarantees

- **Nothing license-restricted ships in this repo.** HITRUST's verbatim requirement-statement
  wording lives only in your own local, gitignored project data, imported from your own MyCSF
  export — never hardcoded here.
- **Your organization's posture never leaves your project.** Assessment status, your written
  justifications, in-progress notes, and vendor picks are stored only in your local, gitignored
  project data. The one flow that reaches the internet — background vendor research for gaps — is
  sent *only* a control's generic public subject (its topic label/code and domain), never your
  justifications or posture notes; a fail-closed allowlist in the research workflow enforces this.
- **No "met" without a reason.** The interview mechanically refuses to record a control as met
  without a justification, or as in-progress without a current-state and estimated-closeness note.

## Architecture

ciso is a **generic tracking core + one certification module** (today, HITRUST). The core —
scaffolding, registration, the assessment gate, versioning, background vendor research, and the
dashboard — is certification-agnostic and keyed by `certKey`; HITRUST supplies the control data, the
org-facing flow, and its licensed-export import. To see the exact core/module boundary and the
contract for adding a second certification (SOC 2, ISO 27001, …), read
[ADDING-A-CERTIFICATION.md](ADDING-A-CERTIFICATION.md).
