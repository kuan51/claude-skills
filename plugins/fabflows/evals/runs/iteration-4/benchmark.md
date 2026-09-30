# Skill Benchmark: fabflows

**Model**: lead claude-haiku-4-5-20251001, claude-opus-5-5; workers per agent pins
**Date**: 2026-09-30T14:41:44Z
**Evals**: 10, 11, 12, 13, 16 (haiku-preflight 25 runs each per configuration)

## Summary

| Metric | Haiku-Preflight | Config B | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 95% ± 11% | 0% ± 0% | +0.95 |
| Time | 15.0s ± 5.0s | 0.0s ± 0.0s | +15.0s |
| Tokens | 18024 ± 10939 | 0 ± 0 | +18024 |

## Notes

- Iteration 4 tests the haiku-preflight variant (#140): haiku-preflight ran agent tasks 10, 11, 12, 13 and 16 five times each. There is no control in this iteration; iteration 3's master control and iteration 1's regraded agent runs are the baselines. Per-task figures, the stable assertion set and the verdict per agent are in plugins/fabflows/evals/RESULTS.md, iteration 4.
- The pooled figures on this tab mix Haiku report and stop tasks with the refuter's Opus report task. Read per-task figures from cells.json.
- Cost: haiku-preflight mean $0.03 per run
