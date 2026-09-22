# Skill Benchmark: brainstorming

**Model**: claude-fable-5-1 lead session; subagents inherit
**Date**: 2026-09-22T01:45:14Z
**Evals**: 3 (3 runs each per configuration)

## Summary

| Metric | Old Skill | With Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 83% ± 0% | 83% ± 0% | +0.00 |
| Time | 60.5s ± 0.0s | 59.9s ± 0.0s | +0.6s |
| Tokens | 67184 ± 0 | 64856 ± 0 | +2328 |
## What changed

The bounded tier now prints the spec block at once when the reading confirms every
assumption; would-be questions become vetoable Decisions lines. Only the bounded prompt
(eval 3) was rerun, new skill against a snapshot of the old one.

## Grades (6 assertions)

| Config | Score | What it did |
|---|---|---|
| New skill | 5/6 | Tier named, zero questions, full spec block in chat, four Decisions each marked vetoable, two Deferred items. Missed only the "Decided/Open/Deferred state block" assertion, which was written for the round-based flow and has nothing to check when nothing is Open. |
| Old skill | 5/6 | Tier named, assumptions list, three questions with recommended answers, state block. Spec deferred to the next turn, so it missed the spec-block assertion. |

## Analyst notes

- Same score, different failure: the new skill fails an assertion that no longer applies to
  the bounded shortcut; the old skill fails the one the user cares about. Iteration 3 should
  make the state-block assertion conditional on the tier (full only) so the bounded case is
  scored on the spec.
- The new skill reached "approve to build?" in one reply at about 2k fewer tokens than the old
  one. The decisions it took by default (name the whole task-runner class, patch bump) are the
  same ones the old skill asked about, now stated as vetoable defaults.
- Both runs executed guard.js against a fixture to prove the premise. That is the second
  iteration where the bounded case runs code; the skill says workers read and the lead asks.
  Candidate wording for iteration 3: "prove a premise by reading; a spike is a round-three
  proposal, not a first-reply habit".
