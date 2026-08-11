# Roadmap (flow c)

Read this when `ciso:roadmap` dispatches here. Available as soon as ANY completed domain has
un-researched gaps -- not gated on the whole tier finishing. **Runs in the background:** launched
fire-and-forget so it never blocks the interview, with findings merged in whenever it finishes.

The roadmap workflow is certification-agnostic core (see `ADDING-A-CERTIFICATION.md`); it lives under
`skills/hitrust/lib/roadmap/` for historical reasons and needs no CMMC-specific variant.

1. **Budget tier.** Check `state.organization.budgetTier`:
   - If already set, tell the user "using your saved default: `<tier>`" and offer
     (`AskUserQuestion`) to keep it or change it for this run.
   - If not set, ask (`AskUserQuestion`): open source/freeware, small business, enterprise, or
     startup-that-might-scale. It is saved as the new default automatically once the workflow runs.
2. **Launch, fire-and-forget.** Run the `Workflow` tool with the contents of
   `${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/workflow.js` as `script`, passing
   `args: { controls: [...], budgetTier }` where `controls` is built from every `gap`/`in_progress`
   entry with `roadmap.status` still `not_started` or `researching` -- **except** any ids already
   dispatched to a still-running background roadmap this session (track those in conversation context
   so they aren't researched twice). Each entry is
   `{ id, relatedControlCode, topicLabel, domainKey, domain }`.

   **Only the requirement's public subject goes in the payload -- never the org's `justification` or
   in-progress posture notes.** Vendor research is dispatched to a web-tool-holding agent.
   `workflow.js`'s `buildPrompt` mechanically drops anything outside a fail-closed subject allowlist
   (`lib/roadmap/sanitize-control.js`), but don't lean on that backstop: never put justification or
   in-progress text in the payload to begin with.

   This matters more for CMMC than for any other certification in `ciso`. An organization's CUI
   posture and its unmet-requirement list are, in aggregate, exactly the targeting information the
   defense supply chain is attacked for — and the org's SPRS score is contract-sensitive. The rule is
   the same as everywhere else; the consequence of breaking it is larger.

   The `Workflow` tool returns immediately with a task-id and delivers its result later via a
   `<task-notification>` -- **launch it and do not wait**: record the dispatched ids as in-flight,
   tell the user vendor research for N requirements is running in the background, and return to the
   interview.
3. **When the background task completes**, drain it -- but only in normal mode, never mid-plan-mode.
   For an in-interview run that is the drain checkpoint at the top of the next
   [Interview](interview.md) Part 2 block. To drain: capture the workflow's returned
   `{ budgetTier, results }`, write it to a scratchpad JSON file, then run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/roadmap/merge-roadmap.js" <docs/ciso-dir>/state.json <result.json path>
   ```
   `merge-roadmap.js` is keyed by control id and works across any certification. Then clear those ids
   from your in-flight set.
4. Regenerate the dashboard, then present a **brief, non-blocking** summary -- call out any
   `confidence: "low"` or empty-vendor results as needing manual follow-up, not silently accepted.

## Three CMMC-specific caveats worth passing on

- **FedRAMP status is a gating question no generic vendor search will ask.** If CUI will be processed
  in a cloud service, DFARS 252.204-7012 requires that service to meet FedRAMP Moderate baseline
  equivalency. A recommendation that is otherwise perfect and lacks that status is not usable for
  CUI. Treat "is this FedRAMP authorized or equivalent?" as a filter on every hosting, collaboration
  or managed-service recommendation, and say so when the research doesn't answer it.
- **A product cannot close 3.12.4.** The system security plan, the assessment, and the POA&M are
  work the organization does. A GRC platform will *host* them, which is not the same thing. The same
  goes for 3.11.1 (risk assessment) and the policy-shaped requirements across every family. A
  confident vendor recommendation against one of those is a signal the research misread the
  requirement.
- **Buying the tool does not raise the SPRS score until it is implemented and documented.** CMMC
  scores implementation, and an unimplemented purchase scores exactly as a gap does. Timing belongs
  in the recommendation, not just price — particularly for the 5-point requirements, which are not
  POA&M-eligible and therefore cannot be deferred past assessment.
