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
| fabflows | Not measured: the old benchmark was retired as biased toward fabflows, and one held-out comparison replaces it ([#248](https://github.com/kuan51/claude-skills/issues/248)) | Not measured | none yet | retired results: `git show 2b1ac1d:plugins/fabflows/evals/RESULTS.md` |
| fabflows `brainstorming` | Not yet re-measured (results reset in [#122](https://github.com/kuan51/claude-skills/issues/122)) | Not yet re-measured (results reset in [#122](https://github.com/kuan51/claude-skills/issues/122)) | none yet | `plugins/fabflows/skills/brainstorming/evals/evals.json` (no results yet) |
| docs-warden | Not measured | Not measured | none | see below |
| ciso | Not measured | Not measured | none | see below |
| data-analysis | Not measured | Not measured | none | see below |

## Not yet measured against no skill

- **docs-warden.** Its recorded runs measured triggering only: whether the skill starts on the
  prompts meant for it and stays quiet on near-misses. Its Tier 2 matrix does compare with and without the plugin
  (`plugins/docs-warden/evals/README.md:87`), but has never run (`:156`). Full results:
  [plugins/docs-warden/evals/README.md](../plugins/docs-warden/evals/README.md).
- **ciso.** A trigger list run by hand,
  [plugins/ciso/evals/trigger-corpus.json](../plugins/ciso/evals/trigger-corpus.json), with its
  procedure in [plugins/ciso/evals/RUNBOOK.md](../plugins/ciso/evals/RUNBOOK.md). No result
  recorded.
- **data-analysis.** A trigger list run by hand for each skill:
  [review](../plugins/data-analysis/skills/review/references/evals.md) and
  [discover](../plugins/data-analysis/skills/discover/references/evals.md).
  No result recorded.
- **fabflows-tickets' `ticket`, `trace` and `setup` skills.** Only in fabflows-tickets' own
  trigger list run by hand,
  [plugins/fabflows-tickets/evals/trigger-corpus.json](../plugins/fabflows-tickets/evals/trigger-corpus.json).
  No result recorded.
