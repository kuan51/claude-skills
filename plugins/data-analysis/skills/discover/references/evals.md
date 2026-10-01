# Trigger-Accuracy Evals

A manually-run check for `SKILL.md`'s `description` field: does it win skill selection for
the queries this skill is meant to handle, and lose for the ones it isn't? Run this whenever
the description changes. Its nearest neighbours are `data-analysis:review` (an existing
conclusion to check) and first-pass EDA skills (no decision to inform), so both
under-triggering and over-triggering are real failure modes.

## Should-trigger

### Explicit

1. "We need to decide whether to cut the discount for repeat customers. Find the patterns in
   this data that bear on it, against the current 4% churn."
2. "Surface what this data says about which regions to expand into, measured by revenue per
   store against last year's average."
3. "Discover the patterns that matter for our staffing decision, using wait time against the
   current 20-minute baseline."

### Implicit

1. "Should we keep the free-shipping threshold at $50? Conversion is 3.1% today. What in the
   order data bears on that?"
2. "Which customer segments would move retention most if we changed onboarding? Retention is
   62% now."
3. "Before we reprice, what does the sales data show about margin by channel compared with
   current margin?"

### Contextual

Asked while `cwd` holds raw data and a requirements doc naming a decision, a metric and a
baseline:

1. "What in here should shape this decision?"
2. "Find the patterns that matter for the call we have to make."

## Should-not-trigger

1. "Is this README's 12% lift real?" (an existing conclusion to check: `data-analysis:review`)
2. "Audit this analysis and tell me if the findings hold up." (review)
3. "Run EDA on this dataset and summarize what you find." (first-pass, no decision)
4. "Explore this CSV and tell me anything interesting." (first-pass, no decision)
5. "What's the correlation between price and sqft in this CSV?" (one-off question)
6. "Build a model to predict churn from this data." (modelling, not discovery)
7. "Plot the distribution of this column." (visualization)
8. "Clean up this notebook's data-loading cell." (fix/refactor)

## How to use this

Run each should-trigger query 1-3 times in a fresh session and confirm
`data-analysis:discover` is selected. Run each should-not-trigger query the same way and
confirm it is not. A miss either way is a signal the `description` needs revision: sharpen
the decision, metric and baseline wording if under-triggering, tighten the review and EDA
exclusions if over-triggering.
