# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-22T19:19:02Z
**Evals**: 8 (3 runs each per configuration)

## Summary

| Metric | Delegate | Inline | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |
| Time | 221.9s ± 28.5s | 88.1s ± 6.8s | +133.8s |
| Tokens | 1249416 ± 122314 | 649844 ± 126397 | +599572 |

## Notes

- Primary outcome saturated: the planted caret-on-zero defect was fixed in all nine runs, in every arm, by the lead or builder before any review ran.
- Treatment administration: the loop arm launched fabflows:build in 1 of 3 runs; the other two leads sized the change as small and built inline, which the requireReview expectation caught.
- Delegate arm: two leads tried fabflows:build (Workflow absent), then hand-ran an Opus editor and an Opus refuter through Agent; one spawned the Sonnet-pinned editor with no review.
- Means: inline $1.32 / 88 s; delegate $2.06 / 222 s; loop (all three) $1.32 / 117 s, the one real loop run $1.70 / 170 s. No denials anywhere.
