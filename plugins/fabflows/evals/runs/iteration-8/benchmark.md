# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-10-01T14:50:20Z
**Evals**: 8 (case-sweep 5 runs each per configuration)

## Summary

| Metric | Case-Sweep | Config B | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 0% ± 0% | +1.00 |
| Time | 434.0s ± 58.3s | 0.0s ± 0.0s | +434.0s |
| Tokens | 1238365 ± 170810 | 0 ± 0 | +1238365 |

## Notes

- Five runs under case-sweep, no replacement needed: no run hit the account's usage limit. All five pass #146's bar: hidden suite 9/9, the loop ends with ACCEPT after one rework round, every workflow finished, no tool call denied.
- By hand: every round-1 review listed caret()'s cases and quoted a ^0.M.P probe with its output (5 of 5); every reported deviation cited the item number shown in its must-fix block and came back matched: true (8 of 8 entries). No lead reverted the caret fix (0 of 5 transcripts contain 'git revert'). Four of ten reviews report creating an empty file under /tmp by a shell redirect, outside the repository, and say so on their first line.
- Cost: case-sweep mean $2.34 per run
