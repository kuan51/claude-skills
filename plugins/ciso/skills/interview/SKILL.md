---
name: interview
description: Use when running the control-by-control (or criterion-by-criterion, or requirement-by-requirement) assessment that records whether each one is met, in progress, a gap, or not applicable, together with the justification behind that answer. This is the main assessment conversation; use ciso:audit instead to check readiness of assessments already recorded.
allowed-tools: Read, Write, Bash, AskUserQuestion, EnterPlanMode, ExitPlanMode, Workflow
---

# Run the assessment interview

## Overview

The core loop: work through a certification's controls in chunks, ask the user where each one
actually stands, and record the answer through `apply-assessment.js`. Resumable -- it picks up the
existing `interviewSessions` entry rather than starting over, and completion is not a lock, so an
already-completed domain can be re-selected to amend prior answers.

Runs inside native plan mode, committing in sub-batches and re-rendering the dashboard after every
one, so an interruption costs at most a handful of controls.

## Routing

Always start here, every invocation:

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop** -- do not scaffold it yourself.
3. **Resolve the certification** from `state.certifications`: the one the user named, else the sole
   registered certification, else `AskUserQuestion` over the registered ones. If the certification
   the user wants is not registered at all, send them to `ciso:register` and stop.
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/invariants.md` and follow it.**
   Mandatory, before step 5. It carries the assessment gate ("met" needs a real justification), the
   content-authority statements, and -- for HITRUST -- the unconditional pending-version-upgrade
   check that must happen before any flow touches control data.
5. **Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/interview.md`.**

Every certification supports this verb.

## Two per-certification bindings

- **HITRUST r2 reads a second file.** After `interview.md`, also read and follow
  `${CLAUDE_PLUGIN_ROOT}/skills/hitrust/references/r2-maturity.md`. r2 scores five PRISMA maturity
  dimensions per control rather than a single status, and that reference carries the depth pass.
  e1 and i1 are Implemented-only and read `interview.md` alone.
- **ISO 27001 assesses clauses before Annex A.** Clause 6.1.3 is what selects the Annex A controls,
  so taking Annex A first inverts the standard's own logic. `interview.md` enforces the order; do
  not offer the user a free choice of starting domain that breaks it.

## Prerequisite worth checking before you start

**SOC 2 needs its scope recorded first.** If `certifications.soc2.tiers.type2.scope` is missing or
has no `tscCategories`, stop and send the user to `ciso:scope`. Which categories are in scope decides
which criteria get asked at all, so interviewing first means asking questions that may turn out to
be out of scope and marking criteria that should have been `not_applicable`.

## After the interview

Re-render the dashboard, then offer:

- `ciso:roadmap` for anything that came out a gap.
- `ciso:evidence` to attach the PRs, commits and CI runs behind whatever was recorded as met -- the
  justification is prose, and prose alone is what `ciso:audit` flags.
