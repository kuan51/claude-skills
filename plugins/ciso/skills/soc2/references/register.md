# Register (flow a)

Read this when `ciso:register` dispatches here (the `type2` tier is missing from state).

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> soc2 "SOC 2 Type II" "${CLAUDE_PLUGIN_ROOT}/skills/soc2/controls/type2.v2017tsc.structure.json"
```
`soc2` and `"SOC 2 Type II"` are the certification key and display name -- always these exact literal values for this skill. `register-tier.js` lives under `skills/hitrust/lib/` for historical reasons but is certification-agnostic core (see `ADDING-A-CERTIFICATION.md`); it requires the cert key and display name explicitly and takes a full structure-file path as its fourth argument, so no HITRUST behavior is involved here.

This merges the 61 shipped entries into `<docs/ciso-dir>/state.json` and creates the `interviewSessions` entry for `soc2`/`type2`. Safe to re-run: it only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`, and only creates the interview session if one doesn't already exist.

After registering:

1. Tell the user it's done, with the count broken out: 33 common criteria (CC1-CC9, always in scope) plus 3 Availability, 2 Confidentiality, 5 Processing Integrity and 18 Privacy criteria that are only in scope if they select those categories.
2. **Restate the authority caveat from `invariants.md`** -- SOC 2 is a report not a certification; every criterion identifier was read from the AICPA document and carries a `codeVerifiedBy` citation, but every `topicSummary` is a paraphrase, not the criterion text.
3. Continue immediately into [Scope](scope.md). Do not go to the interview first: which categories are in scope determines which of the 51 entries should even be asked about.
