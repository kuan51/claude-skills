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

## 2026-09-13 — fabflows 0.2.0: anchor the builder denial check

**PLANNED** — A review of PR #30 probed `saysDenied` and found it misfires both ways: a
first line such as `Permission denied: none of the tests could run` was exempted by the word
"none", and ordinary first lines such as `Files touched: src/auth/deny.js:4` or
`Implemented the --blocked flag` escalated a clean build. The skill also stopped telling the
lead to read the builder's report on escalation. Count a denial only when the first line
starts with one, exempt a line only when it says there is none, have the brief tell the
builder to start the report with `Permission denied:`, and restore "read the report" in the
skill. Verify with `node --test "plugins/fabflows/test/*.test.js"` (the new cases failing
first) and `node --test "test/*.test.js"`.

**CONFIRMED** — Before the fix, `node --test "plugins/fabflows/test/*.test.js"` printed
`pass 34`, `fail 1`: `Permission denied: none of the tests could run` gave `actual: undefined`,
`expected: 'blocked'`. After it, the same command printed `tests 35`, `pass 35`, `fail 0`, and
`node --test "test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. A scratchpad probe of
`saysDenied` returned true for the two "none" denials, `**Permission denied:** …` and
`- Permission denied: no network`, and false for `deny.js`, `blocked-users.ts`,
`--blocked`, `No permission denials.`, `Blocked: none`, `Permission denials: 0` and an
empty line. `markdownlint-cli2` on the touched Markdown files still reports only the older
`docs/RUNLOG.md:197` MD018.

## 2026-09-13 — docs-warden 0.3.0: proselint and ai-tells trial run

**PLANNED** — Add proselint (pinned v0.3.4) and ai-tells (pinned v1.35.0) to the
root `.vale.ini`, run `vale sync`, then lint this repo's Markdown to see which
rules fire. Rules wrong for technical docs or duplicating a loaded rule get
turned off; the result is copied into the two shipped `.vale.ini` files.
ai-tells stays at `error` by the user's choice.

**CONFIRMED** — `vale sync` printed "Synced 4 package(s)". `vale
--output=JSON --minAlertLevel=suggestion` over `git ls-files '*.md'` (137
files, `styles/`, `.claude/` and `before-after.md` left out) reported 7119
alerts. ai-tells: 2435 errors in 127 files, led by `EmDashUsage` (622),
`DoubleHyphen` (438), `ColonUsage` (243) and `SemicolonUsage` (144). proselint:
26 errors (`Typography` 17, `Very` 7). Existing config already reports 757
Microsoft errors, 586 of them `Microsoft.Dashes`. 27 of proselint's 28 rules
with a level set are `error`. Result went to the user before any rule was
turned off.

## 2026-09-14 — docs-warden 0.3.0: Vale doc pass

**PLANNED** — Reword every living document to zero error-level Vale alerts under
the new config, without changing meaning. Historical documents (dated plans,
decision records, run logs, changelogs) and test fixtures skip the two new
packages and are not reworded. Verify with a full `vale --minAlertLevel=error`
sweep over the living documents and every test suite.

**CONFIRMED** — `vale --minAlertLevel=error --output=line` over every tracked
Markdown file outside `docs/superpowers/`, `docs/decisions/`, `docs/RUNLOG.md`,
`CHANGELOG.md` and the docs-warden test fixtures (87 files) printed nothing.
`vale ls-config` parsed all three configs, the two shipped copies through scratch
copies pointed at the synced styles, each with 13 rules at warning.
`node --test "test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. Per-plugin
`node --test` printed ciso 295/295, data-analysis-review 19/19 and fabflows 35/35.
`python plugins/docs-warden/test/test_scripts.py` printed 72 PASS, 0 FAIL.

**SKIPPED** — The plugins were not installed from this branch into a new session,
so the reworded skills were not exercised through a real session start.

## 2026-09-14 — docs-warden 0.3.0: default the new Vale packages to warning

**PLANNED** — Change the three Vale configs (repo root, the docs-warden lint asset,
the clarity asset) so `proselint` and `ai-tells` default to `warning` as a whole,
with a short list of punctuation and filler `ai-tells` rules, plus
`proselint.Uncomparables` and `proselint.CorporateSpeak`, promoted back to `error`
in the repo root config only; the two shipped asset copies stay at warning
throughout. Verify with `vale ls-config` on each config,
`vale --minAlertLevel=error --output=line` over the living-doc list,
`node --test "test/*.test.js"` and `python plugins/docs-warden/test/test_scripts.py`.

**CONFIRMED** — A probe first showed that a `Style = level` or `Style.Rule = level`
line in `[*.md]` turns that style or rule on in every section, whatever its
`BasedOnStyles` says. Each exempt section therefore also sets `proselint = NO`,
`ai-tells = NO` and a `NO` line per promoted rule. With that in place:
`vale ls-config` parses all three configs (shipped copies via scratch copies
pointed at the synced styles). `vale --minAlertLevel=error --output=line` over
the 87 living documents printed nothing and exited 0. `vale
--minAlertLevel=suggestion --output=JSON` on `docs/DECISIONS.md`, `docs/RUNLOG.md`,
`CHANGELOG.md`, `before-after.md`, `evals/README.md` and two fixtures reported no
`proselint` or `ai-tells` alert under any of the three configs. `node --test
"test/*.test.js"`: 4 pass, 0 fail. `python plugins/docs-warden/test/test_scripts.py`:
72 PASS, 0 FAIL.

**CONFIRMED** — Correction to the plugin test counts above: `node --test` run inside
`plugins/ciso`, `plugins/data-analysis-review` and `plugins/fabflows` prints 296, 20
and 36, not 295, 19 and 35. The extra one in each is `test/helpers/frontmatter.js`,
which the runner picks up as a test file. All pass.

---

## 2026-09-15 — fabflows 0.2.4: guard blocked read-only `~/.claude` access

**PLANNED** — Reproduce the denial of a read-only inspection of the plugin cache,
widen the guard's read-only shell allowlist, and re-run
`node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`.

**CONFIRMED** — Piping
`{"tool_name":"Bash","tool_input":{"command":"for d in ~/.claude/plugins/cache/claude-skills/docs-warden/*/; do cat \"$d/.claude-plugin/plugin.json\"; done"}}`
into `node plugins/fabflows/hooks/guard.js` printed the deny about modifying live
configuration; `sort ~/.claude/plugins/config.json` and `awk ... ~/.claude/plugins/x`
denied the same way. After the change the loop, `sort` and `basename` print nothing
(allow), while `while read l; do rm -rf ~/.claude/plugins; done`,
`for d in x; do echo "{}" > ~/.claude/settings.json; done` and
`for f in $(ls ~/.claude/plugins/ ); do echo $f; done` still deny.
`node --test "plugins/fabflows/test/*.test.js"`: 35 pass, 0 fail.
`node --test "test/*.test.js"`: 4 pass, 0 fail.

**SKIPPED** — `awk` and `sed` were left off the allowlist, so they still deny when
they name a protected path. Both can write (`sed -i`, `print > file`), and the
readers already on the list cover the same inspection.

**CONFIRMED** — `npx -y markdownlint-cli2` over the repo reports no error in the
`CHANGELOG.md` or `docs/RUNLOG.md` lines this change added. The one `docs/RUNLOG.md`
hit (line 197, MD018) predates it, as do the other 282 errors repo-wide.

**SKIPPED** — `vale` and `lychee` were not run: neither binary is installed in this
container and installing it is blocked. `.pre-commit-config.yaml` calls them "the same
three linters as CI", but no workflow is tracked under `.github/`, so nothing runs them
on a pull request either.

**CONFIRMED** — Two code reviews found the first cut of the allowlist opened three holes.
Piping payloads into `guard.js` at `5e28b48` versus the pre-branch copy
(`git show d68ef6b:plugins/fabflows/hooks/guard.js`) reproduced all of them:
`sort -o ~/.claude/hooks/guard.js /dev/null` and `uniq evil.json ~/.claude/settings.json`
allowed at HEAD, denied before; `for d in ~/.claude/plugins; do rm -rf "$d"; done`
likewise, since the loop variable hides the path from `RM_DANGER`.
`elif npm install evil; then echo x; fi` allowed at both, so that one is older than the
branch. After the fix all four deny, while the loop from the original report,
`until grep -q x ~/.claude/settings.json; do echo w; done`,
`while read l; do echo $l; done < ~/.claude/settings.json` and
`cut -d: -f1 ~/.claude/plugins/config.json` allow.
`node --test "plugins/fabflows/test/*.test.js"`: 35 pass, 0 fail.
`node --test "test/*.test.js"`: 4 pass, 0 fail.

## 2026-09-16 — fabflows 0.3.0: using-fabflows entrypoint

**PLANNED** — Add the `using-fabflows` entrypoint skill, point the `fabflows` skill at it
as the session's standing opt-in to `fabflows:build`, bump the plugin to 0.3.0 in both
manifests, and record DEC-0011. Verify with
`node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`, then
exercise the skill from a session started with the plugin installed from this branch,
since skills load at session start and the unit tests only read the file.

**CONFIRMED** — The change was built by `fabflows:build` (one round, ACCEPT) and gated
by the lead: `git status --porcelain` printed nothing; `git diff --stat 9ed4312..HEAD`
listed eleven files, all named in the spec.
`node --test "plugins/fabflows/test/*.test.js"`: 36 pass, 0 fail.
`node --test "test/*.test.js"`: 4 pass, 0 fail.

**SKIPPED** — The skill was not invoked from a live session: skills load at session
start, so that needs the plugin installed from this branch and a restart.

## 2026-09-16 — fabflows: renumber the entrypoint decision record

**PLANNED** — PR #37 (docs-warden 0.4.0) merged to master with its own DEC-0010, so this
branch's using-fabflows record moves to DEC-0011. Merge `origin/master` into
`claude/jolly-ride-bk44f7`, rename the file with `git mv`, change its `id` and heading,
update the CHANGELOG and RUNLOG references, and regenerate `docs/DECISIONS.md` with
`adr_index.py`. The PLANNED entry above that names DEC-0010 is corrected in place since
it was never true on master. Verify with `adr_index.py`, `node --test
"test/*.test.js"`, `node --test "plugins/fabflows/test/*.test.js"` and
`python3 plugins/docs-warden/test/test_scripts.py`.

**CONFIRMED** — `adr_index.py` reported 11 records; `docs/DECISIONS.md` lists DEC-0011
above master's DEC-0010 with no duplicate ID. `node --test "test/*.test.js"`: 4 pass,
0 fail. `node --test "plugins/fabflows/test/*.test.js"`: 36 pass, 0 fail.
`python3 plugins/docs-warden/test/test_scripts.py`: 78 PASS, 0 FAIL, exit 0.

## 2026-09-16 — fabflows 0.3.1: bare assignment naming the plugin cache

**PLANNED** — The guard denied a docs-warden scaffold command whose first line only
assigned the plugin-cache scripts path to a shell variable. Reproduce with a scratch
script that pipes that command into `hooks/guard.js`, widen the `VAR=value` prefix strip
to also match at end of segment, add three table rows to `test/guard.test.js`, bump
both manifests to 0.3.1, and verify with `node --test "plugins/fabflows/test/*.test.js"`
and `node --test "test/*.test.js"`.

**CONFIRMED** — Repro script: reported command and bare quoted assignment DENY before,
allow after; assignment with substitution or redirect still DENY.
`node --test "plugins/fabflows/test/*.test.js"`: 36 pass, 0 fail.
`node --test "test/*.test.js"`: 4 pass, 0 fail.

**SKIPPED** — Not exercised from a live session with 0.3.1 installed: the hook loads at
session start, so that needs the cache copy and a restart.

## 2026-09-16 — fabflows 0.3.2: read-only loop over the plugin cache

**PLANNED** — The guard denied a `for` loop that only listed docs-warden versions in the
plugin cache. Two body segments read as not read-only: `v=$(grep ...` lost its command
to the `VAR=value` strip, and `echo "... -> ..."` counted a quoted `>` as a redirect.
Add the reported command and three deny rows to `test/guard.test.js` and see them fail,
strip `VAR=$(` as a unit, ignore `>` inside quotes, bump both manifests to 0.3.2, and
verify with `node --test "plugins/fabflows/test/*.test.js"` and
`node --test "test/*.test.js"`.

**CONFIRMED** — Before the fix the reported command row got `deny`, expected `allow`.
After: `node --test "plugins/fabflows/test/*.test.js"`: 37 pass, 0 fail.
`node --test "test/*.test.js"`: 4 pass, 0 fail. `S=$(npm install evil)`, which slipped
past the install rule before, is now denied.

**SKIPPED** — Not exercised from a live session with 0.3.2 installed: the hook loads at
session start, so that needs the cache copy and a restart.

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
