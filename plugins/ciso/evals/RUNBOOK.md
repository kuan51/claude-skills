# ciso trigger-accuracy evals

This corpus measures **skill selection**: given a realistic user message, does Claude pick the right
ciso skill (or correctly pick none)? It guards against the two failure modes the authoring rubric
cares about -- a skill that *under-triggers* (misses a query it should own) and one that
*over-triggers* (fires on an adjacent query it shouldn't).

## What's in scope

Only the two **model-invocable** skills, `init` and `hitrust`. `hitrust-controls-compiler` is
`disable-model-invocation` (maintainer-only, invoked explicitly as `/ciso:hitrust-controls-compiler`),
so it must never be auto-selected -- queries about its job live in the corpus as negatives
(`expected: null`), which doubles as a check that it stays out of the auto-trigger pool.

## The corpus

`trigger-corpus.json` -> `queries[]`, each `{ query, expected, category }`:

- `expected`: `"init"`, `"hitrust"`, or `null` (no ciso skill should fire).
- `category`: `explicit` (names the skill/action), `implicit` (describes the need), `contextual`
  (assumes project state), `disambiguation` (plausibly confusable between init and hitrust), or
  `negative` (shares keywords with a skill but should trigger neither -- adjacent intent, not random
  noise, per the rubric).

`corpus-shape.test.js` validates the corpus is well-formed (run via `node --test`); it does **not**
measure accuracy -- that needs a model in the loop (below).

## Running the evals (manual)

The repo can't self-run model-in-the-loop scoring cheaply, so this is a manual/harnessed procedure:

1. **Split** the corpus ~60/40 into a tuning set and a held-out test set (keep each category
   represented in both). Iterate skill descriptions only against the tuning set; report the number
   from the held-out set.
2. For each held-out query, start a **fresh** Claude Code session in a project where ciso is
   installed (and, for `contextual`/`hitrust` queries, where `docs/ciso/state.json` already exists),
   paste the query, and record which skill Claude auto-invokes (or none).
3. **Run each query 3x** -- single runs are too noisy. Take the majority selection.
4. **Score**:
   - *False negative*: `expected` is a skill but Claude didn't pick it (under-trigger).
   - *False positive*: Claude picked a ciso skill but `expected` was `null`, or it picked the wrong
     one (over-trigger / mis-route).
   - Trigger accuracy = correct majority selections / total held-out queries.
5. **Target**: >= 90% trigger accuracy with a low false-positive rate. If a skill under-triggers,
   make its `description` slightly more assertive and keyword-rich; if it over-triggers, tighten the
   `description` and lean on the negatives that are firing it. Re-run only after changing
   descriptions, never the corpus, to avoid fitting the test to the model.

## When to re-run

After any change to a skill's `name`/`description`, after adding a skill (new trigger space can
steal selections), or when a HITRUST framework version bump reshapes the `hitrust` description.
