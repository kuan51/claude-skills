# data-analysis-review

Empirically reviews a data science project: independently re-derives findings from its raw
data and code (blind to what the project itself claims), then checks whether those claims
actually hold up. Never modifies the project you're reviewing — see [Guarantees](#guarantees).

Not installed yet? See the [repo root README](../../README.md) for how to add this marketplace
and install the plugin.

## When to use it

- You want a second, independent opinion on whether a data science project's stated conclusions
  are actually supported by its data and code.
- You want to check that a project is *cohesive* (data, methodology, code, and conclusions fit
  together) and *rational* (the approach makes sense given the stated business goal), not just
  bug-free.

## When not to use it

- You want the project fixed, refactored, or built on — this skill only reviews; it never edits
  the project it's reviewing.
- You have a quick, one-off question about the data — this skill's full gating-and-review flow
  is overkill for that; just ask directly instead.

## Quickstart

1. `cd` into the data science project you want reviewed (this skill reviews the current working
   directory).
2. Ask Claude to review it, e.g.: *"Review this project — is the conclusion actually supported
   by the data?"*
3. Claude enters plan mode and walks the project's layout, then asks you a few questions before
   doing any analysis:
   - Confirms the project's business thesis and goals (if they aren't already clearly documented).
   - Offers to load any installed skills relevant to the project's domain/stack.
   - Proposes the reviewer roster — 4 fixed specialists (data quality, statistical methodology,
     domain/business alignment, reproducibility) plus optional extra reviewers if the project
     touches a specialized domain (clinical, financial, fairness-sensitive, time-series, causal).
   - Asks whether you want the final report saved to a file, or just shown in the conversation.
4. Once you approve the plan, Claude runs the analysis: each reviewer independently examines the
   raw data and code — executing code to verify claims empirically where it can — without ever
   seeing what the project itself concluded. Their findings are reconciled for cross-role
   contradictions, then checked against the project's own stated conclusions, one topic at a time.
5. You get a report with:
   - Independent findings per reviewer, with evidence.
   - Cross-role disagreements (if any) found before anyone looked at the project's conclusions.
   - A topic-by-topic comparison of what the project claims vs. what the independent review found.
   - Three headline verdicts — **Accuracy**, **Cohesiveness**, **Rationale** — each qualitative,
     with the evidence behind it (no numeric scores).

The whole flow is interactive: you'll be asked to confirm the thesis, the reviewer roster, and
whether to save the report before any analysis runs.

## Guarantees

- **Never modifies the reviewed project.** All analysis — including any code execution —
  runs against a disposable copy made before analysis starts; the analysis engine refuses to run
  if a path it's given falls outside that copy. The only possible write to your actual project is
  one optional report file, and only if you opt in.
- **Genuinely independent.** The reviewers never see the project's own conclusions until after
  their own findings are locked in.
- **Real verification, not just reading.** Reviewers execute code against the raw data where
  possible to recompute claims, rather than taking the project's numbers on faith.
