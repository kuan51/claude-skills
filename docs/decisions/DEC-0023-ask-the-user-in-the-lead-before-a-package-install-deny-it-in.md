---
id: DEC-0023
title: Ask the user in the lead before a package install, deny it in workers
status: proposed
date: 2026-09-24
deciders: [kuan51]
supersedes: [DEC-0002]
tags: []
---

# DEC-0023: Ask the user in the lead before a package install, deny it in workers

## Context and problem statement

Two holes let a package download past the fabflows guard. The guard matched installers
such as `npm install` but no ephemeral package runner, so `npx --yes`, `bunx`, `uvx`,
`pipx run` and `pnpm dlx` passed when typed straight into Bash. And docs-warden's
`audit.py` spawned `npx --yes markdownlint-cli2@0.23.2` through `subprocess.run`, where no
shell-string hook can see it, falling back to `bunx`. The package landed in
`~/.npm/_npx`, outside the repository.

DEC-0002 made "no installs" a rule that holds "regardless of model judgement." A flat deny
gives the user no way to say yes to one download in the session they are watching, so the
model routes around it instead. This record supersedes only that line of DEC-0002: the
user, not the model, now approves an install, through the guard's `ask` prompt. The rest of
DEC-0002 stands.

## Decision drivers

- A download needs the user's yes, and Claude must ask before looking for another way to
  get the package.
- Every existing deny rule must keep precedence. An install next to a destructive
  segment, a default-branch commit, or a live-config path must still be denied.
- A background worker cannot show a permission prompt, so it must never get one.
- Nothing may regress where it is unknown whether a hook's `ask` actually prompts.

## Considered options

1. **Runners count as installs; `ask` in the lead, `deny` elsewhere; `audit.py` never
   downloads** -- the guard records an install match, finishes every other rule, and only
   then returns `ask` when `agent_id` is absent and `permission_mode` is `default`,
   `acceptEdits`, `auto` or `plan`, and `deny` otherwise. `audit.py` runs markdownlint only
   when it is on PATH.
2. **Deny only** -- add the runners to the install patterns and keep denying. Rejected: it
   leaves the user no approval path, which is the behaviour that pushed the model to look
   for other routes.
3. **An `--allow-download` flag in `audit.py`** -- keep the runner behind an opt-in flag.
   Rejected: the flag would be passed by the model, not the user, and the spawn stays
   invisible to the guard.
4. **`npx --no` in `audit.py`** -- run only an already-cached package. Rejected: on a
   missing package it probably exits non-zero, the same as a lint finding, and would be
   misreported as `fail`. This is inferred and was not run.
5. **Deny instead of ask, to close the automatic-approval gap** -- a `PermissionRequest` hook or
   SDK host can answer an `ask` with no human looking. Rejected: denying removes the
   approval path the user asked for, and whoever configures such a hook or host has chosen
   to automate prompts.

## Decision outcome

Chose **option 1**, because it closes both holes, puts the approval in the native prompt
only a human in the main thread can answer, and keeps today's deny everywhere that prompt
cannot be shown or is not confirmed to prompt.

## Consequences

**Good:**

- The user can approve a single download without disabling the guard.
- Every deny rule still wins, because the install decision is emitted only after the whole
  command passes.
- Workers and non-prompting modes behave exactly as before: denied.
- docs-warden's audit no longer downloads anything on its own.

**Bad:**

- docs-warden's lint no longer runs where `markdownlint-cli2` is not on PATH. The check
  reports `skipped`, or `warn`, where it used to run through `npx`.
- `npx` on a local script, with no download, now asks or denies too.
- The guard now has a third decision type, `ask`, and its tests depend on
  `permission_mode` and `agent_id` in the hook input.

## Gaps accepted

- A `PermissionRequest` hook, an SDK `canUseTool` callback or `--permission-prompt-tool`
  can answer an `ask` with no human looking.
- Whether agent-team teammates carry `agent_id` is not documented, so a teammate may be
  treated as the lead.
- A script that spawns a runner itself is invisible to the guard. The one known site,
  `audit.py`, is fixed.
- `env npm`, `command npm`, `npm.cmd` and flags before the subcommand
  (`npm --global install`) evade the install rules, just as full binary paths do.
- Whether a hook's `ask` prompts in `bypassPermissions` or `dontAsk` is not confirmed;
  those modes get `deny`.

## Links

- Ticket: none; spec `docs/specs/2026-09-24-fabflows-install-approval.md`
- Pull request: pending
- Related: DEC-0002
