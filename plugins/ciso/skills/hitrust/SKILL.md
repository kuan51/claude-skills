---
name: hitrust
description: Use when registering HITRUST CSF controls (e1, i1, or r2) into ciso tracking, importing a MyCSF requirements export, running the control-by-control assessment interview, researching vendor solutions for gaps, or reconciling a HITRUST framework version upgrade.
---

# HITRUST CSF

## Overview

Single entry point for all HITRUST CSF work inside a project's `docs/ciso/` tracking data, across all three nested tiers (e1 ⊂ i1 ⊂ r2): register a tier's control set, optionally import an organization's own MyCSF requirements export, run the control-by-control assessment interview, research budget-appropriate vendor solutions for whatever's a gap, and reconcile a new HITRUST framework version when one ships.

**Tier authority and this must always be communicated to the user:**
- **e1 and i1** both ship `sourceAuthority: "public-topic-level"` content: topic-level structure compiled from public sources only (HITRUST advisories, public secondary write-ups, HITRUST-authorized-assessor write-ups) -- no licensed MyCSF export is used as an input to either shipped file. Explicitly non-authoritative; every entry citation-backed; a `relatedControlCode`/`legacyCategoryPrefix` is populated only on the minority of entries where a public citation actually verified that specific code, never invented for the rest. **Always tell the user this is non-authoritative and point them at MyCSF or an authorized assessor for exact scope, counts, and wording** before they rely on it for a real assessment. HITRUST's verbatim requirement-statement wording is licensed content and never lives in this plugin regardless.
- **r2** ships a small illustrative-only example set (not the real ~2000+-entry scope) pending its own dedicated compilation pass -- tell the user this explicitly if r2 comes up.
- If an org obtains its own licensed `<tier>` MyCSF export, importing it **replaces that tier's `controls` map wholesale** (this plugin's synthetic topic-level ids never line up with real per-statement MyCSF ids -- there's no field-level merge path). Whatever was previously registered is archived first, not deleted, tagged `archivedReason: "import-replaced"`, as a raw safety-net snapshot -- see [Import](#b-import).

## Routing

Always start here, every invocation:

1. Determine the project's `docs/ciso/` path -- check the current working directory's `docs/ciso/state.json` first; if that's not obviously the right project, ask the user.
2. Read `<docs/ciso>/state.json`. **If it doesn't exist, tell the user to run `ciso:init` first and stop** -- do not scaffold it yourself.
3. **Pick a tier.** If `certifications.hitrust` doesn't exist yet, or the user hasn't said which tier they mean, ask (`AskUserQuestion`): e1 (recommended starting point), i1, or r2. Remind them of the authority difference above when i1/r2 is chosen. Everything below is parameterized by this tier choice (`<tier>` is `e1`, `i1`, or `r2`).
4. **Check for a version upgrade FIRST, unconditionally, before anything else below.** If `certifications.hitrust.tiers.<tier>` already exists AND the plugin's bundled `controls/<tier>.v*.structure.json` has a newer `controlSetVersion` than what's recorded in state, go straight to [Upgrade](#e-upgrade) -- do not offer Register/Import/Interview/Roadmap first. Interview and roadmap data may need reconciling against the new structure before any of those flows should touch it. (Not applicable to a brand-new tier registration -- there's nothing yet to upgrade.)
5. Otherwise, inspect `certifications.hitrust.tiers.<tier>` to pick a flow:
   - **Missing entirely** -> go to [Register](#a-register).
   - **Present, but `sourceAuthority` is `"structural-only"` or `"public-topic-level"`** -> offer [Import](#b-import) (recommended, not mandatory -- let the user decline and jump straight to [Interview](#c-interview) if they'd rather proceed on control names/topic labels alone).
   - **Present and the interview session isn't complete** -> offer [Interview](#c-interview), resuming the existing `interviewSessions` entry for `hitrust`/`<tier>`.
   - **Any completed category/domain (in `domainsCompleted`) has a control that's `gap`/`in_progress` with `roadmap.status` still `not_started` or `researching`** -> offer [Roadmap](#d-roadmap) (budget-tiered vendor research). This is checked continuously as categories complete, not gated on the whole tier finishing -- see step 7 in [Interview](#c-interview).

## (a) Register

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> <tier>
```
`<tier>` is `e1`, `i1`, or `r2` (omit it only for e1, kept as the default for backward compatibility). This loads the bundled `controls/<tier>.v11.8.structure.json` and merges it into `<docs/ciso-dir>/state.json`. Safe to re-run: it only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`, and only creates the `interviewSessions` entry if one doesn't already exist.

After registering, tell the user it's done -- and restate the non-authoritative/citation-backed caveat from the Overview for this tier -- then immediately continue into [Import](#b-import) (offering it, not forcing it).

## (b) Import

Optional but strongly recommended before running the interview -- without it, controls only carry a short topic label/summary, not the actual requirement wording.

1. Ask the user, conversationally, for the absolute path to their MyCSF `<tier>` requirements export (a `.xlsx` file). Validate the path exists and ends in `.xlsx`; if not, say so and ask again.
2. For **e1**, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/merge-import.js" <docs/ciso-dir>/state.json <path-to-export.xlsx>
   ```
   This parses the workbook with a small bundled, Node-stdlib-only ZIP+SpreadsheetML reader (`lib/xlsx-lite.js` -- no npm dependency) and **wholesale-replaces** the tier's `controls` map with what the real export actually contains (real ids, real `relatedControlCode`/`relatedControlName`/`legacyCategoryPrefix`, real statement text) -- this is not a field-merge onto the shipped public-sourced structure, since the shipped structure's synthetic ids (e.g. `e1-01-01`) have nothing in common with a real export's Unique IDs to match against. Before replacing, it archives whatever was previously registered into `tier.archivedControls` (tagged `archivedReason: "import-replaced"`) as a raw, unreconciled safety-net snapshot. **Tell the user plainly that any interview progress already recorded against the public-sourced placeholder controls is not carried forward** onto the real controls (only preserved in the archive for manual reference) -- exactly why Import is recommended *before* Interview. It prints a JSON summary (`{ imported, archived, warnings }`) and, on success, archives a byte-for-byte copy of the original file to `<docs/ciso-dir>/imports/<ISO-timestamp>-<original-basename>.xlsx` as an audit trail. The interview session's `domainsRemaining`/`domainsCompleted` are reset to match the real controls' own category structure.
3. For **i1 or r2**, there is no import script yet -- an org's own licensed export for either tier is a different shape than the topic-level placeholder structure this plugin ships (real per-statement ids vs. synthetic topic ids). If a user has one, tell them this import path isn't built for that tier yet and that their options are: proceed with the non-authoritative topic-level content as-is, or track their own export separately outside this tool for now. Do not attempt an ad-hoc merge.
4. Only a genuinely unreadable file, a missing required header column, or an export with zero usable rows is a hard failure -- existing controls are left untouched in that case. Everything else (a malformed row, a duplicate Unique ID in the export) is reported as a warning, not an abort.
5. Report the import summary to the user in plain language, then continue into [Interview](#c-interview).

## (c) Interview

Resumable, chunked by `domainKey` (the modern 19-domain numbering, `01`-`19`, every current tier's controls carry). A handful of e1 controls also carry a `legacyCategoryPrefix` (an OLDER, different numbering scheme derived from a real MyCSF control-reference code, e.g. `04` from `04.a`) -- that field is purely extra display metadata, never used for grouping, since it isn't present on every control and uses a different scheme than `domainKey`. **Must run inside native plan mode** -- this is a firm requirement, not a style choice: the interrogation only counts as "committed" once the user approves the whole batch via `ExitPlanMode`.

### Part 1 -- inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `hitrust`/`<tier>` entry from `interviewSessions` (it should already exist from registration; if somehow missing, re-run [Register](#a-register) first). Present `domainsCompleted` vs `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining category/domain to work through this session -- default to the next one in `domainsRemaining` order, but let the user pick a different one, or re-select an already-completed one to amend prior answers (completion isn't a lock).
4. For every control in the chosen category(ies), sorted by `relatedControlCode` when present, else `topicLabel`, then `id`:
   - Present it: code/topic label, name/summary, and `statementText` if imported. If `statementText` is still `null`, say so plainly and confirm with the user whether to proceed on the label/summary alone or pause here to run [Import](#b-import) first. For i1/r2, also restate that the entry is non-authoritative.
   - Ask its status (`AskUserQuestion`, single-select -- one control at a time, or batched up to 4 per call if that reads more naturally): **met** / **in progress** / **gap** / **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option -- never let a control move on without the user having been asked.
   - Then, freeform conversational follow-up:
     - **met** -> a non-empty justification is mandatory. If the answer is empty or a non-answer, ask again -- never accept a placeholder.
     - **in progress** -> both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **not applicable** / **defer** -> notes are encouraged, not required.
   - Hold every control's `{status, justification, currentState, estimatedCloseness}` in conversation context. **Do not write to `state.json` during this part** -- plan mode is read-only by convention here, and the discipline rule below is what actually enforces the required fields.
5. Call `ExitPlanMode` with a plan body that restates every control processed this session and its captured status + justification/detail. One approval commits the whole batch.

### Part 2 -- after approval, normal mode

6. For every control processed, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json <tier> <controlId> '<jsonPayload>'
   ```
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null). This is the mechanical backstop, not just prose: it throws and makes **no** changes to the file if `status` is `"met"` without a justification, or `"in_progress"` without both `currentState` and `estimatedCloseness` -- so a rule "known" only in this document can't be silently skipped. It always stamps `assessment.assessedAt`, including for a deferred control (stored as `not_assessed`, same as an untouched one, but `assessedAt` is what distinguishes "asked but deferred" from "never touched").
7. Once every control in a chosen category/domain has been applied, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json <tier> <domainKey>
   ```
   This throws if any control in that group still has `assessedAt: null` (something was missed between steps 4-6 -- a hard stop, not a silent skip). On success it moves the group from `domainsRemaining` to `domainsCompleted`, updates `lastUpdatedAt`, and flips the session to `"completed"` once `domainsRemaining` is empty.
8. **Check for un-researched gaps right now, not just at full-tier completion.** Look at every control in `domainsCompleted` so far (the category that just finished, plus any earlier ones from this or a prior session) for `assessment.status` in `gap`/`in_progress` with `roadmap.status` still `not_started` or `researching`. If any exist, tell the user how many and offer [Roadmap](#d-roadmap) right now -- they can accept immediately, or decline and keep interviewing (or stop for now); nothing forces them into Roadmap before the tier is fully interviewed.
9. Call the dashboard regenerator as the last step of the flow:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```
10. Report a summary to the user: counts of met/gap/in-progress/deferred this session, categories remaining, and the dashboard path.

### Discipline (why the mechanical gate exists)

- Never hand-edit `state.json` to bypass a required field -- if you're tempted to write `"status": "met"` directly into the file to save a round-trip, that's exactly the shortcut `apply-assessment.js` exists to block. Always go through the script.
- Never silently skip a control -- every control gets asked, even if the answer is "defer."
- "Met" always needs a real justification; "in progress" always needs both current-state and estimated-closeness. If the user gives a one-word or evasive answer, ask again before calling `apply-assessment.js` -- don't paper over it with a placeholder string, since the script only checks for non-blank, not for genuine content.

### Known limitation (accepted, not a bug)

If a session is interrupted mid-category -- before `ExitPlanMode` -- that category's Q&A is not persisted and is redone next session. Bounded to a small handful of controls per category for e1 (its ~32 public-sourced entries are spread thinly across all 19 domains), larger for i1, and is the deliberate resume granularity this schema chose.

## (d) Roadmap

Available as soon as ANY completed category/domain has un-researched gaps (see [Interview](#c-interview) step 8) -- not gated on the whole tier finishing. Also invocable any time standalone, e.g. to pick up gaps that were deferred earlier.

1. **Budget tier.** Check `state.organization.budgetTier`:
   - If already set, tell the user "using your saved default: `<tier>`" and offer (`AskUserQuestion`) to keep it or change it for this run.
   - If not set, ask (`AskUserQuestion`): open source/freeware, small business, enterprise, or startup-that-might-scale. It's saved as the new default automatically once the workflow runs (see step 3) -- no separate write needed here.
2. Run the `Workflow` tool with the contents of `${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/workflow.js` as `script`, passing `args: { controls: [...], budgetTier }` where `controls` is built from every `gap`/`in_progress` control with `roadmap.status` still `not_started` or `researching`, across whichever tier(s) the user wants covered: `{ id, relatedControlCode or topicLabel, relatedControlName or topicSummary, domainKey, justification: assessment.justification, inProgressNotes: assessment.inProgress }`. (Filtering out `roadmap.status: "complete"` controls is what makes this safe to re-run repeatedly as new gaps appear across sessions, instead of re-researching the same ones.)
3. Write the workflow's result to a scratchpad JSON file, then run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/merge-roadmap.js" <docs/ciso-dir>/state.json <result.json path>
   ```
   to merge vendor findings into each control's `roadmap` field (works across any tier, keyed by control id).
4. Call the dashboard regenerator, then present a summary -- call out any `confidence: "low"` or empty-vendor results as needing manual follow-up, not silently accepted.

## (e) Upgrade

Triggered when the plugin's bundled `controls/<tier>.v*.structure.json` is a newer version than `state.json`'s `tiers.<tier>.controlSetVersion`.

1. Tell the user a newer HITRUST framework version is available for this tier and ask (`AskUserQuestion`) whether to reconcile now or defer.
2. If proceeding, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/diff-structure-versions.js" <old-structure-file> <new-structure-file>
   ```
   to get an added/removed/modified/unchanged report (heuristic, not authoritative for topic-level tiers -- flag ambiguous cases for the user's judgment rather than trusting the classification blindly).
3. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/reconcile-state-version.js" <docs/ciso-dir>/state.json <tier> <new-structure-file>
   ```
   This never deletes assessment/roadmap data: unchanged/modified ids carry their existing `assessment`/`roadmap` forward (modified ones flagged `needsReview: true`), new ids are seeded `not_assessed`, and ids no longer present move to that tier's `archivedControls` bucket rather than being dropped.
4. Call the dashboard regenerator, then present a summary (carried forward / needing review / new / archived counts).
