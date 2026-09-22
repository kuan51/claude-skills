---
id: DEC-0018
title: 'Enforce data-analysis-review''s non-mutation guarantee twice: sandbox copy plus workflow path assertion'
status: proposed
date: 2026-09-22
deciders: [kuan51]
supersedes: []
tags: [data-analysis-review, security, sandbox]
---

# DEC-0018: Enforce data-analysis-review's non-mutation guarantee twice: sandbox copy plus workflow path assertion

Recorded on 2026-09-22 from the retired superpowers design of 2026-07-17 (its "Non-Mutation
Mechanism" addendum). The decision itself dates from 2026-07-17.

## Context and problem statement

The plugin's headline promise is that it never modifies the project under review. The first
design met that with tool restriction alone: no agent has `Write`, `Edit` or `Agent`. A whole-branch
review found the gap: every agent keeps `Bash`, and the `reproducibility-auditor` legitimately
re-runs pipelines and notebooks, which rewrites tracked files in place (re-executing a notebook
rewrites its `.ipynb`). The guarantee was procedural, not structural.

## Decision drivers

- The reproducibility role needs real execution; removing `Bash` would gut the skill's value.
- A guarantee that depends on an operator remembering a step is the category the review had
  already judged insufficient.
- No new dependency and no change to the agent roster.

## Considered options

1. **Tool restriction only** — no `Write`/`Edit`/`Agent`. Rejected: `Bash` can still mutate.
2. **Sandbox copy in SKILL.md only** — copy the project to a temporary directory and rewrite every
   path into it before the engine runs. Closes the gap in practice, but a skipped step or an
   original path pasted into `args` silently reaches the real project.
3. **Sandbox copy plus a structural assertion in the workflow** — as option 2, and `workflow.js`
   takes `sandboxRoot` and throws if any path in `fixedRolePaths`, `extras[].paths` or
   `conclusionPaths` falls outside it, before a single agent is dispatched.

## Decision outcome

Chose **option 3**, because it makes the guarantee fail loudly rather than silently: the
procedural rewrite is the normal path, and the assertion turns a missed rewrite into a thrown
error instead of a write to the user's project. Tool restriction stays as defence in depth.

## Consequences

**Good:**

- "Never modifies the reviewed project" holds even when `Bash` re-executes notebooks.
- The same blindness-by-omission principle already used for conclusion paths now also hides the
  project's real location from every agent.

**Bad:**

- Every review copies the whole project, which costs disk and time on large repositories.
- The assertion is inlined in `workflow.js` rather than imported from `lib/sandbox-paths.js`,
  because workflow scripts have no `require`; the two must be kept in step by hand.

## Gaps accepted

The assertion checks the path lists the caller declares, not what an agent does afterwards. Five
agents hold `Bash`, and nothing structural stops one of them, or a reviewed project's own code once
executed, from writing outside the sandbox or reaching the network; `SCOPE_DISCIPLINE` and
`INJECTION_DEFENSE` instruct against it but do not enforce it.

## Links

- Ticket: none
- Pull request: the 2026-07-17 data-analysis-review work; recorded on the branch that retired
  `docs/superpowers/`
- Related: `docs/specs/2026-09-22-data-analysis-review.md`
