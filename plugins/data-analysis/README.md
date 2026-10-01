# data-analysis

Two skills for a data science project. `review` empirically reviews it: independently
re-derives findings from its raw data and code (blind to what the project itself claims), then
checks whether those claims actually hold up. `discover` starts from a business decision and
surfaces the patterns its data supports; see [Discover](#discover). Neither modifies the
project. See [Guarantees](#guarantees) and [Discover guarantees](#discover-guarantees).

Not installed yet? See the [repo root README](../../README.md) for how to add this marketplace
and install the plugin.

Upgrading from `data-analysis-review`? Version 1.0.0 renames the plugin. Run
`/plugin uninstall data-analysis-review`, then `/plugin install data-analysis`. The skill is now
`data-analysis:review`, and its default report folder moves to `docs/data-analysis/`.

## When to use it

- You want a second, independent opinion on whether a data science project's stated conclusions
  are actually supported by its data and code.
- You want to check that a project is *cohesive* (data, methodology, code, and conclusions fit
  together) and *rational* (the approach makes sense given the stated business goal), not just
  bug-free.

## When not to use it

- You want the project fixed, refactored, or built on. This skill only reviews; it never edits
  the project it's reviewing.
- You have a quick, one-off question about the data. This skill's full gating-and-review flow
  is overkill for that; just ask directly instead.
- There is no conclusion to check, only a decision to inform. Use [discover](#discover).

## Quickstart

1. `cd` into the data science project you want reviewed (this skill reviews the current working
   directory).
2. Ask Claude to review it, e.g.: *"Review this project. Is the conclusion actually supported
   by the data?"*
3. Claude walks the project's layout, then asks you a few questions before doing any analysis.
   It does this in plan mode only if your session is already in plan mode:
   - Always confirms the project's business thesis and goals, even when they are documented, and
     offers one rewrite if the thesis doesn't name the decision it informs, the metric, and a
     baseline or threshold. You can keep your own wording.
   - Offers to load any installed skills relevant to the project's domain/stack.
   - Proposes the reviewer roster: 4 fixed specialists (data quality, statistical methodology,
     domain/business alignment, reproducibility) plus optional extra reviewers if the project
     touches a specialized domain (clinical, financial, fairness-sensitive, time-series, causal).
   - Asks whether you want the final report saved to a file, or just shown in the conversation.
4. After the questions (or, in plan mode, once you approve the plan), Claude runs the analysis: each reviewer independently examines the
   raw data and code (executing code to verify claims empirically where it can) without ever
   seeing what the project itself concluded. Their findings are reconciled for cross-role
   contradictions, then checked against the project's own stated conclusions, one topic at a time.
5. You get a report with:
   - An executive summary of three lines that says whether the conclusion is supported, which
     decision it affects and how much, and the one thing to fix.
   - Independent findings per reviewer, with evidence.
   - Cross-role disagreements (if any) found before anyone looked at the project's conclusions.
     At most 12 topics go on to the comparison below (you can pick another cap); any past the cap
     are listed here as not compared, never dropped silently.
   - A topic-by-topic comparison of what the project claims vs. what the independent review found.
   - Independent findings the project's report does not address at all.
   - Headline verdicts for **Accuracy**, **Cohesiveness**, and **Rationale**, each qualitative,
     with the evidence behind it (no numeric scores).

The whole flow is interactive: you'll be asked to confirm the thesis, the reviewer roster, and
whether to save the report before any analysis runs.

## Guarantees

- **Never modifies the reviewed project.** All analysis, including any code execution,
  runs against a disposable copy made before analysis starts. The analysis engine refuses to run
  if any path it is given lies outside that copy. The only possible write to your actual project is
  one optional report file, and only if you opt in.
- **Genuinely independent.** The reviewers never see the project's own conclusions until after
  their own findings are locked in.
- **Real verification, not just reading.** Reviewers execute code against the raw data where
  possible to recompute claims themselves. Each finding carries a `verified` flag that is true
  only when the command ran and its output is in the evidence; the report tags anything else as
  unverified so you can see which findings are empirically backed.
- **Same rigor whoever calls it.** The review agents are pinned to Opus, so the report's quality
  does not depend on the model your session happens to be running.

## Discover

### When to use discover

- You have a decision to make, the metric that informs it, and a baseline (the do-nothing or
  current-practice value), and want to know what the raw data says that bears on it.
- Use `review` instead when the project already states a conclusion you want checked, and a
  first-pass EDA skill when there is no decision yet.

### Discover quickstart

1. `cd` into the project that holds the data.
2. Ask, e.g.: *"We need to decide whether to cut the repeat discount. What in this data bears
   on it, against today's 4% churn?"*
3. Claude lists the data files and data docs, then confirms the thesis (offering one rewrite if
   it lacks the decision, the metric or the baseline, and stopping if it still does) and whether
   to save the report.
4. It reads only the column names and offers 2 to 4 dimensions to cut the data along; you pick
   them and may add your own.
5. One pattern hunter per dimension works on a copy holding only the data files and data docs.
   A reconciler merges their patterns and flags any that reverse across dimensions, and a
   skeptic rates up to 8 candidates for materiality against the baseline.
6. You get a report with the candidates ranked most material first, each with its evidence, the
   decision it affects, why it got its rating, and the next check that would settle it.

### Discover guarantees

- **Never modifies the project.** Agents see only a disposable copy holding the data files and
  data docs, and the engine refuses to run if any path lies outside it.
- **Never sees a prior conclusion.** Code, notebooks and reports are left out of the copy.
- **No causes from correlations.** Patterns are descriptive; a candidate rises above that only
  when its evidence rules out confounding, and one not verified by execution stays descriptive.
- **Single run, said so.** Patterns are not re-run to check they recur, and the report says to
  treat each as a lead.
