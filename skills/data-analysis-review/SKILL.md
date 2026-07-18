---
name: data-analysis-review
description: Use when asked to review, audit, or sanity-check a data science project's findings, conclusions, or thesis -- independently verifies claims against raw data and code rather than trusting the project's own report.
---

# Data Analysis Review

## Overview

Performs an empirical, objective review of a data science project in the current working directory: independently re-derives findings from the project's raw data and code (blind to its own stated conclusions), then explicitly checks whether those conclusions actually hold up. Does not modify the reviewed project: all analysis -- including any code execution -- runs against a disposable copy made before the analysis engine starts (step 8), and the analysis engine itself refuses to run if any path it's given isn't inside that copy. The only possible write to the original project is one optional output report, and only if the user opts in.

## When NOT to use

- The user wants you to fix, refactor, or build on the project -- this skill only reviews, it never edits the target project.
- The user wants a one-off quick question answered about the data -- this skill's full gating + multi-agent flow is overkill for that; just answer directly.

## Process

This is a two-part process: an interactive gating phase (this conversation, plan mode), then a `Workflow`-driven analysis engine.

### Part 1: Gating flow (plan mode)

1. **Enter plan mode.** Call `EnterPlanMode` if not already active.

2. **Review project hierarchy.** Explore the current working directory: docs, source, notebooks, data files. Build two lists:
   - **Raw inputs**: data files, source code, notebooks, business/requirements docs.
   - **The project's own conclusions**: README claims, final notebook cells, summary reports/decks -- anything that states what the project concluded.

   Keep these lists separate -- the raw-inputs list is what gets passed to independent-EDA agents; the conclusions list is deliberately withheld until the cross-compare phase.

3. **Establish the business thesis and goals.** If it's not clearly stated in the docs, ask the user directly via `AskUserQuestion`. Do not proceed past this step on a guessed thesis.

4. **Search installed skills.** Scan the skills already listed in your context for matches to the project's domain/stack (e.g. notebooks + pandas suggests `scientific-skills:exploratory-data-analysis`, `data:statistical-analysis`, `data:validate-data`). Present candidates via `AskUserQuestion` (multiSelect) for the user to confirm which to load. For any confirmed, read the specific guidance relevant to this project and keep a short excerpt ready to pass into agent prompts in Part 2 -- do not give subagents live access to the `Skill` tool themselves.

5. **Confirm the reviewer roster.**
   - The 4 fixed roles (`data-quality-reviewer`, `statistical-methodologist`, `domain-alignment-reviewer`, `reproducibility-auditor`) are always included.
   - Concatenate the project's README/docs text into a temp file and run `node "${CLAUDE_PLUGIN_ROOT}/skills/data-analysis-review/lib/domain-signals.js" <temp-file>` to detect specialized-domain signals (`clinical`, `financial`, `fairness`, `time_series`, `causal`). `CLAUDE_PLUGIN_ROOT` is this plugin's own installed directory -- use it for every script invocation in this skill, since the current working directory is the project being reviewed, not the plugin.
   - If any signals are found, ask the user (`AskUserQuestion`) whether to add extra reviewer roles using either:
     - **Canned personas** from `${CLAUDE_PLUGIN_ROOT}/skills/data-analysis-review/references/extra-roles.md` (fast, no network), keyed by the same signal keys -- use each entry's `Label` and `Persona` verbatim.
     - **Deep-research-sourced personas** -- call `Skill({skill: "deep-research", args: "<a specific question about review considerations/checklists for this project's detected domain>"})`, turn the cited findings into a persona brief, and compose a short human-readable label for it.
   - Confirm the final roster (fixed 4 + any chosen extras) via `AskUserQuestion` (multiSelect).

6. **Confirm save preference.** Ask yes/no whether to save the final report, default path `docs/data-analysis-review/<YYYY-MM-DD>-review.md`, overridable.

7. **Exit plan mode.** Call `ExitPlanMode` with a plan restating the confirmed thesis/goals, hierarchy findings, skills to load, reviewer roster (with citations for any deep-research-sourced extras), and save preference. Approval confirms everything at once.

### Part 2: Analysis engine (after `ExitPlanMode` approval)

8. **Sandbox the project before any analysis.** Copy the entire project directory to a fresh temporary directory outside the project (e.g. your scratchpad, or the system temp directory) -- every agent in the analysis engine, including any Bash execution the `reproducibility-auditor` performs, must only ever see paths inside this copy. Record the resulting sandbox directory path (you'll pass it as `sandboxRoot` in step 9). Then rewrite every path destined for `args` (below) from the original project root to the copy root:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/data-analysis-review/lib/sandbox-paths.js" <project-root> <sandbox-root> <path1> [path2 ...]
   ```
   This prints the rewritten paths as a JSON array, in the same order given. Use the rewritten paths -- never the originals -- for every entry in `fixedRolePaths`, `extras[].paths`, and `conclusionPaths` below. The Workflow itself (step 9) will refuse to run if any path it receives isn't inside `sandboxRoot`, so a skipped or incomplete rewrite fails loudly instead of silently reaching the original project. Keep the temporary copy until after the report is presented (step 12), since findings' evidence may reference paths inside it -- then delete it.

9. **Run the Workflow.** Read `${CLAUDE_PLUGIN_ROOT}/skills/data-analysis-review/workflow.js` and pass its contents as the `script` parameter to the `Workflow` tool, with `args` set to:
   ```js
   {
     thesis: "<confirmed thesis and goals text>",
     sandboxRoot: "<the sandbox copy's root path from step 8>",
     fixedRolePaths: {
       dataQuality: [/* raw data file paths from step 2 */],
       statistical: [/* raw data + code paths */],
       domainAlignment: [/* raw data + business doc paths */],
       reproducibility: [/* code + notebook paths */],
     },
     extras: [
       // { key: 'fairness', label: 'Fairness / Disparate-Impact Reviewer', paths: [...], persona: '<canned or deep-research brief text>' }
     ],
     skillGuidanceExcerpts: {
       // data_quality: '<excerpted guidance text, if a loaded skill applies>'
     },
     conclusionPaths: [/* the project's own conclusion/report paths from step 2, flat list */],
   }
   ```

10. **Wait for the Workflow result.** It returns `{ eda, reconciled, disagreements, crossCompare }`.

11. **Build the report.** Write the Workflow's result to a JSON file in the scratchpad directory, adding these fields before running the builder: `projectName`, `reviewDate`, `thesis`, `scope` (roster used, skills loaded, execution limitations hit), and your own written verdicts for `verdictAccuracy`, `verdictCohesiveness`, and `verdictRationale` -- each a qualitative verdict plus the evidence from `reconciled`/`crossCompare` that supports it. Add `recommendations` if there are any non-blocking follow-ups worth flagging. Findings' `evidence` fields may reference paths inside the step-8 sandbox copy (e.g. `<sandbox-root>/data/sales.csv`) -- rewrite these back to the equivalent path under the real project root before presenting, so the report doesn't cite a location that's about to be deleted. Then run:
    ```
    node "${CLAUDE_PLUGIN_ROOT}/skills/data-analysis-review/lib/report-builder.js" "${CLAUDE_PLUGIN_ROOT}/skills/data-analysis-review/references/report-template.md" <path-to-result.json>
    ```

12. **Present the report** in the conversation. If the user opted in during step 6, write it to the confirmed path (the only write action this skill ever takes against the reviewed project) -- do not also commit it; that's the user's call. Then delete the step-8 sandbox copy.

## Guarantees

- No project file is modified. All analysis -- including any code execution -- runs against a disposable copy made in step 8; agents are only ever given paths inside that copy, never the original project's path. This is enforced two ways: procedurally, by step 8 rewriting every path before it's used, and structurally, by the analysis engine (`workflow.js`) refusing to dispatch any agent if a path it receives falls outside the declared sandbox root -- so a skipped or incomplete rewrite fails loudly rather than silently reaching the original project. All 7 custom agent types (`agents/*.md`) are also restricted to `Read, Grep, Glob, Bash` -- no `Write`, `Edit`, or `Agent` -- as further defense in depth.
- Independent-EDA agents never receive the project's own conclusion-artifact paths -- they literally aren't told those paths exist.
- Every agent prompt in the analysis engine includes a scope-discipline instruction: use only the files you were given, don't Glob/Grep for more, don't spawn subagents.
