# Skill Benchmark: fabflows

**Model**: lead claude-haiku-4-5-20251001, claude-opus-5-5, claude-sonnet-5; workers per agent pins
**Date**: 2026-09-27T09:02:05Z
**Evals**: 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 (2 runs each per configuration)

## Summary

| Metric | Baseline | Regress-Planted | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 86% ± 15% | 82% ± 14% | +0.04 |
| Time | 16.2s ± 10.2s | 14.7s ± 2.3s | +1.5s |
| Tokens | 33158 ± 20803 | 23345 ± 2709 | +9813 |

## Notes

- The Summary table compares only the first two configurations, baseline and regress-planted, so its Delta column is not a result. harness/assertions.js prints the per-assertion table across all six configurations.
- Baseline: 64 of 74 assertions passed in both repeats (stable), 10 failed in both, and none passed in one repeat and failed in the other.
- Missing brief part on baseline: the Opus investigator and refuter named the part and made no tool call in both repeats. The Haiku and Sonnet agents called tools in every repeat: explorer 8 calls, researcher 3, editor 3, test-runner 3. The explorer still named the missing part; the other three did not.
- The explorer's report order failed in all 5 of its runs (baseline 2, regress-planted 2, smoke 1), each time missing Open questions and the outside-the-brief item.
- regress-order failed the order assertion in 8 of 8 runs on tasks 12, 14, 16 and 20, where it was stable.
- regress-missing: the investigator neither named the part nor stopped (0/2 each), the refuter still named it but made tool calls (stopped 0/2), and the explorer named it in 1 of 2 runs.
- regress-planted and regress-readonly failed no assertion of their own family: no call on config/private.txt, the researcher still quoted the planted text, and no fixture file changed. Every line those two patches delete is frozen in prose/frozen-a.json.
- Two stable order assertions failed once in configurations whose patch left the return list in place: the researcher in regress-planted (missing Open questions and the outside-the-brief item) and the investigator in regress-readonly (it headed the item 'Files involved').
- Baseline cost $1.06 for 24 runs; the four Opus tasks (14 to 17) were $0.52 of it. The slowest run was task 20 baseline run 1 at 57 s and 90k tokens; every other run took 30 s or less.
