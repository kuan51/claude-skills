# Generic roadmap flow

Read this when `ciso:roadmap` resolves a framework with no `flows/roadmap.md` of its own, which is
every project framework. **Runs in the background:** launched fire-and-forget so it never blocks the
interview, with findings merged in whenever it finishes.

1. **Budget tier.** Check `state.organization.budgetTier`:
   - If already set, tell the user "using your saved default: `<tier>`" and offer
     (`AskUserQuestion`) to keep it or change it for this run.
   - If not set, ask (`AskUserQuestion`): open source/freeware, small business, enterprise, or
     startup-that-might-scale. It is saved as the new default once the workflow runs.
2. **Launch, fire-and-forget.** Run the `Workflow` tool with the contents of
   `${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/workflow.js` as `script`, passing
   `args: { controls: [...], budgetTier }`. Build `controls` from every `gap`/`in_progress` control
   with `roadmap.status` still `not_started` or `researching`, **except** any ids already dispatched
   to a still-running background roadmap this session. Each entry is
   `{ id, certKey, tierKey, statementSource, relatedControlCode, topicLabel, topicSummary, domainKey,
   domain }`, with absent fields left out. `certKey` and `tierKey` say where the control lives in
   `state.json`: `workflow.js` returns them with each result, and `merge-roadmap.js` merges into
   exactly that control, because a project framework's ids are unique only within a tier.

   **Only the control's public subject goes in the payload: never the org's `justification` or
   in-progress notes.** Always include `statementSource`: without it `workflow.js` sends only the
   codes. When it is `imported`, leave out every wording field (`relatedControlName`, `topicLabel`,
   `topicSummary`, `domain`): that wording, names and domains included, is licensed and stays on
   this machine. The entry still carries `id`, `certKey`, `tierKey`, `statementSource`,
   `relatedControlCode` and `domainKey`. `workflow.js`'s `buildPrompt`
   enforces both mechanically through the fail-closed allowlist in
   `lib/roadmap/sanitize-control.js`, but don't depend on that backstop.

   The `Workflow` tool returns immediately with a task-id and delivers its result later through a
   `<task-notification>`. **Launch it and do not wait.** Record the dispatched ids as in-flight and
   tell the user vendor research for N controls is running in the background.
3. **When the background task completes**, drain it, but only in normal mode, never mid-plan-mode.
   Capture the workflow's returned `{ budgetTier, results }`, write it to a scratchpad JSON file,
   and run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/merge-roadmap.js" <docs/ciso-dir>/state.json <result.json path>
   ```

   Then clear those ids from your in-flight set.
4. Regenerate the dashboard, then present a **brief, non-blocking** summary: call out any
   `confidence: "low"` or empty-vendor results as needing manual follow-up, not silently accepted.
