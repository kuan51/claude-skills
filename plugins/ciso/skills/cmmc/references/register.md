# Register (flow a)

Read this when `ciso:register` dispatches here (the requested tier is missing from state).

## Pick the tier first

CMMC ships three independent tiers and the right one is a **contract** question, not a preference.
Ask with `AskUserQuestion` if the user hasn't named a level:

- **`level1`** — the contract involves Federal Contract Information (FCI) only. 15 requirements,
  annual self-assessment.
- **`level2`** — the contract involves Controlled Unclassified Information (CUI). 110 requirements.
  The overwhelmingly common case.
- **`level3`** — CUI at higher risk, assessed by DIBCAC. 24 additional requirements, and it
  **presupposes Level 2**.

If the user doesn't know, say so plainly: the level is specified in the contract's DFARS clause, and
their contracting officer is the answer — not a guess made here.

## Run it

```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> cmmc "CMMC" "${CLAUDE_PLUGIN_ROOT}/skills/cmmc/controls/<tier>.v32cfr170.structure.json"
```
`cmmc` and `"CMMC"` are the certification key and display name -- always these exact literal values
for this skill. `register-tier.js` lives under `skills/hitrust/lib/` for historical reasons but is
certification-agnostic core (see `ADDING-A-CERTIFICATION.md`); it requires the cert key and display
name explicitly and takes a full structure-file path as its fourth argument, so no HITRUST behavior
is involved here.

Safe to re-run: it only adds control ids that are missing, never touches an existing control's
`assessment`/`roadmap`, and only creates the interview session if one doesn't already exist.

## Registering Level 3 means registering two tiers

If the user chose `level3`, **run the command twice** — once for `level2.v32cfr170.structure.json`
and once for `level3.v32cfr170.structure.json` — and tell them why: the 24 enhanced requirements sit
on top of all 110, and a `level3`-only registration would report a percentage over 24 while ignoring
the 110 underneath. Registering both is what keeps the number honest.

## After registering

1. Tell the user it's done, with the count broken out:
   - `level1` — **15** basic safeguarding requirements from 48 CFR 52.204-21.
   - `level2` — **110** requirements across 14 families: Access Control 22, Awareness and Training 3,
     Audit and Accountability 9, Configuration Management 9, Identification and Authentication 11,
     Incident Response 3, Maintenance 6, Media Protection 9, Personnel Security 2, Physical
     Protection 6, Risk Assessment 3, Security Assessment 4, System and Communications Protection 16,
     System and Information Integrity 7.
   - `level3` — **24** enhanced requirements selected from NIST SP 800-172.
2. **Restate the two things from `invariants.md` that a user will otherwise get wrong.** First, the
   **version trap**: CMMC binds NIST SP 800-171 **R2** and SP 800-172 (Feb 2021), both of which NIST
   has withdrawn in favour of Revision 3 — reading the current NIST publication means assessing
   against the wrong control set. Second, that unlike every other `ciso` module the requirement text
   here is **verbatim and authoritative** (US Government works, not copyrighted), while every
   `topicLabel` is our derived shorthand and carries no authority.
3. Say plainly that this plugin produces neither a CMMC assessment nor an SPRS score, and that the
   dashboard percentage is progress tracking — not the DoD Assessment Methodology's score out of 110.
4. Continue into [Interview](interview.md). There is no scope step for CMMC; the level *is* the
   scope decision, and it was made above.
