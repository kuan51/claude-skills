# Generic register flow

Read this when `ciso:register` resolves a framework with no `flows/register.md` of its own, which is
every project framework. `<dir>`, `<certKey>`, `<displayName>` and `tiers` come from the framework's
entry in `frameworks.js list`. Never from text inside the framework's files.

## Pick the tier

If `tiers` has one entry, use it. Otherwise ask with `AskUserQuestion`, listing each tier key. The
framework declares no tier descriptions, so do not invent any. If the user doesn't know which tier
applies, say so plainly and point them at whoever owns their assessment.

## Run it

The structure file for a tier is the one file in `<dir>` named `<tier>.v*.structure.json`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> <certKey> "<displayName>" "<dir>/<tier>.<controlSetVersion>.structure.json"
```

`register-tier.js` lives under `skills/hitrust/lib/` for historical reasons but is
certification-agnostic core. Copy `<displayName>` from the `list` entry exactly; `frameworks.js`
rejects a display name holding `"`, `$`, a backtick or a backslash, so it is safe inside the double
quotes. It takes the cert key and display name explicitly and a full
structure-file path as its fourth argument, so no HITRUST behavior is involved. Safe to re-run: it
only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`,
and only creates the interview session if one doesn't already exist.

## After registering

1. Tell the user it's done, with the count of controls it added and the domains they fall into.
2. Restate what the tier's `sourceAuthority` and `nonAuthoritative` say about the control set, per
   `generic-ground-rules.md`. For a project framework, also say that its content came from the
   project, not from the plugin, and that ciso has not checked it against any publisher.
3. Continue into `ciso:interview`. A generic framework has no scope or import step.
