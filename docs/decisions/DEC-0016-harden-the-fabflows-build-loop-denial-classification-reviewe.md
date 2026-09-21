---
id: DEC-0016
title: 'Harden the fabflows build loop: denial classification, reviewer model, and escalation guidance'
status: proposed
date: 2026-09-21
deciders: [kuan51]
supersedes: []
tags: [fabflows, benchmark, build-loop]
---

# DEC-0016: Harden the fabflows build loop: denial classification, reviewer model, and escalation guidance

## Context and problem statement

DEC-0004 shipped `fabflows:build` on arithmetic: an Opus builder, a Fable reviewer, a two-round
rework cap, and an accepted gap that "no eval covers any of this". Iterations 1 to 4 of the
benchmark never reached it, partly because the harness never offered the `Workflow` tool at all.

Iteration 5 did (`evals/RESULTS.md`). Task 7 asks a Fable lead to build a library and CLI from a
spec in a greenfield repository. Both `with_skill` leads launched the loop by the skill's routing
rule, unprompted, and both produced work that passed all 41 hidden acceptance tests. Two runs is
direction, not significance, but the two runs diverged in a way that is not about chance:

- **Run 1** took the clean path. The builder implemented and committed; a fresh reviewer re-ran
  the tests, read every changed file and returned ACCEPT with zero must-fix items; the lead ran
  the gate itself.
- **Run 2** lost its review entirely. The builder did the same work, hit the same denied shell
  command, recovered the same way, and returned `status: done` with an empty `blocker`. The
  workflow escalated it as `blocked` because the first line of its prose report began with the
  word "Permission" rather than, as in run 1, the word "One".

Three decisions follow from what the runs showed. Two further defects are plain bugs with no
options worth recording (the skill hands `args` to the workflow as a string, which `build.js`
rejects, costing every skill-driven lead a turn; and `refuter.md` states two different rules for
BLOCKED, one of which both reviewers disobeyed by returning ACCEPT after a denial). They are
listed under consequences so the fix ships with this record.

## Decision drivers

- **A prose regex decides whether a review happens.** `saysDenied` reads the first line of a free
  text report; `build.js`'s own comment concedes "the builder quoting it in blocker is the real
  signal". In run 2 the structured fields said done with no blocker and the prose overrode them.
- **The loop's value is the review.** Losing it is not a degraded run, it is the bare arm with an
  Opus builder attached. Run 2 cost $3.89 and got no independent check from the loop.
- **Escalation lands worker-level work back on the expensive lead.** Run 2's lead spent 10,317
  Fable output tokens in one turn doing the review itself, which inverts the tiering the skill
  exists for.
- **The reviewer's model depends on how it is launched.** `refuter.md` pins `model: opus`;
  `build.js` defaults `reviewerModel` to `fable`. The in-loop reviewer therefore spent 14,050
  output tokens on the model the user's weekly cap actually binds.
- **A reference file may be unreadable.** The escalation path tells the lead to read
  `references/build-loop.md` first. Run 2's lead tried twice and was refused twice: the plugin
  directory is outside the session's working directory, and this user's global settings block
  reads outside it. An installed plugin lives in the cache, outside any project, so this is not a
  benchmark artifact.
- **Measured, not argued.** Every claim above is from the transcripts and the workflow agents'
  own files, listed in `evals/RESULTS.md` iteration 5.

## Considered options

### A. What counts as a blocker

1. **Keep `saysDenied`** — status quo. A report opening with a denial escalates even when the
   builder recovered, committed and passed. Catches a builder that hides a denial in prose;
   loses a review whenever a builder is candid about a denial it handled.
2. **Trust the structured fields** — escalate on `status: blocked` or a non-empty `blocker`, and
   treat the report's first line as advisory only. The builder's brief already says a denial is a
   blocker and must be quoted in `blocker`, so a builder that recovered and left `blocker` empty
   has answered the question asked.
3. **Keep the regex but only as a tiebreaker** — escalate on prose only when `status` is not
   `done` or the tests were not run. More code for the same outcome as option 2 in every case the
   runs produced.

### B. Which model reviews inside the loop

1. **Keep `fable` as the default** — status quo; spends the capped model on review.
2. **Default to the agent's own pin (`opus`)** — one word in `build.js`, and the loop then agrees
   with `refuter.md`, which every other launch path already honours.
3. **Make the lead choose per run** — document `reviewerModel` in the skill and have the lead pass
   it. More prose, and the lead has no better information than the pin does.

### C. Where the escalation guidance lives

1. **Keep it in `references/build-loop.md`** — status quo and the DEC-0015 candidate. Shortest
   SKILL.md; unreadable for this user, and for any install reached from a project directory.
2. **Inline the branch table back into SKILL.md** — a few lines, always loaded, no file read.
   Costs the character budget the trim was chasing.
3. **Return the next action in the workflow result** — `escalate()` already carries `reason`; have
   it carry a one-line `next` per reason, as the missing-args path already does. The lead then
   needs no file at all.

## Decision outcome

Proposed: **A2, B2 and C3**, with C2 as the fallback if C3 is judged too large a change to
`build.js`.

A2 because the structured contract is the one the builder was asked to fill, and the code's own
comment already says so. B2 because the plugin pins the refuter to Opus everywhere else, and the
one place it does not is the place that spends the capped model. C3 because the guidance is three
lines per outcome and the result object is the one channel that cannot be blocked by a permission
setting; it also removes the read that DEC-0015's trim depends on.

This is a plugin behaviour change: `plugin.json` and `marketplace.json` bump together, and the
frontmatter test's model pins are unaffected. A minor bump (0.3.6 to 0.4.0) fits, because the
escalation contract consumers read gains a field and the reviewer's model changes.

## Consequences

**Good:**

- A builder that recovers from a denial keeps its review, which is what the loop is for.
- The in-loop reviewer stops spending the capped model.
- The lead can act on an escalation without reading a file it may not be allowed to open.
- Shipped with the same change, the two plain bugs: `whenToUse` and the skill's build-loop section
  say `args` is an object (or `build.js` parses a string), and `refuter.md`'s two BLOCKED rules
  are reconciled to one.

**Bad:**

- A builder that hides a denial in prose and leaves `blocker` empty now reaches review. The
  reviewer re-runs the tests itself, so the failure mode is a wasted review round, not a false
  accept.
- Opus review costs more per round at list price than Fable review; the point is which budget it
  comes from, and for a list-price payer this is a rise.
- `escalate()` gains a field, so anything reading its result shape has to tolerate it.

## Gaps accepted

- **The rework path is still unmeasured.** Both builds passed first time, so no REWORK round ran
  and the two-round cap was never approached. The reviewer's ability to catch a real defect, the
  fence around the must-fix list and the cap are all still arithmetic. Measuring them needs a task
  whose spec a first pass reliably misses.
- **One run per behaviour.** The escalation was observed once, the clean path once.
- **Whether the loop prevents the bare arm's defects is unmeasured.** Both bare runs shipped
  commit-hygiene faults (a NUL byte in a committed source file; two of five commits failing in
  isolation, reported as green) that neither fabflows run did. No reviewer ever looked at a bare
  run, so the loop's role in that difference is a hypothesis.
- **The guard hook question is now closed the other way:** payloads confirm it fires inside
  Workflow-tool agents, so `build.js`'s default-branch check is a second line of defence rather
  than the only one. No decision needed, but the comment and the README should stop calling it
  unverified.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0004 (the loop's original tiers and its accepted eval gap), DEC-0015 (its
  reference-file element is what option C revisits; read them together), DEC-0012, DEC-0014;
  `plugins/fabflows/evals/RESULTS.md` iteration 5
