# Skill Benchmark: fabflows

**Model**: lead claude-haiku-4-5-20251001, claude-opus-5-5, claude-sonnet-5-5; workers per agent pins
**Date**: 2026-09-29T21:07:18Z
**Evals**: 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 (agent-rules 36, master 9 runs each per configuration)

## Summary

| Metric | Agent-Rules | Master | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 95% ± 11% | 67% ± 0% | +0.28 |
| Time | 10.1s ± 8.1s | 10.9s ± 1.6s | -0.8s |
| Tokens | 17381 ± 11734 | 18050 ± 2430 | -669 |

## Notes

- Iteration 3 tests the agent-rules variant (#120): agent-rules ran agent tasks 10-21 three times each; master ran tasks 11, 13 and 21 three times each as a same-day control. Per-task figures and the verdict are in plugins/fabflows/evals/RESULTS.md, iteration 3.
- The configurations ran different task sets, so the pooled figures and the delta on this tab are not comparisons. Read per-task figures from cells.json.
- Cost: agent-rules mean $0.03 per run
- Cost: master mean $0.02 per run
