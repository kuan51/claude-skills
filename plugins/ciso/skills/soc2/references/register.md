# Register (flow a)

Read this when `ciso:register` dispatches here (the `type2` tier is missing from state).

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> soc2 "SOC 2 Type II" "${CLAUDE_PLUGIN_ROOT}/skills/soc2/controls/type2.v2017tsc.structure.json"
```

`soc2` and `"SOC 2 Type II"` are the certification key and display name, always these exact literal values for this skill. `register-tier.js` lives under `skills/hitrust/lib/` for historical reasons but is certification-agnostic core (see `ADDING-A-CERTIFICATION.md`); it requires the cert key and display name explicitly and takes a full structure-file path as its fourth argument, so no HITRUST behavior is involved here.

This merges the 61 bundled entries into `<docs/ciso-dir>/state.json` and creates the `interviewSessions` entry for `soc2`/`type2`. Safe to re-run. It adds only control ids that are missing and creates the interview session if one doesn't already exist. It never touches an existing control's `assessment`/`roadmap`.

After registering:

1. Tell the user it's done, with the count broken out. 33 common criteria (CC1-CC9) are always in scope. The rest are only in scope if the user selects those categories. Availability contributes 3. Confidentiality contributes 2. Processing Integrity contributes 5. Privacy contributes 18.
2. **Restate the authority caveat from `invariants.md`.** SOC 2 is a report rather than a certification. Each criterion identifier was read from the AICPA document and carries a `codeVerifiedBy` citation, but each `topicSummary` is a paraphrase rather than the criterion text.
3. Continue immediately into [Scope](scope.md). Do not go to the interview first: which categories are in scope determines which of the 51 entries should even be asked about.
