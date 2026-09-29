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
| fabflows, a spec'd build | No measured gain. Every arm passed all 41 hidden tests. Its reviewer caught a whitespace defect the hidden tests do not check | +$0.63 per run (+24%): $3.23 against $2.61. superpowers +$0.35 (+13%) | 2 per arm | `RESULTS.md`, iteration 1 |
| fabflows, reading 13 files | No measured gain. Every run passed, and it took 179 s against 36 s | +$0.10 per run (+11.5%): $1.00 against $0.90. superpowers +$0.05 (+5.5%) | 3 per arm | `RESULTS.md`, iteration 1 |
| fabflows, short tasks (a scoped edit, a small test file, a version bump) | No measured gain. Every fabflows and no-skill run passed, and two superpowers runs failed one text-match check | +$0.18 to +$0.24 per run (+55% to +72%), of which about $0.15 is a fixed start-up charge. superpowers +17% to +53% | 3 per arm per task | `RESULTS.md`, iteration 1 |
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
