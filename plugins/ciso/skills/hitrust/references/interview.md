# Interview (flow c)

Read this when `ciso:interview` dispatches here. The core discipline invariants live in `invariants.md`, which that verb reads first. The full mechanics (and the reasoning behind the mechanical gate) are here.

Resumable, chunked by `domainKey` (the modern 19-domain numbering, `01`-`19`, every current tier's controls carry) and, within each chunk, committed in sub-batches of 4-6 controls at a time rather than as one whole-category commit. See Part 1 step 4. Some e1 controls also carry a `legacyCategoryPrefix` (an OLDER, different numbering scheme derived from a real MyCSF control-reference code, such as `04` from `04.a`). That field is purely extra display metadata, never used for grouping, since it isn't present on every control and uses a different scheme than `domainKey`. **Must run inside native plan mode.** This is a firm, non-negotiable requirement: each sub-batch only counts as "committed" once the user approves it via `ExitPlanMode`.

## Part 1: Inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `hitrust`/`<tier>` entry from `interviewSessions` (it should already exist from registration; if somehow missing, re-run [Register](register.md) first). Present `domainsCompleted` vs `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining category/domain to work through this session. Default to the next one in `domainsRemaining` order, but let the user pick a different one. They can also re-select an already-completed one to amend prior answers (completion isn't a lock).
4. Sort every control in the chosen category by `relatedControlCode` when present, else `topicLabel`, then `id`, and work through it in sub-batches of 4-6 controls at a time. **Never accumulate a whole category's worth of controls before the first `ExitPlanMode`**. This sub-batch boundary limits how many controls an interruption can cost to a few. For each control in the current sub-batch:
   - Present it: code/topic label, name/summary, and `statementText` if imported. If `statementText` is still `null`, say so plainly and confirm with the user whether to proceed on the label/summary alone or pause here to run [Import](import.md) first. For i1/r2, also restate that the entry is non-authoritative.
   - Ask its status (`AskUserQuestion`, single-select: one control at a time, or batched up to 4 per call if that reads more naturally): **met** / **in progress** / **gap** / **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option. Never let a control move on without the user having been asked.
   - Then, freeform conversational follow-up:
     - **met** -> a non-empty justification is mandatory. If the answer is empty or a non-answer, ask again. Never accept a placeholder.
     - **in progress** -> both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **not applicable** / **defer** -> notes are encouraged, not required.
   - Hold the control's `{status, justification, currentState, estimatedCloseness}` in conversation context. **Do not write to `state.json` during this part.** Plan mode is read-only by convention here, and the discipline rule below is what actually enforces the required fields.
   Once every control in the current sub-batch (4-6 controls) has been asked, move on to step 5 to commit it.
5. Call `ExitPlanMode` with a plan body that restates every control processed in this sub-batch and its captured status + justification/detail. One approval commits this sub-batch only.

## Part 2: After approval, normal mode

**First, drain any finished background roadmap.** If a background vendor-research task (see [Roadmap](roadmap.md)) has completed since you were last in normal mode, merge its result now. Do it before the steps below, never while plan mode is still active (it's read-only). To drain: capture the workflow's returned `{ budgetTier, results }` and write it to a scratchpad JSON file. Run `merge-roadmap.js` ([Roadmap](roadmap.md) step 3) and regenerate the dashboard. Then clear those control ids from your in-flight set. This is a checkpoint the interview loop passes through every 4-6 controls, so a completion that landed several sub-batches ago still gets merged deterministically rather than relying on remembered intent. Writes are serialized (one `node` call at a time), so this merge and the `apply-assessment.js` calls below never race over `state.json`, and no locking is needed.

6. For every control processed in this sub-batch, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json hitrust <tier> <controlId> '<jsonPayload>'
   ```
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null). For **r2 only**, `<jsonPayload>` also includes `"dimension": "implemented"` for this default pass. See the note below explaining why r2's default pass covers only the `implemented` dimension (and [r2-maturity.md](r2-maturity.md) to go deeper). e1/i1 payloads never include a `dimension` field. This is the mechanical backstop, not just prose. It throws and doesn't change the file if `status` is `"met"` without a justification, or `"in_progress"` without both `currentState` and `estimatedCloseness`. This way, a rule "known" only in this document can't be silently skipped. It always stamps the relevant `assessedAt` (the control's own for e1/i1, or the targeted dimension's for r2), including for a deferred control (stored as `not_assessed`, same as an untouched one, but `assessedAt` is what distinguishes "asked but deferred" from "never touched").
7. Regenerate the dashboard now, after this sub-batch, not only once the whole category finishes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```
   This is what actually bounds the value an interruption can cost: after every sub-batch commit, the dashboard pages on disk reflect real assessed progress, not just `state.json`. One run regenerates both `dashboard.html` (the cross-certification index) and `cert-hitrust.html` (where these controls actually appear). There's no separate command for the per-certification page.
8. If controls remain unprocessed in the chosen category, report a brief sub-batch summary (controls processed this sub-batch, statuses captured, sub-batches remaining), call `EnterPlanMode` again, and repeat step 4's sub-batch loop for the next 4-6 controls in the same category. There's no need to re-run Part 1 steps 2-3 unless the user wants to switch to a different category before this one is finished.
9. Once every control in the category has been applied across however many sub-batches it took, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json hitrust <tier> <domainKey>
   ```
   This throws if any control in that group still has `assessedAt: null` (something was missed, or an earlier sub-batch is still pending: this is a hard stop that never skips silently). On success it moves the group from `domainsRemaining` to `domainsCompleted` and updates `lastUpdatedAt`. It also flips the session to `"completed"` once `domainsRemaining` is empty.
10. **Check for un-researched gaps right now, not just at full-tier completion.** Look at every control in `domainsCompleted` so far (the category that just finished, plus any earlier ones from this or a prior session) for `assessment.status` in `gap`/`in_progress` with `roadmap.status` still `not_started` or `researching` (for r2, check `assessment.maturity.implemented.status` instead. The top-level `assessment.status` is only ever `null` or `not_applicable` for r2). If any exist, tell the user how many and offer [Roadmap](roadmap.md) right now. If they accept, it launches in the **background** (see [Roadmap](roadmap.md)) and you continue interviewing immediately. Researching and interviewing are no longer mutually exclusive. Exclude any controls already dispatched to a still-running background roadmap this session, so they aren't re-researched. They can also decline and keep interviewing, or stop for now. Roadmap remains optional until the tier is fully interviewed.
11. Regenerate the dashboard once more (step 7 already reflects this sub-batch; this pass also picks up the category moving to `domainsCompleted` from step 9), then report a full category-completion summary to the user, covering counts of met/gap/in-progress/deferred across the whole category and categories remaining, plus the dashboard path.

## Mechanical-gate discipline

- Never hand-edit `state.json` to bypass a required field. If you're tempted to write `"status": "met"` directly into the file to save a round-trip, that's exactly the shortcut `apply-assessment.js` exists to block. Always go through the script.
- Never silently skip a control. Every control gets asked, even if the answer is "defer."
- A `met` status always needs a real justification. An `in progress` status always needs both current-state and estimated-closeness. If the user gives a one-word or evasive answer, ask again before calling `apply-assessment.js`. Don't paper over it with a placeholder string, since the script only checks for non-blank, not for actual content.

## Known limitation (accepted, not a bug)

If a session is interrupted mid-sub-batch (before that sub-batch's `ExitPlanMode`), only that sub-batch's Q&A (4-6 controls) is lost and redone next session; any earlier sub-batches already committed within the same category are unaffected, since each sub-batch's `apply-assessment.js` calls (Part 2 step 6) already wrote them to `state.json`. This is the deliberate resume scope this schema chose, a smaller loss than losing a whole category, in exchange for more `EnterPlanMode`/`ExitPlanMode` round-trips per category.

## r2: Default pass is Implemented-only

r2 is the only tier that scores five PRISMA maturity dimensions per control (Policy, Procedure, Implemented, Measured, Managed) instead of one flat status. See `docs/specs/2026-09-22-ciso-hitrust.md`. To keep the default interview exactly as cheap as e1/i1 (one question per control), Part 1 step 4 and Part 2 step 6 above target **only the `implemented` dimension** by default for r2. Every `apply-assessment.js` call in the default interview pass for r2 includes `"dimension": "implemented"` in its payload. The other four dimensions (`policy`, `procedure`, `measured`, `managed`) are left `not_assessed` unless the user explicitly asks to deepen a control. See [r2-maturity.md](r2-maturity.md).
