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

If a transcript contains the literal text `</script>`, `generate_review.py` embeds it unescaped
and the browser cuts the page off there: replace it with `<\/script>` on the page's
`EMBEDDED_DATA` line after generating.

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
- **workflows**: every Workflow-tool run the lead launched (`fabflows:build` is one), with each
  agent's label, type, model and exact usage. Workflow agents emit no stream events: they show
  up as `task_progress` events, and their per-message usage lives in `agent-<id>.jsonl` files
  under the transcript directory the tool result names, which the runner copies into
  `<run>/workflows/` before measuring. Their totals are included in `modelUsage` under their own
  model, so the per-model residual still reconciles. A run with a workflow has two `result`
  events (the lead ends its turn, then is woken by the completion notification): per-turn usage
  and turns are summed, the cumulative cost and `modelUsage` are taken from the last, and the
  duration is the harness wall clock.
- **hooks**: hook events from the stream and, via `FABFLOWS_PROBE`, every guard payload with
  its `agent_type`, which is how we know the guard fires inside workers.

## The tasks

| # | Name | Routing row | Graded by |
| --- | --- | --- | --- |
| 1 | `wide-search` | explorer (Haiku) | Every `plugins/*/agents/*.md` named; correct model per pinned agent, as `path:line`; every unpinned agent flagged; no invented files; repo unchanged. |
| 2 | `scoped-edit` | editor (Sonnet) + gate | Guard tests pass; exactly `guard.js` and `guard.test.js` changed; `guard.js` really denies `pipx install black` and still allows `pipx run`. |
| 3 | `write-tests` | test-runner (Sonnet) | New `*.test.js` under `plugins/fabflows/test/`; suite passes; nothing outside that directory changed; the test covers the three cases. |
| 4 | `short-chain` | none (DEC-0004 predicts inline wins) | Both manifests read `0.3.7`; marketplace test passes; exactly two files changed. |
| 5 | `deep-read` | explorer, volume: 13 decision records, ~60k chars of prose | Every record listed with its id, title, status and chosen option (from frontmatter and the outcome section); a 20+ word row each; no invented id; repo unchanged. |
| 6 | `triage-failures` | test-runner, volume: a ~200-line suite log with 3 planted failures | Every failing test and file named (truth from a TAP re-run); no invented or falsely failing file; repo unchanged. The three breaks are applied and committed by the task's `setup` before the session starts. |
| 7 | `build-component` | `fabflows:build` (a spec'd, sizeable change) | A greenfield project (`fixtures/dep-resolver/visible`: a spec for a semver range parser, a flat backtracking resolver and a CLI, plus `package.json`). Graded by a hidden 41-test acceptance suite (`fixtures/dep-resolver/hidden`) run against the fixture at grade time, plus: `npm test` passes, the tree is clean and committed, no dependency added, every launched workflow finished. Caps 200 turns, $60, 120 min. |

Tasks 1 to 4 are short chains, added in iteration 1. Tasks 5 and 6 were added for iteration 2
because iteration 1 showed the lead never delegating on short work: they carry evidence large
enough that the skill's own rule ("delegate when it keeps a large volume out of the lead")
should apply, while the graded answer stays small. Task 7 was added for iteration 5: the shape
fabflows is for, a whole component built from a spec in a long session, where the routing table
sends the work to the build loop.

Every run also checks: finished without error, no denied tool call, under the turn cap.
Grading is programmatic against the clone, never against what the lead said it did.

### Task 7's hidden suite and reference

`fixtures/dep-resolver/hidden/*.test.js` never enters a fixture. The grader runs it from the
evals tree with `LOCKSTEP_ROOT` pointing at the fixture, one grading expectation per test, and
uses `fixtures/dep-resolver/reference/` as the oracle for the resolver's validity checks (so a
wrong `satisfies` in the project cannot vouch for its own lockfile). The reference passes the
whole suite, and `test/evals-harness.test.js` keeps it that way for free, so a hidden assertion
that stopped following from the spec would fail the suite before it could grade a run. The spec
and suite were reviewed adversarially before iteration 5 (four lenses, two refuters per finding,
`git show 735ea1d:docs/RUNLOG.md`); the defects that survived were fixed in the spec text.

## Fixtures are blind

From iteration 5 a fixture never carries the benchmark: no `tasks.json`, no graders, no
RESULTS.md, no run-log entries or decision records about it, and no hint in the prompt about
delegation or the build loop. Two fixture kinds do that (`fixture` in `tasks.json`, top-level
default and per-task override):

- `repo` clones this repository at a pinned pre-benchmark commit (`3fbe15b`: 13 decision
  records, no `evals/` directory) and checks out the `bench/` branch there. Tasks 1 to 6 use it,
  so their ground truth is unchanged from earlier iterations.
- `dir` copies a directory under `evals/fixtures/` into a fresh `git init` repository. Task 7
  uses it.

The with_skill plugin is staged into `<iteration>/plugin/` with only `.claude-plugin`, `agents`,
`hooks`, `skills`, `workflows` and `README.md`, so `plugins/fabflows/evals/` never rides along
under `--plugin-dir`. Iterations 2 to 4 cloned the branch head, which did carry `tasks.json` and
RESULTS.md. A scan of every tool call in those 32 transcripts found none that touched `evals/`,
`tasks.json`, RESULTS.md or the run log, so the numbers stand, but the door was open.

## Skill variants

A hypothesis about the skill's prose runs against a modified copy of the plugin loaded with
`--plugin-dir`, never against the installed cache. The copy lives under `runs/snapshots/`
(gitignored) and is reproducible from a tracked patch under `snapshots/`:

```bash
mkdir -p plugins/fabflows/evals/runs/snapshots/h1-trimmed
cp -r plugins/fabflows/{.claude-plugin,agents,hooks,skills,workflows,README.md} plugins/fabflows/evals/runs/snapshots/h1-trimmed/
patch -p3 -d plugins/fabflows/evals/runs/snapshots/h1-trimmed/skills < plugins/fabflows/evals/snapshots/h1-trimmed.patch
node plugins/fabflows/evals/harness/run.js --iteration 3 --arms with_skill --plugin-dir plugins/fabflows/evals/runs/snapshots/h1-trimmed --tasks 1,5,6 --confirm
```

The description stays identical in a variant so that triggering is not a second variable.

Variants so far: `h1-trimmed.patch` (iteration 3: 38% shorter, gate scoped to worker reports,
build-loop outcomes moved to `references/build-loop.md`) and `h1b-narrowed.patch` (iteration
4: the same plus a volume rule, "delegate the reading, keep the judging", and a judgment
clause narrowed to root-cause, architecture and coupled-refactor calls).

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
- Until iteration 5 the `Workflow` tool was not in `--allowedTools`, so no build loop could have
  run in iterations 1 to 4 whatever the lead decided. Both arms now allow it; a bare lead has no
  reason to use it. Workflow agents cache prompts at the 5-minute rate where the lead uses the
  1-hour rate, which shows up in `modelUsage` as cheaper cache writes for them.
- Iteration 5 measured the guard hook firing inside Workflow-tool agents, so that gap is closed;
  what remains unmeasured is whether a guard *denial* inside one is handled well, since none
  fired.
- Per-message stream usage is the message-start snapshot: input-side fields are final, the
  output field is a placeholder. Output comes from the result's `usage` and `modelUsage` and
  from each Agent call's `subagent_tokens`; never from the stream.
- `os.tmpdir()` can return an 8.3 short name (`REXLIN~1`). A cwd in that form made don't-ask
  mode deny every edit as outside the working directory, so the runner resolves it first.
- Don't-ask mode denies a Bash command that combines `cd <dir> &&` with a pipe, and every
  PowerShell call, allow list or not (`Bash(cd *)`, `Bash(cd:*)`, `PowerShell(*)` and
  `PowerShell(node:*)` were all probed and changed nothing; `--permission-mode auto` is not
  accepted headless). Iteration 1 took 28 such denials across both arms, each costing a turn.
  From iteration 2 the runner appends an environment note to the fixture's `CLAUDE.md` (run
  from the root without `cd`, use Bash not PowerShell) and passes `--disallowedTools
  PowerShell`. The note only loads with `--setting-sources user,project`; `user` alone drops
  the project CLAUDE.md, which is why the first iteration-2 launch still hit the denials and
  was stopped after two runs. Iteration 1 therefore ran without the repo's own CLAUDE.md in
  either arm; from iteration 2 both arms carry it. This is benchmark-only and widens no permission: the plugin, its guard included,
  is unchanged for every platform. On Linux and macOS the PowerShell tool is not offered, so
  the disallow should be a no-op there (not tested from this machine). On Windows the benchmark
  therefore runs without a tool a real session would have. Re-probed on CLI 2.1.272 before
  iteration 5: a bare `npm test`, a pipe into `tail`, `$HOME`, a redirect, and a quoted `cd`
  into the fixture's own Windows path were all allowed; `cd /mnt/c/...` (a WSL path that does
  not exist here) was denied as a move outside the working directory. The Haiku smoke of task 7
  hit exactly that, then spent its last turns trying to edit permissions and never committed,
  so the note now says so and tells the lead to retry without the `cd` instead.
- The fixture's own `guard.test.js` drives `guard.js` with synthetic payloads while the task's
  test command runs, and they land in the `FABFLOWS_PROBE` file. `metrics.js` sets aside every
  payload without a `session_id`; only hook-runner payloads are counted.

## Trigger corpus

`trigger-corpus.json` measures skill selection, the one thing the benchmark above never does
(the with_skill prompt names the skill). It has the same shape as ciso's corpus and runs by the
same manual procedure, `plugins/ciso/evals/RUNBOOK.md`: split, paste each held-out query into a
fresh session three times, take the majority selection, score under- and over-triggering.
`test/trigger-corpus.test.js` checks only that the corpus is well-formed; the number comes from
the run.
