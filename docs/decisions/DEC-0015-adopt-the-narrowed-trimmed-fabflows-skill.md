---
id: DEC-0015
title: Adopt the narrowed trimmed fabflows skill
status: proposed
date: 2026-09-19
deciders: [kuan51]
supersedes: []
tags: [fabflows, benchmark]
---

# DEC-0015: Adopt the narrowed trimmed fabflows skill

## Context and problem statement

DEC-0004, DEC-0012 and DEC-0013 each accepted the same gap: nothing measured what the
`fabflows` skill costs or whether its prose produces the behaviour it describes. The benchmark
under `plugins/fabflows/evals/` closed part of that gap in four iterations
(`evals/RESULTS.md`).

What it found about the shipped skill (13,544 characters): on short tasks a Fable lead with it
loaded produced identical quality to a plain session at +21% to +64% list cost, and the
overhead was the lead's own, in particular re-verifying grep results it had just read as though
they were a worker's report. On a 13-file read the skill delegated by routing and paid for
itself, 12% cheaper with a lead context 12k tokens smaller.

Two variants were then measured on the short search, the 13-file read and a suite triage:

- **Trimmed** (iteration 3; 8,362 characters; the build-loop failure handling moved to
  `references/build-loop.md`; the gate scoped in plain words to worker reports): the
  short-task overhead fell by about three quarters ($1.20 to $0.65 on the search), but one of
  two leads read a judgment clause written for root-cause work as covering a summary and read
  all 13 files itself.
- **Narrowed** (iteration 4; 8,613 characters; the trim plus one rewritten paragraph: "a read of
  more than a handful of files is volume even when you will summarise or judge the result, so
  delegate the reading and keep the judging", with the judgment clause limited to root-cause,
  architecture and coupled-refactor calls): the short-task saving held ($0.68) and both
  13-file runs delegated, one citing the rule almost word for word. Same quality throughout.

## Decision drivers

- **Measured, not argued.** This is the first fabflows prose change with a before-and-after
  number behind it, on the same tasks, with the same lead model and effort.
- **Prose the lead applies as a rule beats prose it interprets.** The volume rule was what
  turned a 1/2 into a 2/2; the longer original prose had the same effect at nearly twice the
  length.
- **The gate was hurting the lead's own work.** Saying that the gate exists for worker reports
  removed the self-verification greps without a single lost assertion.
- **Compaction re-injects the skill inside a 5k-token cap.** A shorter body survives that whole
  more often (the frontmatter test checks the character bound).
- **Two runs per cell.** Every figure is direction, not significance; the deep-read split in
  iteration 3 was one run each way.

## Considered options

1. **Keep the shipped skill** — no measured benefit over the narrowed variant on any task, and
   the highest short-task overhead.
2. **Adopt the iteration-3 trim as is** — largest saving on short tasks, but it weakened the one
   delegation that pays.
3. **Adopt the narrowed trim** — the trim plus the volume rule and the limited judgment clause.
   Keeps the saving and the delegation. Description unchanged, so triggering is untouched.
4. **Adopt the narrowed trim and relax the test-runner gate** — would also let a bare test run
   be delegated. Not selected for a record; the gate change is a separate question with its own
   evidence in iteration 2.

## Decision outcome

Proposed: **option 3**. Replace the body of `plugins/fabflows/skills/fabflows/SKILL.md` with the
`h1b-narrowed` variant (reproducible from `plugins/fabflows/evals/snapshots/h1b-narrowed.patch`),
add `skills/fabflows/references/build-loop.md`, keep the frontmatter description as it is, and
bump `plugin.json` and `marketplace.json` together. A patch bump (0.3.6 to 0.3.7) fits the
CLAUDE.md rule: no install breaks, no new skill or consumer-side file, prose that changes how the
lead decides. If the deciders read the delegation rule as a new behaviour consumers can rely on,
minor is defensible; the choice is theirs.

## Consequences

**Good:**

- Short tasks cost the lead less with the skill loaded, with no measured loss of quality.
- The volume rule is explicit, so the explorer is used where it pays.
- The build loop's non-accepted outcomes load only when a loop ends that way.

**Bad:**

- Tasks 2 to 4 (edit, write tests, version bump) were not rerun on the variant; the saving
  there is inferred from task 1, not measured.
- The judgment clause is now narrower; a task that genuinely needs the lead to read everything
  before it can decide anything has to say so or the lead may delegate the read first.
- `references/build-loop.md` has not been exercised in a live loop ending in escalation.

## Gaps accepted

- **Direction, not significance.** Two runs per cell throughout.
- **Triggering is out of scope here.** The description is unchanged; DEC-0014 addresses when
  the skill loads at all.
- **The test-runner gate stays as it is.** Iteration 2 showed why a bare test run is never
  delegated under it; that is left as a proposal (H5 in `evals/RESULTS.md`).
- **Refuter, investigator, editor and researcher tiers remain unmeasured.** No task reached
  them; the pre-registered tier hypotheses need direct-spawn probes.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0012 (this sharpens its delegate-on-volume rule), DEC-0013, DEC-0004, DEC-0014;
  `plugins/fabflows/evals/RESULTS.md` iterations 3 and 4;
  `plugins/fabflows/evals/snapshots/h1b-narrowed.patch`
