# Interview (flow b)

Read this when `ciso:interview` dispatches here. The core discipline invariants live in
`invariants.md`, which that verb reads first; the full mechanics are here.

Resumable, chunked by `domainKey` and, within each chunk, committed in sub-batches of 4-6
requirements at a time rather than as one whole-domain commit. **Must run inside native plan
mode** -- a firm requirement, not a style choice: each sub-batch only counts as "committed" once the
user approves it via `ExitPlanMode`.

The domain keys depend on the tier:

- `level1` -- a single domain, `FCI` (15 requirements). One or two sittings.
- `level2` -- the 14 NIST families, `3.1` through `3.14`. Note `domainsRemaining` sorts
  **alphabetically**, so `3.1`, `3.10`, `3.11` ... `3.2` — the head of that list is not family 3.2.
  Read past it and offer numeric order.
- `level3` -- families carried over from NIST SP 800-172, a handful of requirements each.

Sizing is lopsided on `level2`: Access Control has 22 and System and Communications Protection 16,
while Personnel Security has 2 and three families have 3. Sub-batch by count, not by domain.

## Which tier, and doing Level 2 before Level 3

If both `level2` and `level3` are registered, **work `level2` to completion first** and say why: the
24 enhanced requirements assume the 110 beneath them are in place, and DIBCAC assesses Level 3
against an organization that already holds a Level 2 certification. Assessing the enhanced
requirements first produces a number that describes nothing.

## Part 1 -- inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `cmmc`/`<tier>` entry from `interviewSessions` (it should already exist from
   registration; if somehow missing, re-run [Register](register.md) first). Present
   `domainsCompleted` vs `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining domain to work through this session, suggesting the next
   uncompleted family in numeric order.
4. Sort the domain's entries by `relatedControlCode` and work through them in sub-batches of
   4-6 -- **never accumulate a whole domain before the first `ExitPlanMode`**. For each requirement:
   - Present it: the code, its `topicLabel`, and its `topicSummary`. **Say once per session that the
     summary is the verbatim requirement text but the label is our derived shorthand** — the reverse
     of every other `ciso` module, and users who have used the others will assume otherwise.
   - Ask its status (`AskUserQuestion`, single-select): **met** / **in progress** / **gap** /
     **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option.
   - Then, freeform conversational follow-up:
     - **met** -> a non-empty justification is mandatory. Push for the artifact an assessor would
       ask to see, not the intent. See the questions worth asking, below.
     - **in progress** -> both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **defer** -> notes encouraged, not required.
     - **not applicable** -> see the next section. Rarer here than in any other `ciso` module.
   - Hold the requirement's `{status, justification, currentState, estimatedCloseness}` in
     conversation context. **Do not write to `state.json` during this part.**
5. Call `ExitPlanMode` with a plan body restating every requirement processed in this sub-batch and
   its captured status + detail. One approval commits this sub-batch.

## `not_applicable` is narrow here, and a POA&M is not a `met`

Two ways a CMMC self-assessment overstates, both of which this flow has to catch:

**`not_applicable` requires that the technology genuinely does not exist in scope** — no wireless
anywhere in the boundary, no mobile devices, no publicly accessible system components. Under the DoD
Assessment Methodology a requirement that does not apply to the environment is scored as met rather
than deducted, which is exactly why it is worth pressing on. "We don't do that yet" is a **gap**, and
"we don't think it matters" is a gap too. Push for a reason that names the absent technology or data
flow.

**A requirement covered only by a plan of action is `in_progress`, never `met`.** CMMC allows a POA&M
for only a subset of requirements, none of the 5-point ones, and closes it at 180 days. If a user
answers "met" and the justification describes a plan, a purchase, or a roadmap item, that is
`in_progress` — record when the work actually started in the current-state note.

## Part 2 -- after approval, normal mode

**First, drain any finished background roadmap** -- see [Roadmap](roadmap.md) step 3. Never while
plan mode was still active.

6. For every requirement processed in this sub-batch, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json cmmc <tier> <controlId> '<jsonPayload>'
   ```
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...",
   "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null).
   `apply-assessment.js` is certification-agnostic core; CMMC uses its flat status path exactly as
   e1/i1, SOC 2 and ISO 27001 do. **Never pass a `dimension` field** -- that is HITRUST r2's PRISMA
   maturity model and has no CMMC equivalent; a CMMC requirement is met or it is not. This call is
   the mechanical backstop, not just prose: it throws and makes **no** changes if `status` is
   `"met"` without a justification, or `"in_progress"` without both `currentState` and
   `estimatedCloseness`.

   Take the id from the control record rather than building it from the code. The tiers use distinct
   prefixes (`cmmc-l1-`, `cmmc-l2-`, `cmmc-l3-`) precisely because `3.1.2` names a Level 2
   requirement and `3.1.2e` a Level 3 one.
7. Regenerate the dashboard now, after this sub-batch -- not only once the whole domain finishes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```
   One run regenerates both `dashboard.html` (the cross-certification index) and `cert-cmmc.html`.
   This is what bounds the value an interruption can cost.
8. If requirements remain in the chosen domain, report a brief sub-batch summary, call
   `EnterPlanMode` again, and repeat step 4's loop.
9. Once every requirement in the domain has been applied, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json cmmc <tier> <domainKey>
   ```
   (four arguments, not five -- this marks the domain complete in the interview session).
10. If the completed domain turned up any `gap` or `in_progress` requirements whose `roadmap.status`
    is still `not_started`, offer [Roadmap](roadmap.md) -- it runs in the background and never blocks
    the next domain.

## The questions worth asking twice

CMMC self-assessments overstate in a small number of predictable places. Each of these is worth a
second question every time:

- **3.12.4 (system security plan)** -- ask whether the SSP describes the *actual* boundary, and when
  it was last updated. A stale SSP is the document an assessor reads first, and every other claim is
  checked against it.
- **3.1.1 / 3.1.2 (access control)** and **3.5.3 (multifactor authentication)** -- these are 5-point
  requirements under the DoD Assessment Methodology and are **not** POA&M-eligible. A soft answer
  here costs more than anywhere else.
- **3.13.11 (FIPS-validated cryptography)** -- ask for the CMVP certificate number, not "we use
  AES-256." Validated and merely-strong are different claims, and this is the requirement where the
  distinction most often gets lost.
- **3.14.1 (flaw remediation)** -- ask for the timeframe actually met, not the one in the policy.
- **Anything answered from a vendor's shared-responsibility matrix** -- ask which party operates the
  control, and whether the org has the artifact. Inheriting a control from a cloud provider is
  legitimate; assuming it without the provider's documentation is not.
