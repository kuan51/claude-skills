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
| fabflows `brainstorming` | Better: 94% of spec-quality checks passed, against 50% | About 6k more tokens (62,244 against 56,007) and 13 s more per first reply | 3 evals, 1 run of each per arm | `brainstorming/iteration-1.md:11`-`13`, `:34` |
| docs-warden | Not measured | Not measured | none | see below |
| ciso | Not measured | Not measured | none | see below |
| data-analysis-review | Not measured | Not measured | none | see below |

`RESULTS.md` is [plugins/fabflows/evals/RESULTS.md](../plugins/fabflows/evals/RESULTS.md), where
every number is a mean of the runs in a cell (`:68`). `brainstorming/` is
[plugins/fabflows/evals/brainstorming/](../plugins/fabflows/evals/brainstorming/).

## What this means

These are readings of the table, not measurements.

- fabflows pays for itself on work big enough to hand off, such as a spec'd build or a read
  across many files. On a small edit it costs 33% to 42% more for the same result, so do small
  things without it.
- fabflows never changed a graded result against no skill. What it changes is cost and the size
  of the lead's context, not the quality of the output.
- `brainstorming` is the one skill measured to improve output against no skill, and only on its
  first reply (`brainstorming/iteration-1.md:25`).
- The same build cost 53% more in iteration 5, under Opus 5 workers with shell denials that
  knocked the review out of the loop (`RESULTS.md:687`). Iteration 6 is the result once those
  were fixed and the workers moved to Opus 5.5.
- Two to five runs per arm give a direction, not statistical significance
  (`plugins/fabflows/README.md:277`).

## Not yet measured against no skill

- **docs-warden.** Its one recorded run measured triggering only: the skill was invoked on 10
  of 18 prompts meant for it, or 10 of 15 without one broken case, and stayed quiet on 15 of 15
  near-misses (`plugins/docs-warden/evals/README.md:164`, `:165`, `:210`, `:211`). Both of its
  documented commands run with `--ablation none` (`:73`, `:83`), although the runner can compare
  against no skill with `--ablation with-without` (DEC-0022). Tier 2 has never run (`:156`).
- **ciso.** A trigger list run by hand, `plugins/ciso/evals/trigger-corpus.json`, with its
  procedure in `plugins/ciso/evals/RUNBOOK.md`. No result recorded.
- **data-analysis-review.** A trigger list run by hand,
  `plugins/data-analysis-review/skills/data-analysis-review/references/evals.md`. No result
  recorded.
- **fabflows' `ticket`, `trace` and `fabflows-setup` skills.** No evals of their own.
