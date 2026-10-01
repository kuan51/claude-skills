# Generic interview flow

Read this when `ciso:interview` resolves a framework with no `flows/interview.md` of its own, which
is every project framework. The core discipline lives in `generic-ground-rules.md`, which the verb
reads first. The mechanics are here.

Resumable, chunked by `domainKey` and, within each chunk, committed in sub-batches of 4-6 controls
at a time rather than as one whole-domain commit. **Must run inside native plan mode.** Each
sub-batch only counts as "committed" once the user approves it through `ExitPlanMode`.

Every tier here uses the flat status shape. Never pass a `dimension` field: that is HITRUST r2's
PRISMA maturity model and does not apply to any other framework, even one with a tier named `r2`.

## Part 1: Inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `<certKey>`/`<tier>` entry from `interviewSessions`. It should already exist from
   registration; if it's missing, run `ciso:register` first. Present `domainsCompleted` and
   `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining domain to work through this session, suggesting the first
   in `domainsRemaining`. The user can pick a different one, or re-select a completed one to amend
   prior answers. Completion isn't a lock.
4. Sort the domain's controls by `id` and work through them in sub-batches of 4-6. **Never
   accumulate a whole domain before the first `ExitPlanMode`.** For each control:
   - Present it: its `id`, `topicLabel` and `topicSummary`. When the tier is `public-topic-level`,
     say the summary is a paraphrase, not the publisher's wording. The first time per session is
     enough.
   - Ask its status (`AskUserQuestion`, single-select): **met** / **in progress** / **gap** /
     **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option.
   - Then, freeform follow-up:
     - **met**: a non-empty justification is mandatory.
     - **in progress**: both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **not applicable** / **defer**: notes encouraged, not required. For
       `not_applicable`, the justification should say why.
   - Hold the control's `{status, justification, currentState, estimatedCloseness}` in
     conversation context. **Do not write to `state.json` during this part.**
5. Call `ExitPlanMode` with a plan body restating every control processed in this sub-batch and
   its captured status and detail. One approval commits this sub-batch.

## Part 2: After approval, normal mode

**First, drain any finished background roadmap** (see `ciso:roadmap`). Never while plan mode is
still active.

6. For every control processed in this sub-batch, run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json <certKey> <tier> '<controlId>' '<jsonPayload>'
   ```

   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}`
   (only the fields relevant to the status need be non-null). It throws and changes nothing if
   `status` is `"met"` without a justification, or `"in_progress"` without both `currentState`
   and `estimatedCloseness`.
7. Regenerate the dashboard now, after this sub-batch:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```

   One run regenerates `dashboard.html` and `cert-<certKey>.html`.
8. If controls remain in the chosen domain, report a brief sub-batch summary, call
   `EnterPlanMode` again, and repeat step 4's loop.
9. Once every control in the domain has been applied, run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json <certKey> <tier> '<domainKey>'
   ```

   (four arguments, not five: this marks the domain complete in the interview session).
10. If the completed domain turned up any `gap` or `in_progress` controls whose `roadmap.status` is
    still `not_started`, offer `ciso:roadmap`. It runs in the background and never blocks the next
    domain.
