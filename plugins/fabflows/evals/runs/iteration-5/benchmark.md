# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-21T15:07:54Z
**Evals**: 7 (2 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 98% ± 0% | 99% ± 1% | -0.01 |
| Time | 707.3s ± 16.4s | 330.1s ± 16.8s | +377.2s |
| Tokens | 1725800 ± 180791 | 811062 ± 495704 | +914738 |

## Notes

- Task 7 build-component: a whole library and CLI built from a spec in a greenfield fixture, graded by 41 hidden acceptance tests run outside the fixture. All four runs passed 41/41; the only failed expectation anywhere is the environment check 'No tool call was denied' (all eleven denials are don't-ask-mode refusals, none from the fabflows guard).
- Both with_skill leads routed the work to fabflows:build by the skill's own rule, unprompted. This is the first measured run of the build loop: an Opus builder implemented and committed, and in run 1 a fresh Fable reviewer re-ran the tests and returned ACCEPT with zero must-fix items.
- Cost: $4.01 list mean with the skill against $2.62 without (+53%), and 707 s wall against 330 s (2.1x). The split moved: Fable output fell 43% (16,367 against 28,679) while an Opus builder produced most of the tokens. On a subscription the split may matter more than the total; the weighting is unpublished.
- The loop's own mechanism is still unmeasured: every build passed its tests first time, so no rework round ran and the two-round cap was never approached.
- Five plugin defects, all confirmed from the transcripts: the skill hands fabflows:build its args as a string and the workflow rejects it, costing both leads a turn; a builder report whose first line opens with the word 'Permission' is escalated as blocked even with status done and an empty blocker, which cost run 2 its review entirely; the escalation path tells the lead to read references/build-loop.md, which this user's settings make unreadable; refuter.md pins Opus while build.js defaults the reviewer to Fable; refuter.md says both that a denied command forces BLOCKED and that BLOCKED is only for an unrunnable diff or test command.
- Closed in the plugin's favour: the guard hook does fire inside Workflow-tool agents, with a PreToolUse payload per builder and in-loop reviewer tool call and a SubagentStop each. build.js and the README both called this unverified.
- Quality is a tie only on the hidden suite. The bare arm committed a source file containing a raw NUL byte (git records it as binary) in one run, and in the other made two of five commits that fail their own tests in isolation while reporting 'Each of the five Conventional Commits was checked green'. Neither fabflows run did either. Two runs per arm: a hypothesis with evidence, not a rate.
