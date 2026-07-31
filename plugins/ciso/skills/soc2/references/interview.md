# Interview (flow c)

Read this when the routing step in `../SKILL.md` picks Interview. The core discipline invariants are summarized in `../SKILL.md`; the full mechanics are here.

Resumable, chunked by `domainKey` (the criteria family: `CC1`-`CC9`, `A1`, `C1`, `PI1`, and `P1`-`P8`) and, within each chunk, committed in sub-batches of 4-6 criteria at a time rather than as one whole-family commit. **Must run inside native plan mode** -- a firm requirement, not a style choice: each sub-batch only counts as "committed" once the user approves it via `ExitPlanMode`.

**Run [Scope](scope.md) first.** Which categories are in scope decides which of the 61 entries should be asked about at all; out-of-scope categories should already be `not_applicable` before you start.

## Part 1 -- inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `soc2`/`type2` entry from `interviewSessions` (it should already exist from registration; if somehow missing, re-run [Register](register.md) first). Present `domainsCompleted` vs `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining family to work through this session. **Suggest the next uncompleted `CC` family, in `CC1` → `CC9` order** -- the COSO-derived families (CC1-CC5) establish the governance answers the later technical families lean on, and the Common Criteria are the only mandatory ones. Note that `domainsRemaining` is sorted **alphabetically**, so `A1` and `C1` sort ahead of `CC1` and the head of that list is the wrong default here -- read past them. The optional categories (`A1`, `C1`, `PI1`, `P1`-`P8`) come after the Common Criteria, and only if the scope selected them. The user can always pick a different family, or re-select a completed one to amend prior answers (completion isn't a lock).
4. Sort the family's criteria by `relatedControlCode` (`CC6.1`, `CC6.2`, ...) and work through them in sub-batches of 4-6 -- **never accumulate a whole family before the first `ExitPlanMode`**. Families are very unevenly sized (`CC6` has 8 and `P6` has 7, while `CC8`, `P1`, `P2`, `P7` and `P8` have exactly 1 each), so sub-batch by count, not by family -- and for the single-criterion families, expect to cover several in one sitting rather than one plan-mode round trip each. For each criterion:
   - Present it: the criterion code, its `topicLabel`, and its `topicSummary`. **Restate that the summary is a paraphrase, not AICPA's criterion text** -- the first time per session is enough, but never let a user believe they are reading the standard.
   - Show its `requiredPolicies` and `evidenceExamples`. These are the concrete conversation-openers: "do you have this policy, approved and acknowledged?" and "could you produce this evidence for every month of the observation period?"
   - Ask its status (`AskUserQuestion`, single-select): **met** / **in progress** / **gap** / **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option.
   - Then, freeform conversational follow-up:
     - **met** -> a non-empty justification is mandatory. For a Type II, probe the period explicitly: a control configured last week is not "met" for a period that started six months ago. If it was introduced mid-period, that is **in progress**, and the current-state note should say when it started.
     - **in progress** -> both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **not applicable** / **defer** -> notes encouraged, not required. For `not_applicable`, the justification should name why -- an out-of-scope category, or a control genuinely inherited from a carve-out subservice organization.
   - Hold the criterion's `{status, justification, currentState, estimatedCloseness}` in conversation context. **Do not write to `state.json` during this part.**
5. Call `ExitPlanMode` with a plan body restating every criterion processed in this sub-batch and its captured status + detail. One approval commits this sub-batch.

## Part 2 -- after approval, normal mode

**First, drain any finished background roadmap** -- see [Roadmap](roadmap.md) step 3. Never while plan mode was still active.

6. For every criterion processed in this sub-batch, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json soc2 type2 <controlId> '<jsonPayload>'
   ```
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null). `apply-assessment.js` is certification-agnostic core -- it lives under `skills/hitrust/lib/` for historical reasons only, and SOC 2 uses its flat status path exactly as e1/i1 do; never pass a `dimension` field, which is HITRUST r2's PRISMA maturity model and does not apply here. This is the mechanical backstop, not just prose: it throws and makes **no** changes if `status` is `"met"` without a justification, or `"in_progress"` without both `currentState` and `estimatedCloseness`.
7. Regenerate the dashboard now, after this sub-batch -- not only once the whole family finishes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```
   One run regenerates both `dashboard.html` (the cross-certification index) and `cert-soc2.html`. This is what bounds the value an interruption can cost.
8. If criteria remain in the chosen family, report a brief sub-batch summary, call `EnterPlanMode` again, and repeat step 4's loop.
9. Once every criterion in the family has been applied, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json soc2 type2 <domainKey>
   ```
   (four arguments, not five -- this marks the family complete in the interview session).
10. If the completed family turned up any `gap` or `in_progress` criteria whose `roadmap.status` is still `not_started`, offer [Roadmap](roadmap.md) -- it runs in the background and never blocks the next family.

## The observation-period question

For a Type II, the interview is really asking two questions per criterion, and only the second one is hard:

- Is the control **designed** appropriately? (Does the thing exist and would it work?)
- Did it **operate effectively across the entire observation period**? (Can you produce evidence for every month, and would a sample of 10 drawn from the period all pass?)

An org that answers only the first will report a compliance percentage that collapses at fieldwork. When a user answers "met" quickly on a criterion with a sampling-heavy evidence type -- access reviews, change tickets, vulnerability remediation, backup restores -- ask what the sampling population looks like and whether it is complete. That question, asked early, is the main value this interview adds over a checklist.
