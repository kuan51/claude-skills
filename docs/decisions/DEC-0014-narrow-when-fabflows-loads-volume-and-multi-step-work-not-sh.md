---
id: DEC-0014
title: 'Narrow when fabflows loads: volume and multi-step work, not short tasks'
status: accepted
date: 2026-09-19
deciders: [kuan51]
supersedes: []
tags: [fabflows, benchmark]
---

# DEC-0014: Narrow when fabflows loads: volume and multi-step work, not short tasks

## Context and problem statement

The `fabflows` skill's description is deliberately pushy. It ends: "and on any task a Haiku or
Sonnet worker could do while the lead is running on an expensive model." That was written to
fight under-triggering, before anything measured what a load costs.

The benchmark under `plugins/fabflows/evals/` now has. In three iterations (iterations 1 to 3,
`evals/RESULTS.md`), a Fable lead with the skill loaded produced the same quality as a plain
session on every task, and on every short task it cost more: +64% list in iteration 1, +21% in
iteration 2 once a shell-permission confound was removed, +33% to +42% on the individual short
tasks. The lead read the skill and then, following the skill's own "when not to delegate"
rules, did the work inline each time. The overhead was the lead's: two Skill loads, a
deliberation turn, and re-verifying its own grep results as if they were a worker's report.
The one measured win came on a 13-file read, where routing fired, the Haiku explorer did the
reading, and the run came in 12% cheaper with a lead context 12k tokens smaller.

So the description decides whether an overhead is paid that, on short work, buys nothing
measured. The question is where the skill should load at all.

## Decision drivers

- **The overhead is fixed per load and lands on the lead.** Trimming the prose (iteration 3)
  cut it by about three quarters on a short task but did not remove it; not loading does.
- **Delegation pays only on volume**, by the skill's own rule and now by measurement: a read of
  many files, a long log, a spec'd change. Short tasks never reach the routing table's cheap
  tiers.
- **The session entry already exists.** DEC-0011 made `using-fabflows` the standing opt-in for
  a session, so the load can be paid once, on purpose, rather than per task by trigger.
- **Trigger accuracy is unmeasured either way.** Neither the current description nor any
  narrower one has a trigger corpus; ciso has one (`plugins/ciso/evals/`), fabflows does not.
- **The user runs a Claude subscription with a weekly cap** (DEC-0012). Loads that buy nothing
  come straight off it.

## Considered options

1. **Keep the pushy description** — status quo. Fires on short tasks and pays the measured
   overhead for no measured gain; keeps the under-triggering guard the description was
   written for.
2. **Narrow the description to volume and multi-step work** — name the shapes that pay
   (exploring or reading across many files, a long test or build log, a multi-file or spec'd
   change, the build loop, verifying a worker's report) and drop the "any task a Haiku or
   Sonnet worker could do" clause. Short tasks stop loading it; `using-fabflows` still puts a
   whole session on fabflows discipline when the user wants that.
3. **Make `using-fabflows` the only entry** — set `disable-model-invocation: true` on the
   `fabflows` skill (as `hitrust-controls-compiler` does in ciso), so it never auto-loads and is
   reached only through the session opt-in or an explicit `/fabflows`. Removes every per-task
   surprise load; also removes the skill from mid-session tasks where it would have paid.
4. **Options 2 and 3 together** — narrow the description and disable auto-invocation. The
   description then only documents the skill; nothing reads it to decide.

## Decision outcome

Proposed: **option 2**, because it removes the loads that iterations 1 to 3 showed to be pure
overhead while keeping the auto-trigger for exactly the shapes where iteration 2 showed
delegation paying. Option 3 is the fallback if a narrowed description still fires on short
work once a trigger corpus measures it. The change is one frontmatter field in
`plugins/fabflows/skills/fabflows/SKILL.md`, mirrored in `marketplace.json`'s description
only if the plugin summary changes, and a patch bump.

## Consequences

**Good:**

- A short task in a session that did not opt in pays nothing for fabflows.
- The description says what the skill is for in the terms the measurement used: volume kept
  out of the lead.
- `using-fabflows` keeps its meaning from DEC-0011 unchanged.

**Bad:**

- A mid-size task the user expected to auto-delegate may no longer load the skill; they
  invoke `/fabflows` or `using-fabflows` instead.
- Until a trigger corpus exists, the narrowed description's precision and recall are as
  unmeasured as the current one's.
- Skill descriptions are re-read on every turn of every session as part of the skill list, so
  a longer, more specific description costs a few tokens everywhere, in exchange for loads
  saved.

## Gaps accepted

- **No trigger corpus yet.** The right next step is a fabflows trigger corpus in the shape of
  `plugins/ciso/evals/trigger-corpus.json`, run with skill-creator's description loop, before
  or with this change. This record proposes the direction; the corpus measures it.
- **The per-session load via `using-fabflows` is unchanged** and remains about 4k tokens of
  prose plus two turns. Iteration 3's trimmed skill addresses that separately (DEC-0015).
- **Single-task sessions overstate the per-task overhead.** In a real session the load is paid
  once and spread over every task that follows; the benchmark charged it to one task each
  time, so the +21% to +64% figures are upper bounds.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0011 (the session opt-in), DEC-0012 (delegate on context volume), DEC-0004;
  `plugins/fabflows/evals/RESULTS.md` iterations 1 to 3
