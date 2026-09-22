---
name: fabflows
compatibility: Claude Code with the fabflows plugin enabled. Needs its namespaced worker agents, the Agent and Workflow tools, and the PreToolUse guard hook. Not portable to Claude.ai or the API.
description: Route mechanical work to cheaper worker agents and verify what they report back. Use when a task means reading across many files, exploring an unfamiliar codebase, researching external documentation, a test or build run with a long log, a multi-file or spec'd change, the build loop, or checking a worker's report. Triggers on "delegate", "spawn an agent", "who should do this", "hand this off", "use a subagent", "explore the codebase", "find where", "trace the callers", "run the tests", "implement this", "cheaper model", "save tokens", "reduce cost", "verify the subagent", "did the worker actually do it", "review this change", "reproduce the bug", "build loop". Not for a one-file grep, a one-line edit, or a known command with short output: do those directly.
---

# Fabflows

A lead doing mechanical work burns the expensive tier on typing. A lead that accepts a
worker's report unchecked has bought a confident lie at a discount. This skill is both
halves: hand work down when that pays, then prove what comes back.

The workers ship with this plugin and are namespaced: `fabflows:explorer`, not `explorer`.
None of them can spawn a worker, so the tree stays one level deep.

## When to delegate

A worker starts cold, and its report sits in your context for the rest of the session.
Delegation pays only when it keeps a large volume out of your context: a wide search, a long
test log, a multi-file read. Volume is decided by what must be read, not by whether judgement
follows: a read of more than a handful of files is volume even when you will summarise or
judge the result, so delegate the reading and keep the judging. Do the task yourself when the
brief would take longer to write than the task takes to do; when it is one short dependent
chain (measured: one model at low effort beats any split of it); or when the task *is* the
judgement call, a root cause, an architecture choice, a refactor across coupled files, rather
than the reading that precedes one. After two failed verifications on the same brief, do it
yourself or bump a tier: a third spawn buys another confident wrong answer.

A one-file grep, a one-line edit, a known command with short output: just do it. The brief,
the report contract and the gate below exist for worker reports. What you read from your own
tools is already evidence; do not re-run it to confirm it.

## Routing

| Task | Worker | Tier |
| --- | --- | --- |
| explore code, find files, locate a symbol, trace callers | `fabflows:explorer` | Haiku, read-only |
| research web or docs, distil a source | `fabflows:researcher` | Haiku, read-only |
| edit, implement, multi-file change | `fabflows:editor` | Sonnet |
| write or run tests | `fabflows:test-runner` | Sonnet |
| review a finished change against its spec, re-running its tests; or a draft spec, lens by lens | `fabflows:refuter` | Opus, read-only + Bash |
| shape a rough idea or an unshaped request into a spec | `fabflows:brainstorming` | the lead asks; explorer, researcher and refuter read |
| reproduce and narrow a self-contained failure | `fabflows:investigator` | Opus, read-only + Bash |
| root-cause decision, hard debugging, architecture, cross-file refactor | the lead does it | none |
| a spec'd, sizeable change | `fabflows:build` | Opus builder, Opus reviewer |

The built-in `Explore` agent inherits the lead's model, so under an expensive lead it costs
about what searching yourself would. `fabflows:explorer` is the cheap tier.

## Who leads

The lead plans, briefs, verifies and takes every escalation; workers type. The lead runs at
whatever effort the session is set to, and workers pin their own. A lead on Opus 5 reaches
for subagents readily: delegate only independent, sizeable work, and skip `fabflows:refuter`
for routine edits.

## The brief

Four parts, every spawn. A worker that has to guess the boundary guesses it wider than you
meant, so if one part is missing, do not spawn.

1. **Objective:** the one question to answer or the one change to make.
2. **Output:** what the report must contain and in what shape. Cap it, because the report is
   re-read on every later turn: for a test run, the command, its exit status, its final
   summary and every failing line, never the whole log; for a search, `file:line` hits, not
   file contents.
3. **Tools and paths:** which tools, which directories.
4. **Boundaries:** what not to touch, and what to do instead of guessing.

> **Objective:** find every caller of `parseToken` and say which ones can receive a null
> token.
> **Output:** `file:line` per caller plus a five-line summary. No file dumps.
> **Tools and paths:** `Read`, `Grep`, `Glob` under `src/auth/` only.
> **Boundaries:** edit nothing. If a caller's null-handling depends on runtime config you
> cannot see, say so under open questions rather than inferring it.

## The report contract

Every worker returns, in this order: any permission denial as the first line; files touched
as `path:line`; the exact commands run and their real output, never a paraphrase; every claim
labelled **confirmed** / **inferred** / **guessed**; open questions; anything noticed outside
the brief, named but not acted on. Terse, no dumps. A report missing any of these is
incomplete: send it back or redo the step yourself. Do not reconstruct the missing half from
what seems likely.

## The verification gate

Trusting the report is how this pattern fails. Before accepting a worker's result:

| Worker | What you re-run |
| --- | --- |
| `fabflows:explorer` | Open one cited file at the cited line and confirm it says what the report claims. |
| `fabflows:researcher` | Fetch one cited URL and confirm it supports the claim attached to it. |
| `fabflows:editor` | Read the diff, not every changed file. Run the build or tests yourself with the output capped (`<cmd> 2>&1 \| tail -30`) and read the summary and any failure. |
| `fabflows:test-runner` | Re-run the command yourself, output capped the same way. A pasted pass you did not reproduce is not a pass. |
| `fabflows:refuter` | Re-run the test command yourself, output capped, and open one cited finding at its `path:line`. |
| `fabflows:investigator` | Run the reproduction command yourself, output capped, and confirm the failure it reports. |

Anything you cannot confirm is `UNVERIFIABLE`, not done: say so. Surface a permission denial
to the user; never re-issue the denied call yourself. A worker's report of scope creep is
your decision, not its.

Narrate delegation in-session: what you are handing off and why before the spawn, what you
verified and how afterwards. No log file: git records the edits.

## The build loop

For a spec'd, sizeable change, `fabflows:build` runs an Opus `editor` that implements the
spec and commits on the feature branch, then a fresh `refuter` (Opus by default) that reads
the diff against the spec and re-runs the tests; REWORK sends the must-fix list to a fresh
builder, up to two rework rounds. Offer it, or launch it when the session opened with
`using-fabflows`. It never merges, pushes, or reverts.

Before starting: write the spec (the behaviour, how to check it, what is out of scope),
or take the one `fabflows:brainstorming` wrote when the request arrived unshaped;
confirm `git status --porcelain` prints nothing and `git rev-parse --abbrev-ref HEAD` prints
the feature branch, never the default branch; pass `spec`, `branch`, `baseRef` (from
`git rev-parse HEAD`) and `testCommand`, and optionally `reviewerModel`. Pass these as an
object, `Workflow({ name: 'fabflows:build', args: { spec, branch, baseRef, testCommand } })`,
not as a string.

On `accepted`, run the gate yourself: `git status --porcelain` still prints nothing, re-run
`testCommand`, read `git diff --stat <baseRef>..HEAD`, and check that one must-fix from an
earlier round is really fixed. Every other outcome carries `reason` and a one-line `next`:
act on those, since they are in the result itself. `references/build-loop.md` covers the one
case they cannot, a workflow error in place of a result.

## Guard hook

This plugin ships an active `PreToolUse` guard that blocks package installs (except `pypdf`
into a literal `--target` under the temp directory or a `scratchpad`, for reading a PDF),
commits and pushes on a default branch, destructive shell commands, credential-file access,
and writes to live Claude Code configuration. It is a tripwire, not a sandbox: it matches shell strings, it
is bypassable, and it fails open. A call that was not blocked was not approved. The real
containment on a worker is its tool allowlist. Rules and known gaps: the plugin README.

## Long sessions

- Follow up with a worker you already briefed by resuming it with `SendMessage`; it keeps
  its context.
- Run workers in the background and keep working while they run.
- Verify a small edit by reading its diff; hand a large or multi-file change to
  `fabflows:refuter` rather than reading all of it.
- Do not pair a long session with a Fable advisor: each consult re-reads the whole transcript
  uncached.
- Ignore any count of remaining context. If the routing table is gone after compaction,
  invoke this skill again.

## When it goes wrong

| Symptom | Cause | Do |
| --- | --- | --- |
| A spawn runs on the lead's model, or as a general-purpose agent | A bare name (`explorer`) does not resolve; plugin agents are namespaced | Spawn `fabflows:explorer` and check the report names the tier it ran on |
| A report is missing a contract field | The worker skipped it | Send it back once with the field named; on a second miss, redo the step yourself |
| A report's first line is a permission denial | The guard or the session's permission mode refused a call | Surface it to the user with the exact call; never re-issue it yourself |
| `fabflows:build` throws instead of returning a result | A budget or token limit ended a round mid-flight | `references/build-loop.md`: resume with the same args and the run ID; never restart with a fresh `baseRef` |
| An install is denied | The guard blocks package installs by design | Report the missing dependency as a blocker. The one exception is `pypdf` into a literal scratch `--target`, for reading a PDF |
