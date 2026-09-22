---
id: DEC-0016
title: 'Harden the fabflows build loop: denial classification, reviewer model, and escalation guidance'
status: accepted
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
- **Run 2** lost the loop's review. The builder did the same work, hit the same denied shell
  command, recovered the same way, and returned `status: done` with an empty `blocker`. The
  workflow escalated it as `blocked` because the first line of its prose report began with the
  word "Permission" rather than, as in run 1, the word "One". The lead then re-created the review
  by hand, spawning `fabflows:refuter` through the Agent tool, which ran on Opus and also returned
  ACCEPT with no must-fix items. So the review still happened, but as unbudgeted lead-driven work
  rather than as the loop's own step.

Three decisions follow from what the runs showed. Two further defects are plain bugs with no
options worth recording (the skill hands `args` to the workflow as a string, which `build.js`
rejects, costing every skill-driven lead a turn; and `refuter.md` states two different rules for
BLOCKED, one of which both reviewers disobeyed by returning ACCEPT after a denial). They are
listed under consequences so the fix ships with this record.

## Decision drivers

- **A prose regex decides whether a review happens.** `saysDenied` reads the first line of a free
  text report; `build.js`'s own comment concedes "the builder quoting it in blocker is the real
  signal". In run 2 the structured fields said done with no blocker and the prose overrode them.
- **The loop's value is the review, and losing it re-prices rather than removes it.** Run 2 cost
  $3.89, and the only independent check it got was one its lead had to brief, spawn and pay for
  itself, on its own turn.
- **Escalation moves orchestration back onto the lead.** Run 2's lead spent 10,317 Fable output
  tokens across the twelve turns of its final segment writing a refuter brief, two probe scripts
  and its report. It did not do the review itself, and the escalation did not invert the tiering:
  run 2 cost less than run 1 and used fewer Fable tokens, because skipping the in-loop reviewer
  skipped the one step that defaults to Fable. That is an argument for the next driver, not
  against it.
- **The reviewer's model depends on how it is launched.** `refuter.md` pins `model: opus`;
  `build.js` defaults `reviewerModel` to `fable`. The in-loop reviewer therefore spent 14,050
  output and 48,100 cache-write tokens on the model the user's weekly cap actually binds: $1.33 of
  run 1's $4.12, and the whole of the arm's cache-write regression.
- **A reference file may be unreadable, in one specific setup.** The escalation path tells the
  lead to read `references/build-loop.md` first. Run 2's lead tried twice and was refused twice,
  because the benchmark stages the plugin inside the repository and this user's global settings
  block reads outside the working directory. `~/.claude/plugins/**` is exempt from that setting,
  so a cache install would have been readable; the exposure is to plugins loaded from a
  development path with `--plugin-dir`, which is how anyone testing a branch runs it.
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

This one is contingent, and the first draft of this record overstated it. Shipped 0.3.6 has no
`references/` directory: its SKILL.md already carries the escalation branches inline, so there is
nothing to fix today. The defect exists only in the DEC-0015 candidate, which moves that content
into a file, and only for a plugin loaded from a development path with `--plugin-dir`, since the
plugin cache is exempt from the setting that blocked the read. So C is not a fix to the current
plugin; it is a condition on adopting DEC-0015.

1. **Keep it in `references/build-loop.md`** — the DEC-0015 candidate. Shortest SKILL.md, and
   unreadable for a `--plugin-dir` load, which is how every branch test and this benchmark run.
2. **Inline the branch table back into SKILL.md** — a few lines, always loaded, no file read.
   Costs the character budget the trim was chasing.
3. **Return the next action in the workflow result** — `escalate()` already carries `reason`; have
   it carry a one-line `next` per reason, as the missing-args path already does. The lead then
   needs no file at all.

## Decision outcome

Proposed: **B2 first and on its own merits, A2 with it, and C3 only as a condition on DEC-0015.**

**B2 is the one change this evidence supports unambiguously**, and it needs no comparison between
arms to justify it: one usage record and the price table settle it. Run 1's in-loop reviewer cost
$1.33 on Fable against $0.70 for the identical work on Opus, and `refuter.md` already pins Opus
everywhere else, so the loop is the single place the plugin contradicts its own tiering.

**A2 must ship with B2, not before it.** The structured contract is the one the builder was asked
to fill, and `build.js`'s own comment says the blocker field is the real signal. But A2 routes
more runs into a review, and while that review defaults to Fable, A2 alone raises Fable spend by
$0.61 to $1.08 per rescued run. The two changes are one change.

**C3 is contingent.** It fixes nothing in 0.3.6, whose SKILL.md already holds the guidance inline.
Adopt it only if DEC-0015's trim is adopted, as the price of moving that content into a file.

There is a sharper reason to act on A2 than its cost. `build.js` instructs the builder to open its
report with `Permission denied:` when a denial occurs, and then escalates any report that opens
that way. A builder that obeys the brief is routed out of the loop; run 2 obeyed and lost its
review, run 1 disobeyed and got one. The loop's success in this iteration depended on a worker
ignoring an instruction.

This is a plugin behaviour change: `plugin.json` and `marketplace.json` bump together, and the
frontmatter test's model pins are unaffected. **Shipped as 0.3.7, a patch, not the minor bump this
record argued for.** The deciders judged that no install breaks, nothing a consumer relies on is
removed, and the one experienced change, the reviewer's tier, is restored by passing
`reviewerModel: 'fable'`. DEC-0015 landed in the same release and asks for the same patch number.
The original reasoning is left below as written, since an accepted record is not edited: a minor
bump (0.3.6 to 0.4.0) fits, because the
reviewer's model changes and, if C3 lands, the escalation contract consumers read gains a field.

## Consequences

**Good:**

- A builder that recovers from a denial keeps its review, which is what the loop is for.
- The in-loop reviewer stops spending the capped model, and for review work it is cheaper at list
  price too. Run 1's reviewer usage costs $1.33 on Fable against $0.70 on Opus. The two models'
  rates are inverted rather than one being uniformly cheaper: Opus is half Fable on input, output
  and cache write, and Fable is half Opus on cache read ($0.25/M against $0.50/M). Review is
  output-heavy, so Opus wins; the crossover for this reviewer's mix would need about 2.6 million
  cache-read tokens, 27 times what it used. B2 therefore saves on both the subscription axis and
  the list-price axis, but the reason is the token mix, not a blanket price advantage.
- The lead can act on an escalation without reading a file it may not be allowed to open.
- Shipped with the same change, the two plain bugs: `build.js` parses a string `args` (a sentence
  in the skill's build-loop section helps, but one in `whenToUse` is reprinted inside the same
  Skill expansion that generates the bad call, so it is not sufficient on its own), and
  `refuter.md`'s two BLOCKED rules are reconciled to the narrow one, BLOCKED only when the diff or
  the test command could not be run, which is what `refuter.md`'s own description and `build.js`'s
  review brief already state. Worth recording rather than using as a justification: under the
  broad reading, run 1's reviewer was denied a command and should have returned BLOCKED, so zero
  of four runs complete the loop under the plugin's other stated rule.

**Bad:**

- A builder that hides a denial in prose and leaves `blocker` empty now reaches review. The
  reviewer re-runs the tests itself, so the failure mode is a wasted review round, not a false
  accept.
- A2 makes escalations rarer, and run 2 shows an escalation can be cheaper than the clean path
  when it skips a Fable reviewer. Applied without B2, A2 would therefore raise the mean cost.
  They belong together.
- `escalate()` gains a field, so anything reading its result shape has to tolerate it.

## Gaps accepted

- **The rework path is still unmeasured.** Both builds passed first time, so no REWORK round ran
  and the two-round cap was never approached. The reviewer's ability to catch a real defect, the
  fence around the must-fix list and the cap are all still arithmetic. Measuring them needs a task
  whose spec a first pass reliably misses.
- **One run per behaviour.** The escalation was observed once, the clean path once.
- **Whether the loop prevents the bare arm's defects is unmeasured, and the comparison is
  confounded.** Both bare runs shipped commit-hygiene faults (a NUL byte in a committed source
  file; two of five commits failing in isolation) that neither fabflows run did. But three of the
  four runs made exactly one feature commit, including a bare one, so only one run could
  structurally show the isolation fault; the builder brief steers towards that single commit; and
  nothing in the loop checks a commit in isolation, since both the gate and the refuter run
  against the final tree. No reviewer ever looked at a bare run. Treat this as a hypothesis about
  what a review culture might catch, not as a measured property of the loop.
- **The efficiency case was argued in the wrong currency, and the right one is only suggestive.**
  Each run's stream records the account's own rate-limit utilisation. Over each arm's pair the
  five-hour window moved +0.11 for fabflows against +0.10 bare, a ratio of 1.10 that tracks Fable
  tokens (1.08) and neither total tokens (2.13) nor list dollars (1.53). So the subscription
  charges for the lead's model and barely notices an Opus worker, and the +53% list figure is not
  what this user pays. The readings are two decimals with one pair per arm, so this is direction
  only. It strengthens B2, which takes the Fable-token ratio to 0.98, below a plain session.
- **The loop completed once.** Run 2 escalated before any review, so every figure describing a
  full build-and-review cycle is n=1, and that one run reached review only because its builder
  ignored the report format the brief mandates.
- **The comparison cannot isolate the loop.** The bare arm ran with no plugin loaded at all, so
  the treatment bundles the prompt prefix, the skill loads, the guard hook and the loop. Decomposed
  by actor, delegation accounts for +11% and the review for the remaining +42 points of the +53%.
  The arm that would separate them, plugin loaded and loop unused, has never been run.
- **The graded axis is saturated.** All four runs passed 41 of 41 hidden tests, so the quality
  comparison has no power in either direction. Nothing here shows the loop produces better work,
  only that it did not produce worse.
- **The guard hook question is now closed the other way:** payloads confirm it fires inside
  Workflow-tool agents, so `build.js`'s default-branch check is a second line of defence rather
  than the only one. No decision needed, but the comment and the README should stop calling it
  unverified.

## Links

- Ticket: none
- Pull request: https://github.com/kuan51/claude-skills/pull/45
- Related: DEC-0004 (the loop's original tiers and its accepted eval gap), DEC-0015 (its
  reference-file element is what option C revisits; read them together), DEC-0012, DEC-0014;
  `plugins/fabflows/evals/RESULTS.md` iteration 5
