# Skill Benchmark: brainstorming

**Model**: claude-fable-5-1 lead session; subagents inherit
**Date**: 2026-09-22T01:25:15Z
**Evals**: 1, 2, 3 (3 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 94% ± 10% | 50% ± 29% | +0.44 |
| Time | 45.8s ± 10.7s | 33.1s ± 6.2s | +12.7s |
| Tokens | 62244 ± 4939 | 56007 ± 3506 | +6238 |

## Per-eval grades (6 assertions each)

| Eval | With skill | Without skill |
|---|---|---|
| 1 vague export, existing repo | 6/6 | 2/6 |
| 2 greenfield CLI | 6/6 | 2/6 |
| 3 bounded README note | 5/6 | 5/6 |

## Analyst notes

- A subagent run exercises only the first reply, so nothing here tests the later rounds, the
  cut, the lens pass, or the written spec.
- Eval 3's one with-skill failure is the assertion, not the skill: the bounded tier still opens
  with assumptions and a premise round, so the spec block cannot appear in the first reply. The
  baseline printed a full spec block immediately with zero questions, which is arguably the
  better user experience for a one-bullet change. Candidate change for iteration 2: let the
  bounded tier skip straight to the spec block when every assumption is confirmed and the
  premise is not in doubt.
- The "no third-party name" assertion never discriminates (both configs pass everywhere).
- Cost of the skill on the first reply: about +6k tokens and +13 s per run, mostly from
  reading the repo before asking.
- Eval 3 with-skill ran guard.js in a scratch repo to prove its premise; that is more than the
  skill asks for and worth watching, since brainstorming is meant to read, not run.
