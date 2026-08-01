---
name: audit
description: Use when checking how audit-ready the tracked certification data actually is -- controls claimed as met with no evidence behind them, assessments that have gone stale, thin or evasive justifications, controls never assessed at all. Also produces ISO 27001's draft Statement of Applicability. Reports on data already recorded; use ciso:interview to record or change it.
allowed-tools: Read, Bash
---

# Audit-readiness report

## Overview

Reads what the project has recorded and reports where it would not survive contact with a real
auditor. Not an assessment and not an audit -- a check on the *quality and freshness* of the
assessment already done.

**Read-only.** It writes nothing to `state.json`. Every problem it finds is fixed somewhere else:
`ciso:interview` for a status or justification, `ciso:evidence` for missing proof.

## Routing

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop.**
3. **Resolve the certification** from `state.certifications`: the one the user named, else the sole
   registered certification. If several are registered and the user did not narrow it, **audit all
   of them** and group the report by certification -- readiness is naturally a whole-programme
   question.
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/invariants.md` and follow it.**
   Mandatory. It carries the content-authority statements, which matter here more than anywhere:
   a readiness report is exactly the moment a user is most likely to mistake this tracking data for
   an authoritative control set.

There is no per-certification `references/audit.md`, with one supplement below.

## The checks

Run all of these against every control in scope. Report each finding with the control id, its label,
and the specific verb that fixes it.

1. **Met without evidence.** `assessment.status === 'met'` and `evidence` is empty or absent. The
   headline check -- a claim with nothing behind it is the first thing an auditor pulls on.
   → `ciso:evidence`.
2. **Stale assessment.** `assessment.assessedAt` more than **12 months** old. Twelve months is the
   common recertification and surveillance cadence; say that you used it, since a given org's cycle
   may differ. → `ciso:interview`.
3. **Stale evidence.** The control is `met`, has evidence, but the newest `recordedAt` is more than
   12 months old. Use `recordedAt` here, not `occurredAt` -- the question is when anyone last
   confirmed the backing still exists, not how old the artifact is. → `ciso:evidence`.
4. **Thin justification.** `met` with a justification under roughly 40 characters, or one that is
   effectively a restatement of the control ("we do this", "yes", "implemented"). The assessment
   gate only checks for non-blank, so this is where evasive answers surface. → `ciso:interview`.
5. **Never assessed.** `assessment.assessedAt === null`. Distinguish from "asked and deferred",
   which has a non-null `assessedAt` with status `not_assessed` -- deferred is a decision, never
   assessed is a hole. → `ciso:interview`.
6. **Unjustified exclusion.** `not_applicable` with a blank or perfunctory justification. An
   exclusion an auditor cannot follow is worse than a gap, because it looks like an evasion.
   → `ciso:interview`.
7. **Gaps with no roadmap.** `gap` or `in_progress` with `roadmap.status` still `not_started`. Not a
   readiness defect exactly, but it is the work queue. → `ciso:roadmap`, or `ciso:sync-tasks` to get
   them into a tracker.

For **r2**, run checks 1-6 against the Implemented dimension, and additionally flag any control
where `managed` or `measured` is claimed with a thinner justification than `implemented` -- higher
maturity claimed on weaker ground than the tier below it.

## SOC 2: check the observation period

For a Type II, compare each `met` control's evidence against `tier.scope.observationPeriodStart`,
using **`occurredAt` where a record has it and falling back to `recordedAt` where it does not**.
That distinction decides the answer: `occurredAt` is when the artifact happened, `recordedAt` is
only when someone typed it in, so judging on `recordedAt` alone flags every control whose supporting
work predates the period -- systematically the foundational ones (MFA, encryption, access review).

**A control whose only evidence postdates the start of the period is not `met` for that period** --
it is `in_progress` with a start date. Report these separately and prominently; the invariants file
calls this the single most common way a self-assessment overstates readiness, and it is invisible
unless something goes looking.

Where a record has no `occurredAt` and its `recordedAt` falls inside the period, say the date is
unconfirmed rather than asserting the control failed -- the artifact may well predate the period.
Offer to re-attach it with `ciso:evidence` and a real `occurredAt`.

## ISO 27001: also produce the Statement of Applicability

When `certKey` is `iso27001`, additionally **read and follow
`${CLAUDE_PLUGIN_ROOT}/skills/iso27001/references/soa.md`** and include its output in the report.
The SoA is a reading of data already recorded -- the include/exclude decision and justification for
all 93 Annex A controls -- and it is what a Stage 1 auditor asks for first. That reference is
deliberately read-only and refuses to write an SoA document into `docs/ciso/`; honour that.

## Reporting

Lead with a one-line readiness summary per certification -- how many controls are `met`, how many of
those carry evidence, how many findings -- then the findings grouped by check, most severe first.
Order: met-without-evidence, observation-period problems, thin justifications, unjustified
exclusions, never assessed, stale, gaps without a roadmap.

**If a check comes back clean, say so explicitly.** "No stale assessments" is information; silence
reads as "not checked."

Close with the single highest-leverage next action rather than a list of everything.
