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
