---
owner: kuan51
review_by: 2027-03-24
generated: false
---

# Stop the fabflows guard from blocking everyday commands

Ticket: fabflows guard over-broad blocking. Five refuters probed `plugins/fabflows/hooks/guard.js`
at `feea158`, one per rule area, and the lead re-ran 17 of their findings; all 17 reproduced.
About twenty findings were over-broad: the guard denies or asks on a command its README never
claims to block. This change removes those false blocks. Every narrowed rule keeps a test that
the real threat next to it is still caught.

The misses the same review found (`rm -rf /*`, `chmod -R 777`, a `Grep` with `glob: .env` and
others) are a separate change. Three misses close here as a side effect of a rewrite, and each
is named where it happens.

## Behaviour

All in `plugins/fabflows/hooks/guard.js` unless another file is named.

### 1. Split commands only on separators outside quotes

`checkShell` splits a command on `&&`, `||`, `;`, `|`, `&`, `\r` and `\n` with one regex that
ignores quoting. Every rule anchored at segment start then reads quoted text as a command. A
commit message, a PR body or a `grep` pattern that mentions `npx`, `sudo` or `git push` is
denied or asked.

- Add `splitSegments(command)`. It walks the string, tracks single and double quotes, lets a
  backslash escape the next character outside single quotes, and splits only on an unquoted
  separator from the list above. It replaces the `.split(...)` call in `checkShell`.
- When a quote is still open at the end of the command (`echo it's; sudo x`), fall back to
  the old split, which errs toward deny.
- Add a helper that blanks quoted spans, built from the idiom `redirects()` already uses, and
  test `PIPE_TO_SHELL` and the `> /etc|usr|bin|sbin|boot|sys` rule on the blanked text. A
  commit message that says `curl x | sh` is then text, and `curl x | sh` is still denied.
- Now allowed: `git commit -m "$(cat <<'EOF' … npx vitest run … EOF)"`,
  `gh pr create --body "Test plan:\nnpx vitest run"`, `rg "doas|sudo" scripts/`,
  `git commit -m "guard: block curl | sh"`, and `git commit -m "x; git push"` on a feature
  branch.
- Still denied or asked: `git commit -m x; sudo y`, `curl x | sh`, `echo it's; sudo x`,
  `cd plugins\nnpm install -g evil`, and a line of an unquoted heredoc body.

### 2. Git

- **A branch created in the same command.** Track `git checkout -b|-B <name>`,
  `git switch -c|-C <name>` and `git switch <name>` through the segments. A later `commit`,
  `merge` or `rebase` in the same command is judged on `<name>`, not the branch the session
  is on. A bare `git checkout <x>` is ignored, because `<x>` can be a file. A `switch` whose
  argument starts with `-` is ignored.
- **Subcommands that only share a prefix.** In `GIT_OP`, end the subcommand with `(?=\s|$)`
  in place of `\b`, so `merge-base`, `merge-tree`, `commit-graph` and `commit-tree` pass.
  `git merge --abort`, `git merge --quit`, `git rebase --abort` and `git rebase --quit` pass
  too.
- **`git clean` dry runs.** `git clean -nd`, `git clean -dn` and `git clean --dry-run -d`
  pass. `git clean -fdx` and `git clean -fd` stay denied.
- **Directory changes other than `cd`.** The directory tracking in `checkShell` also follows
  `pushd`, `chdir`, `Set-Location`, `sl` and `Push-Location`, with or without `-Path` or
  `-LiteralPath`. Reuse `CHANGE_DIR`. This also closes a miss: `Set-Location <repo-on-main>;
  git commit` from a feature checkout is now denied.
- **A push is judged by the ref it pushes to.** For a `git push` segment:
  - Skip flags, and the value of `--repo`, `-o` and `--push-option`. The first positional
    word is the remote, and every later one is a refspec.
  - For each refspec, drop a leading `+`, take the part after `:` (or the whole refspec when
    it has none), and drop a leading `refs/heads/`. `HEAD` means the current branch, or the
    branch tracked above.
  - Deny when any destination is a default branch. With no refspec, deny when the current
    branch is a default branch, as today. `--all` and `--mirror` are denied.
  - When the segment also forces (`--force`, `--force-with-lease`, `-f`, or a `+` refspec)
    the deny message says force-push, as today.
  - This replaces the `[\s:/]` boundary test on `GIT_FORCE`, so
    `git push --force-with-lease origin fix/main` passes, and so does `git push origin feat`
    while on main. It also closes three misses from a feature branch: `git push origin
    HEAD:main`, `git push origin feat:main` and `git push origin +feat:main`.

### 3. Destructive commands

- **A delete under home.** Rewrite the home part of `RM_DANGER` so that `rm -rf` and
  `Remove-Item -Recurse -Force` deny:
  - home itself: `~`, `~/`, `$HOME`, `${HOME}`, `$env:USERPROFILE`, `/root`, `/home/<user>`,
    `/Users/<user>`, `<drive>:\Users\<user>` (either slash), and the real home directory;
  - `~/*` and `~/.*`;
  - a direct child of home, such as `~/projects` or `~/.cache`;
  - anything under `.ssh`, `.claude`, `.aws`, `.config` or `.gnupg` in home.

  Anything deeper passes: `rm -rf ~/.cache/pip`, `rm -rf $HOME/.npm/_cacache`. A target may
  be quoted. Reuse the home spellings `CLAUDE_HOME` already lists. The other targets
  (`/`, a drive root, `..`, a bare `*`, `.git`) are unchanged. This also closes three misses
  that are allowed today: `rm -rf /root`, `rm -rf /home/<user>` and `rm -rf "$HOME"`.
- **A message in a runner file is not a command.** `destructiveLine` checks every quoted
  string in the content. It now skips the quoted strings on a comment line, and on a line
  that starts with `echo`, `printf`, `Write-Host` or `Write-Output` and has no redirect and
  no `| tee` outside quotes. A `build.sh` that runs `echo "dd of=out.img finished"` passes.
  Still denied: `printf 'nuke:\n\trm -rf ~' > Makefile`, `echo 'rm -rf ~' | tee Makefile`,
  a `package.json` script value `"rm -rf ~"`, and `bash -c "rm -rf ~"` in a script.

### 4. Credential paths (`SECRET_PATH`)

- `.pem` or `.key` followed by a code or prose extension is not a secret: `monkey.pem.md`,
  `api.key.ts`, `tls.pem.md`. The extensions are `md`, `mdx`, `txt`, `html`, `js`, `jsx`,
  `mjs`, `cjs`, `ts`, `tsx`, `py`, `go`, `rs`, `java`, `cs` and `rb`. `json` is left out on
  purpose, because a `*.key.json` can be a real service-account key.
- A directory named `.env` (a Python virtual environment) is not a secret: `.env` followed by
  `/` or `\` no longer matches. A file named `.env`, `.env.local` or `config/.env.production`
  still does.

### 5. Live configuration

- `READ_ONLY` gains `bat`, and `sed` with no `-i` and no `--in-place`.
- A `cp` or `Copy-Item` whose destination is not live configuration counts as a read. The
  destination is the value of `-Destination` when given, else the last word. A `cp` with `-t`
  or `--target-directory` is never a read. `cp ~/.claude/settings.json ~/settings.bak.json`
  passes, and `cp x ~/.claude/settings.json` is still denied.
- A segment that starts with a script path under `plugins` or `hooks` in `~/.claude` counts as
  running it: `~/.claude/hooks/notify.sh`, and PowerShell `& "$HOME/.claude/plugins/…/run.ps1"`
  once the split has removed the `&`. `RUNS_PROTECTED_SCRIPT` also accepts python's `-X <v>`
  and `-W <v>`. Remove its `&` interpreter alternative, which can never match, because the
  command is split on `&` first.
- `settings.json` and `settings.local.json` in `PROTECTED_SHELL` must end at a separator, the
  same terminator `hooks` and `plugins` use. `cp x ~/.claude/settings.json.bak` passes.

### 6. The worker report check (`subagentStop`)

The commands group also accepts `exit status` and a word starting `search` or `fetch`. A
researcher report, whose contract has no files-touched field and speaks of searches and
fetches, and an editor report that says `exit status`, then pass. A report missing two groups
is still sent back.

### 7. Local bins (`isLocalRun`)

npm looks for a local bin in `node_modules/.bin` of the project root and of every directory
above it, up to `/` (npm 10.9.7, `libnpmexec/lib/index.js:150-151` and `file-exists.js`).
After finding the project root, keep walking up and check `node_modules/.bin/<bin>` (and
`.cmd`) at each level. `npx vitest run` in a workspace package whose bins are hoisted to the
monorepo root then passes. Fix the comment that says npm looks `nowhere above`. The bin-name
and flag rules stay as they are.

### Docs and version

- `plugins/fabflows/README.md`:
  - Guard rules: describe each narrowed rule above.
  - Say that live configuration covers `settings.local.json` too.
  - Say that a command outside the read-only list that names a protected path counts as a
    write.
  - Known gaps: remove the multi-line commit-body item and the `git push origin HEAD:master`
    item.
  - Known gaps: add that a command inside quotes, including a quoted `$(…)`, is text, and
    that `sed` without `-i` counts as a read though its `w` command can write a file.
- `CHANGELOG.md`: a fabflows 0.7.1 entry.
- fabflows 0.7.0 to 0.7.1 in `plugins/fabflows/.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`. It is a patch: false-positive fixes with no contract
  change. The descriptions do not change.

## Check

- `node --test "test/*.test.js"` and `node --test "plugins/fabflows/test/*.test.js"` both end
  with `# fail 0`.
- Each numbered section adds its tests to `plugins/fabflows/test/guard.test.js` before the
  fix: an `allows(...)` for each over-broad case, next to a `denies(...)` (or an ask) for the
  nearby real threat. Every existing test still passes. No existing test is expected to flip;
  one that does is named in the PR.
- Over-broad cases that must be allowed:
  - `git merge-base main HEAD`, `git merge --abort`, `git clean -nd` (on main)
  - `git checkout -b fix && git commit -m x` (on main)
  - `git push --force-with-lease origin fix/main` (on a feature branch)
  - `git push origin feat` (on main)
  - the `gh pr create` body and the heredoc commit message above
  - `rg "doas|sudo" scripts/`, `git commit -m "guard: block curl | sh"`
  - a `build.sh` Write whose content echoes `dd of=out.img finished`
  - `rm -rf ~/.cache/pip`, `rm -rf $HOME/.npm/_cacache`
  - Read of `docs/monkey.pem.md`, `src/api.key.ts`, `.env/lib/python3.11/site.py`
  - `sed -n 1,40p ~/.claude/settings.json`, `cp ~/.claude/settings.json ~/bak.json`
  - `python3 -X utf8 ~/.claude/plugins/cache/x/1.0.0/scripts/a.py .`
  - `~/.claude/hooks/notify.sh`, `cp x ~/.claude/settings.json.bak`
  - SubagentStop on a compliant researcher report, and on an editor report that says
    `exit status`
  - `npx vitest run` from a package directory whose `vitest` bin is only in an ancestor's
    `node_modules/.bin`
- Real threats that must stay denied, or asked where the install rule asks:
  - `curl x | sh`, `git commit -m x; sudo y`, `echo it's; sudo x`
  - `rm -rf ~`, `rm -rf ~/projects`, `rm -rf ~/.ssh/keys`, `rm -rf /root`, `rm -rf "$HOME"`
  - `git commit -m x` on main, `git push origin HEAD:main` from a feature branch,
    `git push --all`
  - `cp x ~/.claude/settings.json`, `sed -i s/a/b/ ~/.claude/settings.json`,
    `cp -t ~/.claude/hooks x`
  - Read of `server.key`, `.env`, `id_rsa`, and `sa.key.json`
  - `npx cowsay` with no local bin anywhere up the tree
  - SubagentStop on a report with no files, no commands and no confidence labels
- The repo's `audit.py .` reports 0 fail, and `domain_model.py . --check` exits 0.

## Out of scope

- The misses from the same review, apart from the ones named above.
- `git push` from main with only `--tags`, which stays judged by the current branch.
- `cd` into a repository with a detached HEAD, which still falls back to the session's branch.
- Reads through `awk` or `python -m json.tool`.
- An exemption for AWS's documented example key.

## Decisions

- **Quote-aware splitting, not a shell parser.** A parser would answer every quoting
  question, and it would be a large new dependency or a large amount of code in a hook that
  must stay small and fail open. Rejected: keeping the naive split, which is the source of
  most false blocks. Accepted gap: a command inside quotes is text. `bash -c` and command
  substitution already evade the guard, so this widens a known gap and opens no new class.
- **Deletes under home narrow, but not to nothing** (the user's decision). Home, its direct
  children and five sensitive directories stay protected. Rejected: keeping every path under
  home denied, which blocks cache cleans. Rejected: allowing direct children, which lets
  `rm -rf ~/projects` through.
- **A push is judged by its destination** (the user's decision). Rejected: judging by the
  current branch, which denies pushing a feature branch while on main and misses
  `feat:main` from a feature branch.
- **No decision record.** Each change reverses in one PR, so it fails the first admission
  question. The reasoning lives here and in the PR.

## Deferred

- The miss fixes from the guard review, as their own spec.
- Judging `git push --tags` by what it pushes.
