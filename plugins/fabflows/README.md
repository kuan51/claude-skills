# fabflows

Routes mechanical work from an expensive lead model down to cheaper workers, and makes
the lead prove what those workers claim.

> **This plugin installs an active hook.** Once enabled, a `PreToolUse` hook runs on
> every `Bash`, `PowerShell`, `Read`, `Grep`, `Edit`, and `Write` call in your session
> and can block it. It blocks package installs, commits and pushes on a default branch,
> destructive shell commands, reads and writes of credential files, and writes to live
> Claude Code configuration. Read [What the guard blocks](#what-the-guard-blocks) before
> you install it, including the blind spots -- it is a tripwire, not a sandbox.

## The problem

Orchestration instructions that name worker agents are only as good as the agents
existing. A routing table pointing at `@explorer` when no `explorer` agent is installed
does not fail loudly -- the request quietly falls through to a general-purpose agent
running on the lead's own model. The routing that exists to save money spends it
instead, and nothing in the transcript says so.

The second failure is quieter still. A worker returns "done, tests pass," the lead
believes it, and the run continues on a claim nobody checked.

## What it ships

Six workers, each pinned to a model tier and scoped to the smallest tool list that
does its job:

| Agent | Model | Effort | Tools | For |
| --- | --- | --- | --- | --- |
| `fabflows:explorer` | Haiku | -- | Read, Grep, Glob | locating files, tracing symbols, mapping structure |
| `fabflows:researcher` | Haiku | -- | Read, Grep, Glob, WebFetch, WebSearch | external docs and APIs, distilled with sources |
| `fabflows:editor` | Sonnet | medium | Read, Edit, Write, Grep, Glob, Bash | scoped code changes |
| `fabflows:test-runner` | Sonnet | low | Read, Grep, Glob, Bash, Write | writing and running tests, reporting real output |
| `fabflows:refuter` | Opus | medium | Read, Grep, Glob, Bash | reviewing a finished change against its spec, re-running its tests |
| `fabflows:investigator` | Opus | high | Read, Grep, Glob, Bash | reproducing and narrowing a self-contained failure |

Effort is pinned so a worker does not inherit the lead's session effort. Haiku 4.5 has
no effort levels, so the Haiku workers carry none. `CLAUDE_CODE_EFFORT_LEVEL`, if you
set it, overrides every pin.

Plus the `fabflows` skill, which carries the routing table, the four-part delegation
brief, the worker report contract, and the verification gate the lead has to pass before
accepting anything; and the `fabflows:build` workflow, described in
[The build loop](#the-build-loop).

Agent names are namespaced. Address them as `fabflows:explorer`, not `explorer`.

None of the workers can spawn a worker of its own -- `Agent` is absent from every tool
list, so the delegation tree stays one level deep and the cost stays bounded.

## The build loop

`fabflows:build` takes one spec'd change through build and review without the lead
steering each step:

1. An Opus `editor` implements the spec on the checked-out feature branch, runs the
   tests, and commits.
2. A fresh `refuter` -- on Fable by default -- reads the diff against the spec, re-runs
   the tests itself, and returns ACCEPT or REWORK with must-fix findings.
3. On REWORK, a fresh builder gets the must-fix list and the branch diff. After two
   rework rounds the loop stops and hands back to the lead.

The lead writes the spec, checks that the working tree is clean and the right branch is
checked out, and passes `spec`, `branch`, `baseRef` and `testCommand` (optionally
`reviewerModel`). The script refuses `main` and `master`. It never
merges, pushes or reverts: on ACCEPT the lead re-runs the suite itself before accepting,
and merging to the default branch stays a pull request.

Two limits are worth knowing. A workflow cannot resume an agent, so each rework round
starts a fresh builder rather than the same one with its context. And for a small
change, one model working alone at low effort measured cheaper than any build-and-review
split, so the loop is for sizeable specs. [DEC-0004](../../docs/DECISIONS.md) records why.

## Long sessions

- Run the lead at low effort for routine turns and raise it for hard ones. On Fable 5.1
  with an API key or a Claude subscription, changing effort keeps the prompt cache; on
  other models it forces a full re-read, so pick effort at session start there.
- Resume a worker with `SendMessage` for follow-ups in the same area instead of spawning
  a fresh one. It keeps its context.
- A Fable advisor re-reads the whole transcript, uncached, on every call, which gets
  expensive once a session is long.
- On an API key the prompt cache lives five minutes. If your sessions sit idle longer
  than that between turns, `"promptCacheTtl": "1h"` in your settings keeps it warm, at a
  higher cache-write rate.

## Why not the built-in Explore agent

`Explore` inherits the main conversation's model, capped at Opus. Under an expensive
lead it costs roughly what searching yourself would. A plugin cannot override a built-in
agent, so `fabflows:explorer` exists as the cheap alternative rather than as a
replacement for it.

## What the guard blocks

A single `hooks/guard.js` -- Node, no dependencies, one file -- handles every rule:

- **Package installs** across npm, pnpm, yarn, bun, pip, uv, dotnet, cargo, go, gem,
  apt, brew, winget, choco, scoop, and PowerShell's `Install-Module`.
- **Commits, pushes, merges and rebases on a default branch.** The default is read from
  `origin/HEAD` at runtime, falling back to `main` or `master`. Force-push is blocked
  only when it targets a default branch, so `--force-with-lease` on your own feature
  branch still works.
- **Destructive commands** -- `rm -rf` and `Remove-Item -Recurse -Force` at a home,
  root, parent, or `.git` target; `git reset --hard`; `git clean -fd`; `git branch -D`
  (but not `-d`); `sudo`; `chmod 777`; `dd of=`; `mkfs`; `Set-ExecutionPolicy`; and
  piping a download straight into a shell.
- **Credential files** -- reading, staging, or writing `.env`, `*.pem`, `*.key`,
  `id_rsa`, `~/.ssh/`, `~/.aws/credentials`, `.npmrc`, `.pypirc`. Committed examples
  (`.env.example`, `.env.sample`, `.env.template`) are exempt.
- **Secrets in an edit** -- AWS access key ids, GitHub tokens, Slack tokens, Google API
  keys, and private-key headers.
- **Live configuration** -- `~/.claude/settings.json`, `~/.claude/hooks/`,
  `~/.claude/plugins/`, and any `.git/hooks/`. This is what stops a worker from
  disarming the guard. Reading them is allowed; only writes and redirects are blocked.
  Everything else under `~/.claude/` stays writable.

A `SubagentStop` hook checks that a worker's final report actually carries its contract
fields, and sends it back to be re-emitted if two or more are missing.

### Blind spots -- read these

The guard matches patterns on shell strings. It does not understand shells, and it can
be walked around:

- Base64, variable expansion (`X=rm; $X -rf ~`), heredocs, `python -c`, and full binary
  paths all evade it.
- `git -C <other-repo> commit` is evaluated against the session's directory, not the
  repository the command targets.
- `git push origin HEAD:master` from a feature branch is not caught.
- `cd elsewhere && git commit` -- the second segment runs somewhere the guard did not
  look.
- It matches on **paths, not content**. A `Grep` scoped at `~/.ssh/` is denied because
  the path gives it away, but a `Grep` over `.` searching for `AKIA` is not -- the guard
  cannot see what a search is looking for, only where it is pointed.

It also **fails open**. Malformed input, a missing `git`, a directory that is not a
repository, a timeout -- all of those allow the call. That is deliberate: a guard that
failed closed would block every shell call in every session of anyone who installed this
plugin, and the cost of the wrong default there is far higher than a missed tripwire.

A call that was not blocked is not a call that was approved. The real containment on
a worker is its tool allowlist -- `fabflows:researcher`, the agent most exposed to
untrusted web content, has no Bash and no Write at all, and no hook is needed to enforce
that.

## Disabling it

`/plugin disable fabflows`. No environment-variable escape hatch exists, on purpose:
an off switch a model can set is not an off switch. Note that because the guard protects
`~/.claude/plugins/`, upgrading or removing this plugin is a manual action you perform
yourself.

The one environment variable the guard reads is `FABFLOWS_PROBE`. Set it to a file path
and the guard appends each raw hook payload it receives to that file, which is how you
confirm the hook fires at all and see the exact payload shape your version sends. It
**logs and then falls through to the normal rules** -- it does not short-circuit
enforcement, so it cannot be used to disarm the guard.

## Tests

```bash
node --test "plugins/fabflows/test/*.test.js"
```

`frontmatter.test.js` pins the agent roster, each agent's tool list, model tier and
effort, and the skill's frontmatter. `build.test.js` runs the build workflow's loop
against stub agents. `guard.test.js` drives `guard.js` over a table of allow and deny
cases, including real git fixtures for the branch rules and the path traps that a naive
substring match would get wrong.
