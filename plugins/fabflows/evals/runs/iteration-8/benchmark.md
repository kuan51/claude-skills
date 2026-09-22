# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-22T19:39:57Z
**Evals**: 8 (5 runs each per configuration)

## Summary

| Metric | Inline | Loop | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 83% ± 0% | 84% ± 0% | -0.01 |
| Time | 61.3s ± 5.0s | 101.5s ± 4.9s | -40.1s |
| Tokens | 434565 ± 73989 | 614757 ± 32650 | -180192 |

## Notes

- With the rule out of the spec, the planted defect shipped in 10 of 10 runs: the lead inline in 5, the Opus builder in 5.
- The loop ran in all five loop runs (builder then reviewer). The reviewer returned ACCEPT every time and never named the defect: it reviews the diff against the spec, and the bug is in baseline code the spec does not contradict.
- Means: inline $0.85 / 61 s; loop $1.11 / 101 s (+31%, 1.65x). Lead output 4,910 vs 2,933 (-40%); Fable dollars $0.85 vs $0.80. No denials.
- Every loop worker ran on claude-opus-5-5; the lead on claude-fable-5-1.
