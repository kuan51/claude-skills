# Roadmap (flow c)

Read this when the routing step in `../SKILL.md` offers Roadmap, or when running Roadmap standalone. Available as soon as ANY completed domain has un-researched gaps -- not gated on the whole tier finishing. **Runs in the background:** launched fire-and-forget so it never blocks the interview, with findings merged in whenever it finishes.

The roadmap workflow is certification-agnostic core (see `ADDING-A-CERTIFICATION.md`); it lives under `skills/hitrust/lib/roadmap/` for historical reasons and needs no ISO-specific variant.

1. **Budget tier.** Check `state.organization.budgetTier`:
   - If already set, tell the user "using your saved default: `<tier>`" and offer (`AskUserQuestion`) to keep it or change it for this run.
   - If not set, ask (`AskUserQuestion`): open source/freeware, small business, enterprise, or startup-that-might-scale. It is saved as the new default automatically once the workflow runs.
2. **Launch, fire-and-forget.** Run the `Workflow` tool with the contents of `${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/workflow.js` as `script`, passing `args: { controls: [...], budgetTier }` where `controls` is built from every `gap`/`in_progress` entry with `roadmap.status` still `not_started` or `researching` -- **except** any ids already dispatched to a still-running background roadmap this session (track those in conversation context so they aren't researched twice). Each entry is `{ id, relatedControlCode, topicLabel, domainKey, domain }`.

   **Only the requirement's public subject goes in the payload -- never the org's `justification` or in-progress posture notes.** Vendor research is dispatched to a web-tool-holding agent. `workflow.js`'s `buildPrompt` mechanically drops anything outside a fail-closed subject allowlist (`lib/roadmap/sanitize-control.js`), but don't lean on that backstop: never put justification or in-progress text in the payload to begin with.

   The `Workflow` tool returns immediately with a task-id and delivers its result later via a `<task-notification>` -- **launch it and do not wait**: record the dispatched ids as in-flight, tell the user vendor research for N requirements is running in the background, and return to the interview.
3. **When the background task completes**, drain it -- but only in normal mode, never mid-plan-mode. For an in-interview run that is the drain checkpoint at the top of the next [Interview](interview.md) Part 2 block. To drain: capture the workflow's returned `{ budgetTier, results }`, write it to a scratchpad JSON file, then run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/merge-roadmap.js" <docs/ciso-dir>/state.json <result.json path>
   ```
   `merge-roadmap.js` is keyed by control id and works across any certification. Then clear those ids from your in-flight set.
4. Regenerate the dashboard, then present a **brief, non-blocking** summary -- call out any `confidence: "low"` or empty-vendor results as needing manual follow-up, not silently accepted.

## Two ISO-specific caveats worth passing on

- **No tool closes a clause.** Vendor research is genuinely useful against Annex A, where most entries have a product answer. It is close to useless against `CL4`-`CL10`: no platform performs your internal audit, holds your management review, or writes your risk assessment criteria for you. A compliance platform will *host* those records, which is not the same thing. If a clause gap comes back with a confident vendor recommendation, treat that as a signal the research misread the requirement.
- **Buying the platform does not shorten the ISMS's operating history.** A certification body wants to see the management system actually running -- internal audit performed, management review held, risks treated. Tooling adopted this month does not produce the audit that should have happened last quarter. That timing belongs in the recommendation, not just the price.
