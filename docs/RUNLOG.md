# Run log

Append-only. Newest at the bottom.

**In scope:** operational actions that leave no commit behind — deploys, data
migrations, credential rotations, scripts run against live systems, manual
verification, and checks that were skipped.

**Out of scope:** code and documentation edits. Git and the pull request already
record those.

Every action gets **two entries**: the intent, then the confirmation. The second
entry names the exact command or check used, so anyone can re-run it later.
A skipped check gets its own `SKIPPED` entry — a silent gap is worse than an
admitted one.

Past 500 lines, move the oldest entries into `docs/runlog/YYYY-QN.md` -- the
archive for the quarter each entry falls in -- until the log is back under the
limit, and leave a one-line pointer. Whole entries only.

Older entries: [docs/runlog/2026-Q3.md](runlog/2026-Q3.md).

---

## 2026-09-17 — fabflows 0.3.4: tune for a Fable lead on a weekly cap

**PLANNED** — Rewrite the skill's lead-effort guidance to `medium` by default, add a
delegate-on-volume rule, trim the four Bash-capable workers' report contracts to exit
status, summary and failing lines, correct the README cache tip, bump both manifests to
0.3.4, and record DEC-0012. Verify with `node --test "plugins/fabflows/test/*.test.js"`,
`node --test "test/*.test.js"`, and `wc -c plugins/fabflows/skills/*/SKILL.md` under
20,000.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"`: 36 pass, 0 fail (36,
not the 37 logged at 0.3.2: the 0.3.3 guard trim removed one row).
`node --test "test/*.test.js"`: 4 pass, 0 fail. `wc -c`: fabflows/SKILL.md 13,430,
using-fabflows/SKILL.md 1,165. `adr_index.py .` regenerated `docs/DECISIONS.md` with 12
records.

**SKIPPED** — Not exercised from a live session with 0.3.4 installed, and no `/usage`
before-and-after on a subscription: skills load at session start and the cap's token
weighting is unpublished, so the effect on the weekly meter is unmeasured.

**PLANNED** — Follow-up: drop the lead-effort default from the skill, README and
changelog (the lead inherits the session's effort; workers keep their pins), record
DEC-0013 superseding DEC-0012 on that point, and re-run both suites.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"`: 36 pass, 0 fail.
`node --test "test/*.test.js"`: 4 pass, 0 fail.

## 2026-09-17 — fabflows 0.3.5: cap what reaches the lead

**PLANNED** — Prompt review for token efficiency. Change the gate table to read the
diff and cap command output, align `build.js`'s report schema and review brief with the
trimmed worker contract, bump both manifests to 0.3.5. Verify with both suites and the
SKILL.md size check.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"`: 36 pass, 0 fail.
`node --test "test/*.test.js"`: 4 pass, 0 fail. `wc -c`: fabflows/SKILL.md under 20,000.

**SKIPPED** — Agent-body dedupe (each worker repeats the brief check, injection clause
and report contract) left as is: per-spawn cost on cheap tiers only, and agent files
have no include mechanism. Not exercised in a live session.

**CORRECTION** — The CONFIRMED entry above was wrong for the `build.js` commit: an
unescaped apostrophe in the review brief broke the file, and
`node --test "plugins/fabflows/test/*.test.js"` was 21 pass, 15 fail at 6605913 and
d04d079. The commit chain ran on grep's exit status, not the test's, so it committed and
pushed anyway. Fixed forward in the next commit.

**CONFIRMED** — After the fix: `node --check plugins/fabflows/workflows/build.js` clean;
`node --test "plugins/fabflows/test/*.test.js"`: 36 pass, 0 fail.

## 2026-09-17 — code review findings on already-merged guard.js and audit.py

**PLANNED** — `/code-review` diffed a stale local `master` (PR #35) against HEAD, so
its four findings sit in code merged by PRs #36 to #42, not in this branch's own
changes. Reproduce each with a scratch script, fix guard.js (assignment-only redirect;
unresolvable `cd` fallback) and audit.py (null manifest keys; missing generator), add
regression rows, bump docs-warden to 0.4.1.

**CONFIRMED** — Before: `X=1>~/.claude/settings.json` allow; `cd $WT; git commit`,
`cd nope; …`, `cd .. && …`, `(cd x); …`, `cd -; …` on `main` all allow; a bare
`waivers:` failed the manifest check; a missing `domain_model.py` read as ontology
skipped. After: all deny or fail. `node --test "plugins/fabflows/test/*.test.js"`:
36 pass, 0 fail. `python3 plugins/docs-warden/test/test_scripts.py`: 80 PASS, no FAIL.
`node --test "test/*.test.js"`: 4 pass, 0 fail.

## 2026-09-19 — fabflows: token benchmark, iteration 1

**PLANNED** — Close the "no eval covers any of this" gap that DEC-0004, DEC-0012 and
DEC-0013 each accepted. Add `plugins/fabflows/evals/` (tasks, a headless `claude -p`
harness with per-model attribution, a grader) and one free suite test. Probe the harness
assumptions on Haiku first, smoke-test it end to end on task 4, then run the matrix:
4 tasks x 2 arms (with_skill via `--plugin-dir`, without_skill) x 2 repeats, Fable lead
at medium effort, in a clean room (all plugins off through `--settings`,
`--strict-mcp-config`, advisor removed). Aggregate with skill-creator's
`aggregate_benchmark.py`, review in its viewer, write `evals/RESULTS.md`. No plugin
behaviour change and no version bump in this iteration.

**CONFIRMED** — Probes, each a 1-turn Haiku `claude -p ... --output-format json|stream-json`
from a scratch directory: the result carries `usage`, `modelUsage` (per model, `costBasis:
list`), `total_cost_usd`, `num_turns`, `permission_denials`, `subagent_stats`; worker
`assistant` events carry `parent_tool_use_id`; one message arrives as several events with
repeated `usage`, so sums dedupe on `message.id`. `--plugin-dir plugins/fabflows` lists the
six `fabflows:*` agents, `fabflows:build` and both skills; `--settings
'{"enabledPlugins":{"fabflows@claude-skills":false}}'` removes them. `--safe-mode` drops
`--plugin-dir` plugins too; `--bare` needs an API key. With every plugin off and
`--strict-mcp-config`, the first-turn system prompt fell from 55,344 to 7,427 cache-write
plus 30,035 cache-read tokens and no foreign SessionStart hook ran. `advisorModel: ""`
removed the `advisor` tool in two runs where the control run listed it. With
`FABFLOWS_PROBE` set, a `fabflows:explorer` spawned by the lead produced `PreToolUse Read`
and `SubagentStop` payloads tagged `agent_type: fabflows:explorer`, so the guard runs
inside workers. `node --test "plugins/fabflows/test/*.test.js"`: 39 pass, 0 fail
(36 existing + 3 new); `node --test "test/*.test.js"`: 4 pass, 0 fail.

**CONFIRMED** — Smoke test on Haiku (task 4, both arms, iteration 0) found two harness bugs
before any Fable run: `os.tmpdir()` returned an 8.3 short name and don't-ask mode denied every
Edit and Write against that cwd (3/7 both arms); the status parser trimmed the leading space
off porcelain output. After `fs.realpathSync.native` and an untrimmed parse: 7/7 and 6/7.
Matrix: `node plugins/fabflows/evals/harness/run.js --iteration 1 --confirm --parallel 2`,
16 runs, 23:01 to 23:10 UTC, then `--regrade` after two grader fixes (a section lead-in
counts as flagging every row under it; synthetic guard payloads from the fixture's own tests
are set aside). `summarize.js` over `runs/iteration-1`: quality 1.00 in all 16 runs;
with_skill mean 13.0 turns, 2,666 lead output, 34,230 cache-write, 364,496 cache-read,
$0.92 list, 70 s; without_skill 8.5 turns, 1,866, 20,146, 239,191, $0.56, 44 s. Zero
routing-driven spawns in 8 with_skill runs; 3 fallback test-runner spawns after shell
denials. 25 denials across both arms, all `cd`-prefixed Bash or PowerShell in don't-ask mode (28 counting the 3 fallback workers' own denials).
`aggregate_benchmark.py` plus `annotate_benchmark.py` and `generate_review.py --static`
produced `benchmark.json`, `benchmark.md`, `review.html`. `node --test
"plugins/fabflows/test/*.test.js"`: 40 pass, 0 fail; `node --test "test/*.test.js"`: 4 pass,
0 fail. Findings and iteration-2 hypotheses in `plugins/fabflows/evals/RESULTS.md`.

**SKIPPED** — No live interactive session; every measurement is headless `claude -p` in a
clean room, so the user's real environment (other plugins, MCP tools, advisor) is not in the
numbers. The build loop, the verification gate and the Haiku/Sonnet/Opus tiers were not
exercised: no task reached them.

**CORRECTION** — The first CONFIRMED entry above gives the plugin suite as "39 pass, 0 fail
(36 existing + 3 new)". The 39 was arithmetic, not an observed count: the full-suite run at
that moment had 40 tests with 1 failing (a tautological guard test in the new file, since
removed), and only the new file's own run (3 pass) had been read. The observed count after
the removal is 40 pass, 0 fail: 8 frontmatter, 16 build, 13 guard, 3 evals-harness.

## 2026-09-19 — fabflows: token benchmark, iteration 2

**PLANNED** — H0 then H4 then H1, per the user's choice after reviewing iteration 1. H0:
remove the shell-denial confound without widening permissions (probes showed don't-ask mode
refuses `cd` combined with a pipe and every PowerShell call; `Bash(cd *)`, `Bash(cd:*)`,
`PowerShell(*)` and `PowerShell(node:*)` allow rules changed nothing; `--permission-mode
auto` falls back to default headless). Fix: an environment note appended to the fixture's
CLAUDE.md plus `--disallowedTools PowerShell`, benchmark-only. H4: two volume tasks, a
decision-record digest (13 files, ~60k chars) and a suite triage with three planted failures
applied by a per-task `setup` step. Smoke both on Haiku, then run
`node plugins/fabflows/evals/harness/run.js --iteration 2 --tasks 2,3,4,5,6 --confirm
--parallel 2` (20 Fable runs; task 1 had no denials and is not rerun). H1 follows as
iteration 3 with a trimmed skill snapshot via `--plugin-dir`.

**CONFIRMED** — Haiku smoke of tasks 5 and 6 (`--iteration 0 --tasks 5,6 --model haiku`):
10/10 and 8/8 in both arms, no denials. First Fable launch of
`--iteration 2 --tasks 2,3,4,5,6 --confirm --parallel 2` still hit the denials in its first
two runs (the fixture CLAUDE.md note was not loaded: `--setting-sources user` drops project
CLAUDE.md files, confirmed by a Haiku probe that answered NOT LOADED under `user` and quoted
the note under `user,project`); killed via Stop-Process after 2 runs. With `user,project`,
task 2 rerun: 9/9 in all four runs, no denials. Tasks 3 to 6: 16 runs, 00:03 to 00:14 UTC.
Regraded both iterations after two grader fixes (any mention of a record or agent may satisfy
a row check, not only the first; worker output from the per-model residual, since
`subagent_tokens` is not a category sum) and one metric added (the lead's post-spawn tool
calls). `summarize.js` over iteration-2: quality 1.00 in all 20 runs; with_skill mean 10.5
turns, 2,035 lead output, 28,251 cache-write, $0.76 list, 63 s; without 8.4, 1,798, 24,891,
$0.63, 60 s. deep-read: with $0.94 vs without $1.07, lead final context 54,787 vs 66,487,
both with_skill runs delegated to fabflows:explorer by routing and ran the gate;
triage-failures: no delegation, the lead citing the gate's re-run rule. 5 denials in total
(4 with, 1 without), all variable expansions or redirects. `node --test
"plugins/fabflows/test/*.test.js"`: 40 pass, 0 fail. Details in `evals/RESULTS.md`.

**CONFIRMED** (iteration 3, H1) — Snapshot `runs/snapshots/h1-trimmed` (SKILL.md 8,362 chars
against 13,544, plus `references/build-loop.md`, 1,821), patch tracked at
`evals/snapshots/h1-trimmed.patch`; a Haiku probe with `--plugin-dir` on the snapshot listed
all six agents and both skills. `node plugins/fabflows/evals/harness/run.js --iteration 3
--arms with_skill --plugin-dir plugins/fabflows/evals/runs/snapshots/h1-trimmed --tasks 1,5,6
--repeats 2 --confirm --parallel 2`: 6 runs, 00:23 to 00:28 UTC. Quality 1.00 in all six.
Means against the full skill and no skill: wide-search $0.65 vs $1.20 vs $0.46 (cache-write
24,525 vs 51,236 vs 17,339); deep-read $1.10 vs $0.94 vs $1.07 with 1/2 runs delegating vs
2/2 vs 0/2; triage-failures $0.65 vs $0.67 vs $0.51, no delegation in any. One denial (a
Bash variable expansion). Written up in `evals/RESULTS.md`, iteration 3.

**SKIPPED** — No iteration 4. The approved budget of roughly 24 further Fable runs is spent
(iteration 2: 4 rerun plus 16, plus 2 stopped; iteration 3: 6). The narrowed-clause variant
of the trimmed skill, the test-runner gate change (H5) and the trigger scope (H6) are
proposed, not run.

**CONFIRMED** (iteration 4, narrowed trim) — Snapshot `runs/snapshots/h1b-narrowed`, the
iteration-3 skill plus one rewritten "When to delegate" paragraph (8,613 chars); patch at
`evals/snapshots/h1b-narrowed.patch`, and `diff` between the two snapshots shows only that
paragraph. `node plugins/fabflows/evals/harness/run.js --iteration 4 --arms with_skill
--plugin-dir plugins/fabflows/evals/runs/snapshots/h1b-narrowed --tasks 1,5,6 --repeats 2
--confirm --parallel 2`: 6 runs, 00:42 to 00:48 UTC. Quality 1.00 in all six. Means:
wide-search $0.68 (trimmed $0.65, full $1.20, none $0.46); deep-read $0.96 with 2/2 runs
delegating to fabflows:explorer and lead final context 53,973 (full $0.94 and 2/2; trimmed
$1.10 and 1/2; none $1.07); triage-failures $0.73, no delegation, one run with two denials.
Written up in `evals/RESULTS.md`, iteration 4; adoption proposed in DEC-0015.

**CONFIRMED** (housekeeping) — `adr_new.py` created DEC-0014 (trigger and load scope) and
DEC-0015 (adopt the narrowed trim), both `status: proposed`; `adr_index.py` regenerated
`docs/DECISIONS.md`. Run-log rotation per DEC-0001 via a one-off script: 651 lines to 496,
nine oldest whole entries moved to `docs/runlog/2026-Q3.md` with a pointer under the header.
Fixture clones under `%TEMP%/fabflows-bench` kept at the user's request.

## 2026-09-19 — fabflows: token benchmark, iteration 5 (a complex build with the build loop)

**PLANNED** — Extend the benchmark to the shape fabflows is for: a whole component built from a
spec, with `fabflows:build` available. Task 7 `build-component`: a greenfield fixture
(`evals/fixtures/dep-resolver/visible`: SPEC.md for a semver range parser, a flat backtracking
resolver and a CLI, plus package.json) graded by a hidden 41-test acceptance suite
(`fixtures/dep-resolver/hidden`, run at grade time with `LOCKSTEP_ROOT` pointing at the fixture,
never copied into it) that a reference implementation passes; a free suite test keeps that true.
Blindness, at the user's direction: every fixture is blind to the benchmark from here on. Repo
fixtures clone a pinned pre-benchmark commit (`3fbe15b`: 13 decision records, no `evals/`), the
with_skill plugin is staged without `evals/`, and the task prompt names only the spec. Harness:
`Workflow` added to the allowed tools in both arms (probes showed it was never allowed, so no
build loop could have run in iterations 1 to 4); workflow agents attributed from `task_progress`
events and their per-agent transcript files, since they emit no stream events, and a run with a
workflow has two `result` events (per-turn usage summed, cumulative cost taken from the last);
per-task caps (200 turns, $60 list, 120 min). Skill variant, per the user: the narrowed trim
(`runs/snapshots/h1b-narrowed`, the DEC-0015 candidate). Arms `with_skill` and `without_skill`,
two repeats each; an explicit build-loop arm only if neither with_skill run launches the loop by
the standing rule. Verify: `node --test "plugins/fabflows/test/*.test.js"` and
`node --test "test/*.test.js"`; dry run `node plugins/fabflows/evals/harness/run.js --iteration 5
--tasks 7`; Haiku smoke `node plugins/fabflows/evals/harness/run.js --iteration 0 --tasks 7 --arms
without_skill --repeats 1 --model haiku --confirm`; then `node plugins/fabflows/evals/harness/run.js
--iteration 5 --tasks 7 --repeats 2 --parallel 2 --plugin-dir
plugins/fabflows/evals/runs/snapshots/h1b-narrowed --confirm`.

**CONFIRMED** (task 7 review and harness verification) — Both were run as Workflow-tool
orchestrations. The first launch of each died on the account's usage limit with no agent
finished (about 840k subagent tokens spent for nothing; the one partial edit, a correct
`tasks.json`, was reverted before relaunch). Review, relaunched: four finder lenses (hidden
assertions not implied by the spec, spec ambiguity, reference against spec, blindness of the
visible fixture) and two refuters per finding; 30 of 38 agents finished before the limit hit
again. 17 findings, none survived both refuters; the four reference-lens findings whose refuters
died were checked by hand against the code and all four were real edge cases the hidden suite did
not cover, fixed in `visible/SPEC.md` and `reference/src/index.js` (conflict reporting through an
already-selected package, build metadata on wildcard partials, `maxSatisfying` on non-strings,
operators on a bare wildcard). One finding refuted as "no grading impact" was a fixture defect all
the same: `node --test test/` fails on Node 24 (reproduced: `not ok 1 - test`, exit 1), so the
fixture's `npm test` is now `node --test "test/**/*.test.js"`. Harness build, relaunched: four
agents (metrics.js, run.js, grade.js, tasks.json + tests) finished; the verifier hit the limit.
Verification, third workflow: contract review (four low findings, none blocking), adversarial code
review (three medium/high: the hidden-suite summary ignored the runner's exit status so a crashed
test file vanished from the count; `npm test` passed vacuously with no test files; a run killed
mid-workflow recorded the first turn's duration), runtime checks all passed including
`node run.js --iteration 4 --regrade` with `cells.json` unchanged. The three bugs and three low
ones (git identity in fresh fixtures, node_modules filtered on copy, status read before tests)
fixed by hand; the fix agent had hit the limit. After the fixes: `node --test
"plugins/fabflows/test/*.test.js"` 44 pass (40 plus 4 new), `node --test "test/*.test.js"` 4
pass, dry run prints per-task caps, grading a scratch fixture holding the reference gives 50/50
with "Hidden acceptance suite: 41/41", an empty fixture 6/10 with "could not run", a fixture with
one planted bug 48/50 with the expected-versus-actual evidence. A scan of every tool call in the
32 iteration-2-to-4 transcripts found none touching `evals/`, `tasks.json`, RESULTS.md or the
run log.

**CONFIRMED** (task 7 smoke) — `node plugins/fabflows/evals/harness/run.js --iteration 0 --tasks
7 --arms without_skill --repeats 1 --model haiku --confirm`: one Haiku run, 251 s, $0.68 list,
25 turns, graded 38/50 with the hidden suite at 34/41 (the failures were the prerelease rule,
hyphen rounding, cycle recursion and conflict reporting, so the task's hard parts are where
they should be). The lead never committed: its first `npm test` was written as `cd /mnt/c/...
&& npm test | head`, denied as a move outside the working directory, after which it tried to
read and write `.claude/settings.json` (denied) and stopped. A six-command Haiku probe in the
same environment (`permprobe-cd`) then showed bare `npm test`, a pipe into `tail`, `$HOME`, a
redirect and a quoted `cd` into the fixture's real path all allowed and only the `/mnt/c` form
denied, so the fixture's environment note now names that and says to retry without the `cd`
instead of editing settings. Harness, fixture preparation, hidden-suite grading and the
per-run outputs all worked end to end.

**CONFIRMED** (iteration 5, task 7) — The first launch of `node plugins/fabflows/evals/harness/run.js
--iteration 5 --tasks 7 --repeats 2 --parallel 2 --plugin-dir
plugins/fabflows/evals/runs/snapshots/h1b-narrowed --confirm` went through the Bash tool, whose
ten-minute ceiling would have outlived neither run, so it was stopped after about a minute
(harness, both sessions) and relaunched detached with `Start-Process`, logging to
`runs/iteration-5/launch.log`; four runs, 02:16 to 02:34 UTC. Every run passed all 41 hidden
tests; the only failed expectation anywhere was the no-denial environment check (with_skill 3
and 7 denials, without_skill 1 and 0). List cost with_skill $4.12 and $3.89 against without
$2.54 and $2.70; wall clock 696 s and 719 s against 318 s and 342 s; lead output 5,562 and
13,122 tokens against 28,848 and 28,510. Both with_skill leads launched `fabflows:build` by the
standing rule, and both first passed its args as a text block and got `not-started` before
relaunching with an object. Run 1: one Opus build round (37,103 output tokens, 402 s), one Fable
review round (14,050 output, 188 s), ACCEPT. Run 2: one Opus build round (29,365 output, 303 s),
then the workflow escalated `blocked` because the builder's report opened with the permission
denial it had recovered from, so no reviewer ran; the lead tried to read the skill's
`references/build-loop.md` (denied twice: the plugin directory is outside the fixture and the
user's `blockReadsOutsideWorkingDirectories` setting is on), spawned `fabflows:refuter` through
the Agent tool on Opus, wrote its own probe scripts and finished. Denied commands were `cd
"<fixture>" && npm test | tail`, `npm test | tail; echo ${PIPESTATUS[0]}`, multi-line `node -e`
scripts, and one compound `ls && cat; git log | head`.

**CONFIRMED** (iteration 5 analysis and reporting) — The four transcripts were analysed by a
Workflow orchestration (one analyst per run reading the full stream and the workflow agents' own
transcript files, one synthesiser, then two refuters per finding); the analysts and synthesiser
finished, all 46 refuters died on the session limit, so the 23 findings were verified by hand
instead. Verified directly: `git show --stat` in the bare arm's first fixture prints
`src/resolve.js | Bin 0 -> 5408 bytes`, and the file holds one NUL byte at offset 2621, written
as a literal separator inside a string; checking out each of the bare arm's second run's five
commits with `git archive` and running the suite gives 1 test 0 pass and 2 tests 0 pass for the
first two, against its report's claim "Each of the five Conventional Commits was checked green";
`refuter.md` line 5 pins `model: opus` while `build.js` line 40 defaults `reviewerModel` to
`fable`; `refuter.md` lines 19 and 21 give two different rules for BLOCKED; the two builder
reports differ only in their first word and `saysDenied` escalated one and not the other; both
fabflows runs' probe files carry two payloads from the abandoned first launch. Harness fixes
from the analysis: the probe file is truncated before each run, `summarize.js` reads the wall
clock from `timing.json`, and a model's residual output is split when some of its workers are
exact. `node --test "plugins/fabflows/test/*.test.js"` 44 pass. Reporting:
`summarize.js`, `aggregate_benchmark`, `annotate_benchmark.py` and `generate_review.py` over
`runs/iteration-5`; results written up in `evals/RESULTS.md`.

**CONFIRMED** (iteration 5, refutation and token ledger) — Two read-only Workflow passes, no new
sessions. Refutation attacked every claim written into `evals/RESULTS.md` iteration 5 and
DEC-0016: 63 verdicts, 30 upheld, 22 overstated, 11 refuted. The corrections that changed the
reading: only ten of the eleven denials are don't-ask-mode (the eleventh is the blocked plugin
read, which the same document already described as defect 3); `~/.claude/plugins/**` is exempt
from `blockReadsOutsideWorkingDirectories`, so the unreadable reference file is an artifact of
`--plugin-dir` staging rather than a property of an install, and the shipped 0.3.6 has no
`references/` directory at all; run 2 did not lose its review, it re-created it by hand on Opus,
and cost less than run 1 with fewer Fable tokens because the escalation skipped the Fable
reviewer, so escalation did not invert the tiering; the bare arm's commit-hygiene comparison is
confounded, since three of four runs made one feature commit (including a bare one), the builder
brief steers towards one commit, and nothing in the loop checks a commit in isolation; the bare
lead's "checked green" claim is literally true and merely vacuous, not false; the NUL byte costs
the textual diff and `git grep`, not blame or patch transport; and the "43% off the lead's Fable"
figure is total Fable output, the lead's own output having fallen 67%. The token ledger assigned
every token in the four runs to a phase. Rates solved from the runs' own reported costs, verified
here to reproduce all six per-model figures exactly: Fable $10/M input, $50/M output, $0.25/M
cache read, $12.50/M 5-minute cache write, $20/M 1-hour; Opus $5/$25/$0.50/$6.25. The two are
inverted, Opus half on everything produced and Fable half on cache reads, so the in-loop
reviewer's $1.33 on Fable is $0.70 on Opus and the crossover needs 2.6M cache-read tokens, 26.7x
what that reviewer used. RESULTS.md and DEC-0016 corrected accordingly.

**CONFIRMED** (iteration 5, lever refutation and confound hunt) — The two passes that died on the
session limit, re-run batched (four agents instead of twenty-one), read-only. Ten efficiency
levers attacked on arithmetic and on quality cost: two survive (default the in-loop reviewer to
Opus, worth $1.33 and 159,865 Fable tokens per review round; tell the lead `args` is an object,
worth $0.16 per session), three overstated, five refuted. The confound hunt found six problems
that invalidate headline claims, all now in RESULTS.md: the bare arm ran with no plugin loaded at
all, so nothing can be attributed to the loop alone; decomposed by actor, delegation is +11% and
the review is the remaining +42 points of the +53%; the loop completed once, not twice, and that
run reached review only because its builder ignored the report opening `build.js` itself mandates
and then escalates on; the "+32% Fable cache writes" regression is inside the treatment arm's own
run-to-run range; the graded axis is saturated at 41/41 so it has no power; and the staged plugin
is the unadopted DEC-0015 trim, 141 lines against the shipped 227, whose `references/` directory
does not exist in 0.3.6, so the unreadable-reference defect has never shipped. The largest finding
was free and already on disk: every transcript carries the account's `rate_limit_event`
utilisation. Verified here from the four transcripts: over each arm's pair the five-hour window
moved +0.11 with fabflows against +0.10 bare (ratio 1.10), which tracks the Fable-token ratio
(1.08) and not total tokens (2.13) or list dollars (1.53). The subscription meter charges for the
lead's model and barely notices 1.7M Opus tokens, so the +53% list headline is not what this
account pays. `node --test "test/*.test.js"` 4 pass.

## 2026-09-21 — fabflows 0.3.7: harden the build loop on the benchmark's evidence

**PLANNED** — Implement DEC-0016 and DEC-0015 together on
`claude/fabflows-token-optimization-b4d2c5`. Six behaviour and prose changes: the escalation
condition stops reading the builder's prose and `saysDenied` only classifies the reason; the
builder brief distinguishes a denial that stopped the builder from one it worked around;
`reviewerModel` defaults to `opus`; a string `args` payload is parsed and fails safe to
`missing-args`; `escalate()` carries a one-line `next` per reason; the skill body is replaced with
the narrowed variant plus `references/build-loop.md`. Then the refuter's contradictory BLOCKED
rules, the editor's line-range demand, two comments the benchmark disproved, and the version.
Verify with `node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`
after every commit.

**CONFIRMED** — Seven commits, each green on both suites. Plugin suite 40 to 47 tests, root suite
4. New coverage: the string-args parser in four readable shapes and seven unreadable ones, a `next`
field on all eight escalation reasons with distinct text per reason, the five denial openings that
cost benchmark run 2 its review now asserted to reach review, and the reviewer override re-pointed
at a third model so it still proves the override once Opus is the default. Checked rather than
assumed: benchmark task 4 asks a session to bump 0.3.6 to 0.3.7, and a design review flagged that
shipping 0.3.7 would make it unpassable. It does not, because that task's fixture is pinned at
`3fbe15b`, where both manifests still read 0.3.6; `git show 3fbe15b:plugins/fabflows/.claude-plugin/plugin.json`
confirms it. No edit was needed. Pull request
https://github.com/kuan51/claude-skills/pull/45 opened before the records were accepted, so both
could carry its link.

**CONFIRMED** (decision records) — DEC-0015 and DEC-0016 moved from `proposed` to `accepted`, which
`plugins/docs-warden/skills/docs-warden/references/adr-format.md` defines as the sanctioned
transition; immutability starts at that commit, so it was made last and carries everything those
records will ever say. DEC-0016 argued for a minor bump to 0.4.0 and 0.3.7 shipped: the record now
states that, the reason, and leaves the original reasoning visible beneath it. `adr_index.py`
regenerated `docs/DECISIONS.md`, which shows the two as the only accepted records of sixteen.

## 2026-09-21 — ponytail review of the 0.3.7 diff: six cuts

**PLANNED** — Run a complexity review over the seven 0.3.7 commits and implement what it found.
Six findings: the `key: value` block parser in `build.js` is recovery for a shape the skill body
now tells the lead not to write; its trailing-comma and quote salvage is unreached by any test;
`NEXT[reason] || <generic>` in `escalate()` is a branch nothing calls; `references/build-loop.md`
restates four branches that `next` now carries; `build.test.js` walks the escalation scenarios in
two tables; and the `reviewerModel: 'fable'` case exercises the same branch as the `'sonnet'` case
above it. Verify with `node --test "plugins/fabflows/test/*.test.js"` and
`node --test "test/*.test.js"` after every commit.

**CONFIRMED** — Four commits, each green: `a276ae8`, `c2ab499`, `2c09b46`, `cb7175c`. Plugin suite
47 to 46 tests (two escalation tables became one), root suite 4. 59 lines net removed across
four files, 109 deleted against 50 added, measured with `git diff --stat 332ab25..HEAD`.
Checked by mutation rather than by reading: deleting `next` from `escalate()` fails the merged
table on its first row, so the folded assertions are not vacuous. `node --test
"plugins/fabflows/test/build.test.js"` with `next` removed reported 17 pass 1 fail, and 18 pass 0
fail once restored.

**CONFIRMED** (departure worth naming) — Narrowing the parser to JSON-only contradicts the
recommendation in `evals/RESULTS.md:148` and the consequence recorded in DEC-0016, both of which
argue that prose alone is not enough because `whenToUse` is reprinted inside the same Skill
expansion that generated the bad call, and both iteration-5 leads did write a `key: value` block.
What changed since is that the skill body now says to pass an object outright, and a block fails
loudly as `missing-args` rather than half-parsing. DEC-0016 is accepted and therefore immutable,
so the departure is recorded here rather than in the record. If a later run shows a lead losing a
turn to this again, the parser is the fix and this entry is the reason it was removed.

## 2026-09-22 — fabflows 0.4.0: brainstorming skill

**PLANNED** — Add `skills/brainstorming/SKILL.md` (sized request, worker-sourced facts,
bounded question rounds with recommended answers, expand-then-cut, a lens pass through the
refuter, a spec `fabflows:build` can take), teach `refuter.md` to review a spec instead of a
diff, pin both in `frontmatter.test.js`, bump to 0.4.0 across `plugin.json`,
`marketplace.json`, both READMEs and `CHANGELOG.md`, and record DEC-0017. Verify each commit
with `node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`, and
check the shipped skill names no third-party project with
`grep -rniE "superpowers|grill|gsd|get-shit-done|context-mode|interview-me|pocock|obra|sorbh|mksglu" plugins/fabflows/skills/brainstorming plugins/fabflows/agents/refuter.md`.

**CONFIRMED** — Four commits, each checked out alone in a scratch worktree and tested:
`4e8bf80` and `3d23311` printed `tests 46`, `fail 0`; `f4120f7` and `bc3e7f2` printed
`tests 47`, `fail 0` (the one new test). `node --test "test/*.test.js"` printed `fail 0` on all
four. The banned-name grep above printed nothing (exit 1). `wc -c` on the new SKILL.md printed
8426, under the 20,000 cap; its description is 984 characters. `adr_index.py .` reported 17
records.

**SKIPPED** — The skill was not exercised in a live session, and the skill-creator eval loop
(three test prompts with and without the skill, graded and reviewed) has not run yet. Both
need the plugin installed from this branch and a new session (CLAUDE.md, "Testing a plugin
change"); the eval loop is the next step on this branch.

## 2026-09-22 — fabflows 0.4.0: brainstorming eval, iteration 1

**PLANNED** — Run the three prompts in `skills/brainstorming/evals/evals.json` with and
without the skill as subagents, grade six assertions per run, aggregate with the
skill-creator's `scripts.aggregate_benchmark`, and rotate the run log past its 500-line rule.

**CONFIRMED** — Rotation: `wc -l docs/RUNLOG.md` printed 439 (from 643); 31 entry headings
before and after (9 here, 22 in `docs/runlog/2026-Q3.md`). Evals: `aggregate_benchmark` printed
`With Skill: 94.4% pass rate`, `Without Skill: 50.0% pass rate`, `Delta: +0.44`; per-eval grades
6/6, 6/6, 5/6 with the skill against 2/6, 2/6, 5/6 without; mean tokens 62,244 against 56,007
and mean time 45.8 s against 33.1 s. Summary and analyst notes are in
`skills/brainstorming/evals/iteration-1.md`; the review page and raw outputs stayed in the
session scratchpad.

**SKIPPED** — A subagent has no user to answer a round, so only the first reply was tested:
the cut, the lens pass through the refuter, and the written spec are unexercised. No
`SKILL.md` change was made from these results; that waits on the user's review feedback.

## 2026-09-22 — fabflows 0.4.0: bounded shortcut, eval iteration 2

**PLANNED** — Let the bounded tier print the spec block at once when nothing is left to ask,
then rerun the bounded prompt against a snapshot of the pre-change skill.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"` printed `pass 47`, `fail 0`
after the edit; `wc -c` on SKILL.md printed 8929. The banned-name grep over the skill
directory printed nothing once the eval assertion was reworded (it had listed the names).
`aggregate_benchmark` on iteration 2 printed `Old Skill: 83.3%`, `With Skill: 83.3%`,
`Delta: +0.00`; the new skill printed the full spec block in its first reply with zero
questions, the old skill deferred it a turn. Tokens 64,856 against 67,184. Notes in
`skills/brainstorming/evals/iteration-2.md`.

**SKIPPED** — One prompt, one run per configuration, first reply only. The state-block
assertion was not adjusted for the bounded shortcut, so the two 5/6 scores fail different
assertions; the eval, not the skill, is what iteration 3 should fix first.

## 2026-09-22 — fabflows 0.4.0: destructive-fixture cleanup, guard rule, eval iteration 3

**PLANNED** — Delete the `/tmp/tmp.KDPIjQRT7i/Makefile` left by an eval run (target body
`rm -rf ~`), sweep for others, add a guard rule that blocks a destructive command written
into a runner file, let the brainstorming skill allow only declared read-only spikes with
inert fixtures, add the matching eval assertions, and rerun the bounded prompt.

**CONFIRMED** — `cat -A` showed `nuke:$` / `^Irm -rf ~$`; `rm -r /tmp/tmp.KDPIjQRT7i`
and the empty scratch `mk/` repo removed. `grep -rlFf sweep-patterns.txt` (patterns:
`rm -rf`, `git push --force`, `mkfs`) over `/tmp` and the scratchpad, limited to Makefile,
`*.mk`, justfile, `*.sh`, `*.ps1`, printed nothing (exit 1), before and after iteration 3.
The first sweep attempt was itself blocked by the guard because the pattern text contained
`dd of=`; the pattern moved into a file. `node --test "plugins/fabflows/test/*.test.js"`
printed `tests 48`, `pass 48`, `fail 0` (one new table test, 12 cases); root suite `fail 0`.
The exact iteration-2 payload piped into the guard as a Write returned `permissionDecision:
deny`; the `echo would-delete` variant returned nothing. `aggregate_benchmark` on iteration 3
printed `With Skill: 100%`, `Old Skill: 87.5%`; notes in `skills/brainstorming/evals/iteration-3.md`.

**SKIPPED** — The run briefs forbade destructive fixtures, so iteration 3 does not show
whether the skill wording alone prevents them; the guard rule is the mechanical layer. Still
first reply only, one prompt, one run per configuration.

## 2026-09-22 — fabflows 0.4.0: ponytail review cuts

**CONFIRMED** — Eight cuts from `/ponytail-review` applied: one extension list feeds both
runner-file regexes, the notebook fallback and the chained unquoting strips are gone, the
refuter owns the lens list, the hard block is stated once, and the three eval write-ups
moved from `skills/brainstorming/evals/` (which installs into consumers' caches) to
`plugins/fabflows/evals/brainstorming/`. Earlier entries above cite the old path; they
were true when written. `node --test "plugins/fabflows/test/*.test.js"` printed `pass 48`,
`fail 0`; root suite `fail 0`. Net 16 lines fewer in code and skill.

**SKIPPED** (departure worth naming) — The file move landed inside commit `43c9666`
(the guard refactor) because `git mv` had staged it before that commit ran, so that commit
mixes a refactor with a docs move. History is pushed, so it stays as is.
