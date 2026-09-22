# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-19T23:29:43Z
**Evals**: 1, 2, 3, 4 (2 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 90% ± 6% | 90% ± 6% | +0.00 |
| Time | 70.5s ± 20.5s | 44.0s ± 16.7s | +26.4s |
| Tokens | 412060 ± 102075 | 261361 ± 78142 | +150699 |

## Notes

- Every substantive assertion passed in all 16 runs. The only failed expectation anywhere is the environment check 'No tool call was denied': 28 denials across both arms (25 by the lead, 3 by fallback workers), all Bash commands prefixed with cd into the fixture or PowerShell calls, refused by don't-ask mode.
- No routing-driven delegation occurred in any of the 8 with_skill runs. The lead read the skill and chose inline work each time, citing the when-not-to-delegate rules. The 3 test-runner spawns were fallbacks after the lead's own shell calls were denied, and the worker's Bash was denied the same way.
- wide-search is the cleanest cell (zero denials in both arms): with_skill averaged 10 turns and $1.20 list per run against 4 turns and $0.46 without, on identical 9/9 quality.
- Tokens are the run total across input, output, cache reads and cache writes from the result's modelUsage. Cache writes at the 1-hour rate are about 74% of list cost in both arms, so every extra turn costs mainly through what it appends to the cache.
- Two repeats per cell show direction, not significance.
