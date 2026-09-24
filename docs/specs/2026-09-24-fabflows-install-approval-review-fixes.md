# Review fixes for the package-install approval change

Follow-up to `docs/specs/2026-09-24-fabflows-install-approval.md`. Two code reviews of branch
`claude/fabflows-package-guard-gap-55t8c4` found that the first build over-blocks local tools,
lets some installs into live config through with only an ask, and leaves wording and docs that
contradict the new rule. Ticket: fabflows package guard gap.

## Behaviour

### Guard (`plugins/fabflows/hooks/guard.js`)

1. **A locally installed tool is not a download.** A segment matched by the runner patterns
   `npx`, `pnpx`, `bunx`, `npm exec`, `npm x` or `bun x` is **not** an install when either of
   these holds:
   - It carries `--no`, `--no-install` or `--offline`, so it cannot download.
   - Its first non-flag token after the runner (skip a bare `--`) is a plain bin name, and
     `node_modules/.bin/<name>` (or `<name>.cmd`) exists in the effective cwd or any parent
     directory. A plain bin name has no `@`, no `/` and no `:`. The segment must also carry
     no `-p` or `--package` flag. Use `fs.existsSync`, and fail toward install when unsure.

   So `npx vitest run`, `npx tsc --noEmit`, `npm exec -- jest` and `npx --no eslint .` are
   allowed in a project that has them installed. `npx vitest@1 run`, `npx -p x y`,
   `npx @scope/pkg` and a bin that is not installed still count as installs. `uvx`,
   `pnpm dlx`, `yarn dlx`, `pipx` and `uv tool` always download, so they stay installs.
2. **An install aimed at live config is denied, not asked.** An install segment is denied
   in all of these cases:
   - `isProtectedPath(effCwd)` is true. That covers a `cd` into live config and a session
     cwd that is already there.
   - The raw segment, *before* `VAR_PREFIX` is stripped, names a protected path. That
     catches `NPM_CONFIG_PREFIX=~/.claude/plugins/x npm i -g foo` and
     `PIP_TARGET=~/.claude/hooks pip install foo`.
   - `PROTECTED_SHELL` matches. Its leading character class also accepts `=`, so
     `--prefix=$HOME/.claude/...` and `--target=$HOME/.claude/...` are caught. That class
     change applies to every rule that uses `PROTECTED_SHELL`.
3. **Runner names need a space or end of segment after them.** Change `\b` to `(\s|$)` in
   the `npx|pnpx|bunx|uvx` pattern, so a quoted alternation such as `rg "npx|bunx" docs` or
   `grep -E "foo|npx" x` never produces an install segment.
4. **`uv run --with` matches only uv's own options.** `--with`, `--with-requirements` or
   `--with-editable`, followed by a space or `=`, matches only when it comes before the
   command. Only flags and their values may come before it, never a bare positional token.
   So `uv run pytest --with-coverage`, `uv run script.py --with foo` and
   `uv run pytest -k with --with-foo` are not installs. `uv run --python 3.12 --with foo x`
   is an install.
5. **`npm init <initializer>` matches only when the token right after `init` is a
   non-flag.** So `npm init -w packages/a`, `npm init --scope myorg` and
   `npm init --init-author-name "A B"` are not installs, and `npm init vite` still is.
6. **Transparent prefixes are stripped before the anchor**, the same way as `(`, shell
   keywords and `VAR=`. The prefixes are `time`, `exec`, `nohup`, `command`, `!`, `{`, `env`
   followed by any `VAR=value` pairs, and `xargs` followed by its flags. So `time npx foo`,
   `exec npx foo`, `xargs -n1 npx foo`, `! npx foo`, `{ npx foo; }`, `env FOO=1 npm install x`
   and `command npm install x` are judged as the runner or installer they wrap. This helps
   every rule, not only installs.
7. **`plan` leaves `ASK_MODES`**, which becomes `default`, `acceptEdits` and `auto`. A hook
   `ask` is not documented as enforced in plan mode when bypass is available, and plan mode
   has no reason to install anything.
8. **Every install decision tells Claude to stop.**
   - **Ask path:** the result also carries `additionalContext`, which Claude sees even if
     the user declines. It says: if the user declines, or the call is not approved, name the
     package and stop, and try no other runner, package manager, manual download or script.
   - **Deny, worker:** report the package to the lead as a blocker, and do not work around
     it.
   - **Deny, lead in a mode that cannot prompt** (`bypassPermissions`, `dontAsk`, unknown,
     missing): this mode cannot show an approval prompt, so a yes cannot let the command
     through. Ask the user to run it themselves, for example with the `!` prefix, or to
     switch to a mode that prompts. Try no other route.
9. **One output helper.** `decide(decision, reason, context)` writes the `hookSpecificOutput`
   and exits. `deny()` and the install path both call it.
10. **The `Monitor` tool is guarded like Bash.** Add `Monitor` to the `PreToolUse` matcher
    in `hooks/hooks.json`. `preToolUse` treats `tool_input.command` from `Monitor` exactly
    like Bash's.
11. **Remove `npx` from `RUNS_PROTECTED_SCRIPT`.** A runner segment aimed at live config is
    denied by item 2, so the entry is dead.

### Around the guard

12. **The build brief.** In `plugins/fabflows/workflows/build.js`, the builder brief's "A
    denial you worked around is not a blocker" gains an exception. A denied package install
    or package runner is always a blocker: quote it and never work around it. Check that
    `build.test.js` still passes, and add an assertion that the brief carries the exception.
13. **docs-warden generators.** `audit.py --run-generators` skips a declared generator whose
    `command[0]` basename, with any `.cmd` or `.exe` removed, is a package runner: `npx`,
    `pnpx`, `bunx`, `uvx` or `pipx`. The same applies when `command[0:2]` is `pnpm dlx`,
    `yarn dlx`, `npm exec`, `npm x` or `bun x`. The skip is reported in the existing
    skipped list with the reason "package runner; ask the user to run it". Fix the stale
    comment at `audit.py` near line 577, which cites `_lint_runner` resolving npx. It
    should cite the `.CMD` shim of the tool itself.
14. **Docs.**
    - `plugins/fabflows/README.md`:
      - Guard rules: local bins, the mode list without `plan`, and `Monitor`.
      - Known gaps: drop the claim that no other known site spawns a runner. Instead say
        that `--run-generators` skips runners, and that any other script, and `pre-commit`
        on its first run, can still download where no hook sees it. Add
        `$(...)` command substitution if it is not listed already.
      - Known gaps: a multi-line `git commit -m` body whose line starts with a runner is
        judged as a command. That errs toward ask or deny.
      - Remove `env` and `command` from the evasions list, now that they are stripped.
    - `plugins/fabflows/skills/fabflows/SKILL.md`:
      - The ask applies in default, acceptEdits and auto.
      - In other modes the lead asks the user to run the command themselves.
    - `plugins/docs-warden/skills/docs-warden/references/audit-schema.md`: say "the approved
      `npx` command", not "the `npx` command CI uses".
    - `CHANGELOG.md`: update the two 0.6.0 entries to match.
    - `docs/decisions/` DEC-0023: still `proposed`, so edit it in place. Add the local-bin
      rule, `plan` removed, and the generator skip.
    - `docs/specs/2026-09-24-fabflows-install-approval.md`: leave it as the original record.
      This spec supersedes the parts it changes.
    - Regenerate `docs/architecture/domain-model.md` with the installed
      `~/.claude/plugins/cache/claude-skills/docs-warden/0.5.0/skills/docs-warden/scripts/domain_model.py`,
      in its own commit. Never hand-edit it.

## Check

- `node --test "plugins/fabflows/test/*.test.js"` passes, and `guard.test.js` gains these
  cases:
  - **Local bins.** Make a temp dir with `node_modules/.bin/vitest` and use it as cwd. As a
    worker, `npx vitest run`, `npm exec -- vitest` and `npx --no eslint .` are allowed. In
    the same dir, `npx vitest@1 run`, `npx -p vitest vitest` and `npx notinstalled` are
    denied for a worker and asked for the lead. From a dir with no `node_modules`,
    `npx vitest run` is an install.
  - **Live config, lead in default mode, all deny:**
    - `cd ~/.claude/plugins/cache/x && npm install foo`
    - `npm install foo` with the session cwd set to a path under `~/.claude/plugins`
    - `NPM_CONFIG_PREFIX=~/.claude/plugins/x npm i -g foo`
    - `PIP_TARGET=~/.claude/hooks pip install foo`
    - `pip install --target=$HOME/.claude/hooks x`
    - `npm install --prefix=$HOME/.claude/plugins/cache/x foo`
  - **No longer installs:**
    - `rg "npx|bunx" docs`
    - `grep -E "foo|npx" README.md`
    - `uv run pytest --with-coverage`
    - `uv run script.py --with foo`
    - `npm init -w packages/a`
    - `npm init --scope myorg`

    The first two are allowed. The rest are not asked or denied as installs.
  - **Still installs:** `uv run --python 3.12 --with foo x` and `npm init vite`.
  - **Prefixes:** `time npx foo`, `exec npx foo`, `xargs -n1 npx foo`, `! npx foo`,
    `{ npx foo; }`, `env FOO=1 npm install x` and `command npm install x` are denied for a
    worker.
  - **Plan mode:** `permission_mode: "plan"` gets deny.
  - **Precedence:** `npx foo && curl x | sh` is denied in the lead in default mode.
  - **Monitor:** `tool_name: "Monitor"` with `command: "npx foo"` is denied for a worker.
  - **Decision text:** the ask result carries `additionalContext`. The lead's deny in
    `bypassPermissions` says the mode cannot prompt.
  - **Fewer spawns.** Trim the mode matrix. Every runner and installer runs in one ask mode
    (`default`) and one deny case (worker). Every mode runs on a single command.
- `python3 plugins/docs-warden/test/test_scripts.py` exits 0 with no `FAIL` line. It gains a
  test: a declared generator `["npx", "x"]` under `--run-generators` is skipped with the
  package-runner reason, and `subprocess.run` is never called for it.
- `node --test "test/*.test.js"` passes.
- Spike: pipe a PreToolUse JSON with `permission_mode: "default"` and
  `npx --yes markdownlint-cli2@0.23.2` into the guard. It still prints `"ask"` and an
  `additionalContext`.

## Out of scope

- `$(...)` command substitution, `bash -c`, `python -c`, full binary paths, and `.cmd` or
  `.exe` suffixes on the runner itself. These stay known gaps.
- Quote-aware shell splitting.
- Eval task 2 in `plugins/fabflows/evals/tasks.json`. It grades a fixture pinned at an older
  commit, where `pipx run` was allowed by design. Re-pinning it means rewriting the task,
  whose prompt says `pipx install` is not caught, so it is not touched here.

## Decisions

- **Local bins are detected by `node_modules/.bin`, not by allowing all of `npx`.** npx runs
  a local bin before it downloads anything. So an existing bin with no version or package
  spec cannot download, and a missing one can. That restores the build loop's
  `npx vitest run` without reopening the gap. Rejected: allowing `npx` for workers, which
  reopens the gap. Rejected: `npx --no` only, which would make every JS repo rewrite its
  `testCommand`.
- **`plan` is removed from the ask modes.** A hook `ask` is not documented as enforced
  there, and deny was the behaviour before this change.
- **The `=` fix to `PROTECTED_SHELL` applies to every rule.** It also newly denies writes
  like `python fix.py --out=$HOME/.claude/settings.json`. That write was a gap before.
- **The bump stays minor, 0.6.0.** Precedent: fabflows 0.4.0 and 0.5.0 added guard blocks as
  minor bumps, and both plugins are on 0.x. The local-bin fix removes the breakage the
  review flagged for `npx jest`.
- **Commit `1e1c024` keeps its message.** It is pushed, and history is not rewritten. Later
  commits cite the ticket.

## Deferred

- Quote-aware splitting, which would end the multi-line `git commit -m` false positive.
- Detecting a local bin for `pnpm exec` and `yarn` bins through PnP.
