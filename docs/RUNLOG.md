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
