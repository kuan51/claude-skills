---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Conventions

How we work in this repository **today**. Edited in place as the standard changes.

No history here. A dated entry in this file belongs in git, in a pull request, or,
only for an architecture decision (hard to reverse, constrains other
components, had a real alternative), in a record under [DECISIONS.md](DECISIONS.md).

## Stack

Node.js (built-in `node --test` runner, no test framework dependency) for
JavaScript checks. Python 3 for the `docs-warden` plugin's scripts, using only
the standard library except PyYAML, which `_common.py` and `adr_new.py`
import (not currently declared in a `requirements.txt` anywhere in the repo; install it
yourself before running docs-warden's scripts locally).

## Repository layout

- `plugins/<name>/`: one self-contained plugin per directory, each with its
  own `.claude-plugin/plugin.json`, `skills/`, and `test/`.
- `.claude-plugin/marketplace.json`: the marketplace manifest; must agree
  with each plugin's `plugin.json` on `name` and `version` (see
  [CLAUDE.md](../CLAUDE.md)).
- `test/`: root-level tests, currently just marketplace/plugin manifest
  consistency checks.
- `docs/`: this document set, plus `docs/specs/`: dated design records written
  by `fabflows:brainstorming`, one per change (`<YYYY-MM-DD>-<slug>.md`), never
  renamed or overwritten. A spec describes the behaviour, how to check it, what
  is out of scope, the decisions taken and what was deferred. When
  `.claude/fabflows.json` names a tracker, the spec lives in the linked ticket
  instead of `docs/specs/`; a ticket can be edited, so the approval fingerprint
  (`ticket.js approve`) and each commit's `Spec:` trailer replace the "never
  overwritten" guarantee.

## Branches and commits

Never commit directly to the default branch; work on a branch named for the
change or ticket.

Commit messages follow Conventional Commits: `type(scope): subject`, imperative,
72 characters at most.

## Naming

Plugin directory names, `plugin.json` `name` fields, and `marketplace.json`
plugin entries all use the same lowercase-hyphenated name.

## Testing

Root-level manifest consistency: `node --test "test/*.test.js"`.

Each plugin has its own tests: run them before merging any change to that
plugin.

- `ciso` and `data-analysis-review` keep tests beside their skill code as well
  as under `test/`, so run each with a recursive glob:
  `node --test "plugins/ciso/**/*.test.js"` and
  `node --test "plugins/data-analysis-review/**/*.test.js"`.
- `docs-warden`'s Python scripts are checked with
  `python3 plugins/docs-warden/test/test_scripts.py` (assert-based, no framework).
- `fabflows`'s suite covers its hook as well as its manifests:
  `node --test "plugins/fabflows/test/*.test.js"`. Keep to `test/`: the tests
  under `evals/fixtures/` are hidden acceptance tests for benchmark runs.

A plugin that includes a hook keeps that hook's allow and deny cases in a table its
test suite drives directly. Nothing in this repository runs these suites
automatically, so a security-adjacent code path is protected by convention alone.
Run the suite for any plugin you touch.

Behavioral evals for a plugin's skills live in `plugins/<name>/evals/` in
`claude plugin eval` format: one directory per case holding `prompt.md`,
`graders/*.md` and, when the case needs a seeded repository, `case.yaml` plus
`fixture.sh`. They spend tokens and never run under the unit tests; each plugin's
`evals/README.md` gives the command and its prerequisites. `docs-warden` has the
one suite in that format (DEC-0022). `fabflows`'s benchmark predates it and keeps its
own harness under `evals/harness/`, with its `brainstorming` evals in
`evals/brainstorming/`. `ciso` and `data-analysis-review` have trigger-accuracy
lists run by hand: `evals/trigger-corpus.json` (procedure in `evals/RUNBOOK.md`)
and `skills/data-analysis-review/references/evals.md`. Every recorded result is
collected in [EVALS.md](EVALS.md).

## Documentation

Every pull request updates the affected documents or says why not.
Accepted decision records are never edited; supersede them instead.
At 50 decided records, `docs-warden`'s `compact` mode offers to archive the oldest
25 into `docs/decisions/archive/` behind one digest record, as its own pull request
(DEC-0003).

## Generated files

Do not hand-edit these. CI regenerates each and fails on any diff.

| Path | Regenerate with |
|------|-----------------|
| `docs/DECISIONS.md` | `adr_index.py .` |
| `docs/decisions/README.md` | the same command |
| `docs/architecture/domain-model.md` | `domain_model.py . --write` |
