# Register (flow a)

Read this when the routing step in `../SKILL.md` picks Register (the tier is missing from state).

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> hitrust "HITRUST CSF" <tier>
```
`hitrust` and `"HITRUST CSF"` are the certification key and display name -- always these exact literal values for this skill (`register-tier.js` itself is certification-agnostic and requires both explicitly; this skill only ever registers the `hitrust` certification). `<tier>` is `e1`, `i1`, or `r2` (omit it only for e1, kept as the default for backward compatibility). This loads the bundled `controls/<tier>.v11.8.structure.json` and merges it into `<docs/ciso-dir>/state.json`. Safe to re-run: it only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`, and only creates the `interviewSessions` entry if one doesn't already exist.

After registering, tell the user it's done -- and restate the non-authoritative/citation-backed caveat from the skill's Overview (`../SKILL.md`) for this tier -- then immediately continue into [Import](import.md) (offering it, not forcing it).
