---
id: DEC-0002
title: Ship fabflows as a plugin with worker agents and an active guard hook
status: proposed
date: 2026-09-09
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0002: Ship fabflows as a plugin with worker agents and an active guard hook

## Context and problem statement

A user-level `CLAUDE.md` routed work to four named agents -- `explorer`, `researcher`,
`editor`, `test-runner` -- none of which existed on disk. `~/.claude/agents/` held 21
agent files and not one carried those names.

Delegation to a name that does not resolve does not fail loudly. It falls through to a
general-purpose agent, which inherits the main conversation's model. With the lead set
to an expensive tier, every delegation written to save money spent it instead, and
nothing in the transcript said so. The routing table had been wrong for as long as it
had existed.

The second problem is the one that makes delegation dangerous rather than merely
wasteful: a worker returns "done, tests pass," the lead believes it, and the run
continues on a claim nobody checked. Reports from the field put the rate of subagent
reports containing at least one claim that does not match the underlying tool output at
roughly a fifth to a third.

## Decision drivers

- An agent that does not exist must stop being a silent no-op. Materializing the four
  named workers is the smallest change that makes the existing routing true.
- Model tier has to be pinned per role. Omitting `model:` silently inherits the lead,
  which is the exact bug being fixed.
- The strongest containment on a worker is its tool allowlist, not a hook. Multiple
  reports say hooks do not fire reliably for tool calls made inside a subagent, so a
  design that leans on hooks for worker containment is leaning on something unverified.
- Nothing may require an install. The operating rule is that the assistant never
  installs packages, so a design needing `jq`, `gitleaks`, or `ripgrep` is not shippable.
- Windows, macOS and Linux are all first-class. That rules out bash-only scripts and
  case-sensitive path comparison.

## Considered options

1. **A plugin shipping the four agents, a driving skill, and an active guard hook** --
   the routing becomes true, the tiers are pinned and testable, and the two rules that
   must hold regardless of what any model decides are enforced by the harness.
2. **Extend `superpowers:subagent-driven-development`** -- it already implements a
   controller loop with a ledger, review packages and fix rounds. But it lives in a
   third-party marketplace this repository does not own, so changes are not shippable
   from here, and its agents are prompt templates rather than registered, model-tiered
   agent types. Its niche is executing a written plan; this one is routing a single task
   to a tier.
3. **Workflow-tool scripts, as `ciso` and `data-analysis-review` already ship** -- the
   established idiom in this repository: `agent`/`parallel`/`phase` with JSON schemas.
   Those drive deterministic multi-step state machines over local state files. Routing
   one task to one tier is a single judgement call, not a state machine; a workflow
   script would add a state file with nothing to keep in it.
4. **`permissions.deny` rules in user settings** -- the native, declarative, lazier
   option, evaluated before hooks and unbreakable by a bug in one's own script. Rejected
   for two concrete reasons: a plugin cannot ship user settings, so it could only ever be
   a snippet to paste; and the default-branch half needs runtime git state that a static
   pattern cannot see.
5. **Docs-only guidance** -- the status quo. The four agents had been missing for as
   long as the instructions had routed to them, which is precisely how prose-only
   guarantees fail.

## Decision outcome

Chose **option 1**.

Four agents, each pinning `model:` and carrying the smallest tool list that does its job,
none granted `Agent` so the delegation tree stays one level deep. A `fabflows` skill
carrying the routing table with namespaced names, the four-part delegation brief, the
worker report contract, and the verification gate the lead must pass before accepting
anything.

One dependency-free Node script, `hooks/guard.js`, handles every hook rule -- a
`PreToolUse` guard on shell, read, and write tools, and a `SubagentStop` check on the
worker report contract. It is one file rather than the eleven bash scripts the source
research proposed, because a single Node file needs no `jq`, no `gitleaks`, and no
`ripgrep`, and behaves the same on all three platforms.

Two mechanics were settled against the source research by checking shipped code:

- **Blocking is JSON (`permissionDecision: "deny"`), never exit code 2.** The
  documentation describes exit 2, but the only shipped `PreToolUse` blocker in the local
  plugin ecosystem uses the JSON path and always exits 0, and exit 2 is reported not to
  block calls made inside a subagent.
- **The guard fails open.** Any parse error, missing `git`, non-repository directory, or
  timeout allows the call.

`model:` frontmatter is new to this repository -- no agent in `plugins/` carried it
before -- which is why the test suite pins each agent's tier as well as its tool list.

## Consequences

**Good:**

- The routing table becomes true. A delegation to `fabflows:explorer` actually runs on
  Haiku instead of silently inheriting the lead.
- The two rules that must hold regardless of model judgement -- no installs, no
  default-branch commits -- are enforced by the harness rather than by prose that a model
  may or may not follow.
- The tool allowlists are the real containment and need no hook to work.
  `fabflows:researcher`, the agent most exposed to untrusted web content, has no Bash and
  no Write at all.
- One guard file with one test table means the allow and deny cases are visible in
  review, including the traps a naive implementation gets wrong.

**Bad:**

- **Anyone who installs this plugin from the marketplace acquires an active hook that can
  block their shell commands.** Someone installing it for the agents gets the guard too.
  This is disclosed in the plugin description, the marketplace entry, the repository
  README bullet, and the first paragraph of the plugin README -- but disclosure is not
  consent, and a user who skims will be surprised the first time `npm install` is denied.
- **Upgrading or uninstalling fabflows becomes a manual human action.** The guard
  protects `~/.claude/plugins/`, so the assistant cannot re-copy into the plugin cache or
  edit `installed_plugins.json`. That is the intended threat model -- a worker must not be
  able to disarm the guard -- but every future version bump now needs a human.
- **The guard is a tripwire, not a wall, and reads like a wall.** Pattern matching on
  shell strings is defeated by base64, variable expansion, heredocs, `python -c`, and full
  binary paths. A reader who sees "blocks commits to the default branch" will over-trust
  it.
- **Failing open means a bug in the guard is silent.** A malformed payload allows the
  call and says nothing. The alternative -- failing closed -- would block every shell call
  in every session of anyone who installed the plugin, which is a far worse default, but
  the cost is that the guard's own failures are invisible.
- **Nothing runs the test suite.** This repository has no CI, no `package.json`,
  and `pre-commit` is not installed. A security-adjacent code path is protected by the
  convention that someone remembers to run `node --test`.
- **The `SubagentStop` check greps prose** for contract markers. It will be wrong in both
  directions. It is deliberately lenient -- it sends a report back only when two of three
  marker groups are absent -- which means it also misses reports that are merely thin.

## Gaps accepted

The guard's blind spots are known and unfixed: `git -C <other-repo> commit` is evaluated
against the session's directory rather than the repository the command targets;
`git push origin HEAD:master` from a feature branch is not caught; `cd elsewhere && git
commit` runs somewhere the guard did not look; `bash -c 'npm install'` hides the install
from segment matching.

Force-push is narrowed deliberately. Only a push targeting a default branch is blocked,
because the actual rule is about rewriting history on a shared branch, and
`--force-with-lease` on one's own feature branch is routine. A blanket block would be
fought weekly and then disabled.

`~/.claude/` is protected selectively rather than wholesale -- only `settings.json`,
`settings.local.json`, `hooks/`, and `plugins/`. Protecting the whole tree would have
blocked `CLAUDE.md`, plan files, the memory directory, and the user's own agent
definitions. Three explicit allow cases in the test suite hold that line.

Whether hooks fire at all for a worker's tool calls is not settled. If they do not, the
guard protects only the lead session and the tool allowlists are the entire containment
story. That is verified after installation, not before.

macOS and Linux behaviour is inferred from Node's documented `path` and `os` semantics,
not observed. Only Windows was exercised. The portable test suite is the hedge: a wrong
separator or case assumption fails on the platform where it is wrong rather than passing
silently.

## Links

- Ticket: none; found while reviewing an orchestration framework proposal against the
  agents actually installed
- Pull request: pending
- Related: none
