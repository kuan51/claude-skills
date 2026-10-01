# Skill Benchmark: fabflows

**Model**: lead <synthetic>, claude-fable-5-1; workers per agent pins
**Date**: 2026-10-01T12:41:40Z
**Evals**: 8 (lead-gate 5, lead-gate-rerun 2 runs each per configuration)

## Summary

| Metric | Lead-Gate | Lead-Gate-Rerun | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 86% ± 20% | 100% ± 0% | -0.14 |
| Time | 402.2s ± 245.4s | 687.0s ± 24.4s | -284.7s |
| Tokens | 1019430 ± 624054 | 1935395 ± 242132 | -915965 |

## Notes

- lead-gate run-4 and run-5 hit the account's session usage limit (HTTP 429, 'You've hit your session limit'): run-4's third review never ran and the lead never got a result; run-5 ended at its first turn at $0. Neither measures the plugin. lead-gate-rerun run-1 and run-2 replace them, so the iteration's five valid runs are lead-gate 1-3 and lead-gate-rerun 1-2.
- The bar is #146's: hidden suite 9/9, the loop ends with ACCEPT, every workflow finished, no tool call denied. Of the five valid runs, 3 pass. lead-gate run-1 fails only on the ACCEPT part (rework cap with the caret fix in place, 9/9); lead-gate run-3's review never named the caret defect (7/9).
- Cost: lead-gate mean $2.05 per run
- Cost: lead-gate-rerun mean $3.30 per run
