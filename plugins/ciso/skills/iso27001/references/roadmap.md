# Roadmap (flow c)

Read this when `ciso:roadmap` dispatches here. Available as soon as ANY completed domain has un-researched gaps. It does not wait for every domain in the tier to finish. **Runs in the background:** launched fire-and-forget so it never blocks the interview, with findings merged in whenever it finishes.

The roadmap workflow is certification-agnostic core (see `ADDING-A-CERTIFICATION.md`). It lives under `skills/hitrust/lib/roadmap/` for historical reasons and doesn't need an ISO-specific variant.

1. **Budget tier.** Check `state.organization.budgetTier`:
   - If already set, tell the user "using your saved default: `<tier>`" and offer (`AskUserQuestion`) to keep it or change it for this run.
   - If not set, ask (`AskUserQuestion`): open source/freeware, small business, enterprise, or startup-that-might-scale. It is saved as the new default automatically once the workflow runs.
2. **Launch, fire-and-forget.** Run the `Workflow` tool with the contents of `${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/workflow.js` as `script`, passing `args: { controls: [...], budgetTier }` where `controls` is built from every `gap`/`in_progress` entry with `roadmap.status` still `not_started` or `researching`, **except** any ids already dispatched to a still-running background roadmap this session (track those in conversation context so they aren't researched twice). Each entry is `{ id, relatedControlCode, topicLabel, domainKey, domain }`.

   **Only the requirement's public subject goes in the payload: never the org's `justification` or in-progress posture notes.** Vendor research is dispatched to a web-tool-holding agent. `workflow.js`'s `buildPrompt` mechanically drops anything outside a fail-closed subject allowlist (`lib/roadmap/sanitize-control.js`), but don't depend on that backstop: never put justification or in-progress text in the payload to begin with.

   The `Workflow` tool returns immediately with a task-id and delivers its result later via a `<task-notification>`. **Launch it and do not wait.** Record the dispatched ids as in-flight and tell the user vendor research for N requirements is running in the background. Then return to the interview.
3. **When the background task completes**, drain it, but only in normal mode, never mid-plan-mode. For an in-interview run that is the drain checkpoint at the top of the next [Interview](interview.md) Part 2 block. To drain, capture the workflow's returned `{ budgetTier, results }`. Write it to a scratchpad JSON file. Then run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/merge-roadmap.js" <docs/ciso-dir>/state.json <result.json path>
   ```
   `merge-roadmap.js` is keyed by control id and works across any certification. Then clear those ids from your in-flight set.
4. Regenerate the dashboard, then present a **brief, non-blocking** summary: call out any `confidence: "low"` or empty-vendor results as needing manual follow-up, not silently accepted.

## Two ISO-specific caveats worth passing on

- **No tool closes a clause.** Vendor research is useful against Annex A, where most entries have a product answer. It is close to useless against `CL4`-`CL10`, where internal audit, management review, and risk assessment criteria all require your organization's own judgment, not a platform's automation. A compliance platform will *host* those records, which is not the same thing. If a clause gap comes back with a confident vendor recommendation, treat that as a signal the research misread the requirement.
- **Buying the platform does not shorten the ISMS's operating history.** A certification body checks whether the management system is actually running: internal audit performed, and management review held. Risks must also be treated, and tooling adopted this month does not produce the audit that should have happened last quarter. The recommendation must address that timing, not just the price.
