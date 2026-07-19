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
3. Run `ciso:hitrust` — registers the HITRUST e1 control set (public-sourced, topic-level, v11.8),
   optionally imports your own licensed MyCSF export to get the exact requirement wording, then
   walks you through a control-by-control interview (inside a real plan-mode session, chunked so
   you can stop and resume across multiple sittings).
4. Open `docs/ciso/dashboard.html` in any browser — birds-eye progress across all tracked
   certifications, and a drill-down into every control's status, justification, and (once you've
   run the roadmap phase) vendor research.

## Guarantees

- **Nothing license-restricted ships in this repo.** HITRUST's verbatim requirement-statement
  wording lives only in your own local, gitignored project data, imported from your own MyCSF
  export — never hardcoded here.
- **Nothing about your organization ever leaves your project.** Assessment status, justifications,
  and vendor picks are local-only by default.
- **No "met" without a reason.** The interview mechanically refuses to record a control as met
  without a justification, or as in-progress without a current-state and estimated-closeness note.
