# fabflows benchmark

Measures what a fabflows-led session costs against a plain session on the same tasks, with
tokens attributed to the lead and to each worker type by model. It exists because DEC-0004,
DEC-0012 and DEC-0013 each accepted the same gap: every tier, effort pin and cost claim in
this plugin rested on list-price arithmetic, and nothing measured it.

**This is on-demand tooling, not a test.** Each run is a fresh headless `claude -p` lead
session (Fable by default) that spends real tokens. It never runs under `node --test`. The
one thing in the suite is `test/evals-harness.test.js`, which checks `tasks.json` and the
stream parser against a fixture transcript for free.

## Running it

```bash
node plugins/fabflows/evals/harness/run.js --iteration 1            # print the matrix and caps
node plugins/fabflows/evals/harness/run.js --iteration 1 --confirm  # launch the runs
```

Options: `--tasks 1,2` `--arms with_skill` `--repeats 2` `--parallel 1` `--model fable`
`--effort medium` `--plugin-dir <path>` (a modified snapshot of the plugin for the with_skill
arm) `--regrade` (re-measure and re-grade existing transcripts without new sessions).

Then summarise, aggregate and view. `summarize.js` prints the per-cell table and writes
`cells.json`; the other two are skill-creator's, run with `<skill-creator>` set to that skill's
directory; `annotate_benchmark.py` fixes the run count and model names the aggregator hardcodes
and attaches analyst notes:

```bash
node plugins/fabflows/evals/harness/summarize.js plugins/fabflows/evals/runs/iteration-1
(cd <skill-creator> && python -m scripts.aggregate_benchmark <abs>/runs/iteration-1 --skill-name fabflows)
python plugins/fabflows/evals/harness/annotate_benchmark.py <abs>/runs/iteration-1 <skill-creator> <abs>/runs/iteration-1/notes.json
python <skill-creator>/eval-viewer/generate_review.py <abs>/runs/iteration-1 --skill-name fabflows --benchmark <abs>/runs/iteration-1/benchmark.json --static <abs>/runs/iteration-1/review.html
```

Results are summarised in `RESULTS.md`. Raw runs under `runs/` are gitignored.

## What each run does

1. Clones this repo into a short temp path (`%TEMP%/fabflows-bench/...`; a clone inside the
   repo's own deep path fails on Windows with "Filename too long") and checks out a `bench/`
   branch, so the guard's default-branch rule never fires on the task itself.
2. Launches `claude -p` in that clone with the task prompt. The `with_skill` arm prefixes
   "Invoke the fabflows:using-fabflows skill first" and loads the plugin from this repo via
   `--plugin-dir`; the `without_skill` arm gets the bare task.
3. Streams the session to `transcript.jsonl`, then snapshots `git status`, `git diff`, the
   final result text, and runs the task's test command in the clone.
4. Writes `metrics.json`, `timing.json` and `grading.json` per run.

### The clean room

Both arms run with every installed plugin disabled through `--settings` and `--strict-mcp-config`,
and with the advisor tool removed (`advisorModel: ""`). Probes showed the alternative: the
user's normal environment puts about 55k tokens of MCP tool schemas into every system prompt
and injects other plugins' SessionStart hooks (a persona, a memory dump) into the lead, and an
advisor tool whose instructions tell the lead to consult it before substantive work. The clean
room drops the system prompt to about 37k tokens and leaves fabflows as the only difference
between the arms. `--bare` would be cleaner still but requires an API key, and `--safe-mode`
drops `--plugin-dir` plugins too.

Both arms still load the user's global `CLAUDE.md`. It is the same in both, so it inflates
absolute numbers without touching the delta.

### Per-model attribution

The final result's `modelUsage` rolls all agents together. The stream does not: every
`assistant` event carries `message.model` and `message.usage`, and a worker's events carry the
`parent_tool_use_id` of the `Agent` call that spawned it, which joins to that call's
`subagent_type`. `harness/metrics.js` sums usage once per `message.id` (one message arrives as
several events that repeat its usage) and reports:

- **lead**: model, messages, uncached input, cache writes, cache reads, output, thinking,
  final context size, tool calls, and how many times it re-ran the task's test command after
  spawning a worker (the verification gate).
- **workers**: the same per `subagent_type`, plus spawn count.
- **byModel** and **totals**, alongside the result's own `modelUsage` and `total_cost_usd`.
- **hooks**: hook events from the stream and, via `FABFLOWS_PROBE`, every guard payload with
  its `agent_type`, which is how we know the guard fires inside workers.

## The tasks

| # | Name | Routing row | Graded by |
| --- | --- | --- | --- |
| 1 | `wide-search` | explorer (Haiku) | Every `plugins/*/agents/*.md` named; correct model per pinned agent, as `path:line`; every unpinned agent flagged; no invented files; repo unchanged. |
| 2 | `scoped-edit` | editor (Sonnet) + gate | Guard tests pass; exactly `guard.js` and `guard.test.js` changed; `guard.js` really denies `pipx install black` and still allows `pipx run`. |
| 3 | `write-tests` | test-runner (Sonnet) | New `*.test.js` under `plugins/fabflows/test/`; suite passes; nothing outside that directory changed; the test covers the three cases. |
| 4 | `short-chain` | none (DEC-0004 predicts inline wins) | Both manifests read `0.3.7`; marketplace test passes; exactly two files changed. |

Every run also checks: finished without error, no denied tool call, under the turn cap.
Grading is programmatic against the clone, never against what the lead said it did.

## Caps

`tasks.json` sets `maxTurns`, `maxBudgetUsd` (list price, passed as `--max-budget-usd`) and a
wall-clock kill. Without `--confirm` the runner prints the matrix and exits.

## When to re-run

After a tier or effort change, after trimming the skill prose, before a version bump that
touches routing, and whenever a decision record wants a number instead of arithmetic.

## Limitations and Windows notes

- Subscription weighting of Fable, Opus, Sonnet and Haiku tokens against a weekly cap is
  unpublished. Tokens by model are directional; `total_cost_usd` is list price.
- Two repeats per cell show direction and catch one outlier. They do not give significance.
- The `with_skill` prompt names the skill explicitly, so triggering is not measured here.
- Hooks inside Workflow-tool agents remain unmeasured; the build loop is deferred.
- Per-message stream usage is the message-start snapshot: input-side fields are final, the
  output field is a placeholder. Output comes from the result's `usage` and `modelUsage` and
  from each Agent call's `subagent_tokens`; never from the stream.
- `os.tmpdir()` can return an 8.3 short name (`REXLIN~1`). A cwd in that form made don't-ask
  mode deny every edit as outside the working directory, so the runner resolves it first.
- Don't-ask mode denies any Bash command that starts with `cd <dir> &&` and every PowerShell
  call, allow list or not. Iteration 1 took 28 such denials across both arms, each costing a
  turn. Fix before iteration 2 (see `RESULTS.md`, H0).
- The fixture's own `guard.test.js` drives `guard.js` with synthetic payloads while the task's
  test command runs, and they land in the `FABFLOWS_PROBE` file. `metrics.js` sets aside every
  payload without a `session_id`; only hook-runner payloads are counted.
