# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-20T00:24:33Z
**Evals**: 2, 3, 4, 5, 6 (2 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 96% ± 7% | 99% ± 4% | -0.03 |
| Time | 63.2s ± 29.9s | 59.6s ± 39.4s | +3.5s |
| Tokens | 331827 ± 70549 | 194206 ± 53386 | +137622 |

## Notes

- Quality tied at 100% of task assertions in all 20 runs. The only failed expectation anywhere is the environment check 'No tool call was denied': 5 denials (4 with_skill, 1 without), all variable expansions such as ${PIPESTATUS[0]} or a redirect to a file, plus one fallback worker's cd. Down from 28 in iteration 1 after the fixture note loaded.
- deep-read is the first cell where fabflows costs less: $0.94 vs $1.07 list per run, with the lead's final context 54.8k vs 66.5k tokens. Both with_skill runs delegated to fabflows:explorer by routing ('a wide multi-file read') and ran the gate (a grep and two spot-read files). Wall time doubled: 111 s vs 50 s.
- triage-failures did not delegate in either with_skill run. The lead's stated reason: the gate would make it re-run the test command anyway, so it ran it inline. For a single test run the test-runner row is self-defeating by the skill's own rules.
- Three of the four with_skill denials are the lead's own shell idioms around exit status and log capture: echo exit=${PIPESTATUS[0]} twice and a $TMPDIR redirect with echo exit=$? once, all refused by don't-ask mode as variable expansions; the report contract's exit-status wording invites the idiom. The fourth is a fallback worker's cd.
- Across all five tasks the with_skill arm averaged $0.76 vs $0.63 (+21%), 10.5 vs 8.4 turns, and 224 vs 36 thinking tokens per run. Iteration 1's +64% included the denial cascades and no volume task.
- Two repeats per cell: direction, not significance.
