---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Conventions

How we work in this repository **today**. Edited in place as the standard changes.

No history here. A dated entry in this file means you wanted a decision record —
see [DECISIONS.md](DECISIONS.md).

## Stack

Node.js (built-in `node --test` runner, no test framework dependency) for
JavaScript checks. Python 3 for the `docs-warden` plugin's scripts, using only
the standard library except `_common.py`'s `import yaml` (PyYAML — not
currently declared in a `requirements.txt` anywhere in the repo; install it
yourself before running docs-warden's scripts locally).

## Repository layout

- `plugins/<name>/` — one self-contained plugin per directory, each with its
  own `.claude-plugin/plugin.json`, `skills/`, and `test/`.
- `.claude-plugin/marketplace.json` — the marketplace manifest; must agree
  with each plugin's `plugin.json` on `name` and `version` (see
  [CLAUDE.md](../CLAUDE.md)).
- `test/` — root-level tests, currently just marketplace/plugin manifest
  consistency checks.
- `docs/` — this document set, plus `docs/superpowers/` (implementation plans
  and specs from past feature work, kept for historical reference).

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

Each plugin has its own test suite under `plugins/<name>/test/` — run before
merging any change to that plugin. `docs-warden`'s Python scripts are checked
with `python3 plugins/docs-warden/test/test_scripts.py` (assert-based, no
framework).

## Documentation

Every pull request updates the affected documents or says why not.
Accepted decision records are never edited; supersede them instead.

## Generated files

Do not hand-edit these. CI regenerates each and fails on any diff.

| Path | Regenerate with |
|------|-----------------|
| `docs/DECISIONS.md` | `adr_index.py .` |
| `docs/decisions/README.md` | the same command |
