# ciso trigger-accuracy evals

This corpus measures **skill selection**: given a realistic user message, does Claude pick the right
ciso skill (or correctly pick none)? It guards against the two failure modes the authoring rubric
cares about -- a skill that *under-triggers* (misses a query it should own) and one that
*over-triggers* (fires on an adjacent query it shouldn't).

## What's in scope

The eleven **model-invocable** verbs: `init`, `register`, `scope`, `import`, `interview`, `roadmap`,
`upgrade`, `review`, `evidence`, `audit`, and `sync-tasks`. `hitrust-controls-compiler` is
`disable-model-invocation` (maintainer-only, invoked explicitly as `/ciso:hitrust-controls-compiler`),
so it must never be auto-selected -- queries about its job live in the corpus as negatives
(`expected: null`), which doubles as a check that it stays out of the auto-trigger pool.
`sync-tasks` IS in scope: a user asks for it in their own words ("push our gaps into JIRA"), so it
competes for selection like any other verb even though it never runs as part of an assessment flow.

**With a verb surface, verb confusion is the failure mode that matters most.** Naming a
certification no longer picks a skill -- every verb resolves the certification at runtime -- so the
risk moved to adjacent verbs: `interview` (record a status) vs `audit` (report on statuses already
recorded) vs `review` (read a code change) vs `evidence` (attach an artifact without changing a
status), and `register` vs `init`. These share vocabulary -- "review", "audit", "control",
"record" -- and differ by what they *do* to the tracking data, which is a far thinner signal than a
framework name was. `test/corpus-shape.test.js` fails if the corpus stops carrying a disambiguation
query for each of them, but it only checks that the questions are still being asked; whether the
model answers them correctly is what the run below measures.

## The corpus

`trigger-corpus.json` -> `queries[]`, each `{ query, expected, category }`:

- `expected`: any verb name from the corpus's `expectedValues`, or `null` (no ciso skill should fire).
- `category`: `explicit` (names the skill/action), `implicit` (describes the need), `contextual`
  (assumes project state), `disambiguation` (plausibly confusable between two ciso verbs -- init vs
  register, interview vs audit, review vs evidence), or `negative` (shares keywords with a skill but should
  trigger neither -- adjacent intent, not random noise, per the rubric).

`corpus-shape.test.js` validates the corpus is well-formed (run via `node --test`); it does **not**
measure accuracy -- that needs a model in the loop (below).

## Running the evals (manual)

The repo can't self-run model-in-the-loop scoring cheaply, so this is a manual/harnessed procedure:

1. **Split** the corpus ~60/40 into a tuning set and a held-out test set (keep each category
   represented in both). Iterate skill descriptions only against the tuning set; report the number
   from the held-out set.
2. For each held-out query, start a **fresh** Claude Code session in a project where ciso is
   installed (and, for `contextual` queries and any verb other than `init`, where
   `docs/ciso/state.json` already exists **with a certification registered**), paste the query, and
   record which skill Claude auto-invokes (or none). For queries naming a certification, seed
   `state.json` with **more than one** certification
   registered -- a query like "add SOC 2 alongside it" only tests what it claims to if the other
   certification is actually present.
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
steal selections), or when a framework version bump reshapes a verb's description.

**Adding a verb is the highest-risk case**: it does not merely add trigger space, it competes
directly with every existing verb, and the verbs already share vocabulary. Re-run the *whole* corpus
then, not just the new verb's queries -- the regression to look for is an existing verb losing
queries it used to win.

Adding a *certification* is not that case, and does not on its own require a re-run: a certification
module ships no skill of its own (see ADDING-A-CERTIFICATION.md), so it adds no trigger space. Re-run
only if it changed a verb's description.
