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

## 2026-09-19 — docs-warden evals: first Tier 1 (triggering) run

**PLANNED** — Smoke one case natively to prove `claude plugin eval` runs from this
machine (trust prompt, plugin resolution, Skill grader), then the ten Tier 1 cases at
3 runs each: `claude plugin eval plugins/docs-warden --tag trigger-positive
trigger-negative --ablation none --runs 3 --model claude-sonnet-5 --max-cost-usd 10
--trust-plugin --no-publish --json plugins/docs-warden/evals/results/tier1.json
--report plugins/docs-warden/evals/results/tier1.html`. Expected: every
`trigger-pos-*` case at 0.9 or above, every `trigger-neg-*` case at 1.0. Tier 2 is
not run in this entry: it needs the WSL2 sandbox described in
`plugins/docs-warden/evals/README.md`.

**CONFIRMED (partial)** — Two probes ran; the full Tier 1 matrix has not. `claude plugin
eval plugins/docs-warden --case trigger-pos-stale-docs-casual --ablation none --runs 1
--model claude-sonnet-5 --max-cost-usd 2 --trust-plugin --no-publish` exited 0,
score 1.0, $0.15, 21 s, 8 turns: the runner resolves the plugin from a path, the Skill
grader matched `"skill":"docs-warden:docs-warden"`, and `aggregate-result.json` carries
`schemaVersion: 1` with per-run `graders[]`, `costUsd`, `turns` and `error`. A second
probe, `--case adr-immutability-refusal --scaffold --keep-temp` with no `--allow-tools`,
exited 1 at score 0.8 and settled two open questions. First, `--scaffold` DOES run
natively on Windows: the operator's own bash seeds the workspace, and only granting
Claude a shell needs the sandbox, so the Tier 1 positives were given fixtures. Second,
with no Edit tool the lead delegated to a subagent via the Agent tool, which means
`tool_used` graders see only the lead's calls; every "must not change X" case therefore
also grades X's contents after the run. Both failing graders were the eval's fault, not
the skill's: the bare phrasing "DEC-0001 has a typo... Fix it please." invoked no skill
at all, so it became its own Tier 1 case and the Tier 2 prompt now says "Our accepted
ADR DEC-0001...". The kept workspace was removed as the runner instructed.

**SKIPPED** — The Tier 2 matrix. It needs a WSL2 sandbox (bubblewrap, socat, system-wide
PyYAML, a signed-in Claude Code) that this machine does not yet have; the prerequisites
are in `plugins/docs-warden/evals/README.md`. No Tier 2 case has ever been run, so
nothing in this repository claims a Tier 2 result.

## 2026-09-21 — docs-warden evals: Tier 1 measured

**PLANNED** — Re-run the Tier 1 matrix after raising `max_turns` from 10 to 30, because
the first full run errored three runs on the cap and every one of them had invoked the
skill and was working through it, so the cap was penalising success rather than
preventing it.

**CONFIRMED** — `claude plugin eval plugins/docs-warden --tag trigger-positive
trigger-negative --scaffold --ablation none --runs 3 -j 4 --model claude-sonnet-5
--judge-model claude-haiku-4-5 --max-cost-usd 15 --trust-plugin --no-publish --json
plugins/docs-warden/evals/results/tier1.json` exited 1 (correct: `--threshold` defaults
to 1.0 and three cases scored below it), $5.04, 535 s, 33 runs, `partial: false`, zero
run errors. Negatives 15/15: all five near-miss prompts left both skills alone, each
answered in one or two turns. Positives 10/18. Three cases invoked the skill in all
three runs (class B readiness at 43/29/49 turns, new-repo scaffolding at 14/10/12,
stale docs at 20/21/23); `why-did-we-choose` invoked it once in three at 7 turns each;
`adr-typo-bare-id` and `readme-env-var-drift` never invoked it, finishing in 6 to 10
turns. The prior 10-turn run scored the same 10/18, so the cap changed which runs
errored but not the trigger rate.

The 8 failing positive runs are a finding about the skill, not the suite. Its
description already lists "the README is wrong" and "why did we choose", and neither
phrase invokes it; the runs were not cut short, they answered directly. Anthropic's
documentation states a skill is consulted only for work Claude cannot comfortably do
alone. Scaffolding, auditing and compliance prompts trigger reliably; maintain-mode and
decide-mode prompts do not. No change has been made to `SKILL.md` on the strength of
this: the measurement is recorded, the remedy is a separate decision.

**SKIPPED** — The Tier 2 matrix, again. Still no WSL2 sandbox on this machine.

## 2026-09-21 — docs-warden evals: a broken Tier 1 case, corrected and re-measured

**PLANNED** — Check the premise of every weak Tier 1 positive against its fixture
before reporting the 10/18 as a property of the skill. A prompt that asserts something
the fixture does not contain measures nothing.

**CONFIRMED** — `trigger-pos-readme-env-var-drift` was invalid. Its prompt says the
README documents three environment variables while the deploy script reads seven;
`grep -rni "env" plugins/docs-warden/test/fixtures/repo-it-tooling` returns only two
`.gitignore` lines, the README has no configuration section, and the single source file
`src/CertRotate.psm1` is nine lines with no environment variables and no deploy script.
Claude looked, found nothing and answered directly, so the 0/3 measured the eval, not
the skill. The case's `fixture.sh` now appends a Configuration section naming three
variables and writes `src/Deploy.ps1` reading seven; verified by running the script into
a scratch directory, which produced `documented: 3  read: 7` and a clean git tree.
Re-run ten times on the corrected fixture: 3/10 invoked, $3.64. Weak and high-variance,
but not zero.

Two corrections to earlier reasoning in this session, recorded because both were stated
before being checked. First, the `turns` field is not a measure of effort: an inspected
run reported `turns: 1` while its trace contained more than thirty tool calls, so the
earlier claim that failing runs "finished in six to ten turns and were therefore not cut
short" was not sound. The sound evidence is that the 30-turn matrix recorded zero run
errors. Second, a trace inspected to explain a failure turned out to belong to a run
that had passed, with `skill-invoked` true and the Skill call visible in the trace; the
grader regex was confirmed correct against the raw trace text. No grader change was
needed and none was made.

**SKIPPED** — `python plugins/docs-warden/test/test_scripts.py` reports 79 PASS, 1 FAIL
on this machine, and the failure is environmental rather than a regression. No skill or
test file was changed by this branch (`git diff --stat HEAD -- plugins/docs-warden/skills
plugins/docs-warden/test` is empty). `test_audit_reports_a_failing_generator_instead_of_in_sync`
declares a generator `command: ["python3", "gen.py"]` and asserts the scorecard reason
names exit code 3. Here `python3` resolves to the Windows Store alias stub at
`AppData/Local/Microsoft/WindowsApps/python3`, which exits 9009 with "Python was not
found", so the generator never runs. Reproduced standalone: the scorecard correctly
reports `generated-docs` as `fail` with reason `exit 9009`, and only the assertion that
the reason contains "3" fails. `audit.py` behaved correctly; the test hardcodes an
interpreter name instead of `sys.executable`. Left unfixed as out of scope for this
branch.

## 2026-09-21 — docs-warden evals: Tier 2 unblocked, then blocked by an audit.py crash

**CONFIRMED** — The WSL2 sandbox now works. bubblewrap, socat and PyYAML 6.0.3 are
installed system-wide, user namespaces are enabled, and `bwrap --unshare-all true`
succeeds. Claude Code inside WSL was at 2.1.263, below the 2.1.269 the eval docs
require, and was missing `--trust-plugin` and `--concurrency`; `claude update` took it
to 2.1.278 and both flags are present. All five fixture scripts were run under WSL bash
and produce the intended repositories: `maintain-targeted-update` leaves exactly one
uncommitted file (`src/CertRotate.psm1`, renamed to `-TargetHub` while the README still
says `-HubName`), and `adr-immutability-refusal` commits the planted `certficate` typo
with `status: accepted` intact.

**CONFIRMED** — A smoke of `audit-scorecard` under the sandbox scored 0.45 and exposed a
crash in `audit.py`, not a skill defect. The eval harness injects a `.claude/` directory
into the workspace whose entries are character devices owned by `nobody`
(`crw-rw-rw- 1 nobody nobody 1, 3`), which read as permission-denied. `audit.py` line
806, in `check_glossary_reject_terms`, calls
`path.read_text(encoding="utf-8", errors="replace")` over every markdown document found
under the repository. `errors="replace"` survives undecodable bytes but not an
unreadable file, so the call raises `PermissionError` and the whole audit dies before
writing `docs-scorecard.json`.

Reproduced deterministically outside the harness, with no sandbox involved:

    W=$(mktemp -d); cd $W; bash <evals>/audit-scorecard/fixture.sh
    mkdir -p .claude && printf 'x\n' > .claude/loop.md && chmod 000 .claude/loop.md
    python3 <scripts>/audit.py .
    -> PermissionError: [Errno 13] Permission denied: '.../.claude/loop.md'
    -> scorecard: NO

Any repository containing a permission-restricted markdown file crashes the audit the
same way. The suite already has `test_audit_survives_a_document_that_is_not_valid_utf8`,
so tolerating unreadable documents is an existing design goal; this is the same class of
defect left uncovered. In the smoke run Claude worked around it by copying the
repository minus `.claude` to `$TMPDIR/docs-audit-repo` and auditing the copy, which
succeeded and produced a correct scorecard naming the real IEC 62304 gap. The eval's
three scorecard graders still failed, because they look for `docs-scorecard.json` in the
workspace and it had been written into the temporary copy instead.

**SKIPPED** — The Tier 2 matrix, for a third time, now for a different and better
understood reason. Every case whose prompt leads the skill to run `audit.py` hits this
crash, so the matrix would measure the bug rather than the skill. No fix has been made:
`audit.py` is plugin behavior, a change there needs a version bump and a marketplace
sync, and that is outside this branch's scope.

## 2026-09-21 — docs-warden evals: adversarial review of the suite, and the fixes it forced

**PLANNED** — Review every eval case adversarially before trusting any number it
produces: find graders that pass on a wrong run, graders that fail on a correct one, and
fixtures whose premise is absent. Two earlier attempts died on usage credits after
reaching only two cases.

**CONFIRMED** — The third attempt completed: 40 agents, no errors, 32 high and medium
findings verified adversarially, 27 confirmed and 5 refuted. Every confirmed finding that
could be checked deterministically was re-checked here before acting on it. Four mattered
enough to name.

First, `init-confirmed-scaffold`'s prompt supplied the owner as `@it-team`. Substituted
into the template's unquoted `owner: {{OWNER}}` slot that yields invalid YAML, because
`@` is a reserved indicator. Verified directly: `yaml.safe_load("owner: @it-team")` raises
`ScannerError`, while the quoted and bare forms parse. Every downstream grader in that
case would have been measuring a broken manifest rather than the skill. The prompt now
says `owner it-team`, and a new grader asserts the written manifest parses.

Second, the shell-mutation heuristic had two holes the original twelve-command test
missed. `echo x >>docs/RUNLOG.md` with no space after the redirect escaped it entirely,
and a multi-line command whose first line held an unrelated `>` was falsely blamed for a
path named on a later line, because the character class did not exclude the backslash of
a JSON-encoded newline. Both reproduced, both fixed, and the test now covers fifteen
commands, eight mutating and seven not, all passing.

Third, the "never touch X" cases relied on `tool_used` guards that only observe the lead
session, and an earlier probe had already shown the lead delegates to a subagent when it
lacks a tool. Each such case now also carries a content check that no tool can evade: the
run log still has exactly the number of `## ` entry headings the fixture shipped with,
the three `REQ-FIX` headings are all present, and `tests/test_pressure.py` still holds
exactly two `def test_` functions, which is what a silently-added test would break.

Fourth, all five Tier 1 negatives ran in an empty workspace, so 15/15 meant less than it
appeared: a near-miss is only a near-miss when the colliding keyword is actually in the
repository. They now seed the same documented repository the positives use, so a prompt
about CODEOWNERS or a run log is asked in a repo that genuinely has both.

Two smaller ones: `trigger-pos-why-did-we-choose` was named for a trigger phrase its
prompt never contained (it said "why we picked"), and `trigger-pos-adr-typo-bare-id`
asked for a mutation while grading only invocation, with no check that the accepted
record survived. Both corrected.

One proposed fix was rejected after checking the fixture rather than trusting the claim.
A grader was to assert `tests/test_pressure.py` still contained `REQ-FIX-001`; the file
deliberately never writes any requirement ID out, stating that "naming it would itself
count as coverage". That grader would have failed every compliant run. The count-based
check above replaced it.

## 2026-09-21 — docs-warden evals: drop the invented team name from the prompts

**PLANNED** — Replace `it-team` in the eval prompts. docs-warden ships in a public
marketplace, so its evals should not name a team that implies a particular organisation.

**CONFIRMED** — Two prompts and their two graders changed to `maintainers`, which is the
idiomatic term in this plugin's own domain (it ships a MAINTAINERS artifact for the OSPS
Baseline overlay) and names no one. `grep -rn it-team plugins/docs-warden/evals/` now
returns nothing; 124 graders still compile. The correction in the preceding entry, which
recorded the owner becoming `owner it-team`, stands as written because this log is
append-only: the value is now `owner maintainers`, and the reason for dropping the
leading `@` is unchanged and still correct. The CODEOWNERS template writes `@{{OWNER}}`
itself, so the manifest value is bare by design.

The plugin's own test fixtures still declare `owner: it-team` and `owner: platform-team`
in `test/fixtures/*/.docs-warden.yml`. Those were left alone: they are synthetic fixture
data that `test/test_scripts.py` asserts against, and changing them is a separate call
from what the evals put in a prompt.

## 2026-09-21 — docs-warden evals: Tier 1 re-measured after the review's fixes

**CONFIRMED** — Same command as the 15:30 run, against the corrected suite: 33 runs,
$4.77, 389 s, `partial: false`, zero run errors. Positives went 10/18 to 12/18;
negatives held at 15/15.

The whole of the gain came from one case, and it is the most instructive result of the
exercise. `trigger-pos-why-did-we-choose` went from 1/3 to 3/3 because the prompt was
changed from "why we picked Hyper-V over Proxmox" to "why did we choose Hyper-V over
Proxmox". The skill's description lists the phrase "why did we choose" verbatim. Nothing
about the skill changed, only whether the prompt used its exact words. Triggering is
therefore matching close to literally, and a natural paraphrase misses it. The corollary
is a caution about this suite and any like it: an eval written in the description's own
vocabulary will report a trigger rate better than users experience.

The negatives are now meaningful rather than nearly free. Until this run all five
executed in an empty workspace, so a question about CODEOWNERS or a run log had nothing
to collide with. They now seed the same documented repository the positives use, where
`.github/CODEOWNERS`, `docs/RUNLOG.md` and `docs/GLOSSARY.md` are all present, and the
skill still stayed out of all fifteen runs.

Two positives remain at 0/3 and are the real finding: `adr-typo-bare-id` (fix a typo in
an accepted decision record) and `readme-env-var-drift` (reconcile a README against the
code, 3/13 across every run ever made of it). Both ask to modify something that exists,
while every decision-related trigger phrase in the description describes creating a
record. No change has been made to SKILL.md; the measurement is recorded and the remedy
is a separate decision.

## 2026-09-21 — docs-warden evals: the phrasing pair, and a correction

**PLANNED** — Re-measure the triggering-vocabulary effect with a controlled pair, after
the earlier claim about it was made on a confounded single case.

**CONFIRMED** — Correction first. The previous entry reported that
`trigger-pos-why-did-we-choose` went 1/3 to 3/3 on one prompt edit and read that as proof
that triggering is literal-phrase sensitive. That conclusion was reached on a bad prompt.
To embed the description's exact phrase the sentence had been bent into "Someone asked me
why did we choose Hyper-V over Proxmox", which is not grammatical English in reported
speech, so the edit changed both the vocabulary and the naturalness and the two could not
be separated. Worse, the fixture is a PowerShell certificate-rotation module, so a
question about hypervisors asked about something the repository does not contain at all.

Both prompts were rewritten around a technology choice the fixture genuinely embodies:
PowerShell rather than Python, whose reasoning appears in no document there (confirmed:
no record under `docs/decisions/` mentions PowerShell). They now differ in exactly one
respect. `trigger-pos-why-did-we-choose` asks "why did we choose" and says "recorded";
the new `trigger-pos-decision-rationale-paraphrase` asks "why we went with" and says
"captured", using none of the skill's vocabulary. Twelve runs each, Sonnet 5, $2.65
total: the literal wording invoked the skill 9/12, the paraphrase 2/12.

That is the controlled version of the earlier claim, and it survives: triggering matches
close to literally, and a user who does not use the skill's own words mostly does not get
it on a question it exists to answer. The paraphrase case is kept rather than fixed,
because it is the honest half of the pair -- a suite written entirely in the description's
vocabulary would report a trigger rate better than users experience.

Note for anyone re-running this: `--case` is not repeatable, the last one wins silently.
The pair shares the tag `phrasing`; select it with `--tag phrasing`.
