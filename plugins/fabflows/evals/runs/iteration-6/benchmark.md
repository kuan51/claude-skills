# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-10-01T01:20:52Z
**Evals**: 8 (rework-permission 5 runs each per configuration)

## Summary

| Metric | Rework-Permission | Config B | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 87% ± 7% | 0% ± 0% | +0.87 |
| Time | 568.2s ± 76.0s | 0.0s ± 0.0s | +568.2s |
| Tokens | 1522157 ± 191552 | 0 ± 0 | +1522157 |

## Notes

- Iteration 6 measures the rework-permission variant (#146) on task 8, review-catch, loop arm only: one configuration, rework-permission, five runs. Its comparison is iteration 5 (the review-callees runs, where the review named the planted defect in 5 of 5 and the rework left it in place in 4 of 5, and the master runs). The per-run review rounds, the hand-read named-defect and fix-landed counts, and the verdict are in plugins/fabflows/evals/RESULTS.md, iteration 6.
- The pass-rate figure on this tab counts the two informational review rows and the hidden suite together. Read the hidden-suite row and the final verdict per run from RESULTS.md, not from here.
- Cost: rework-permission mean $2.81 per run
