---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Eval results

Each row answers one question: does the plugin or skill do better than Claude with no plugin,
and what does it cost? Where a row has numbers, every one is copied from the source line cited
beside it. Those files keep the setup, every run and the caveats, and they win if this page
disagrees with them.

| Plugin or skill | Useful compared with no skill? | Cost compared with no skill | Runs | Source |
| --- | --- | --- | --- | --- |
| fabflows, a spec'd build | No measured gain: quality 1 / 1 / 1. Task 8, which tests whether the reviewer finds a planted defect, was not run | $3.2343 against $2.6093, +$0.6250 (+24.0%). superpowers +$0.3505 (+13.4%) | 2 per arm | `RESULTS.md:69`, `:29` |
| fabflows, reading 13 files | No measured gain: quality 1 / 1 / 1, and 178.9 s against 35.5 s | $1.0014 against $0.8977, +$0.1037 (+11.5%). superpowers +$0.0490 (+5.5%) | 3 per arm | `RESULTS.md:67` |
| fabflows, a wide search | No measured gain: quality 1 / 1 / 1 | $0.5316 against $0.3129, +$0.2186 (+69.9%). superpowers +$0.0807 (+25.8%) | 3 per arm | `RESULTS.md:63` |
| fabflows, running and triaging a failing test suite | No measured gain: quality 1 / 1 / 1 | $0.5481 against $0.3357, +$0.2124 (+63.3%). superpowers +$0.0613 (+18.3%) | 3 per arm | `RESULTS.md:68` |
| fabflows, short tasks (a scoped edit, a small test file, a version bump) | No measured gain: quality 1 in every arm on each, after the regrade. Before it, superpowers scored 0.917 on the scoped edit, a grader artifact | +$0.1887 (+54.8%), +$0.2360 (+71.8%) and +$0.1846 (+59.5%). superpowers +$0.1169 (+34.0%), +$0.1741 (+52.9%) and +$0.0540 (+17.4%) | 3 per arm per task | `RESULTS.md:64-66`, `:163`, `:292` |
| fabflows `brainstorming` | Not yet re-measured (results reset in [#122](https://github.com/kuan51/claude-skills/issues/122)) | Not yet re-measured (results reset in [#122](https://github.com/kuan51/claude-skills/issues/122)) | none yet | `plugins/fabflows/skills/brainstorming/evals/evals.json` (no results yet) |
| docs-warden | Not measured | Not measured | none | see below |
| ciso | Not measured | Not measured | none | see below |
| data-analysis-review | Not measured | Not measured | none | see below |

`RESULTS.md` is [plugins/fabflows/evals/RESULTS.md](../plugins/fabflows/evals/RESULTS.md).

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
