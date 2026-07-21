# Trigger-Accuracy Evals

A manually-run check for `SKILL.md`'s `description` field: does it actually win skill
selection for the queries this skill is meant to handle, and lose for the ones it
isn't? Run this whenever the description changes (this refactor's revision included) —
in an environment with 100+ installed skills, several of which cover adjacent
"analyze/validate this data" ground, under-triggering (the skill exists but doesn't
fire) and over-triggering (it fires for a request better served by a first-pass EDA
skill or a direct answer) are both real failure modes worth checking for by hand.

## Should-trigger

**Explicit**
1. "Review this data science project — is the conclusion actually supported by the data?"
2. "Audit this analysis and tell me if the findings hold up."
3. "Sanity-check the README's claims against the raw data and code."
4. "I want an independent review of whether this model's reported results are real."
5. "Can you verify this project's conclusions instead of just taking the report at face value?"

**Implicit**
6. "Does the README's claim about a 12% lift actually hold up given the raw data?"
7. "This notebook says the model beats the baseline — is that true?"
8. "Someone on my team claims this churn analysis is solid. Can you check?"
9. "I don't trust this report's numbers — can you re-derive them independently?"

**Contextual** (asked while `cwd` is a project containing notebooks/source plus a
README or report stating a conclusion)
10. "Can you sanity-check this?"
11. "Is this cohesive — does the approach actually match the stated goal?"
12. "Grade this analysis for me."

## Should-not-trigger

Negative controls that share keywords but want something this skill explicitly isn't
for (see `SKILL.md`'s "When NOT to use" section):

1. "Run EDA on this dataset and summarize what you find." (first-pass analysis, no
   existing conclusion to check)
2. "Clean up this notebook's data-loading cell." (fix/refactor, not review)
3. "What's the correlation between price and sqft in this CSV?" (one-off question,
   answer directly)
4. "Build a model to predict churn from this data." (produce a first analysis)
5. "Refactor this pipeline to be more maintainable." (fix/refactor)
6. "Validate that this CSV matches the expected schema." (schema validation — likely
   `data:validate-data`, not a conclusions-vs-evidence review)
7. "Plot the distribution of this column." (visualization, one-off)
8. "Explain what this analysis script does." (code explanation, not review)

## How to use this

Run each should-trigger query 1-3 times in a fresh session (installed-skill list may
vary run to run) and confirm `data-analysis-review` is selected. Run each
should-not-trigger query the same way and confirm it is *not* selected. A
should-trigger query that doesn't select this skill, or a should-not-trigger query that
does, is a signal the `description` field needs revision — tighten the "when to use"
half if over-triggering, sharpen the distinguishing behavior if under-triggering.
