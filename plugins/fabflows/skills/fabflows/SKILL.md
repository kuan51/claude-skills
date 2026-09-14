---
name: fabflows
description: Route mechanical work to cheaper worker agents and verify what they report back. Use when planning a multi-step change, exploring an unfamiliar codebase, researching external documentation, running or writing tests, making a multi-file edit, or deciding whether to do a task yourself or hand it off. Triggers on "delegate", "spawn an agent", "who should do this", "hand this off", "use a subagent", "explore the codebase", "find where", "trace the callers", "run the tests", "implement this", "cheaper model", "save tokens", "reduce cost", "verify the subagent", "did the worker actually do it", "review this change", "reproduce the bug", "build loop", and on any task a Haiku or Sonnet worker could do while the lead is running on an expensive model.
---

# Fabflows

A lead session doing mechanical work burns the expensive tier on typing. A lead that
accepts a worker's report without re-checking it has bought a confident lie at a
discount. Both halves are this skill: hand the work down, then prove the answer.

The workers are real agents shipped with this plugin. They are namespaced, so the
address is `fabflows:explorer`, not `explorer`.

## Boundaries

**This skill will:** pick a worker tier for a task, write the four-part brief that
makes delegation work, reject a report that arrives without its contract fields,
re-verify a worker's claims before accepting them, and say plainly when a task should
not be delegated at all.

**This skill will not:** delegate the root-cause decision on a bug, architecture
decisions, or cross-file refactors; accept a worker's word as evidence; write a
delegation log file; or edit code itself. The lead integrates and verifies -- it does
not become another worker.

## Non-negotiables

1. **Never delegate without all four brief parts.** Objective, output format, tools and
   paths, boundaries. Missing one, do not spawn -- a worker that has to guess the
   boundary will guess it wider than you meant.
2. **Never accept an unverified claim.** Re-read the changed files yourself. Re-run the
   build or the tests yourself and read the real output. A claim you have not confirmed
   is `UNVERIFIABLE`, not done.
3. **Reject an incomplete report.** No permission-denial line, no `file:line`, or
   paraphrased command output -- send it back or redo the step yourself. Do not
   reconstruct the missing half from what seems likely.
4. **Narrate the delegation in-session.** Say what you are handing off and why before
   you spawn; say what you verified and how afterwards. No log file -- git records the
   edits, and a second ledger only drifts from it.
5. **Never do mechanical work while a worker fits.** Exploring, grepping, running a
   known command, applying an already-decided edit -- hand it off.

## Routing

| Task | Worker | Tier |
| --- | --- | --- |
| explore code, find files, locate a symbol, trace callers | `fabflows:explorer` | Haiku, read-only |
| research web or docs, distil a source | `fabflows:researcher` | Haiku, read-only |
| edit, implement, multi-file change | `fabflows:editor` | Sonnet |
| write or run tests | `fabflows:test-runner` | Sonnet |
| review a finished change against its spec, re-running its tests | `fabflows:refuter` | Opus, read-only + Bash |
| reproduce and narrow a self-contained failure | `fabflows:investigator` | Opus, read-only + Bash |
| root-cause decision, hard debugging, architecture, cross-file refactor | the lead does it | -- |

The built-in `Explore` agent is not a cheap substitute for `fabflows:explorer`. It
inherits the main conversation's model, capped at Opus, so under an expensive lead it
costs roughly what doing the search yourself would. A plugin cannot override a built-in
agent, so the namespaced worker is the way to get the cheap tier.

None of the workers can spawn a worker of its own -- `Agent` is absent from every
tool list. The delegation tree is one level deep on purpose.

## Who leads

The lead plans, writes specs and briefs, verifies, and takes every escalation; workers do
the typing. The split pays because the two jobs cost differently. A lead re-reads a large
context every turn, and cached reads are cheap. A builder writes a lot of output from a
fresh context, and output is the expensive part. Put the most expensive model on the lead,
not on the typing.

- **Lead on Fable.** Run it at `low` effort for routine turns and raise it for
  architecture or deep debugging. On Fable 5.1 with an API key or a Claude subscription,
  changing effort keeps the prompt cache, so move it as the work changes.
- **Lead on Opus 5.** It reaches for subagents readily, so delegate only independent,
  sizeable work, and skip `fabflows:refuter` for routine edits. Changing effort
  mid-session re-reads the whole context uncached, so pick a level at session start.

## The delegation brief

Every spawn carries all four. They are short; the discipline is that none is missing.

1. **Objective** -- the one question to answer or the one change to make.
2. **Output format** -- what the report must contain, and in what shape.
3. **Tools and paths** -- which directories to look in, which tools to use.
4. **Boundaries** -- what not to touch, and what to do instead of guessing.

Worked example:

> **Objective:** find every caller of `parseToken` and say which ones can receive a
> null token.
> **Output:** paths with `file:line` for each caller, plus a five-line summary. No file
> dumps.
> **Tools and paths:** Read, Grep, Glob under `src/auth/` only.
> **Boundaries:** do not edit anything. If a caller's null-handling depends on runtime
> config you cannot see, say so under open questions rather than inferring it.

## The worker report contract

Every worker returns these, in this order. A report missing any of them is incomplete.

- **Any permission denial as the very first line.** A worker that hits a denial and
  reports success anyway is the failure mode this contract exists to catch.
- Files touched, as `path:line`.
- The exact commands run and their real output. Never a paraphrase of output the worker
  did not see.
- Every claim labeled **confirmed** / **inferred** / **guessed**.
- Open questions.
- Anything noticed outside the brief, named but not acted on.
- Terse. No file dumps.

## The verification gate

Do this before you accept anything. Trusting the report is the single most common way
this pattern fails.

| Worker | What the lead re-runs |
| --- | --- |
| `fabflows:explorer` | Open one cited file at the cited line and confirm it says what the report claims. |
| `fabflows:researcher` | Fetch one cited URL and confirm it supports the claim attached to it. |
| `fabflows:editor` | Re-read every changed file. Run the build or tests yourself and read the output. |
| `fabflows:test-runner` | Re-run the command yourself. A pasted pass you did not reproduce is not a pass. |
| `fabflows:refuter` | Re-run the test command yourself and open one cited finding at its `path:line`. |
| `fabflows:investigator` | Run the reproduction command yourself and confirm the failure it reports. |

Cross-check each claim against real tool output. Treat anything you cannot confirm as
`UNVERIFIABLE` and say so -- do not quietly promote it to done.

## The build loop

For a spec'd, sizeable change, offer `fabflows:build`. An Opus `editor` implements the
spec on the current feature branch and commits; a fresh `refuter` reads the diff against
the spec and re-runs the tests; a REWORK verdict sends the must-fix list to a fresh
builder, up to the rework cap. It runs through the Workflow tool, so start it only when
the user asks for it or agrees to it.

Before starting it:

1. Write the spec: the behaviour, how to check it, and what is out of scope.
2. Confirm `git status --porcelain` prints nothing and `git rev-parse --abbrev-ref HEAD`
   prints the feature branch -- never the default branch.
3. Pass `spec`, `branch`, `baseRef` (from `git rev-parse HEAD`) and `testCommand`.
   Optional: `reviewerModel` (default `fable`; pass `opus` where Fable is not
   available).

On `accepted`, run the gate yourself: re-run `testCommand`, read
`git diff --stat <baseRef>..HEAD`, and check that one must-fix from an earlier round is
really fixed. On `escalate`, read `reason` and `verdict` -- the last review, or null if
none ran -- and take the work over. The loop never
merges, pushes, or reverts -- those stay with you and the user.

## What the guard hook blocks

This plugin ships an active `PreToolUse` hook. It blocks package installs, commits and
pushes on a default branch, destructive shell commands, reads and writes of
credential-bearing files, and writes to live Claude Code configuration or git hooks.

It is a tripwire, not a sandbox. Pattern matching on shell strings is bypassable by
base64, variable expansion, heredocs, `python -c`, and full binary paths, and it cannot
see a command run against a different repository via `git -C`. The guard also fails
open: if it errors, the call proceeds. Do not treat a call that was not blocked as a
call that was approved -- the real containment on a worker is its tool allowlist.

## Long sessions

- Follow up with a worker you already briefed by resuming it with `SendMessage`. It keeps
  its context, so it does not re-read what it already knows.
- Run workers in the background and keep working while they run.
- Verify a small edit by reading its diff, not the whole file. Hand a large or multi-file
  change to `fabflows:refuter` rather than reading all of it into the lead's context.
- Do not pair a long session with a Fable advisor: each consult re-reads the whole
  transcript, uncached.
- Ignore any count of remaining context: do not cut work short or suggest a new session
  because the context is large. Compaction re-injects invoked skills within a shared
  budget, oldest dropped first, so if the routing table is gone after compaction, invoke
  this skill again.

## When not to delegate

- The brief would take longer to write than the task takes to do.
- The task needs judgement about *why* the code is the way it is.
- The task spans files whose relationship to each other is the actual problem. Coupled
  edits do not split across workers; that is where multi-agent work degrades fastest.
- A worker already failed verification twice on this task.
- The work is one short, dependent chain. Measured, a single model at low effort beats
  any split of it: the brief, the report, and the check cost more than they save.

## Escalation

- Two failed verifications on the same brief -- the lead does it, or bumps a tier.
  Re-spawning the same worker a third time buys another confident wrong answer.
- A worker reports a permission denial -- surface it to the user. Never route around a
  denial, and never re-issue the same call from the lead to dodge it.
- A worker reports scope creep -- decide it yourself; do not delegate the decision.
