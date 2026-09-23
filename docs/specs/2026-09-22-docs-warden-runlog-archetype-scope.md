# docs-warden: scope RUNLOG to operational archetypes and constrain its entries

## Behaviour

`docs/RUNLOG.md` stops being a universal required file. It is required only for the
`it-tooling` and `firmware` archetypes. A `library` or `service` repo is not asked for one.

1. **Required-files.** `_common.py`: remove `RUNLOG` and `RUNLOG_ARCHIVE_DIR` from
   `UNIVERSAL_FILES`; keep both constants (other scripts import them). `archetypes.py`:
   add `docs/RUNLOG.md` to `files` for `it-tooling` and `firmware`. "Requires
   RUNLOG" is always derived from `ARCHETYPES[archetype]["files"]` plus the manifest's
   `extra_files`, never a hardcoded list. `test_scripts.py` `_universal_repo` helper
   (line ~152) builds fixtures from `UNIVERSAL_FILES`; it must also write the archetype's
   own `files` so the tests at lines ~185, ~209, ~391, ~542 keep passing.
2. **Entry shape** (`freshness.py`, only when RUNLOG is required). Split the log into
   entries on `##` headings, ignoring text before the first heading and any `##` line
   inside a fenced code block. Warn, never fail, on an entry that: (a) has no line
   starting with `- CONFIRMED`, `- FAILED` or `- SKIPPED` (after optional `**`), or (b)
   has such a line but neither it nor its indented continuation lines contain a backtick
   span, or (c) exceeds 12 lines. Message names the heading and the rule broken. The
   existing 500-line rotation warning stays. The reference example
   (`universal-set.md:87-92`) must pass all three.
3. **Stray file** (`freshness.py`). If RUNLOG is not required and `docs/RUNLOG.md` exists,
   emit exactly one warning: "docs/RUNLOG.md is not required for the <archetype>
   archetype; its contents belong in the PR description or a decision record. Consider
   removing it." Skip the rotation and entry-shape checks for that file. If there is no
   manifest or the archetype is unknown, skip the new checks entirely and change nothing.
4. **Skill text.** Move the RUNLOG section out of `references/universal-set.md` into
   `references/archetypes.md`, naming the two archetypes and the entry rule from
   Behaviour 2. `SKILL.md`: file table (~192) marks RUNLOG as archetype-scoped; the
   `git mv` example (~213) drops it; trigger list (line 3) keeps the word. Rule 5 (~39)
   unchanged. `RUNLOG.md.tmpl` header gains the entry rule. `README.md.tmpl:25`: remove
   the RUNLOG row; init guidance adds it only for the two archetypes.
5. **This repo** (archetype `library`). `git rm docs/RUNLOG.md docs/runlog/2026-Q3.md`.
   Replace the five references to the deleted log with a pointer to its last committed
   state, `git show 735ea1d:docs/RUNLOG.md`: `plugins/fabflows/evals/harness/run.js:44`,
   `plugins/fabflows/evals/README.md:124`, `plugins/fabflows/evals/RESULTS.md:86`,
   `plugins/docs-warden/evals/README.md:156`. `DEC-0001:63` is left as is (a record is
   not edited). Remove the two ignore lines at `.markdownlint-cli2.yaml:54-55`.
   `CLAUDE.md` ~80 and ~104-105: drop RUNLOG and say operational narrative goes in the PR
   description and durable conclusions in a decision record or spec.
6. **Version.** `plugin.json` and `marketplace.json` 0.4.3 -> 0.5.0, same commit.

## Check

```text
python plugins/docs-warden/test/test_scripts.py
node --test "test/*.test.js"
```

New tests in `plugins/docs-warden/test/test_scripts.py`:

- library and service fixtures without RUNLOG pass `required-files`; it-tooling and firmware fixtures without it fail.
- freshness on an it-tooling fixture: entries missing a CONFIRMED line, missing a backtick
  span, and over 12 lines each warn; the reference example does not; a `##` inside a
  fence does not start an entry.
- freshness on a library fixture with a stray `docs/RUNLOG.md` of 600 lines warns exactly
  once (stray only, no rotation warning).
- freshness on a fixture with no manifest emits no RUNLOG warnings.

Manual, after the cleanup: installed `audit.py .` and `freshness.py .` on this repo show
no RUNLOG fail or warn; `grep -rn 'docs/RUNLOG' --exclude-dir=.git .` hits only
`DEC-0001`, the spec, and the plugin's own skill files and templates. Behaviour 4 has no
automated check; the reviewer reads the three edited reference files.

## Out of scope

- Eval graders under `plugins/docs-warden/evals/` (they assert RUNLOG is not written;
  still true).
- gitattributes diff collapsing; automatic rotation (rejected in DEC-0001).
- The user's global CLAUDE.md, which still mandates RUNLOG per project.
- Any edit to DEC-0001.

## Decisions

- Archetype-scoped, not removed: hand-run scripts against live systems and flash runs need a home
  for actions git cannot see. This repo's log held benchmark narrative whose durable
  results already live in `RESULTS.md`; a pointer to the last commit keeps the evidence.
- Warn, not fail, on shape and stray file: existing logs must not turn red on upgrade.
- 12 lines and one backtick span on the confirmation line: the reference example is six
  lines with two commands; 12 leaves room for a FAILED follow-up.
- A stray log gets one warning and no rotation warning: two warnings for one file is
  advice nobody can follow.
- `extra_files` naming RUNLOG makes it required, so audit and freshness cannot disagree.
- Delete rather than freeze: git keeps history; a frozen file is still tokens read.
- Minor bump: loosens a requirement, adds warnings, `freshness.py` still exits 1 only on
  failures.
- No `webapp` or `cli` archetype: webapp is `service`; cli is `it-tooling` or `library`.
- `service` excluded: a service with CI/CD has no manual actions by design, and a manual one is an incident for the incident tracker. A service that wants a log lists it in `extra_files`.

## Deferred

- Eval cases for the new warnings and for init scaffolding per archetype.
- gitattributes `-diff` marker for repos that keep a log.
- A `runlog: false` manifest override for an it-tooling or firmware repo that wants out.
- New `webapp` and `cli` archetypes, if their document set ever differs.
