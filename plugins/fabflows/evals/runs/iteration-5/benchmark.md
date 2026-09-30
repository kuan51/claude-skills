# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-30T21:36:37Z
**Evals**: 8 (master 3, review-callees 4, review-callees-r5 1 runs each per configuration)

## Summary

| Metric | Master | Review-Callees | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 84% ± 0% | 88% ± 8% | -0.04 |
| Time | 192.9s ± 84.5s | 622.4s ± 125.6s | -429.5s |
| Tokens | 543669 ± 202877 | 1557158 ± 373918 | -1013489 |

## Notes

- Iteration 5 measures the review-callees variant (#145) on task 8, review-catch, loop arm only: master is the same-day control (3 runs), review-callees the variant (4 runs), and review-callees-r5 the variant's fifth run, launched on its own after a container restart killed the original fifth run, because run.js refuses to add a run to an existing configuration. All three configurations ran the same task, so the cost columns compare; the per-run review findings, the hand-read named-defect counts and the verdict are in plugins/fabflows/evals/RESULTS.md, iteration 5.
- The pass-rate figures on this tab count the two informational review rows and the hidden suite together. Read the named and left-in counts from RESULTS.md, not from here.
- Cost: master mean $1.28 per run
- Cost: review-callees mean $2.96 per run
- Cost: review-callees-r5 mean $3.13 per run
