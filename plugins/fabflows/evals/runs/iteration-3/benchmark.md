# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-20T00:29:35Z
**Evals**: 1, 5, 6 (2 runs each per configuration)

## Summary

| Metric | With Skill | Config B | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 98% ± 5% | 0% ± 0% | +0.98 |
| Time | 65.3s ± 39.6s | 0.0s ± 0.0s | +65.3s |
| Tokens | 259748 ± 43874 | 0 ± 0 | +259748 |

## Notes

- H1, trimmed skill (8,362 chars against 13,544, build-loop failure prose moved to references/build-loop.md, gate scoped to worker reports), with_skill arm only, tasks 1, 5 and 6, two runs each. Quality 100% of task assertions in all six runs; the one failed expectation is the environment check (one denied Bash).
- wide-search: $0.65 list per run against $1.20 with the full skill and $0.46 with no skill. The confirmation greps the full skill induced are gone (cache writes 24.5k against 51.2k; thinking 215 against 464). The trim removes roughly three quarters of the skill's overhead on this short task.
- deep-read: one of two runs delegated (full skill: two of two). The non-delegating run read all 13 files itself, reasoning 'this needs judgment about what each decided', which reads the trimmed when-not-to-delegate clause about judgment as covering a summarising task. Mean $1.10 against $0.94 full skill and $1.07 no skill: the trim gave back the volume-task win.
- triage-failures: $0.65 against $0.67 full and $0.51 none; no delegation in any variant, for the gate reason recorded in iteration 2.
- Direction only: two runs per cell, and the deep-read split is one run each way.
