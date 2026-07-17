# Design: `data-analysis-review` skill

**Date:** 2026-07-17
**Status:** Approved (brainstorming phase complete)

## Context

The `claude-skills` repo is a blank-slate "collection of claude skills." This document specifies the first skill to add: `data-analysis-review`, which performs an **empirical, objective review of a data science project**.

The core problem it solves: a data science project's README, report, or final notebook cells state conclusions, but nothing independently checks whether those conclusions are actually supported by the underlying data and code. This skill independently re-derives findings from a project's raw inputs — blind to the project's own stated conclusions — and then explicitly checks whether those conclusions hold up. It never modifies the project under review; its only possible write action is one optional output report.

This design was produced via the `superpowers:brainstorming` process: one-question-at-a-time clarification, approach comparison with trade-offs, and section-by-section design confirmation. Every decision below was explicitly confirmed by the project owner.

## Goals

- Independently verify a data science project's empirical claims against its raw data and code, not just its own narrative.
- Distinguish three failure modes explicitly: inaccurate results, incohesive/internally-contradictory work, and unsound rationale — and report on each separately.
- Guarantee the project under review is never modified. The skill's only possible write action is a single, user-opted-in report file.
- Keep the common case fast and simple (fixed 4-role review, no network dependency) while allowing deeper, domain-grounded rigor (deep-research-sourced extra roles) when the project's domain warrants it and the user opts in.

## Non-Goals

- This skill does not fix, refactor, or otherwise modify the reviewed project.
- It does not replace domain-specific linters, test suites, or CI — it is a one-time human-in-the-loop review, not a continuous check.
- It does not attempt to cover every possible specialized review angle automatically; specialized "extra" roles are opt-in, not exhaustive by default.

## Plugin Layout

Full plugin structure (chosen over a bare skill folder, so the custom subagent roles are properly registered and reusable):

```
.claude-plugin/
  plugin.json                      # name: data-analysis-review, description, version
skills/
  data-analysis-review/
    SKILL.md                       # gating flow (plan mode) + when/how to invoke the analysis workflow
    references/
      report-template.md           # final report skeleton
      extra-roles.md               # canned personas for common optional extra reviewer roles
    workflow.js                    # the Workflow script for the analysis engine
agents/
  data-quality-reviewer.md         # fixed role: data integrity/quality
  statistical-methodologist.md     # fixed role: statistical rigor
  domain-alignment-reviewer.md     # fixed role: business/thesis alignment
  reproducibility-auditor.md       # fixed role: code & reproducibility
  findings-reconciler.md           # barrier role: cross-role contradiction check
  thesis-auditor.md                # cross-compare role (invoked once per topic)
  extra-reviewer.md                # generic reusable role for confirmed optional extras
```

**Tool access (structural guarantee):** all 7 agent types declare `Tools: Read, Grep, Glob, Bash` — no `Write`, `Edit`, or `Agent`. This makes "never modifies the project" and "never spawns its own subagents" guarantees enforced by construction, not just by prompt instruction. It closes a gap found during design review: the optional "extra" reviewer roles were originally going to run on the general-purpose agent type (full tool access, including `Agent`), which would have let them spawn their own Explore subagents and potentially break the independent-review blindness. Routing extras through the shared `extra-reviewer` type (persona supplied per-call in the prompt, not baked into the agent file) closes that gap without proliferating agent files for every possible extra.

## Plan-Mode Gating Flow

This runs interactively in the main conversation, before the analysis engine starts. It cannot be expressed as a `Workflow` script because it needs `AskUserQuestion`, `EnterPlanMode`, and `ExitPlanMode`, none of which are available inside a workflow script.

1. **Enter plan mode** (`EnterPlanMode`, if not already active).
2. **Review project hierarchy.** Catalog docs, source/notebooks, and data files. Critically, split what's found into two buckets:
   - *Raw inputs*: data files, source code, notebooks, business/requirements docs.
   - *The project's own conclusions*: README claims, final notebook cells, summary reports/decks.

   This split is what keeps the later independent-EDA phase blind — see below.
3. **Establish the business/project thesis**, before anything else downstream. If it isn't clearly documented, ask the user directly. The thesis and goals anchor every subsequent phase; nothing else proceeds on a guessed thesis.
4. **Search installed skills/plugins.** Scan the already-injected list of available skills for matches to the project's detected domain/stack (e.g. notebooks + pandas → `scientific-skills:exploratory-data-analysis`, `data:statistical-analysis`, `data:validate-data`, `scientific-skills:peer-review`). Present candidates via `AskUserQuestion` (multiSelect) for the user to confirm which to load.
5. **Confirm the reviewer roster.** The 4 fixed roles are always included. If the project shows domain signals warranting specialized review (e.g. clinical, financial, fairness-sensitive, time-series-forecasting data), offer the user a choice between:
   - **Canned extras** — fast, static personas from `references/extra-roles.md`, no network dependency.
   - **Deep-research-sourced extras** — invoke the `deep-research` skill (`Skill({skill: "deep-research", args: "<domain-specific research question>"})`) to get cited, domain-grounded recommendations for what a specialized reviewer should check, then turn the findings into persona briefs.

   This is always the user's choice, never automatic — deep-research adds real latency, tokens, and a network dependency, so it's an offered upgrade, not a default tax on routine reviews. Either way, the final roster (fixed 4 + any confirmed extras) is confirmed via `AskUserQuestion` (multiSelect).
6. **Confirm save preference.** Ask yes/no whether to save the final report at the end, with a default path (`docs/data-analysis-review/<date>-review.md`) the user can override. If declined, the report will only be shown in chat.
7. **Final gate: `ExitPlanMode`.** The plan body restates the confirmed thesis/goals, hierarchy findings, skills-to-load, reviewer roster (with rationale/citations for any deep-research-sourced extras), and save preference. Approving this single gate confirms everything at once — there is no separate, redundant confirmation step immediately before it.

## Analysis Engine (`Workflow` tool)

**Why `Workflow` and not plain `Agent` dispatch:** a full run involves roughly 9-15 agent calls (4-7 independent-EDA roles, 1 reconciliation agent, 4-7 cross-compare agents) in a `parallel → barrier → parallel` shape. The barrier is genuine — reconciliation needs every independent finding at once to check for contradictions *between* roles, so it cannot be pipelined item-by-item. This shape is `Workflow`'s canonical fit, and schema-enforced structured outputs make the later pairing of each independent finding with its corresponding cross-compare discrepancy reliable, instead of depending on parsing free-text agent replies.

**Phase 1 — Independent EDA (parallel).** Each of the 4 fixed roles, plus any confirmed extras, receives *only*:
- The confirmed thesis and goals.
- Raw data/code/notebook file paths relevant to its role.
- For extras: the canned or deep-research-derived persona brief.

They are never told that the project's own conclusion-artifact paths exist — blindness by omission, not by instruction, since an omitted fact can't be stumbled into by an over-eager Glob the way an "avoid this file" instruction could be violated under pressure. Each role executes code/queries against the raw data where possible, to independently recompute and verify claims empirically; when execution isn't possible (e.g. data too large, missing runtime), it falls back to static code/doc review and explicitly notes the limitation rather than silently skipping it.

Every phase-1 (and cross-compare) prompt includes this scope-discipline instruction, which does double duty: it stops Glob/Grep-based wandering that tool restriction alone doesn't prevent, and it's a second, independent line of defense against subagent-spawning even though the `Agent` tool is already structurally absent:

> Only read and use the exact file paths listed above. Do not use Glob or Grep to search for other files, directories, or paths beyond what was explicitly given to you. Do not invoke the Agent tool or spawn any subagents under any circumstance — perform all analysis yourself. If you believe you need a file that wasn't provided, stop and report that gap in your findings instead of searching for it.

Returns schema: `findings[] { severity, claim, evidence, required_execution }`.

**Phase 2 — Reconciliation (barrier, 1 agent, `findings-reconciler`).** Receives all phase-1 structured findings together and checks for contradictions *between* roles (e.g. the data-quality reviewer flags a column as unreliable that the statistical-methodologist relied on for a key test). This agent doesn't receive file paths — it works purely from the structured findings already gathered, so the scope-discipline instruction doesn't apply to it in the same way (nothing to over-explore). Returns `{ reconciled: [...], disagreements: [...] }`.

**Phase 3 — Cross-compare (parallel, one `thesis-auditor` agent per reconciled topic).** Only at this point does each agent receive the project's own conclusion/report file path(s) relevant to its specific topic, plus the reconciled independent finding for that topic. It reads the project's actual stated claim and compares. Returns `{ topic, project_claim, independent_finding, discrepancy, verdict }`.

**Workflow return value:** the bundled structured JSON (reconciled findings + disagreements + cross-compare array). No prose formatting happens inside the workflow — that's the main thread's job next.

## Report & Save Behavior

The main thread (back in the SKILL.md-driven conversation, after the `Workflow` call returns) builds the final report from `references/report-template.md`:

1. **Header** — project name/path, review date, confirmed thesis & goals.
2. **Scope & Method** — roster used (noting canned vs. deep-research sourcing with citations), skills loaded, and any execution limitations hit.
3. **Independent Findings** — by role: claim, evidence (file:line or executed command output), severity.
4. **Reconciliation Notes** — cross-role disagreements surfaced before the project's own conclusions were even looked at.
5. **Cross-Comparison** — per topic: project's stated claim vs. independent finding vs. verdict (Supported / Partially Supported / Unsupported), with evidence.
6. **Overall Verdicts** — the three headline dimensions, each a qualitative verdict + evidence (no numeric scores, per explicit decision):
   - **Accuracy** — do the project's stated results match what independent empirical review found?
   - **Cohesiveness** — do data, methodology, code, and conclusions fit together without internal contradiction?
   - **Rationale** — is the reasoning for the chosen approach sound given the business thesis?
7. **Recommendations** (optional) — non-blocking follow-ups worth flagging.

**The only write action in the entire skill** is this one report file, and only if the user opted in during planning (step 6 of the gating flow). If they declined, the report is shown in chat only — nothing touches disk. No automatic git commit either way; that decision is left to the user. The saved file and the chat-displayed report are identical, never divergent versions.

## Open Questions / Follow-ups for Implementation

None outstanding — every design decision above was explicitly confirmed during brainstorming. The implementation plan (next step, via `superpowers:writing-plans`) should determine:
- Exact frontmatter/content for `plugin.json` and each `agents/*.md` file.
- The precise domain-signal heuristics used in gating step 5 (what counts as "specialized enough" to offer extras).
- The exact `Workflow` script (`workflow.js`) implementing the phases described above, including the JSON schemas for each phase's structured output.
- Content of `references/extra-roles.md` (the canned extra personas) and `references/report-template.md`.

## Verification

- **Spec self-review** (this document): placeholder scan, internal consistency, scope, and ambiguity check — see commit history for this file.
- **Implementation verification** (once built): actually run the skill against a small sample data-science project directory and confirm — the gating flow asks the right questions in order; the `Workflow` analysis engine runs all phases and returns well-formed structured results; the final report matches the template; and, critically, that no project file is ever modified and no file beyond the single opted-in report is written.
