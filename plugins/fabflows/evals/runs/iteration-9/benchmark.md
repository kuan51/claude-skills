# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-10-03T06:36:54Z
**Evals**: 8 (control 5, rework-high 5 runs each per configuration)

## Summary

| Metric | Control | Rework-High | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 97% ± 7% | 100% ± 0% | -0.03 |
| Time | 492.7s ± 40.1s | 403.8s ± 58.6s | +88.9s |
| Tokens | 1413534 ± 86384 | 1249300 ± 81784 | +164234 |

## Notes

- Tracked in #177: rework-only review rounds at high effort instead of xhigh. control is master's fabflows 0.15.2 (a5d726c); rework-high is 0.15.3 (6b25f90). Same day, one session at a time.
- Every run of both configurations took two rounds, REWORK then ACCEPT; each agent transcript confirms review:2 ran at high in rework-high and xhigh in control.
- Round-2 reviewer tokens: control mean 28,333, rework-high mean 20,719 (26.9% lower). Round-2 reviewer time: control mean 86.2 s, rework-high 37.4 s.
- Every rework-high round-2 report marks each round-1 item fixed, and raises no must-fix. Control run-2 shipped 7/9 on the hidden suite; it does not affect the variant bar.
- Cost: control mean $2.52 per run
- Cost: rework-high mean $2.21 per run
