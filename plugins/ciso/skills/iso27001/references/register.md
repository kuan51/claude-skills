# Register (flow a)

Read this when `ciso:register` dispatches here (the `isms` tier is missing from state).

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> iso27001 "ISO/IEC 27001:2022" "${CLAUDE_PLUGIN_ROOT}/skills/iso27001/controls/isms.v2022.structure.json"
```
`iso27001` and `"ISO/IEC 27001:2022"` are the certification key and display name -- always these exact literal values for this skill. `register-tier.js` lives under `skills/hitrust/lib/` for historical reasons but is certification-agnostic core (see `ADDING-A-CERTIFICATION.md`); it requires the cert key and display name explicitly and takes a full structure-file path as its fourth argument, so no HITRUST behavior is involved here.

This merges the 123 shipped entries into `<docs/ciso-dir>/state.json` and creates the `interviewSessions` entry for `iso27001`/`isms`. Safe to re-run: it only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`, and only creates the interview session if one doesn't already exist.

After registering:

1. Tell the user it's done, with the split broken out: **30 management-system clause requirements** (clauses 4-10, `CL4`-`CL10`) and **93 Annex A controls** (`A5` 37, `A6` 8, `A7` 14, `A8` 34). Say plainly that both halves are assessed and neither is optional -- an org that has "done the controls" but not the clauses is not certifiable, and clause work is where first attempts most often stall.
2. **Restate the authority caveat from `invariants.md`** -- ISO 27001 is sold rather than published, so identifiers were *corroborated*, not *verified*, and every label and summary is our paraphrase rather than ISO's wording. Mention the 30-vs-34 clause granularity convention here rather than waiting for a user to notice a mismatch with their certification body's checklist.
3. Continue into [Interview](interview.md). Unlike SOC 2 there is no scope step to run first.
