# Skill Benchmark: fabflows

**Model**: lead claude-fable-5-1, claude-haiku-4-5-20251001, claude-opus-5-5, claude-sonnet-5-5; workers per agent pins
**Date**: 2026-09-29T00:37:29Z
**Evals**: 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 (with_skill 20, without_skill 20, superpowers 20, agent 24 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |
| Time | 133.0s ± 228.9s | 56.0s ± 89.6s | +77.1s |
| Tokens | 314994 ± 314145 | 157534 ± 213284 | +157460 |

## Notes

- fabflows (with_skill) cost more than no skill on all seven tasks: +$0.10 (deep-read, +11.5%) to +$0.24 (write-tests, +71.8%) per run on tasks 1-6, and +$0.63 (+24.0%) on build-component. Pooled over the 60 task cells, a run averaged $0.874 with fabflows, $0.640 without (+36.6%) and $0.756 with superpowers (+18.0%), so fabflows ran 15.7% above superpowers.
- Most of the extra cost on short tasks is a fixed start-up charge of about $0.15 per run. It comes from the plugin listing (+2,305 first-request tokens), the two Skill loads (11,217 chars, about 4,256 tokens) and their two extra requests. On tasks that cost about $0.33 without the plugin, that alone adds 44-49%.
- Writing tokens to the 1-hour cache at $20 per 1M is what makes context expensive, not re-reading it ($0.25 per 1M, 1/80 of the write price). Re-reading the fabflows skill text on later turns costs only $0.002-$0.006 per run, while writing it once costs about $0.085.
- Delegation paid off only where the lead would otherwise read a lot. On deep-read, handing the 13 files to a Haiku explorer saved $0.565 of lead reading, for $0.393 of worker, brief and report plus $0.090 of verification. On triage-failures the Sonnet test-runner roughly broke even ($0.104 against $0.089 saved), and the lead then re-ran the suite itself ($0.031).
- On build-component the Opus workers cost $2.280 per run, and the Fable lead fell from $2.609 to $0.954. The Opus reviewer ($1.402 per run) cost more than the Opus builder ($0.878). Run-1's REWORK round alone cost $1.079, so with_skill ranged from $2.74 to $3.73 over just 2 runs.
- Superpowers against no skill: +$0.05 to +$0.17 per run on tasks 1-6 and +$0.35 on build-component. It starts through a SessionStart hook (3,405 chars, about 2,168 first-request tokens, about $0.045 per run, no extra request). fabflows starts through a prompt prefix that forces 2 Skill calls. The two arms therefore did not start on equal terms.
- Quality cannot separate the arms on tasks 1-7. Every substantive assertion passed in every run, except 2 superpowers scoped-edit runs. Those failed only 'guard.js contains /pipx/', because the existing pattern was widened to pip(3|x)? and it still denies 'pipx install black'. That is a text-match grader artifact, so the superpowers 0.917 on scoped-edit reads as 1.0 on behaviour.
- fabflows added wall time with no measured quality gain: deep-read took 178.9s against 35.5s (5.0x), triage 79.8s against 36.8s, and build-component 761.9s against 315.6s. The with_skill result.duration_ms for build-component leaves out the background workflow, so use timing.json or cells.json sec.
- The agent tasks (10-21, 24 runs, $0.757 in total) passed 105 of 124 substantive assertions. Four of the 19 failures are order-regex grader artifacts (for example '**Files involved:**' and '**Command**'), which gives 109 of 124 once corrected.
- Asked to stop when a brief part was missing, investigator, refuter and editor stopped in 6 of 6 runs. Explorer, researcher and test-runner did not stop in any of their 6 runs, although all six agent files carry the same stop rule. The planted instruction was never followed (4 of 4) but was quoted only 2 of 4 times.
- Report-task repeats on Sonnet and Opus differ by up to 2.2x in cost with the same behaviour. The difference is which repeat hit a cold cache: for editor, 6,936 against 1,970 cache-write tokens. Treat a 2-repeat agent mean as a cold/warm average.
- benchmark.md and this tab pool every task, so build-component dominates the time and token means, and the pass rate also counts non-substantive checks. The per-task, three-arm figures are in cells.json. The agent arm ran different tasks, so its dollar note against without_skill is not a comparison.
- The sessions ran in a cloud container with its session variables removed (31 tools at start-up, a 1-hour prompt cache). A smoke run without that trim loaded 45 tools and a bare run cost about 2.7 times as much, so the absolute dollars are specific to this setup.
- Cost: with_skill mean $0.87 per run, $+0.23 (+37%) against without_skill
- Cost: without_skill mean $0.64 per run
- Cost: superpowers mean $0.76 per run, $+0.12 (+18%) against without_skill
- Cost: agent mean $0.03 per run, $-0.61 (-95%) against without_skill
