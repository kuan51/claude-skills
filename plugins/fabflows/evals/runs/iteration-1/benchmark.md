# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1, claude-haiku-4-5-20251001, claude-opus-5-5, claude-sonnet-5-5; workers per agent pins
**Date**: 2026-09-29T01:33:00Z
**Evals**: 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 (with_skill 20, without_skill 20, superpowers 20, agent 24 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |
| Time | 133.0s ± 228.9s | 56.0s ± 89.6s | +77.1s |
| Tokens | 314994 ± 314145 | 157534 ± 213284 | +157460 |

## Notes

- Pooled over the 60 task runs, a run cost $0.874 with fabflows (with_skill), $0.640 without a skill (+36.6%) and $0.756 with superpowers (+18.0%). Per-task figures are in plugins/fabflows/evals/RESULTS.md, iteration 1.
- Where the extra cost comes from, the grader findings, the agent-task gaps and the confounds are in RESULTS.md, iteration 1. This tab pools every task and counts non-substantive checks, so read per-task figures from cells.json.
- The agent arm ran different tasks (10-21), so its dollar note against without_skill below is not a comparison.
- Cost: with_skill mean $0.87 per run, $+0.23 (+37%) against without_skill
- Cost: without_skill mean $0.64 per run
- Cost: superpowers mean $0.76 per run, $+0.12 (+18%) against without_skill
- Cost: agent mean $0.03 per run, $-0.61 (-95%) against without_skill
