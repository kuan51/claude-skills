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

---

## 2026-09-10 — docs-warden 0.2.0: decision compaction

**PLANNED** — Add `adr_compact.py`, a SessionStart hook, and tests; verify with
`python3 plugins/docs-warden/test/test_scripts.py` and `node --test "test/*.test.js"`.

**CONFIRMED** — `python3 plugins/docs-warden/test/test_scripts.py` printed 68
PASS, 0 FAIL (63 existing + 5 new). `node --test "test/*.test.js"` printed
`# pass 4`, `# fail 0`. End-to-end in a scratch git repo with 50 records: the
hook printed its line, `adr_compact.py` moved 25 files into `archive/` as git
renames and wrote DEC-0051, `adr_index.py` reported 26 records, `audit.py`
showed `adr-immutability` and `adr-index` pass.

**SKIPPED** — The hook was not exercised through a real Claude Code session
start; skills and hooks load at startup, so that needs the plugin installed from
this branch and a new session (see CLAUDE.md, "Testing a plugin change").

## 2026-09-10 — docs-warden 0.2.0: review fixes on PR #22

**PLANNED** — Fix the seven `/code-review` findings (digest re-archived, archived
`../` links failing the audit, `superseded_by` missing from the digest, archive
overwrite on re-run, archived records outside the immutability check, hook and
script counting differently, fenced headings ending a section) and re-verify.

**CONFIRMED** — `python3 plugins/docs-warden/test/test_scripts.py` printed 72
PASS, 0 FAIL (4 new checks). `node --test "test/*.test.js"` printed `# pass 4`,
`# fail 0`. Re-ran the three-round scratch reproduction: no digest in
`archive/`, "Chose option 1." still at the top level, `links` pass, and the
digest line for DEC-0005 reads "superseded by DEC-0040".

## 2026-09-10 — docs-warden 0.2.0: over-engineering review cuts on PR #22

**PLANNED** — Apply the four cuts from the ponytail review: hook delegates to
`adr_compact.py --check`, inline the one-caller helper, print the mapping only
on dry run, drop the non-git rename fallback.

**CONFIRMED** — `python3 plugins/docs-warden/test/test_scripts.py` printed 72
PASS, 0 FAIL. `node --test "test/*.test.js"` printed `# fail 0`. The hook,
fed `{"cwd": <50-record folder>}`, printed the compaction line via `--check`.
Hook shrank from 36 to 17 lines.

## 2026-09-13 — fabflows 0.2.0: Fable lead, Opus build loop

**PLANNED** — Pin worker effort, add the `refuter` and `investigator` agents and the
`fabflows:build` workflow, update the skill and docs, and bump to 0.2.0. Verify
each commit with `node --test "plugins/fabflows/test/*.test.js"` and
`node --test "test/*.test.js"`.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"` printed `tests 28`,
`pass 28`, `fail 0`: the 18 existing tests plus 10 new (the `SubagentStop` matcher
check, the skill size check, and eight in `build.test.js`). `node --test
"test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. `adr_index.py` reported 4
records. Each commit was tested before it was made: 18, 19, 27 and 28 passing.

**SKIPPED** — Nothing was exercised in a real Claude Code session: the two new
agents, the effort pins, and a live `fabflows:build` run need the plugin installed
from this branch and a new session (see CLAUDE.md, "Testing a plugin change"). That
run should set `FABFLOWS_PROBE` to find out whether the guard fires inside workflow
agents, which DEC-0004 leaves open.

## 2026-09-13 — fabflows 0.2.0: over-engineering review cuts

**PLANNED** — Apply the ten cuts from the ponytail review: drop the stringified-args
parse, merge the two not-started exits, hard-code the rework cap, drop the schema
fields the script never reads, the `next` gate string, the `phase()` calls, the meta
test, and the explicit `undefined` effort entries, and shrink the README sections
that repeat the skill. Verify with `node --test "plugins/fabflows/test/*.test.js"`
and `node --test "test/*.test.js"`.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"` printed `tests 27`,
`pass 27`, `fail 0` (one fewer than before, because the meta test is gone). `node --test
"test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. A search of `plugins/fabflows`
for `maxRework`, `testOutput`, `deviations`, `GATE`, `phase(` and `result.next` found
nothing.

## 2026-09-13 — fabflows 0.2.0: branch review fixes

**PLANNED** — Fix what the three-agent branch review confirmed: `build.js` accepting an
ACCEPT that still lists must-fix items, escalate exits without the last verdict, the first
rework numbered round 2, the untrimmed branch name in the briefs, and six doc claims (the
editor description, a test comment on hooks in subagents, the README cache-TTL tip and
DEC-0004 link, the skill's compaction line, the CHANGELOG reviewer wording). Add a test
that fails without each fix. Verify with `node --test "plugins/fabflows/test/*.test.js"`,
`node --test "test/*.test.js"`, and a throwaway mutation probe re-run against the fixed
script.

**CONFIRMED** — The new accept-with-must-fix test failed first against the old script
(`actual: 'accepted'`, `expected: 'escalate'`), then passed after the fix. After all three
commits, `node --test "plugins/fabflows/test/*.test.js"` printed `tests 30`, `pass 30`,
`fail 0`, and `node --test "test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. The
mutation probe (a scratchpad script that breaks one piece of `build.js` at a time and runs
`build.test.js` against it) reported all 14 mutants killed with the baseline green;
before these tests the suite killed 2 of 10. The five design gaps the review raised were
not fixed here; each went to its own brainstorming session.

## 2026-09-13 — fabflows 0.2.0: the refuter can answer BLOCKED

**PLANNED** — Add `BLOCKED` to the build loop's review verdict so a reviewer that cannot
run the diff or the test command escalates with reason `reviewer-blocked` instead of
accepting untested work or asking for rework the builder cannot do. Update `refuter.md`,
the skill's build-loop section, the changelog, and record the choice as DEC-0005. Verify
with `node --test "plugins/fabflows/test/*.test.js"`, `node --test "test/*.test.js"`, and
the scratchpad mutation probe.

**CONFIRMED** — The new BLOCKED tests failed first against the old loop (`actual:
'rework-without-must-fix'`, `expected: 'reviewer-blocked'`), then passed after the change.
`node --test "plugins/fabflows/test/*.test.js"` printed `tests 31`, `pass 31`, `fail 0`;
`node --test "test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. The mutation probe,
with two new mutants (the BLOCKED check removed, BLOCKED dropped from the review brief),
reported all 16 killed with the baseline green. `adr_new.py` created DEC-0005 and
`adr_index.py` rebuilt the index.

**SKIPPED** — No live run: whether a real refuter answers BLOCKED when its test command
is missing needs the plugin installed from this branch and a new session, as the earlier
SKIPPED entry for 0.2.0 already notes.

## 2026-09-13 — fabflows 0.2.0: a build run that throws

**PLANNED** — Close the review gap where an `agent()` throw in `fabflows:build` (a spent
`+Nk` budget) ends the run in a workflow error instead of an `escalate` result. No code
change: add one paragraph to the skill's build-loop section telling the lead to read
`git log <baseRef>..HEAD`, resume with `resumeFromRunId`, and never restart with a fresh
`baseRef`, and record why in DEC-0007 (numbered by hand -- DEC-0005 and DEC-0006 are taken
on sibling branches). Verify with `node --test "plugins/fabflows/test/*.test.js"`,
`node --test "test/*.test.js"`, and
`python plugins/docs-warden/skills/docs-warden/scripts/adr_index.py .` leaving no diff
beyond the new row.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"` printed `tests 30`,
`pass 30`, `fail 0`, and `node --test "test/*.test.js"` printed `tests 4`, `pass 4`,
`fail 0`. `python plugins/docs-warden/skills/docs-warden/scripts/adr_index.py .` printed
`5 record(s)`; `git diff docs/DECISIONS.md` showed only the new DEC-0007 row, and
`docs/decisions/README.md` was unchanged. `adr_new.py` has no option for the number, so it
scaffolded DEC-0005 and the record was rewritten as DEC-0007 by hand.

**SKIPPED** — No live run. Nothing here made `fabflows:build` throw and then resumed it
with `resumeFromRunId`, so DEC-0007's claim that finished rounds replay from cache after a
throw is inferred from the Workflow reference, not observed.

## 2026-09-13 — fabflows 0.2.0: uncommitted work can pass review

**PLANNED** — Close the dirty-tree gap: the refuter reviews `git diff <baseRef>..HEAD`
but runs the tests against the working tree, so work the builder left uncommitted passes
both. Tell the builder to leave `git status --porcelain` empty before reporting done,
make every path it prints a must-fix in the review brief (checked before the tests run),
stop the rework brief claiming earlier commits exist, and add the same check to the
lead's gate in the skill. Record the design as DEC-0005. Write the brief assertions in
`build.test.js` first and watch them fail. Verify with `node --test
"plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`.

**CONFIRMED** — The new test failed first against the old script (`build:1 brief must
check the tree`, `expected: /git status --porcelain/`), then passed after the brief
edits. `node --test "plugins/fabflows/test/*.test.js"` printed `tests 31`, `pass 31`,
`fail 0`, and `node --test "test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`.
`adr_new.py` scaffolded DEC-0005 and `adr_index.py` reported 5 records. No version bump:
master is on fabflows 0.1.0 and 0.2.0 is unreleased.

## 2026-09-13 — fabflows: renumber the dirty-tree decision record

**PLANNED** — PR #23 (fabflows 0.2.0 plus the refuter's BLOCKED verdict) already adds a
DEC-0005, and sibling PRs #27, #24 and #26 took DEC-0006 to DEC-0008, so this branch's
record moves to DEC-0009. Rename the file with `git mv`, change its `id` and heading,
regenerate `docs/DECISIONS.md` with `adr_index.py`, and retarget PR #25 onto #23's
branch, `claude/fabflows-reviewer-blocked`. The entry above that names DEC-0005 stays as
written: it was true when logged. Verify with `adr_index.py` and `node --test
"plugins/fabflows/test/*.test.js"`.

**CONFIRMED** — `adr_index.py` reported 5 records, and `docs/DECISIONS.md` lists
DEC-0009 with no DEC-0005 row. `node --test "plugins/fabflows/test/*.test.js"` printed
`tests 31`, `pass 31`, `fail 0`, and `node --test "test/*.test.js"` printed `tests 4`,
`pass 4`, `fail 0`. `gh pr view 25` printed `base=claude/fabflows-reviewer-blocked
commits=1` after the retarget. The merge base with #23's branch is `ea72d41`: a local
`git fetch` of that branch failed with a connection reset, but #23's commit list on
GitHub contains `ea72d41` and none of this branch's commits. The branch this PR first
targeted, `claude/fabflows-plugin-design-5bb9a2`, was pushed by mistake (it duplicates
#23's commits) and was deleted from origin; `git ls-remote` no longer finds it.

## 2026-09-13 — fabflows 0.2.0: fence the must-fix list in rework briefs

**PLANNED** — Close the gap where a REWORK verdict's findings entered the next builder's
brief unmarked, inside its Objective. `buildBrief()` moves them into a `<must-fix>` block
after the spec, labels it as the reviewer's findings to be treated as data, tells the
builder to report any item the spec does not need instead of doing it, and strips
`must-fix` tags from finding text so it cannot close the fence. Record the choice as
DEC-0008. Add a test that fails against the unfenced brief. Verify with
`node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`.

**CONFIRMED** — Against the old `buildBrief()`, the new test failed on its fence match
(`actual: null`, `expected: true`). After the fix, `node --test
"plugins/fabflows/test/*.test.js"` printed `tests 31`, `pass 31`, `fail 0`, and `node --test
"test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. A throwaway mutation probe (a
scratchpad copy of `build.js` broken one piece at a time, run against the fence test)
killed all three mutants -- `unfence` made a no-op, the fence dropped, the data label
dropped -- with the baseline green. `adr_index.py . --check` printed `index up to date
(5 record(s))`. After rebasing onto the BLOCKED-verdict branch (PR #23), the same two
commands printed `tests 32`, `pass 32`, `fail 0` and `tests 4`, `pass 4`, `fail 0`, the
probe again killed all three mutants, and the regenerated index held 6 records.

**SKIPPED** — vale on DEC-0008. It stopped with `'Project' vocabulary not found`, and the
Microsoft and write-good packages are absent from the tree; fetching them needs
`vale sync`, a download. A search of the record for spaced em dashes, the error the
earlier records were fixed for, found none.

## 2026-09-13 — fabflows 0.2.0: a contradictory builder reply escalates

**PLANNED** — A stub run of `build.js` showed a builder reply of `done` with a `blocker`,
`done` with an empty report, and `done` with a permission denial only in its report all
ending `accepted`. Make the loop escalate any reply that names a blocker, add `minLength: 1`
to the shared report schema, tell the builder a permission denial is a blocker, and tell the
lead where the builder's blocker lives on escalation. Record it as DEC-0006. Verify with
`node --test "plugins/fabflows/test/*.test.js"` (the new tests failing first) and
`node --test "test/*.test.js"`.

**CONFIRMED** — Against the old loop the new assertions failed (`actual: 'accepted'`,
`expected: 'escalate'`; `actual: 'reviewer-failed'`, `expected: 'blocked'`; `minLength`
`actual: undefined`, `expected: 1`), then passed after the change.
`node --test "plugins/fabflows/test/*.test.js"` printed `tests 31`, `pass 31`, `fail 0`;
`node --test "test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`. Re-running the
scratchpad stub script on the new `build.js`: `done` with a blocker now escalates after one
call; `done` with an empty report and `done` with a denial only in the report still end
`accepted` there, because stubs skip schema validation and the loop reads no prose -- both
recorded as gaps in DEC-0006. `adr_new.py` numbered the record DEC-0005, since this branch
lacks the sibling's DEC-0005; it was renamed to DEC-0006 and `adr_index.py` rebuilt the index.
After rebasing onto `claude/fabflows-reviewer-blocked` (PR #23) and resolving the SKILL.md,
run-log and index conflicts, `node --test "plugins/fabflows/test/*.test.js"` printed
`tests 32`, `pass 32`, `fail 0` and `node --test "test/*.test.js"` printed `tests 4`,
`pass 4`, `fail 0`; `python3 plugins/docs-warden/skills/docs-warden/scripts/audit.py .`
passed `adr-index` and `links` (96 relative links).

**SKIPPED** — No live run: whether the runtime enforces `minLength`, and whether a real
builder puts a permission denial in `blocker`, needs the plugin installed from this branch
and a new session.

## 2026-09-13 — fabflows 0.2.0: close DEC-0006's three builder-reply gaps

**PLANNED** — DEC-0006 left three builder replies the loop could not act on: `done` with an
empty report ends `accepted` against the stubs, `done` with a permission denial only in the
report ends `accepted`, and `blocked` with no blocker escalates with no reason. Make the loop
escalate an empty or blank report and a reason-less `blocked` as `unexplained`, and treat a
denial on the report's first non-blank line -- where the report contract puts it -- as
`blocked`. Tell the builder to quote a denial there too, and tell the lead what `unexplained`
means. No decision record: reversing it is one pull request, so the admission test says no.
Verify with `node --test "plugins/fabflows/test/*.test.js"` (the new tests failing first),
`node --test "test/*.test.js"`, and `python3 plugins/docs-warden/skills/docs-warden/scripts/audit.py .`.

**CONFIRMED** — Before the change, `node --test "plugins/fabflows/test/*.test.js"` failed on
the new assertions (`actual: undefined`, `expected: 'unexplained'` for an empty report that
ended `accepted`; `actual: 'reviewer-failed'`, `expected: 'blocked'` for a denial in the
report that went to review). After it, the same command printed `tests 35`, `pass 35`,
`fail 0`, and `node --test "test/*.test.js"` printed `tests 4`, `pass 4`, `fail 0`.
`audit.py .` passed `adr-index` and `links` (87 relative links). Its `lint` check failed;
`markdownlint-cli2` on the three touched Markdown files reports only
`docs/RUNLOG.md:197` MD018, which predates this entry.

**SKIPPED** — No live run: whether the runtime enforces `minLength`, and whether a real
builder puts a denial on its report's first line, needs the plugin installed from this
branch and a new session. Vale not run: it stops on the missing `Project` vocabulary.

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
manifests, and record DEC-0010. Verify with
`node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`, then
exercise the skill from a session started with the plugin installed from this branch,
since skills load at session start and the unit tests only read the file.
