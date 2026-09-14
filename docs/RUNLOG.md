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
