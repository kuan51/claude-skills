# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1; workers per agent pins
**Date**: 2026-09-20T00:50:32Z
**Evals**: 1, 5, 6 (2 runs each per configuration)

## Summary

| Metric | With Skill | Config B | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 98% ± 5% | 0% ± 0% | +0.98 |
| Time | 86.4s ± 43.4s | 0.0s ± 0.0s | +86.4s |
| Tokens | 349874 ± 78288 | 0 ± 0 | +349874 |

## Notes

- Narrowed trim (the iteration-3 skill plus a one-line volume rule, 'delegate the reading and keep the judging', and a judgment clause limited to root-cause, architecture and coupled-refactor calls), with_skill only, tasks 1, 5 and 6, two runs each. Quality 100% of task assertions in all six runs; the one failed expectation is the environment check (two denied Bash calls in one triage run).
- wide-search: $0.68 against $0.65 trimmed, $1.20 full skill and $0.46 no skill. The short-task saving of the trim is kept.
- deep-read: both runs delegated to fabflows:explorer by routing, one quoting the new rule ('Thirteen records, more than a handful, so per the routing table I'm handing the reading to a cheap explorer and keeping the judgement'). $0.96 against $0.94 full skill, $1.10 trimmed and $1.07 no skill; lead final context 53,973 against 66,487 with no skill. The volume-task delegation the first trim weakened is back.
- triage-failures: $0.73 against $0.67 full, $0.65 trimmed and $0.51 no skill, inflated by one run that hit two shell denials and recovered over 14 turns; no delegation in any variant, for the gate reason recorded in iteration 2.
- Two runs per cell: direction, not significance. Across the three tasks the narrowed trim is the only variant that keeps both the short-task saving and the volume-task delegation.
