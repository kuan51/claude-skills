---
id: DEC-0005
title: Let the fabflows refuter answer BLOCKED when it cannot review
status: proposed
date: 2026-09-13
deciders: [kuan51]
supersedes: []
tags: [fabflows]
---

# DEC-0005: Let the fabflows refuter answer BLOCKED when it cannot review

## Context and problem statement

DEC-0004's build loop gives the refuter a review verdict of `ACCEPT` or `REWORK` and
nothing else. `refuter.md` already told the reviewer that a missing test runner or
dependency is a blocker to report, and that a permission denial comes first, but the
verdict schema had nowhere to put either. A reviewer that could not run the diff or the
test command had two answers, both wrong: `ACCEPT`, which accepts work nobody tested, or
`REWORK` with a must-fix the builder cannot act on, which spends Opus build rounds up to
the rework cap before the lead hears about it. A three-agent review of the 0.2.0 branch
raised it.

## Decision drivers

- The loop must never accept a change its reviewer could not test.
- A problem the builder cannot fix must not cost build rounds.
- The smallest change, reusing an exit the lead already knows how to read.

## Considered options

1. **`BLOCKED` in any round, escalating** — add `BLOCKED` and an optional `blocker` to the
   verdict; the loop escalates it with reason `reviewer-blocked`.
2. **`BLOCKED` in round 1 only** — treat a later-round block as `REWORK`, on the theory
   that the builder broke the runner.
3. **A pre-flight test run** — the lead runs the test command on the clean tree before
   starting the loop, and the schema stays as it is.
4. **Keep two verdicts** — the reviewer files "could not test" as a must-fix.
5. **Retry the review** — on a block, spawn a fresh reviewer once before escalating.

## Decision outcome

Chose **option 1**, because one enum value and one loop branch remove both wrong answers,
and the escalation already returns the last review as `verdict`, so the lead finds the
reason at `verdict.blocker` with no new plumbing. Option 2 asks the reviewer to judge who
broke the runner, which it cannot do reliably, and a wrong guess costs a round. Option 3
catches a missing runner before a build is paid for, but not a denial or anything that
breaks after round 1; it can still be added later. Option 4 is the failure being fixed.
Option 5 doubles the cost of a rare, usually non-transient failure that one escalation
settles.

## Consequences

**Good:**

- A reviewer that follows its instructions can no longer accept untested work.
- A blocked review costs no further build rounds and reaches the lead with its reason.
- Must-fix items sent with `BLOCKED` are not passed on as rework, because the review never
  ran.

**Bad:**

- A reviewer that ignores its instructions can still answer `ACCEPT` without testing. The
  lead's own re-run of the test command on `accepted` stays the backstop.
- A block in round 2 or 3 may be the builder's doing, and the loop does not say so; the
  lead has to read the round history.
- `blocker` is optional, so a `BLOCKED` can arrive without a reason and the lead has to
  read the prose report.
- The loop cannot resume after the lead fixes the environment, so the lead runs the
  refuter by hand on `<baseRef>..HEAD`.

## Gaps accepted

No pre-flight test run. Whether `blocker` becomes required is left to match whatever rule
the loop adopts for the builder's own `blocked` status, which is being decided separately.
A reviewer that lies about having tested is not detected by the loop.

## Links

- Ticket: none
- Pull request: none yet
- Related: DEC-0004
