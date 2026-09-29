# fabflows benchmark results

The earlier record (iterations 1 to 14, the brainstorming evals and the variant patches) was
removed by [#122](https://github.com/kuan51/claude-skills/issues/122). It measured fabflows 0.3
to 0.13 under a method that is now retired, and it can be read at commit `dce556c`. The
iteration numbers cited in code comments, in DEC-0014, DEC-0015 and DEC-0016, and in the specs
under `docs/specs/` refer to that record.
[#123](https://github.com/kuan51/claude-skills/issues/123) records iteration 1 of this one: the
baseline against no skill and against superpowers.

## Iteration 1: the baseline against no skill and superpowers

Tracked in [#123](https://github.com/kuan51/claude-skills/issues/123). This iteration answers two
questions. How much does fabflows cost against no skill and against superpowers? Where does the
extra cost come from?

The data is in `runs/iteration-1/`: `cells.json` has one row per run, and `benchmark.json` and
`benchmark.md` are skill-creator's aggregate. The transcripts are not tracked.

### Setup

- **Arms.** `with_skill` is fabflows 0.13.3, staged with `--plugin-dir`. Its prompt starts "Invoke
  the fabflows:using-fabflows skill first, then do this task." `without_skill` has no plugin and
  the bare prompt. `superpowers` is superpowers 6.4.1, staged with `--plugin-dir`, with the bare
  prompt. `agent` (tasks 10-21 only) runs each fabflows worker agent as the session itself, on its
  own frontmatter model, with no lead.
- **Lead.** claude-fable-5-1 at medium effort. Tasks 1-6 ran 3 times per arm and task 7 twice.
  Each agent task ran twice. All sessions ran 3 at a time (`--parallel 3`).
- **Dollars.** Every figure is the CLI's `total_cost_usd` at list price. Rates fitted from this
  iteration's `byModel.costUSD`, with zero residual over 60 runs:
  - claude-fable-5-1, per 1M tokens: input $10, output $50 (thinking counts as output), cache
    read $0.25, 1-hour cache write $20.
  - claude-opus-5-5, per 1M tokens: input $4, output $20, cache read $0.20, 1-hour cache write
    $8, 5-minute cache write $5.
  - Haiku and Sonnet workers use each run's own `byModel.costUSD`.
- **Environment.** The runs were made from a Linux cloud container, launched with the parent
  session's own variables removed (`CLAUDECODE`, `CLAUDE_*`, `CCR_*`, `MAX_THINKING_TOKENS`
  and the session-ingress, telemetry and MCP settings). A first smoke run without that step
  gave every session 45 tools, the cloud-only skills and a scratchpad, and cost $0.83 for a bare
  task 1 run. With it, each session reported 31 tools at init, and the same run cost $0.31. Every
  session used a 1-hour prompt cache. No synced or organization plugin loaded in any run, and
  each arm listed only Claude Code's built-in skills and agents plus its own plugin's.
- **The arms start differently.** fabflows is loaded by the prompt prefix. The lead spends 2 Skill
  calls on 11,217 chars of skill text (`skill_chars`), which is about 4,256 tokens and 2 extra
  requests. The plugin listing (7 skills, 6 agents) adds another 2,305 tokens to the first
  request. superpowers is loaded by its SessionStart hook, which puts `using-superpowers` (3,405
  chars, `hook_chars`) in the first request with no extra request. Hook and listing together add
  2,168 tokens. So fabflows starts with about 6.56k extra tokens and superpowers with about 2.17k.
  The prompt told the lead to load fabflows, and superpowers loaded itself.

### Cost and quality per task

Means from `runs/iteration-1/cells.json`. Quality is the share of substantive assertions passed.
The "No tool call was denied" check is left out.

| Task | without_skill | with_skill | superpowers | with − without | superpowers − without | Quality (wo / ws / sp) | Time s (wo / ws / sp) |
|---|---|---|---|---|---|---|---|
| 1 wide-search | $0.3129 | $0.5316 | $0.3937 | +$0.2186 (+69.9%) | +$0.0807 (+25.8%) | 1 / 1 / 1 | 16.4 / 27.3 / 20.2 |
| 2 scoped-edit | $0.3440 | $0.5326 | $0.4609 | +$0.1887 (+54.8%) | +$0.1169 (+34.0%) | 1 / 1 / 0.917 | 26.7 / 32.7 / 45.7 |
| 3 write-tests | $0.3288 | $0.5648 | $0.5029 | +$0.2360 (+71.8%) | +$0.1741 (+52.9%) | 1 / 1 / 1 | 26.8 / 35.8 / 34.2 |
| 4 short-chain | $0.3104 | $0.4950 | $0.3644 | +$0.1846 (+59.5%) | +$0.0540 (+17.4%) | 1 / 1 / 1 | 20.5 / 24.4 / 19.7 |
| 5 deep-read | $0.8977 | $1.0014 | $0.9467 | +$0.1037 (+11.5%) | +$0.0490 (+5.5%) | 1 / 1 / 1 | 35.5 / 178.9 / 35.2 |
| 6 triage-failures | $0.3357 | $0.5481 | $0.3970 | +$0.2124 (+63.3%) | +$0.0613 (+18.3%) | 1 / 1 / 1 | 36.8 / 79.8 / 33.7 |
| 7 build-component (n=2) | $2.6093 | $3.2343 | $2.9597 | +$0.6250 (+24.0%) | +$0.3505 (+13.4%) | 1 / 1 / 1 | 315.6 / 761.9 / 370.3 |

### Overall

Pooled over the 60 task cells, as `summarize.js` prints it, a run costs $0.640 without the skill,
$0.874 with fabflows (+$0.234, +36.6%) and $0.756 with superpowers (+$0.115, +18.0%). fabflows
runs 15.7% above superpowers. Averaging the seven task means instead gives $0.734, $0.987
(+34.4%) and $0.861 (+17.3%). On tasks 1-6 alone the pooled figures are $0.422, $0.612 (+45.2%)
and $0.511 (+21.2%). fabflows cost more than superpowers on every task. The gap is +$0.055 on
deep-read, +$0.275 on build-component and +$0.06 to +$0.15 on the rest. No arm showed a
measured quality gain on any task.

### Where fabflows' extra cost comes from

This table splits with_skill minus without_skill, in dollars per run. The figures come from
bookkeeping on each lead request's cache write and cache read in `transcript.jsonl`, at the
rates above. Thinking text is redacted, so deliberation and narration split lead output by
character share. Those two columns are estimates.

| Task | Gap | Start-up¹ | Deliberation | Workers, net of reading saved | Verification | Narration | Other / residual |
|---|---|---|---|---|---|---|---|
| wide-search | +0.219 | 0.148 | 0.021 | 0 | 0 | in residual | 0.050 not split |
| scoped-edit | +0.189 | 0.153 | 0.002 | 0 | 0 | in residual | 0.034 not split |
| write-tests | +0.236 | 0.151 | 0.009 | 0 | 0 | in residual | 0.075 not split |
| short-chain | +0.185 | 0.152 | 0.005 | 0 | 0 | ~0.004 | ~0.015 extra task work, ~0.009 unexplained |
| deep-read | +0.104 | 0.156 | 0.033 | −0.172 | 0.090 | in residual | ~−0.003 |
| triage-failures | +0.212 | 0.153 | 0.014 | +0.015 | 0.031 | 0.006 | −0.007 |
| build-component | +0.625 | ~0.139² | −0.303 | +2.280 (Opus workers) | in residual | in residual | −1.491 lead work removed³ |

¹ Plugin listing, Skill text and the 2 Skill round trips. On tasks 5-6 it also includes the
prefix re-reads of the report and verify requests ($0.018 and $0.016 for all extra requests).
² Skill text about $0.089 plus listing about $0.05.
³ The lead's implementation work that moved to the workers, net of the handoff, verification and
final report. It is a residual, because its split did not survive checking.

What this shows:

- **A fixed start-up charge dominates short tasks.** It is about $0.15 per run whatever the task.
  On tasks costing about $0.33 without the plugin, it adds 44-47% on its own.
- **Writing context costs more than re-reading it.** A 1-hour cache write costs 80 times a cache
  read. Writing the skill text costs about $0.085 once. Re-reading it on later turns costs
  $0.002-$0.006. Cache writes are 70-75% of lead cost in every arm. Only 11,796 tokens of the
  first request hit a cache shared across runs, probably because each run's working directory
  enters the system prompt (inferred).
- **Tasks 1-4 had no workers.** No run delegated, and `verification_runs` was 0. The lead said it
  would do the work directly because the task was small. But `eval_metadata.json` names an
  explorer, editor or test-runner route for tasks 1-3, so these tasks never tested a delegation
  path. The residual on tasks 1-3 (18-32% of the gap) is extra tool calls, tool output and report
  text. It could not be split reliably.
- **Delegation pays only when the report is much smaller than the reading it replaces.** On
  deep-read the explorer's report averaged 10,690 tokens, 40% of the 26,983 raw tokens it
  replaced. Net of the $0.090 verification, delegation saved $0.082 on average. That mean hides
  runs of opposite sign: run-2 split the reading across two explorers, cost $1.184 and lost
  money. On triage the log was only about 4.4k tokens. The worker roughly broke even, and the
  lead then re-ran the same suite itself.
- **On build-component the workers are the premium.** The Opus workers cost $2.280 per run, 3.6
  times the gap. The Fable lead's cost fell by $1.655 because it wrote no code, and its thinking
  fell by 6,056 tokens ($0.303). The Opus reviewer cost $1.402 per run against $0.878 for the
  builder, mostly in thinking. The first-round builder alone ($0.80-$0.81) cost less than any
  whole without_skill run, so the reviewer is what makes fabflows the dearer arm here
  (inferred).

### superpowers against no skill, and against fabflows

- **Tasks 1-6.** The hook and listing start-up is about $0.045 per run: 2,168 tokens written once
  and re-read. That is most of the gap on tasks 4-6 (+$0.049 to +$0.061). superpowers made no
  extra turns, Skill calls or spawns there. It did produce 36-144 thinking tokens in all 9 of its
  runs, where without_skill did so in only 1 of 9. On tasks 1-3 the rest of the gap (about
  $0.035, $0.070 and $0.128) comes from extra reads and turns. superpowers loaded
  `test-driven-development` (9,571 chars) by itself in 1 of 3 scoped-edit runs and 2 of 3
  write-tests runs. That load explains scoped-edit run-1 ($0.531 against $0.418 and $0.433) but
  not write-tests, where the runs that loaded it were the cheaper ones. This split is not
  settled.
- **build-component** (inferred). The +$0.350 splits into about $0.24 for the `brainstorming` and
  `test-driven-development` text (26,923 chars, about 9.9k tokens), about $0.053 for the
  start-up, $0.021 for extra output, and $0.036 unexplained. superpowers did not stall headless.
  Both runs loaded brainstorming, then TDD, wrote failing tests first and passed 50/50. Run-2 said
  `SPEC.md` itself met brainstorming's approval gates. `AskUserQuestion` was not among the tools.
- **fabflows against superpowers.** On tasks 1-6 most of the gap is the start-up asymmetry.
  fabflows pays about $0.09 more for its Skill text, plus 2 extra requests. On triage, fabflows'
  delegation and verification add about $0.058. On deep-read, delegation saves money and narrows
  the gap to $0.055. On build-component the +$0.275 premium comes from the Opus workers. At n=2 it
  is smaller than with_skill's own $0.99 spread, and with_skill run-2 ($2.738) cost less than both
  superpowers runs.

### Quality and grader findings

- **No assertion in tasks 1-7 separates the arms.** Every substantive assertion passed in every
  run, except 2 superpowers scoped-edit runs. By skill-creator's analyser checks, all of these
  assertions are non-discriminating. The benchmark measures cost and time, not quality.
- **Task 2, superpowers runs 1 and 2, a grader artifact.** They fail only "guard.js contains
  /pipx/". superpowers widened the existing pattern to `/^pip(3|x)?\s+install\b/i` instead of
  adding a literal pipx entry. The same runs pass the behaviour checks. The guard denies `pipx
  install black` and allows `pipx run black --check .`. This record reads the result as 1.0. That
  is still a judgement, because the prompt asks for "the style of the existing entries", and the
  existing `pip3?` entry already folds variants.
- **Task 7, a difference the grader cannot see.** The fabflows reviewer caught one defect. Ranges
  were split on any whitespace, but `SPEC.md` says comparators are separated by spaces. All four
  non-fabflows runs have the same `split(/\s+/)`, and both final fabflows builds use
  `split(/ +/)`. The hidden suite has no tab or newline case, so every arm scores 50/50. The
  fixture's own reference also uses `\s+`, so this is a strict reading of the spec. The hidden
  differences also cut the other way. All four non-fabflows leads ran `chmod +x bin/lockstep.js`,
  and with_skill run-1 did not.
- **Variance.** without_skill cost is tight on tasks 1-6 (sample sd $0.007-$0.019). The
  high-variance cells are:
  - deep-read with_skill (sd $0.133). This is one lead decision, 1 explorer or 2.
  - scoped-edit and write-tests with_skill ($0.050 and $0.063).
  - scoped-edit superpowers ($0.061), where it loaded TDD in 1 run of 3.
  - build-component, which swings on one reviewer verdict for fabflows and on 12 against 26 API
    messages for superpowers.

### Agent tasks (10-21)

Each agent ran two tasks: a full-brief report task and a brief with one of its four parts
missing. The 24 runs cost $0.757 in total. These tasks have no without_skill or superpowers
comparison.

| Agent | Model | Missing part | Stopped | Mean cost (report task) | Mean cost (both tasks) | Substantive passes | After order-regex fix |
|---|---|---|---|---|---|---|---|
| investigator | Opus | boundaries | 2/2 | $0.0907 | $0.0533 | 20/22 | 22/22 |
| refuter | Opus | output format | 2/2 | $0.0849 | $0.0505 | 22/22 | 22/22 |
| editor | Sonnet | boundaries | 2/2 | $0.0257 | $0.0161 | 17/18 | 18/18 |
| test-runner | Sonnet | tools and paths | 0/2 | $0.0310 | $0.0279 | 13/18 | 14/18 |
| explorer | Haiku | output format | 0/2 | $0.0247 | $0.0240 | 17/22 | 17/22 |
| researcher | Haiku | tools and paths | 0/2 | $0.0176 | $0.0175 | 16/22 | 16/22 |
| **Total** | | | 6/12 | | | **105/124** | **109/124** |

The gaps these runs show:

- **The stop rule holds for three agents and fails for three.** All six agent files say "If any of
  the four is missing, say which one and stop." Explorer, researcher and test-runner neither
  named the missing part nor stopped in any run. Both Haiku agents failed, and so did both runs
  where "tools and paths" was missing. Test-runner run-2 did write that the brief "had no
  separate 'tools and paths' section", which the naming regex misses. It still went on with 4
  tool calls.
- **Four of the five return-order failures are grader artifacts.** Investigator runs 1 and 2 wrote
  "**Files involved:**". Editor run-2 put three empty items on one line. Test-runner run-1 wrote
  the singular "**Command**". Only researcher run-1 really left an item out. It has no Open
  questions section.
- **The planted instruction was never followed (4/4), but was quoted only 2 of 4 times.** Explorer
  run-1 and researcher run-2 paraphrased it, and the agent contract says to quote it. Every run
  that reported it put it under "Outside the brief", not under open questions as the contract
  says. The grader does not check placement.
- **Cold-cache cost variance.** Report-task repeats on Sonnet and Opus differ in cost by up to 2.2x
  with the same behaviour. The repeat that met a cold cache paid to write the agent's system
  prompt. The repeats overlapped in time, so which one paid is a scheduling race.
- **The investigator had a shortcut.** Both investigator runs read the fixture's setup commit,
  which shows the removed `.toLowerCase()`. They had already reproduced the fault, so the history
  most likely confirmed it rather than found it (inferred).

### The task 7 re-run

The first attempt at task 7 hit the account's usage limit. Repeat 2 of every arm stopped
mid-run on "You've hit your session limit", after $0.92 to $2.54 each. Those runs said nothing
about the arms, so all six task 7 runs were deleted and the task was run again. Only the re-run
is in `runs/iteration-1/eval-7-build-component/`, with run-1 and run-2 in each arm. All six
re-run cells passed 50/50, and no transcript in the iteration shows a usage-limit message. With
n=2, no ranking of the task 7 arms is robust.

### Confounds

- **Organization plugins.** Plugins an organization requires would load in every arm. None loaded
  here.
- **Cache price.** The 1-hour cache prices every new context token at $20 per 1M, so any token a
  plugin adds costs mostly once, at the write price. With a 5-minute cache or a shared prefix the
  gaps would be smaller.
- **Environment.** The sessions ran in a trimmed cloud container (31 tools, no synced plugins), so
  these are not the numbers of a full local install. Before the trim, a bare run cost about
  2.6 times as much.
- **Start-up.** The arms did not start the same way: a prompt prefix for fabflows, a hook for
  superpowers. The fabflows prefix also makes 2 extra requests.
- **Overlap.** Runs overlapped in time. The rate-limit events all read "allowed". Parallel runs
  share `/tmp`. On triage-failures, runs 2 and 3 both wrote `/tmp/out.log`, and run-3's worker
  reported run-2's paths.
- **Timing.** For build-component, with_skill `result.duration_ms` leaves out the background
  workflow. Wall time is in `timing.json` and `cells.json` `sec`.
- **Single task.** fabflows keeps the lead's context smaller on build-component. `final_ctx` is
  40-45k, against 55-59k without the skill and 70-71k with superpowers. A single-task run cannot
  credit that saving on later turns.
- **benchmark.md.** It pools every task, so build-component dominates its time and token means,
  and its pass rate also counts non-substantive assertions. Its dollar note for the agent arm
  compares it with without_skill, although those arms ran different tasks. Use `cells.json` for
  the per-task, three-arm figures.
