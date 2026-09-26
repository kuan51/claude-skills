# claude-skills

A Claude Code plugin marketplace. Each plugin is self-contained under `plugins/<name>/` with its own
`.claude-plugin/plugin.json`, and is registered in the root `.claude-plugin/marketplace.json`.

## Versioning: `plugin.json` is the source of truth

A plugin's version is defined in **two** files that must always agree:

| File | Field | Role |
|---|---|---|
| `plugins/<name>/.claude-plugin/plugin.json` | `version` | **Source of truth.** The installer keys updates off it and installs to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. |
| `.claude-plugin/marketplace.json` | the plugin's `version` | What the marketplace advertises. Must mirror `plugin.json`. |

**Whenever you change `plugin.json`'s `version` or `description`, change the matching `marketplace.json`
entry in the same commit.** `marketplace.json`'s copy of the description is what users read when
browsing the marketplace, so a plugin whose scope has changed needs both updated, plus its bullet in
the root `README.md`.

This is not hypothetical. `ciso` added a whole second certification while `marketplace.json` still
advertised it as *"starting with HITRUST CSF e1"* at `0.1.0`. The plugin's own `plugin.json` had been
updated and the marketplace entry had not. Only the check below catches that.

Run this before finishing any change that touches a plugin's manifest:

```bash
node --test "test/*.test.js"
```

The fabflows ticket and PR flows also have an offline bats suite: `bats plugins/fabflows/test/pm`.

`test/marketplace-consistency.test.js` fails if the two manifests disagree on version or name, if a
registered plugin's `source` path doesn't exist, or if a plugin under `plugins/` isn't registered.

## When to bump

Semver, judged by what a consumer experiences, not by diff size:

- **Patch** (`0.1.0` → `0.1.1`): wording fixes, corrected data within an existing control set, a bug
  fix in a script with no contract change.
- **Minor** (`0.1.0` → `0.2.0`): a new skill, a new certification module, a new file the plugin
  writes into a consuming project, or a new field consumers can rely on. Additive, doesn't invalidate
  existing local state.
- **Major** (`0.2.0` → `1.0.0`): a change that breaks an existing install, such as renamed or removed
  skills, a state-file schema change needing migration, or removing output a user's workflow depends on.

Bump once per release-worthy change. A stack of commits landing as one PR gets
one bump.

Consequences worth remembering when you bump:

- **Version determines the install path.** A bump installs alongside the old copy rather than
  replacing it. That makes an upgrade cheap to reverse, and it means testing an unreleased version
  locally is non-destructive.
- **State a plugin wrote into a consuming project persists after the bump.** `ciso` stores per-project data
  in a gitignored `docs/ciso/`; if a change reshapes that data, include the reconciliation path with it
  (see `plugins/ciso/skills/hitrust/lib/versioning/`) rather than assuming a fresh install.

## Testing a plugin change before merging

Unit tests exercise scripts. They do not prove a skill works when *consumed*. To test the real thing,
install the plugin from your branch:

```bash
git -C ~/.claude/plugins/marketplaces/claude-skills fetch origin <branch>:<branch>
git -C ~/.claude/plugins/marketplaces/claude-skills checkout <branch>
cp -r ~/.claude/plugins/marketplaces/claude-skills/plugins/<name>/. \
      ~/.claude/plugins/cache/claude-skills/<name>/<version>/
```

then add a matching entry to `~/.claude/plugins/installed_plugins.json`. With the fabflows guard
active, Claude can run the two `git -C` lines but not the `cp` or the `installed_plugins.json`
edit: those write into the live plugin cache, which the guard protects on purpose, so the user runs
them. **Skills are loaded into the
session at startup**, so a newly installed skill is not invocable until a new session begins. Plan
for a restart rather than assuming a mid-session rescan. Revert by deleting the version directory,
dropping its `installed_plugins.json` entry, and checking the marketplace clone back to `master`.

## Maintaining documentation with docs-warden

`docs/` follows the docs-warden layout (`docs/CONVENTIONS.md` for current state, `docs/decisions/`
for why, `docs/GLOSSARY.md`, `docs/SECURITY.md`,
`docs/specs/` for fabflows design records; when `.claude/fabflows.json` names a tracker, the
spec lives in the linked ticket instead, and the approval fingerprint plus each commit's `Spec:`
trailer replace the "never overwritten" guarantee). `.docs-warden.yml` at the root drives it. The
`docs-warden` plugin in this repo is also the installed tool: invoke the `docs-warden:docs-warden`
skill and it picks the mode, or run its scripts directly from the installed plugin, never from a
copy in this repo. CI is the one exception, described below:

```bash
W=~/.claude/plugins/cache/claude-skills/docs-warden/<version>/skills/docs-warden/scripts
python $W/audit.py .                 # scorecard; every fail or warn is offered as a fix, never applied silently
python $W/adr_new.py . "<title>"     # scaffold the next DEC-NNNN, then fill it with the human
python $W/adr_index.py .             # regenerate docs/DECISIONS.md and docs/decisions/README.md
python $W/freshness.py .             # documents past review_by or older than the code they cite
```

Rules that bite here:

- **Every PR updates the affected documents or says why not.** After a code change, grep `docs/`
  and the plugin READMEs for the paths and symbols you touched (`maintain` mode), propose the
  specific edits, then re-run `adr_index.py` and `audit.py`.
- **A decision record only when all three are yes:** reversing it costs more than one PR, it
  constrains work outside the component touched, and a rejected alternative exists. Otherwise the
  reasoning goes in the PR description. Accepted records are never edited. Supersede them instead.
- **Generated files are never hand-edited:** `docs/DECISIONS.md`, `docs/decisions/README.md`,
  `docs/architecture/domain-model.md` (see the table in `docs/CONVENTIONS.md`).
- **This repo keeps no run log** (its archetype is `library`). Operational narrative, such as
  commands run and checks skipped, goes in the PR description; durable conclusions go in a
  decision record or spec.
- **CI runs markdownlint, Vale and `audit.py` on every pull request and push to master**
  (`.github/workflows/docs.yml`), from the checkout's own copy of the scripts, so a PR is
  checked by its own version of docs-warden. Vale lints only the Markdown files the PR changes, as pre-commit does.
  lychee and `freshness.py` still run only by hand.
