---
owner: kuan51
review_by: 2027-03-24
generated: false
---

# Ask the user before a package install or package runner

## Behaviour

A package download needs the user's yes, and Claude asks before it looks for another way
to get the package.

Two holes let a download past the fabflows guard. First, the guard matched installers
(`npm install`) but no ephemeral package runner: `npx --yes`, `bunx`, `uvx`, `pipx run`,
`pnpm dlx` all passed when typed straight into Bash. Second, docs-warden's `audit.py`
spawned `npx --yes markdownlint-cli2@0.23.2` through `subprocess.run`, where no shell-string
hook can see it, and fell back to `bunx` when `npx` was missing. The package landed in
`~/.npm/_npx`, outside the repo.

1. **Guard: runners count as installs.** `plugins/fabflows/hooks/guard.js` treats these the
   same as the existing `INSTALL` patterns, matched per shell segment and case-insensitive:
   `npx`, `pnpx`, `bunx`, `npm exec`, `npm x`, `bun x`, `pnpm dlx`, `yarn dlx`, `uvx`,
   `uv tool run`, `uv tool install`, `uv run --with`, `pipx run`, `pipx install`,
   `npm|yarn|pnpm|bun create`, and `npm init <arg>` when `<arg>` is not a flag.
   `npm init -y` stays allowed, and so does `echo "npx foo"`, because the pattern is
   anchored to the start of the segment.
2. **Guard: ask the user in the lead, deny everywhere else.** For any segment matching an
   install or runner pattern, except the existing `pypdf` scratchpad exception:
   - The guard **records** the match and keeps checking every remaining segment and rule.
     If any rule denies, that deny is returned as today. Only when the whole command
     passes every other rule does the guard emit the recorded decision. That is emitted
     in `preToolUse` after `checkShell` returns. An install next to a destructive
     segment, a git op on a default branch, or an install that names a live-config path
     (`~/.claude/plugins`, `~/.claude/hooks`) is still denied.
   - The guard returns `permissionDecision: "ask"` only when `agent_id` is absent (the
     main thread) **and** `permission_mode` is exactly one of `default`, `acceptEdits`,
     `auto` or `plan`. The reason, which the user sees and Claude does not, names the
     segment (first 60 characters) and says it downloads from a package registry.
   - In every other case it returns `permissionDecision: "deny"`: `agent_id` present (a
     worker), or `permission_mode` of `bypassPermissions`, `dontAsk`, missing, or any
     other value. The deny reason tells Claude to stop, name the package, the version
     and where it lands, and ask the user. It must not try another runner, package
     manager, manual download or script until the user says yes. A worker reports the
     package to the lead as a blocker.
3. **docs-warden `audit.py` never downloads.** `LINT_TOOLS` drops the `npx` and `bunx`
   runners for markdownlint-cli2. Lint runs only when `markdownlint-cli2` is on PATH, still
   resolved with `shutil.which` because Windows needs the `.CMD` shim resolved. Otherwise
   the tool counts as not installed, and the lint check reports `skipped`, or `warn` when
   another linter ran clean, never `pass`, as today. The fix line names
   `npx --yes markdownlint-cli2@0.23.2` as a command to ask the user to approve first,
   because it downloads into the npm cache. The `MARKDOWNLINT` pin stays.
4. **Wording.** The Guard hook section and the "An install is denied" row of
   `plugins/fabflows/skills/fabflows/SKILL.md` say this: before any install, any package
   runner, or any script you know will fetch a package, stop. Name the package, the
   version and where it lands, and ask the user. If the guard asks or denies, look for no
   other route until the user says yes. Agent files are unchanged, because they already
   forbid installs.
5. **Docs and manifests.**
   - `plugins/fabflows/README.md`, Guard rules: runners are covered, and the lead gets an
     `ask` while workers and non-prompting modes get a `deny`.
   - `plugins/fabflows/README.md`, Known gaps: a script that spawns a runner itself is
     invisible to the guard, and the one known site is fixed. `env npm`, `command npm`,
     `npm.cmd` and flags before the subcommand (`npm --global install`) evade the guard,
     just as full binary paths do. A `PermissionRequest` hook, an SDK `canUseTool`
     callback or `--permission-prompt-tool` can answer an `ask` with no human looking.
     Whether agent-team teammates carry `agent_id` is not documented.
   - `plugins/docs-warden/skills/docs-warden/references/audit-schema.md:161` no longer
     claims the audit runs markdownlint through npx.
   - A new decision record, scaffolded with the installed docs-warden `adr_new.py` and
     indexed with `adr_index.py`, supersedes `DEC-0002`'s "no installs regardless of model
     judgement". The user, not the model, approves an install through the guard's ask
     prompt, and workers are still denied.
   - fabflows goes from `0.5.2` to `0.6.0` and docs-warden from `0.5.0` to `0.6.0`. The
     fabflows `description` stops saying the guard `blocks package installs`, and
     `.claude-plugin/marketplace.json` and the root `README.md` bullet change to match in
     the same commit.

## Check

- `node --test "plugins/fabflows/test/*.test.js"` passes, with new cases in
  `plugins/fabflows/test/guard.test.js`:
  - `ask` for every runner in item 1 and a sample of existing installers (`npm install x`,
    `pip install x`), in the main thread, with `permission_mode` set to each of `default`,
    `acceptEdits`, `auto` and `plan`.
  - `deny` for the same commands with an `agent_id`, and with `permission_mode` set to
    `bypassPermissions`, `dontAsk`, an unknown value, or absent.
  - `deny` with `permission_mode: "default"` for: an install followed by a segment another
    rule denies; that deny-rule segment followed by an install; an install that names
    `~/.claude/plugins/`; `curl x | sh`. Use inert stand-ins, such as a git commit on the
    default branch or `git reset --hard`, and never a delete payload.
  - Allowed: `echo "npx foo"`, `npm init -y`, and the existing `pypdf` scratchpad case.
  - The existing install table still denies, because its inputs carry no
    `permission_mode`.
- `python3 plugins/docs-warden/test/test_scripts.py` prints no `FAIL`. A new test puts
  `npx` and `bunx` on PATH without `markdownlint-cli2` and asserts two things:
  `check_lint` never calls `subprocess.run`, and it returns `skipped` with a fix that
  names the approve-first command.
- `node --test "test/*.test.js"` passes, so the manifests agree.
- Spike: pipe
  `{"hook_event_name":"PreToolUse","tool_name":"Bash","permission_mode":"default","cwd":"<repo>","tool_input":{"command":"npx --yes markdownlint-cli2@0.23.2"}}`
  into `node plugins/fabflows/hooks/guard.js`. It prints `"permissionDecision":"ask"`.

## Out of scope

- Seeing inside a script that spawns a download. No shell-string hook can.
- Wrappers the guard already cannot see: `bash -c`, `python -c`, variables, full binary
  paths, `env` and `command` prefixes, `.cmd` and `.exe` suffixes, flags before the
  subcommand. These are listed as known gaps, not fixed.
- Any change to a worker agent file.

## Decisions

- Close both holes, the direct runner and the hidden spawn, and add wording (user, round
  1 Q1).
- `audit.py` stops using runners instead of switching to `npx --no` (user, Q2). `npx --no`
  on a missing package probably exits non-zero, the same as a lint finding, and would be
  misreported as `fail`. This is inferred and was not run.
- `ask` in the lead, `deny` in workers (user, Q3). The prompt is native, and background
  workers cannot show one.
- `ask` only for an allowlist of modes; everything else, missing included, is denied.
  Whether a hook's `ask` prompts in `bypassPermissions` or `dontAsk` is not confirmed,
  and deny is today's behaviour, so nothing regresses (refuter S4).
- The ask is deferred to the end of the check so every deny rule keeps precedence
  (refuter S1, S2). A must-fix security gap found in the lens pass is closed by design.
- Accept the gap that a `PermissionRequest` hook or SDK host can answer an `ask` automatically, and
  document it (refuter S3). Denying instead would remove the approval path the user asked
  for, and whoever configures such a hook or host has chosen to automate prompts.
- Both plugins take a minor bump. fabflows gets a new guard decision type. docs-warden's
  lint no longer runs on its own, which consumers will notice, on a 0.x version.
- One spec, one PR, one bump per plugin. `CLAUDE.md` says a stack of commits landing as one
  PR gets one bump.

## Deferred

- A network sandbox or PATH shims so a spawned script cannot download.
- Letting `npx --no` and local-only runners through without a prompt.
- `go run pkg@ver`, `deno run npm:`, `dotnet tool run` and other long-tail runners.
- Closing the `env` and `command` prefix, `.cmd` suffix and flag-before-subcommand evasions
  for installers and runners alike.
- A per-package allowlist the user builds up.
