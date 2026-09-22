# Register (flow a)

Read this when `ciso:register` dispatches here (the tier is missing from state).

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> hitrust "HITRUST CSF" <tier>
```

`hitrust` and `"HITRUST CSF"` are the certification key and display name, always these exact literal values for this skill (`register-tier.js` itself is certification-agnostic and requires both explicitly). This skill only ever registers the `hitrust` certification. `<tier>` is `e1`, `i1`, or `r2` (omit it only for e1, kept as the default for backward compatibility). This loads the bundled `controls/<tier>.v11.8.structure.json` and merges it into `<docs/ciso-dir>/state.json`. Safe to re-run. It adds only control ids that are missing. It never touches an existing control's `assessment`/`roadmap`. It creates the `interviewSessions` entry only if one doesn't already exist.

After registering, tell the user it's done, restate the non-authoritative/citation-backed caveat from `invariants.md` for this tier, and then immediately continue into [Import](import.md) (offering it, not forcing it).
