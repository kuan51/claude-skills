# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-22T18:41:15Z
**Evals**: 7 (2 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |
| Time | 413.6s ± 8.1s | 479.8s ± 169.4s | -66.2s |
| Tokens | 1011876 ± 137663 | 1908556 ± 1006817 | -896680 |

## Notes

- Opus-tier workers resolved to claude-opus-5-5 through the `opus` alias; 76 workflow-agent messages, no other id.
- Both with_skill runs completed build:1 and review:1 ACCEPT inside the loop; no denials in any run.
- Means: list $2.92 vs $3.55 (-18%), wall 414 s vs 480 s (-14%), Fable output 6,660 vs 38,314 (-83%); hidden tests 41/41 in all four runs (ceiling).
- Linux run; iterations 1-5 ran on Windows under don't-ask denials, so wall clock and denial counts are not comparable across that line.
