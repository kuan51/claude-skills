# Interview (flow b)

Read this when the routing step in `../SKILL.md` picks Interview. The core discipline invariants are summarized in `../SKILL.md`; the full mechanics are here.

Resumable, chunked by `domainKey` (`CL4`-`CL10` for the clauses, `A5`-`A8` for the Annex A themes) and, within each chunk, committed in sub-batches of 4-6 requirements at a time rather than as one whole-domain commit. **Must run inside native plan mode** -- a firm requirement, not a style choice: each sub-batch only counts as "committed" once the user approves it via `ExitPlanMode`.

## Do the clauses first

**Suggest `CL4` → `CL10` before any `A5`-`A8` theme**, and say why when you do: clause 6.1.3 is what *selects* the Annex A controls in the first place. An organization that assesses Annex A first has picked its controls before defining the risk assessment that justifies them, which is the inversion ISO auditors look for and the reason "we implemented the controls" is not the same as "we have an ISMS."

Note the sizing. `A5` has 37 entries and `A8` has 34, while `CL5`, `CL8` and `CL10` have 3, 3 and 2 -- so sub-batch by count, not by domain, and expect the small clause domains to take several per sitting while `A5` spans many.

## Part 1 -- inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `iso27001`/`isms` entry from `interviewSessions` (it should already exist from registration; if somehow missing, re-run [Register](register.md) first). Present `domainsCompleted` vs `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining domain to work through this session, suggesting the next uncompleted clause domain per the ordering above. Note `domainsRemaining` is sorted **alphabetically**, so `A5`-`A8` sort ahead of every `CL` domain and `CL10` sorts ahead of `CL4` -- the head of that list is the wrong default twice over. Read past it. The user can always pick a different domain, or re-select a completed one to amend prior answers (completion isn't a lock).
4. Sort the domain's entries by `relatedControlCode` and work through them in sub-batches of 4-6 -- **never accumulate a whole domain before the first `ExitPlanMode`**. For each requirement:
   - Present it: the code, its `topicLabel`, and its `topicSummary`. **Restate that the summary is our paraphrase, not ISO's wording** -- the first time per session is enough, but never let a user believe they are reading the standard.
   - Ask its status (`AskUserQuestion`, single-select): **met** / **in progress** / **gap** / **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option.
   - Then, freeform conversational follow-up:
     - **met** -> a non-empty justification is mandatory. For a clause, push for the *record* that proves it: ISO conformity is evidenced by documented information, and "we do that" without a retained record is what becomes a nonconformity at Stage 2.
     - **in progress** -> both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **defer** -> notes encouraged, not required.
     - **not applicable** -> see the next section. This is only valid for Annex A, and the justification is doing real work.
   - Hold the requirement's `{status, justification, currentState, estimatedCloseness}` in conversation context. **Do not write to `state.json` during this part.**
5. Call `ExitPlanMode` with a plan body restating every requirement processed in this sub-batch and its captured status + detail. One approval commits this sub-batch.

## `not_applicable` means "excluded from the SoA, and here is why"

For an Annex A control, `not_applicable` is the exclusion decision the Statement of Applicability has to defend, so the justification is the deliverable, not a formality. Push for a reason that names *why the risk does not apply to this organization* -- "we develop no software in house, so there is no development lifecycle to secure" -- and push back on reasons that are really "we haven't done it yet," which is a **gap**, not an exclusion. Assessors read exclusions first because that is where scope gets quietly narrowed.

**A clause is never `not_applicable`.** Clauses 4-10 apply to every ISMS without exception. If a user reaches for it on a `CL*` entry, that is a gap or a deferral.

## Part 2 -- after approval, normal mode

**First, drain any finished background roadmap** -- see [Roadmap](roadmap.md) step 3. Never while plan mode was still active.

6. For every requirement processed in this sub-batch, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json iso27001 isms <controlId> '<jsonPayload>'
   ```
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null). `apply-assessment.js` is certification-agnostic core; ISO uses its flat status path exactly as e1/i1 and SOC 2 do. **Never pass a `dimension` field** -- that is HITRUST r2's PRISMA maturity model and has no ISO equivalent; ISO conformity is binary, graded by the certification body as conforming, a minor nonconformity, or a major one. This call is the mechanical backstop, not just prose: it throws and makes **no** changes if `status` is `"met"` without a justification, or `"in_progress"` without both `currentState` and `estimatedCloseness`.

   Watch the ids. Clause `8.1` and Annex A `A.8.1` are different requirements -- `iso27001-8.1` and `iso27001-a.8.1` -- and the same collision exists at 5.1, 6.2 and 7.2. Take the id from the control record rather than building it from the code.
7. Regenerate the dashboard now, after this sub-batch -- not only once the whole domain finishes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```
   One run regenerates both `dashboard.html` (the cross-certification index) and `cert-iso27001.html`. This is what bounds the value an interruption can cost.
8. If requirements remain in the chosen domain, report a brief sub-batch summary, call `EnterPlanMode` again, and repeat step 4's loop.
9. Once every requirement in the domain has been applied, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json iso27001 isms <domainKey>
   ```
   (four arguments, not five -- this marks the domain complete in the interview session).
10. If the completed domain turned up any `gap` or `in_progress` requirements whose `roadmap.status` is still `not_started`, offer [Roadmap](roadmap.md) -- it runs in the background and never blocks the next domain.

## The question worth asking on clause entries

Annex A answers tend to be concrete -- the control exists or it doesn't. Clause answers are where self-assessments overstate, because the activity often happens informally and leaves no record. Three that are worth a second question every time:

- **9.2.2 (audit programme)** -- an internal audit that was never performed is the single most common reason a first certification attempt stalls. "We're planning to" is `gap`.
- **9.3.1-9.3.3 (management review)** -- ask for the minutes. A review with no retained record did not happen, as far as Stage 2 is concerned.
- **6.1.2 / 6.1.3 (risk assessment and treatment)** -- ask whether the process is repeatable and produces comparable results, not just whether a risk register exists. A spreadsheet written once, by one person, with no stated criteria, is a `gap` dressed as a `met`.
