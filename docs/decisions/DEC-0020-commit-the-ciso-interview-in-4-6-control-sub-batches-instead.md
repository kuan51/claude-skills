---
id: DEC-0020
title: Commit the ciso interview in 4-6 control sub-batches instead of whole domains
status: proposed
date: 2026-09-22
deciders: [kuan51]
supersedes: []
tags: [ciso, interview, plan-mode]
---

# DEC-0020: Commit the ciso interview in 4-6 control sub-batches instead of whole domains

Recorded on 2026-09-22 from the retired superpowers hardening design of 2026-07-19 (its section
"Interview commit-batch shrinking"). The decision itself dates from 2026-07-19.

## Context and problem statement

The control-by-control interview runs inside plan mode, where non-edit tool calls are blocked, so
every answer for a domain sat in conversation context until one `ExitPlanMode` committed the whole
domain through `apply-assessment.js`. A closed session or crash before that point lost every answer
in the domain; for i1 a domain can be several dozen controls.

## Decision drivers

- Plan mode is the right place for the interview; leaving it was not on the table.
- The existing per-control apply loop and domain-done gate already work and should be reused.
- The owner preferred the simplest fix over new persistence machinery.

## Considered options

1. **Checkpoint partial answers into the plan file** — zero loss on interruption, but a new
   persistence format, a recovery path, and tests for both.
2. **Shrink the commit unit to sub-batches of 4-6 controls** — call `ExitPlanMode` per sub-batch,
   apply through the existing loop, re-enter plan mode, repeat; the domain-done call runs once
   every control has an assessment. Nothing new is built; only the exit/re-enter frequency changes.

## Decision outcome

Chose **option 2**, because it bounds the worst-case loss to a handful of controls using
mechanisms that already exist and are already tested.

## Consequences

**Good:**

- An interruption loses at most one sub-batch; committed sub-batches in the same domain survive.
- The sub-batch size matches the `AskUserQuestion` batching already in use.

**Bad:**

- More approval round trips per domain, so a long domain interrupts the user more often.

## Gaps accepted

Loss is bounded, not eliminated. Full checkpointing remains available as a later decision if the
round trips prove too costly.

## Links

- Ticket: none
- Pull request: the 2026-07-19 ciso hardening work; recorded on the branch that retired
  `docs/superpowers/`
- Related: `docs/specs/2026-09-22-ciso-hitrust.md`
