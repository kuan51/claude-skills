# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-29T16:18:42Z
**Evals**: 1, 2, 3, 4, 5, 6 (lean-start 18, master 6, master-rerun 3 runs each per configuration)

## Summary

| Metric | Lean-Start | Master | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |
| Time | 65.4s ± 64.7s | 49.1s ± 56.2s | +16.3s |
| Tokens | 217631 ± 58650 | 192205 ± 41656 | +25426 |

## Notes

- Iteration 2 tests the lean-start variant (#133): lean-start ran tasks 1-6 three times each; master ran tasks 1 and 4 as a drift check against iteration 1, and master-rerun ran task 1 again. Per-task figures and the verdict are in plugins/fabflows/evals/RESULTS.md, iteration 2.
- The configurations ran different task sets, so the pooled figures and the delta on this tab are not comparisons. Read per-task figures from cells.json.
- Cost: lean-start mean $0.59 per run
- Cost: master mean $0.54 per run
- Cost: master-rerun mean $0.52 per run
