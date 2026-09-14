---
id: DEC-0004
title: Fable leads fabflows; Opus builds and reviews in a deterministic build loop
status: proposed
date: 2026-09-13
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0004: Fable leads fabflows; Opus builds and reviews in a deterministic build loop

## Context and problem statement

fabflows 0.1.0 routes work from an expensive lead to cheaper workers: `explorer` and
`researcher` on Haiku, `editor` and `test-runner` on Sonnet. Two proposals prompted a
second look.

The first was to run Opus 5 as the lead and hand code-writing to a dedicated Fable agent,
to spend fewer tokens while writing better code over long sessions. The second was a
ticket-driven flow: the lead writes a spec, an Opus builder implements it on its own
branch and worktree, a cold Fable reviewer returns ACCEPT or REWORK, the same builder
fixes the must-fixes with its context intact, the loop merges to the default branch and
runs the suite there, and the lead cuts the release.

The question was which model belongs in which seat, measured as cost per finished task on
pay-per-token billing, and which parts of the ticket flow fabflows should carry.

## Decision drivers

- **Cost splits by seat.** Fable 5.1 lists at $10 in and $50 out per million tokens, with
  cache reads at $0.25. Opus 5 lists at $5 and $25, with cache reads at twice Fable's rate.
  A lead mostly re-reads a large cached context. A builder mostly writes output from a
  fresh context, because a subagent shares no cache with its parent.
- **Only two multi-model shapes measured as wins:** a cheap executor consulting a strong
  advisor, or a strong orchestrator handing bulk work to cheaper workers. When the work is
  one dependent chain, the coordinator's model alone at lower effort came out ahead.
- **Model behaviour.** Opus 5 is strongest on hard multi-file work given the full spec up
  front, and its review is high-precision and high-recall at lower effort. As a lead it
  over-delegates and over-verifies. Fable 5.1 at low effort is often competitive with Opus
  and Sonnet on cost per task, and fresh-context verifiers outperform self-critique.
- **The Workflow tool** gives deterministic ordering, but a script cannot resume an agent
  and has no shell or filesystem.
- **The guard hook** already blocks commits and merges on a default branch.

## Considered options

1. **Opus lead, Fable builder** -- the first proposal. It puts Fable's $50 output on the
   seat with the most output and rebuilds Fable's context on every spawn, and Fable 5.1
   tends to rewrite whole files. Opus 5 as lead over-delegates.
2. **Opus lead, Fable advisor** -- a measured shape. But every consult re-reads the whole
   transcript uncached, and on a coding benchmark the pairing sat within noise of the
   frontier model alone at about the same cost. A Fable lead accepts only a Fable advisor.
3. **Fable lead with Opus reviewer and investigator, the ticket flow as skill prose** --
   keeps the same builder across rework rounds via `SendMessage`, but the ordering depends
   on the lead following prose.
4. **Fable lead with Opus reviewer and investigator, the ticket flow as a Workflow
   script** -- deterministic ordering and a hard rework cap. Each rework round gets a fresh
   builder.
5. **The ticket flow verbatim** -- auto-merge to the default branch, a worktree per ticket,
   and a release step.

## Decision outcome

Chose **option 4**, because:

- it keeps the most expensive model on the lead, where its premium is smallest
- it gives the build to Opus, where the spec is complete and the output large
- the script, not the lead's memory, enforces the build-then-review order and the rework cap

What ships:

- `refuter` (Opus, medium effort) reviews a change against its spec, re-runs the tests, and
  returns ACCEPT or REWORK. It has no Edit or Write.
- `investigator` (Opus, high effort) reproduces and narrows a self-contained failure. The
  lead keeps the root-cause call. An Opus debugger for hard root causes was rejected: it
  hands the hardest problems to the weaker model, and they need the lead's context.
- `editor` pins medium effort and `test-runner` pins low, instead of inheriting the lead's.
- `fabflows:build` works in rounds:
  - An Opus `editor` builds and commits on the checked-out feature branch.
  - A fresh `refuter` reviews. It runs on Fable by default: a reviewer at least as capable
    as the builder is the safer default. That rule is inferred from the advisor pairing
    rule, not documented for review, and it costs about $0.30 more per round than Opus.
  - REWORK sends the must-fixes to a fresh builder.
  - After two rework rounds the loop hands back to the lead.

Where the loop departs from the ticket flow:

- **A fresh builder each round.** There is no resume API.
- **No merge and no worktree.** A worktree subagent branches from the default branch, and
  the guard blocks default-branch merges. Merging stays a human pull request.
- **A red suite escalates** instead of auto-reverting.
- **Release, the ticket system, and seats** are out of scope.

A `SessionStart` hook to restore routing after compaction was considered and dropped:
agent types stay listed after compaction, and an invoked skill is re-injected (up to 5,000
tokens).

## Consequences

**Good:**

- Long sessions keep a leaner lead: reading a large change happens in the refuter's
  context, not the lead's.
- The build and review order and the rework cap cannot drift. A stub-driven test pins
  them.
- Workers no longer inherit the lead's session effort.
- A session led by Opus 5 gets explicit guidance: delegate less, and skip the refuter on
  routine edits.

**Bad:**

- Each rework round re-reads the branch from scratch; the prose variant would have kept
  the builder's context.
- The measured counter-evidence stands: for a short dependent chain, the lead alone at low
  effort is cheaper than the loop. The skill limits the loop to sizeable specs, but nothing
  enforces that.
- A Fable reviewer costs about twice an Opus one per round.
- The roster grows from four agents to six, and the build loop needs the user's opt-in
  each run.

## Gaps accepted

- **Effort values are starting points.** Medium, low, medium and high have not been
  measured on these workloads.
- **Hooks in workflow agents are unverified.** Plugin hooks are documented to run inside
  subagents; whether they fire inside workflow agents is not, so `build.js` refuses `main`
  and `master` itself.
- **`SubagentStop` inside workflows is unverified.** How a block interacts with a workflow
  agent's structured-output retries is unknown. Every schema requires a prose `report` so
  the contract markers stay present.
- **Missing Fable access is untested.** What `model: 'fable'` does in a session without it
  is unverified; `reviewerModel` is the escape hatch.
- **No eval covers any of this.** The cost figures are list-price arithmetic.
- **Out of scope:** parallel builds (several specs, worktrees, a merge step), auto-revert
  on a red suite, and release automation.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0002, which this refines and does not supersede
- Evidence:
  - the claude-api skill's `cost-optimization.md` and `model-migration.md`
  - Claude Code documentation: sub-agents, advisor, hooks, prompt-caching, model-config,
    plugins-reference
