---
name: hitrust
description: Use when registering HITRUST CSF controls (e1, i1, or r2) into ciso tracking, importing a MyCSF requirements export, running the control-by-control assessment interview, researching vendor solutions for gaps, or reconciling a HITRUST framework version upgrade.
---

# HITRUST CSF

## Overview

Single entry point for all HITRUST CSF work inside a project's `docs/ciso/` tracking data, across all three nested tiers (e1 ⊂ i1 ⊂ r2): register a tier's control set, optionally import an organization's own MyCSF requirements export, run the control-by-control assessment interview, research budget-appropriate vendor solutions for whatever's a gap (in the background, without blocking the interview), and reconcile a new HITRUST framework version when one ships.

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
   - **Any completed category/domain (in `domainsCompleted`) has a control that's `gap`/`in_progress` with `roadmap.status` still `not_started` or `researching`** -> offer [Roadmap](#d-roadmap) (budget-tiered vendor research, which runs in the background so it never blocks the interview). This is checked continuously as categories complete, not gated on the whole tier finishing -- see step 10 in [Interview](#c-interview).

## (a) Register

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> hitrust "HITRUST CSF" <tier>
```
`hitrust` and `"HITRUST CSF"` are the certification key and display name -- always these exact literal values for this skill (`register-tier.js` itself is certification-agnostic and requires both explicitly; this skill only ever registers the `hitrust` certification). `<tier>` is `e1`, `i1`, or `r2` (omit it only for e1, kept as the default for backward compatibility). This loads the bundled `controls/<tier>.v11.8.structure.json` and merges it into `<docs/ciso-dir>/state.json`. Safe to re-run: it only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`, and only creates the `interviewSessions` entry if one doesn't already exist.

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

Resumable, chunked by `domainKey` (the modern 19-domain numbering, `01`-`19`, every current tier's controls carry) and, within each chunk, committed in sub-batches of 4-6 controls at a time rather than as one whole-category commit -- see Part 1 step 4. A handful of e1 controls also carry a `legacyCategoryPrefix` (an OLDER, different numbering scheme derived from a real MyCSF control-reference code, e.g. `04` from `04.a`) -- that field is purely extra display metadata, never used for grouping, since it isn't present on every control and uses a different scheme than `domainKey`. **Must run inside native plan mode** -- this is a firm requirement, not a style choice: each sub-batch only counts as "committed" once the user approves it via `ExitPlanMode`.

### Part 1 -- inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `hitrust`/`<tier>` entry from `interviewSessions` (it should already exist from registration; if somehow missing, re-run [Register](#a-register) first). Present `domainsCompleted` vs `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining category/domain to work through this session -- default to the next one in `domainsRemaining` order, but let the user pick a different one, or re-select an already-completed one to amend prior answers (completion isn't a lock).
4. Sort every control in the chosen category by `relatedControlCode` when present, else `topicLabel`, then `id`, and work through it in sub-batches of 4-6 controls at a time -- **never accumulate a whole category's worth of controls before the first `ExitPlanMode`**; this sub-batch boundary is what bounds an interruption's blast radius to a handful of controls instead of an entire domain. For each control in the current sub-batch:
   - Present it: code/topic label, name/summary, and `statementText` if imported. If `statementText` is still `null`, say so plainly and confirm with the user whether to proceed on the label/summary alone or pause here to run [Import](#b-import) first. For i1/r2, also restate that the entry is non-authoritative.
   - Ask its status (`AskUserQuestion`, single-select -- one control at a time, or batched up to 4 per call if that reads more naturally): **met** / **in progress** / **gap** / **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option -- never let a control move on without the user having been asked.
   - Then, freeform conversational follow-up:
     - **met** -> a non-empty justification is mandatory. If the answer is empty or a non-answer, ask again -- never accept a placeholder.
     - **in progress** -> both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **not applicable** / **defer** -> notes are encouraged, not required.
   - Hold the control's `{status, justification, currentState, estimatedCloseness}` in conversation context. **Do not write to `state.json` during this part** -- plan mode is read-only by convention here, and the discipline rule below is what actually enforces the required fields.
   Once every control in the current sub-batch (4-6 controls) has been asked, move on to step 5 to commit it.
5. Call `ExitPlanMode` with a plan body that restates every control processed in this sub-batch and its captured status + justification/detail. One approval commits this sub-batch -- not the whole category.

### Part 2 -- after approval, normal mode

**First, drain any finished background roadmap.** If a background vendor-research task (see [Roadmap](#d-roadmap)) has completed since you were last in normal mode, merge its result **now** -- before the steps below, and never while plan mode was still active (it's read-only). To drain: capture the workflow's returned `{ budgetTier, results }`, write it to a scratchpad JSON file, run `merge-roadmap.js` (Part (d) step 3), regenerate the dashboard, and clear those control ids from your in-flight set. This is a checkpoint the interview loop passes through every 4-6 controls, so a completion that landed several sub-batches ago still gets merged deterministically rather than relying on remembered intent. Writes are serialized (one `node` call at a time), so there's no `state.json` race between this merge and the `apply-assessment.js` calls below -- no locking needed.

6. For every control processed in this sub-batch, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json hitrust <tier> <controlId> '<jsonPayload>'
   ```
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null). For **r2 only**, `<jsonPayload>` also includes `"dimension": "implemented"` for this default pass -- see [r2: maturity dimensions](#r2-maturity-dimensions-implemented-first-by-default) below; e1/i1 payloads never include a `dimension` field. This is the mechanical backstop, not just prose: it throws and makes **no** changes to the file if `status` is `"met"` without a justification, or `"in_progress"` without both `currentState` and `estimatedCloseness` -- so a rule "known" only in this document can't be silently skipped. It always stamps the relevant `assessedAt` (the control's own for e1/i1, or the targeted dimension's for r2), including for a deferred control (stored as `not_assessed`, same as an untouched one, but `assessedAt` is what distinguishes "asked but deferred" from "never touched").
7. Regenerate the dashboard now, after this sub-batch -- not only once the whole category finishes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```
   This is what actually bounds the value an interruption can cost: after every sub-batch commit, `dashboard.html` on disk reflects real assessed progress, not just `state.json`.
8. If controls remain unprocessed in the chosen category, report a brief sub-batch summary (controls processed this sub-batch, statuses captured, sub-batches remaining), call `EnterPlanMode` again, and repeat step 4's sub-batch loop for the next 4-6 controls in the same category -- there's no need to re-run Part 1 steps 2-3 unless the user wants to switch to a different category before this one is finished.
9. Once every control in the category has been applied across however many sub-batches it took, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json hitrust <tier> <domainKey>
   ```
   This throws if any control in that group still has `assessedAt: null` (something was missed, or an earlier sub-batch is still pending -- a hard stop, not a silent skip). On success it moves the group from `domainsRemaining` to `domainsCompleted`, updates `lastUpdatedAt`, and flips the session to `"completed"` once `domainsRemaining` is empty.
10. **Check for un-researched gaps right now, not just at full-tier completion.** Look at every control in `domainsCompleted` so far (the category that just finished, plus any earlier ones from this or a prior session) for `assessment.status` in `gap`/`in_progress` with `roadmap.status` still `not_started` or `researching` (for r2, check `assessment.maturity.implemented.status` instead -- the top-level `assessment.status` is only ever `null` or `not_applicable` for r2). If any exist, tell the user how many and offer [Roadmap](#d-roadmap) right now. If they accept, it launches in the **background** (see [Roadmap](#d-roadmap)) and you continue interviewing immediately -- researching and interviewing are no longer mutually exclusive. Exclude any controls already dispatched to a still-running background roadmap this session, so they aren't re-researched. They can also decline and keep interviewing, or stop for now; nothing forces them into Roadmap before the tier is fully interviewed.
11. Regenerate the dashboard once more (step 7 already reflects this sub-batch; this pass also picks up the category moving to `domainsCompleted` from step 9), then report a full category-completion summary to the user: counts of met/gap/in-progress/deferred across the whole category, categories remaining, and the dashboard path.

### Discipline (why the mechanical gate exists)

- Never hand-edit `state.json` to bypass a required field -- if you're tempted to write `"status": "met"` directly into the file to save a round-trip, that's exactly the shortcut `apply-assessment.js` exists to block. Always go through the script.
- Never silently skip a control -- every control gets asked, even if the answer is "defer."
- "Met" always needs a real justification; "in progress" always needs both current-state and estimated-closeness. If the user gives a one-word or evasive answer, ask again before calling `apply-assessment.js` -- don't paper over it with a placeholder string, since the script only checks for non-blank, not for genuine content.

### Known limitation (accepted, not a bug)

If a session is interrupted mid-sub-batch -- before that sub-batch's `ExitPlanMode` -- only that sub-batch's Q&A (4-6 controls) is lost and redone next session; any earlier sub-batches already committed within the same category are unaffected, since each sub-batch's `apply-assessment.js` calls (Part 2 step 6) already wrote them to `state.json`. This is the deliberate resume granularity this schema chose -- a smaller blast radius than losing a whole category, in exchange for more `EnterPlanMode`/`ExitPlanMode` round-trips per category.

### r2: maturity dimensions (Implemented-first by default)

r2 is the only tier that scores five PRISMA maturity dimensions per control (Policy, Procedure, Implemented, Measured, Managed) instead of one flat status -- see `docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md`. To keep the default interview exactly as cheap as e1/i1 (one question per control), Part 1 step 4 and Part 2 step 6 above target **only the `implemented` dimension** by default for r2 -- every `apply-assessment.js` call in the default r2 interview pass includes `"dimension": "implemented"` in its payload. The other four dimensions (`policy`, `procedure`, `measured`, `managed`) are left `not_assessed` unless the user explicitly asks to deepen a control.

**Deepening a control (optional, any time):** if the user wants to go beyond Implemented for a specific r2 control or domain, repeat Part 1's plan-mode Q&A loop for that control, once per remaining dimension, then commit each with the same `apply-assessment.js` call shape but `"dimension"` set to the dimension just answered (e.g. `"dimension": "policy"`). A **hard validation** applies: `managed` can never be marked `"met"` until `measured` is already `"met"` on that control (HITRUST's own PRISMA rule -- Managed can't outscore Measured) -- `apply-assessment.js` throws if this is attempted, so ask about `measured` before `managed` when deepening.

**Whole-control not applicable:** omit `dimension` entirely and pass `{"status": "not_applicable"}` to mark a control not applicable across all five dimensions at once (this is the only whole-control call r2 supports). To reverse it, call again with no `dimension` and `{"status": "not_assessed"}`.

**Domain completion is Implemented-only:** step 9's group-completion call only requires every control's `implemented` dimension (or whole-control not_applicable) to be resolved -- deepening the other four dimensions is optional progress that never blocks a domain from completing.

## (d) Roadmap

Available as soon as ANY completed category/domain has un-researched gaps (see [Interview](#c-interview) step 10) -- not gated on the whole tier finishing. Also invocable any time standalone, e.g. to pick up gaps that were deferred earlier. **Runs in the background:** it's launched fire-and-forget so it never blocks the interview, and its findings are merged in whenever it finishes (steps 2-4).

1. **Budget tier.** Check `state.organization.budgetTier`:
   - If already set, tell the user "using your saved default: `<tier>`" and offer (`AskUserQuestion`) to keep it or change it for this run.
   - If not set, ask (`AskUserQuestion`): open source/freeware, small business, enterprise, or startup-that-might-scale. It's saved as the new default automatically once the workflow runs (see step 3) -- no separate write needed here.
2. **Launch, fire-and-forget.** Run the `Workflow` tool with the contents of `${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/workflow.js` as `script`, passing `args: { controls: [...], budgetTier }` where `controls` is built from every `gap`/`in_progress` control with `roadmap.status` still `not_started` or `researching` -- **except** any control ids you've already dispatched to a still-running background roadmap this session (track those in conversation context so they aren't researched twice) -- across whichever tier(s) the user wants covered: `{ id, relatedControlCode or topicLabel, relatedControlName or topicSummary, domainKey, domain }` -- **only the control's public subject (its code/label/name and domain), never the org's `justification` or in-progress posture notes.** Vendor research is dispatched to a web-tool-holding agent, so posture prose must stay local: `workflow.js`'s `buildPrompt` mechanically drops anything outside a fail-closed subject allowlist (`lib/roadmap/sanitize-control.js`) -- but don't lean on that backstop, just never put justification/in-progress text in the payload to begin with. (Filtering out `roadmap.status: "complete"` controls is what makes this safe to re-run repeatedly as new gaps appear across sessions, instead of re-researching the same ones.) The `Workflow` tool returns immediately with a task-id and delivers its result later via a `<task-notification>` -- **launch it and do not wait for it**: record the dispatched control ids as in-flight, tell the user vendor research for N controls is now running in the background, and return to the interview (or end the turn if this was a standalone Roadmap run).
3. **When the background task completes** (its `<task-notification>` arrives), drain it -- but only in normal mode, never mid-plan-mode. For an in-interview run that's the drain checkpoint at the top of the next Part 2 (normal-mode) block; for a standalone run, do it as soon as the notification arrives. To drain: capture the workflow's returned `{ budgetTier, results }`, write it to a scratchpad JSON file, then run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/merge-roadmap.js" <docs/ciso-dir>/state.json <result.json path>
   ```
   to merge vendor findings into each control's `roadmap` field (works across any tier, keyed by control id). Then clear those control ids from your in-flight set.
4. Call the dashboard regenerator, then present a **brief, non-blocking** summary -- call out any `confidence: "low"` or empty-vendor results as needing manual follow-up, not silently accepted. Until this merge lands, the dashboard still shows those gaps as un-researched (a deliberate consequence of not tracking an in-flight state on disk) -- the "research running in the background" message from step 2 is what tells the user findings are on the way.

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
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/reconcile-state-version.js" <docs/ciso-dir>/state.json hitrust <tier> <new-structure-file>
   ```
   This never deletes assessment/roadmap data: unchanged/modified ids carry their existing `assessment`/`roadmap` forward (modified ones flagged `needsReview: true`), new ids are seeded `not_assessed`, and ids no longer present move to that tier's `archivedControls` bucket rather than being dropped.
4. Call the dashboard regenerator, then present a summary (carried forward / needing review / new / archived counts).
