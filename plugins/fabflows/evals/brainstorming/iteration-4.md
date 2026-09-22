# Skill Benchmark: brainstorming

**Model**: claude-fable-5-1 lead session; subagents inherit
**Date**: 2026-09-22T03:33:39Z
**Evals**: 4 (1 run per configuration)

## Summary

| Metric | Old Skill | With Skill | Delta (with minus old) |
|--------|------------|---------------|-------|
| Pass Rate | 92% | 100% | +0.08 |
| Time | 193.0s | 210.5s | +17.5s |
| Tokens | 91949 | 99848 | +7899 |

The aggregator prints the delta as old minus with; the column above is corrected by hand,
as iterations 2 and 3 were.

## What changed

Eval 4 is the first that runs past the first reply. The user pre-answers every round, so one
session reaches the cut, the lens pass and the written spec. The planted gap is a note
rendered into the dashboard HTML unescaped. The new skill carries the three-round budget and
the bounded checkpoint sentence; the old one is the snapshot before them.

## Grades (12 assertions)

| Config | Score | What it did |
|---|---|---|
| New skill | 12/12 | Full tier, 18 labelled assumptions, three rounds labelled "n of 3", cut, a refuter brief headed "spec mode" naming the draft path, lens pass finding the injection reading and confirming Decision 4 removes it, spec on disk, "Approve to build?". |
| Old skill | 11/12 | Same shape and the same design. Its refuter brief never says "spec mode". |

Both arms pushed back on the request: "exactly as typed" became escape plus
`white-space: pre-wrap`, with the literal reading named as an injection surface, and both
specs pin a payload test in Check.

## Analyst notes

- **The refuter was never spawned.** The runner subagents had no Agent tool, so both leads
  wrote the brief and worked the seven lenses themselves, labelled as such. This iteration
  shows the skill drives a session to a written spec with the security gap removed; it does
  not show that a fresh-context refuter would have found it. That claim is still unmeasured
  and needs a live session (CLAUDE.md, "Testing a plugin change").
- The one differentiating assertion is wording ("spec mode" in the brief). On design quality
  the two arms are indistinguishable on this prompt.
- The round budget was never exercised: both arms emptied Open in three rounds on their own.
- Eight earlier runs of this eval, on two prompt wordings (an API token saved to config, then
  the note) and two models, were stopped by a response-side safety classifier before the
  skill ran. The run that worked used a shorter brief that no longer asked the runner to
  reconstruct the conversation as the user would see it. Cause not confirmed.
- Cost of the full path: about 92k to 100k tokens and 3 to 3.5 minutes for one design
  conversation with no real subagents; a live run adds two Haiku calls and one Opus call.
- Post-run sweep of /tmp and the scratchpad for runner files containing destructive commands
  printed nothing. Neither arm wrote outside docs/specs/ in its clone.
