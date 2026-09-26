---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Eval results

Each row answers one question: does the plugin or skill do better than Claude with no plugin,
and what does it cost? Every number is copied from the source line cited beside it. Those files
keep the setup, every run and the caveats, and they win if this page disagrees with them.

| Plugin or skill | Useful compared with no skill? | Cost compared with no skill | Runs | Source |
| --- | --- | --- | --- | --- |
| fabflows, a spec'd build | Same result: 41/41 hidden tests in both arms | 18% cheaper ($2.92 against $3.55), 14% faster, 83% fewer lead output tokens | 2 per arm, iteration 6 | `RESULTS.md:592`-`595`, `:598`-`599` |
| fabflows, reading 13 files | Same result | About 12% cheaper ($0.94 against $1.07), a lead context 12k tokens smaller, twice the wall time | 2 per arm, iteration 2 | `RESULTS.md:1164`-`1167`, `:1196`-`1197` |
| fabflows, short tasks (a scoped edit, a small test file, a version bump) | Same result | 33% to 42% more | 2 per arm, iteration 2 | `RESULTS.md:1169`-`1170` |
| fabflows `brainstorming` | Better: 94% of first-reply checks passed, against 50% | About 6k more tokens (62,244 against 56,007) and 13 s more per first reply | 3 evals, 1 run of each per arm | `brainstorming/iteration-1.md:11`-`13`, `:19`-`21`, `:34` |
| docs-warden | Not measured | Not measured | none | see below |
| ciso | Not measured | Not measured | none | see below |
| data-analysis-review | Not measured | Not measured | none | see below |

`RESULTS.md` is [plugins/fabflows/evals/RESULTS.md](../plugins/fabflows/evals/RESULTS.md).
`brainstorming/` is [plugins/fabflows/evals/brainstorming/](../plugins/fabflows/evals/brainstorming/).
The brainstorming file's header says 3 runs per configuration, but its aggregator writes 3
whatever the data says (`plugins/fabflows/evals/harness/annotate_benchmark.py:5`), and the
grades show one run of each eval.

## What this means

These are readings of the table, not measurements.

- fabflows pays for itself on work big enough to hand off, such as a spec'd build or a read
  across many files. On a small edit it costs 33% to 42% more for the same result, so do small
  things without it.
- In every fabflows comparison with no plugin (iterations 1, 2, 5 and 6), both arms hit the
  ceiling of the graded tests. Those runs show a cost difference and say nothing about quality
  either way (`RESULTS.md:673`).
- `brainstorming` is the one skill measured to improve output against no skill, and only on its
  first reply (`brainstorming/iteration-1.md:25`).
- An earlier run of the same build, iteration 5, cost 53% more (`RESULTS.md:687`). The
  iteration 6 section of `RESULTS.md` explains what changed between the two (`:605`).
- The fabflows rows rest on two runs per arm and the brainstorming row on one run of each
  eval, so these figures give a direction, not statistical significance. The fabflows README
  says the same of its runs (`plugins/fabflows/README.md:277`).

## Not yet measured against no skill

- **docs-warden.** Its recorded runs measured triggering only: whether the skill starts on the
  prompts meant for it and stays quiet on near-misses. Its Tier 2 matrix does compare with and without the plugin
  (`plugins/docs-warden/evals/README.md:87`), but has never run (`:156`). Full results:
  [plugins/docs-warden/evals/README.md](../plugins/docs-warden/evals/README.md).
- **ciso.** A trigger list run by hand,
  [plugins/ciso/evals/trigger-corpus.json](../plugins/ciso/evals/trigger-corpus.json), with its
  procedure in [plugins/ciso/evals/RUNBOOK.md](../plugins/ciso/evals/RUNBOOK.md). No result
  recorded.
- **data-analysis-review.** A trigger list run by hand,
  [references/evals.md](../plugins/data-analysis-review/skills/data-analysis-review/references/evals.md).
  No result recorded.
- **fabflows' `ticket`, `trace` and `fabflows-setup` skills.** Only in fabflows' own trigger
  list run by hand,
  [plugins/fabflows/evals/trigger-corpus.json](../plugins/fabflows/evals/trigger-corpus.json).
  No result recorded.
