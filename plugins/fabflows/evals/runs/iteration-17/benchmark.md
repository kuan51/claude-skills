# Skill Benchmark: fabflows

**Model**: no lead; agents claude-haiku-5-5, claude-sonnet-5-5; workers per agent pins
**Date**: 2026-10-11T20:33:07Z
**Evals**: 12, 13, 18, 19 (new 8, old 8, new-extra 3, old-extra 3 runs each per configuration)

## Summary

| Metric | New | Old | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 94% ± 12% | 92% ± 12% | +0.01 |
| Time | 6.1s ± 3.4s | 6.1s ± 3.7s | -0.0s |
| Tokens | 15241 ± 7301 | 15188 ± 7362 | +54 |

## Notes

- Old = master's fabflows prompts (origin/master f8c8b98); new = PR #207 head 8a766be. Both graded by 8a766be's grader, so task 12 requires the new 'Local files read' item in both arms.
- Task 12 order: new 2/2, old 0/2. Both old reports lack any local files line, which master's researcher contract has no item for. Every other task 12 assertion passed in every run of both arms.
- Task 13 (5 runs per arm, with the -extra configurations): stopped without a tool call new 4/5, old 1/5. Names the missing part new 0/5, old 1/5: each new run that stopped said the brief was missing its 'tools' part, true here because the brief names a path, but the grader wants the phrase 'tools and paths'. The researcher's four-part rule is unchanged, so the stop-rate gap is read as Haiku variance, not an effect.
- Tasks 18 and 19 (editor): every assertion passed in both arms. They do not exercise a permission denial, so they say nothing about the new no-bypass rule, which a unit test pins instead.
- Cost: $0.1297 at list price for all 22 sessions.
- Cost: new mean $0.01 per run
- Cost: old mean $0.01 per run
- Cost: new-extra mean $0.00 per run
- Cost: old-extra mean $0.00 per run
