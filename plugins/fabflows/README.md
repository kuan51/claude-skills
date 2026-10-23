# fabflows

Routes mechanical work from an expensive lead model down to cheaper workers, and makes
the lead prove what those workers claim.

> **This plugin installs an active hook.** Once enabled, a `PreToolUse` hook runs on
> every `Bash`, `PowerShell`, `Monitor`, `Read`, `Grep`, `Edit`, `Write`, and `NotebookEdit`
> call in your session
> and can block it, or rewrite a worker's test command so only its failures print. It asks before package installs and package runners, and blocks commits and pushes on a default branch,
> destructive shell commands, reads and writes of credential files, and writes to live
> Claude Code configuration. Read [Guard rules](#guard-rules) before you install it,
> including its [known gaps](#known-gaps). It behaves like a tripwire. It offers no
> sandboxing. The ticket hook, `ticket.js`, is part of the companion plugin
> [fabflows-tickets](../fabflows-tickets/).

## The problem

Orchestration instructions that name worker agents are only as good as the agents
existing. A routing table pointing at `@explorer` when no `explorer` agent is installed
does not raise an error. The request silently resolves to a general-purpose agent
running on the lead's own model. The routing that exists to save money spends it
instead, and nothing in the transcript says so.

The second failure is quieter still. A worker returns "done, tests pass," the lead
believes it, and the run continues on a claim nobody checked.

## What's included

Ten workers, each pinned to a model tier and scoped to the smallest tool list that
does its job:

| Agent | Model | Effort | Tools | For |
| --- | --- | --- | --- | --- |
| `fabflows:explorer` | Haiku | none | Read, Grep, Glob | file location, symbol tracing, and structure mapping |
| `fabflows:researcher` | Haiku | none | Read, Grep, Glob, WebFetch, WebSearch | external docs and APIs, distilled with sources |
| `fabflows:editor` | Sonnet | medium | Read, Edit, Write, Grep, Glob, Bash | scoped code changes |
| `fabflows:test-runner` | Sonnet | low | Read, Grep, Glob, Bash, Write | writing and running tests, reporting real output |
| `fabflows:refuter` | Opus | xhigh | Read, Grep, Glob, Bash | reviewing a finished change against its spec, re-running its tests; or a draft spec, lens by lens |
| `fabflows:investigator` | Opus | high | Read, Grep, Glob, Bash | reproducing and narrowing a self-contained failure |
| `fabflows:sweeper` | Sonnet | high | Read, Grep, Glob, Bash | sweeping the functions a change calls but does not change; the build loop's sweep lens |
| `fabflows:reproducer` | Sonnet | low | Read, Grep, Glob, Bash | running one failing command and reporting whether it reproduces |
| `fabflows:security-lens` | Sonnet | high | Read, Grep, Glob, Bash | security findings on a staged diff, never a verdict |
| `fabflows:coverage-lens` | Sonnet | high | Read, Grep, Glob, Bash | mapping each spec Behaviour line to the test that exercises it |

Effort is pinned so a worker does not inherit the lead's session effort. Haiku 4.5 has
no effort levels. The Haiku workers declare none. `CLAUDE_CODE_EFFORT_LEVEL`, if you
set it, overrides every pin.

Plus the `fabflows` skill, which carries the routing table, the four-part delegation
brief, the worker report contract, and the verification gate the lead has to pass before
accepting anything; the `fabflows:build` workflow, described in
[The build loop](#the-build-loop); and the `using-fabflows` entrypoint skill, which you
invoke at the start of a conversation to run the whole session on that discipline.
Invoking it authorizes the lead to launch the build loop, and to make the one commit of its
accepted change on your feature branch, without asking again per task. That invocation is the opt-in, not a SessionStart hook,
because consent should be one deliberate user action and a hook would opt in sessions that
never asked. The `brainstorming` skill sits in front of the loop
for a request that arrives without a spec; see [Brainstorming](#brainstorming). Tickets
and audit trace reports are in the companion plugin [fabflows-tickets](../fabflows-tickets/).
When `.claude/fabflows.json` names a tracker other than `none` and `fabflows-tickets:ticket` is
not loaded, brainstorming and the build stop and ask you to install and enable it.

Agent names are namespaced. Address them as `fabflows:explorer`, not `explorer`.

None of the workers can spawn a worker of its own. `Agent` is absent from every tool
list. The delegation tree therefore remains one level deep, and the cost remains bounded.

## Brainstorming

`fabflows:brainstorming` turns a rough idea into the spec the build loop needs. The lead
sizes the request first: bounded (one behaviour, a few files) is designed in chat, full
(data, interfaces, auth, a feature) gets a spec written to `docs/specs/<date>-<slug>.md`.
Facts come from `explorer` and `researcher`, never from the user; the conversation opens
with an assumptions round, then runs rounds of at most three numbered questions, each with
a recommended answer, until nothing is open. The lead states the maximal version, cuts it
to the smallest shippable slice, and sends the draft to `refuter` in spec mode, which
attacks it across seven lenses and blocks on a security gap. The user reads the spec before
`fabflows:build` launches. Spec review reuses `refuter` rather than a new agent because it is
already the adversarial reviewer with the right tier and tools. Brainstorming is a skill, not
an agent, because asking the user is the lead's job.

## The build loop

`fabflows:build` takes one spec'd change through build and review: an Opus `editor`
implements the spec on the feature branch in the build's own git worktree and stages it, never committing, a fresh
`refuter` (Opus by default, matching the pin in `agents/refuter.md`) reviews the staged diff and
re-runs the tests, and after two rework rounds the loop hands back to the lead. A round that
sweeps callees reviews with two concurrent reviewers on the same staged tree: a `refuter` reads the diff
against the spec and re-runs the tests, and a `sweeper` only sweeps callees, on Sonnet at high effort.
It never commits, merges, pushes, or reverts. On ACCEPT the lead checks that the staged tree is
the one the reviewer recorded (`git write-tree` against `verdict.head`), re-runs the tests and
makes exactly one commit, with the ticket's trailers when the branch is linked through
`fabflows-tickets`, so an accepted build lands as one reviewed
commit with no fix-up commits. A commit hook that refuses or rewrites that commit stops the lead,
because fixing it would be unreviewed work. While plan mode is active the lead never links or edits a ticket, commits or
launches the loop, and approving the plan is not reading the spec. The [skill](skills/fabflows/SKILL.md) carries the preconditions and arguments.
Pass `reviewerModel: 'fable'` to review on the lead's Fable tier instead, for every reviewer except the sweep lens, which stays on Sonnet. The reviewer reads code the diff calls, and a must-fix that names a real bug
there lets the builder fix it even where the spec says otherwise. The builder names each spec
sentence it crossed in `deviations`, the loop matches each entry to the must-fix it cites, and
the lead keeps a matched fix and proposes the spec amendment to the user rather than reverting
it. The first review probes one input per case of each function the diff calls. Rounds 2 and 3
judge only the rework since the staged tree the previous review read: an earlier must-fix still
not fixed, a regression or a real bug in that rework diff, or unstaged work. A new finding
elsewhere is a note the lead reads.

Round 1 builds on Opus because the builder gets the full spec up front and writes most of the output, so
the loop overrides `editor`'s Sonnet pin. Rounds 2 and 3 build on Sonnet at high effort, because a
rework builder only fixes a short must-fix list on work already staged. That setting halved the sweep
lens's time with quality unchanged (#181). The build-then-review order and the rework cap live
in the workflow script, so they hold whatever the lead remembers, and the loop never merges, so
merging stays a human pull request. The loop reviews on Opus by default because iteration 5
measured the Fable reviewer at $1.33 against $0.70 on Opus. Structured `status` and `blocker`
fields decide escalation, never report prose. Any non-blank `blocker` from the builder
escalates to the lead whatever its status says, so the loop never reviews a reply the builder
itself flagged. A reviewer that cannot run the diff or tests answers BLOCKED and the loop
escalates, because the loop must never accept a change its reviewer could not test, and a
broken runner is nothing another round can fix. Reviewer findings reach the next builder
inside a `<must-fix>` fence labelled as data, with fence tags stripped, because findings quote
files the reviewer read and the builder must not obey text quoted inside them.
The builder stages each file by its own path with `git add -- <file>...`, never a directory, a
glob, a pathspec such as `:/`, `-A` or `.`, because the guard checks only the paths a `git add`
names, so `git add -- src/` would stage an un-ignored `src/.env.local` unseen. `git diff --name-only` and
`git ls-files --others --exclude-standard :/` must print nothing before the builder reports done,
and the reviewer counts every printed path as must-fix, because the workflow has no shell and the
staged diff cannot show unstaged files. A reviewer that finds HEAD moved past `baseRef` answers
BLOCKED, since the builder committed. The reviewer checks the tree before it runs the tests,
because a test's transient files would otherwise count as must-fix. It starts the tests in the
background and reads the diff while they run, to shorten the review. It never returns before the
tests finish, and answers BLOCKED when it never sees them finish. A build that throws is resumed with `resumeFromRunId`, not caught
inside the script, because git, the args and the run journal already hold its history, and a
resume carries on where a catch would end it.

Every build runs in one git worktree under `.claude/worktrees/`, on the feature branch, so
isolation is the first line of defence and the guard the backstop, since Claude Code refuses git
commands from a worktree session that reach into the main checkout. The lead enters it with
EnterWorktree before it links a ticket, because ticket links are keyed by branch name, and passes
its `git rev-parse --show-toplevel` as the required `worktree` arg. The script refuses a
`worktree` that is not an absolute path (`/`, or `C:/` as Git for Windows prints it) ending in
`/.claude/worktrees/<name>` or that carries
shell syntax, and every builder and reviewer first checks that it runs in that worktree on that
branch. Separate specs can build in parallel, one session and one worktree each. A repo
whose tests need gitignored files, such as a `.env` or `node_modules`, sets `.worktreeinclude`
or `worktree.symlinkDirectories`, which Claude Code applies to the worktrees it creates.

A spec whose `## Tasks` section lists two to four tasks with disjoint files can pass them as
`tasks`. Round 1 then starts one Opus builder per task at once, each in a temporary worktree of
its own, so no builder sees another's edits or shares an index. Each hands back a tree hash and
its branch, which the script checks before one Sonnet merge agent restores each task's paths
into the build's worktree with `git restore --source=<tree>`, with no piped command, and
removes the temporary worktrees. A task's file can name a directory, which covers the files
under it, and the script then checks that the merge brought in every task, each only within
its own files, before any review. Review and rework then run as for one builder. The Workflow tool
runs at most min(16, CPUs - 2) agents at once, so on a machine with few CPUs the task builders
queue rather than run together.

## Measured performance

fabflows includes a benchmark (`evals/`) that runs a headless Fable lead on the same task
with and without the plugin and grades the result programmatically, never from what the lead
said it did.

Iteration 1 measured fabflows 0.13.3 against no skill and against superpowers
([#123](https://github.com/kuan51/claude-skills/issues/123)). Pooled over the 60 task runs, a
run cost $0.874 with fabflows, $0.640 without it (+36.6%) and $0.756 with superpowers (+18.0%).
Quality differed on one text-match check only, which failed two superpowers runs. It was a grader
artifact, and after the regrade quality is the same in every arm (`evals/RESULTS.md:290`).
On short tasks, most of the extra cost is a fixed start-up
charge of about $0.15 per run for the plugin listing and the two Skill loads, while the build
task's extra cost is the Opus builder and reviewer. The routing aims to save money on large
reads, and in iteration 1 delegation saved money only on the task that reads 13 files.
[evals/RESULTS.md](evals/RESULTS.md) has the per-task figures, the attribution and the
confounds. Iteration 2 ([#133](https://github.com/kuan51/claude-skills/issues/133)) moved the
recovery table and four long-session habits out of the skill's start-up text, into
`skills/fabflows/references/recovery.md`. A run now writes about 470 fewer tokens at start-up,
about $0.009, and every run still passed.
Iteration 3 ([#120](https://github.com/kuan51/claude-skills/issues/120)) measured clearer stop,
quote and empty-item rules in the six agent files. The Opus and Sonnet agents then stopped on
every brief with a missing part, and the two Haiku agents in 2 of 6. The rules were not adopted
then. Iteration 4 ([#140](https://github.com/kuan51/claude-skills/issues/140)) adopted them in
the investigator, editor and test-runner, and measured the stop rule as a first-paragraph check
for the two Haiku agents: the explorer stopped in 4 of 5 runs and the researcher in 3 of 5, so
their files and the refuter's stay as they are.
Iteration 5 ([#145](https://github.com/kuan51/claude-skills/issues/145)) told the refuter that
the code a diff calls is in scope and let it probe that code with one line. The build loop's
review then named a planted defect in a callee the spec never mentions in 5 of 5 runs, against
0 of 3 on master, but the rework left the defect in place in 4 of 5: the builders read the
fixture's spec as forbidding the library change. The rule was not adopted then.
Iteration 6 ([#146](https://github.com/kuan51/claude-skills/issues/146)) let the builder treat a
reviewer's must-fix as permission to fix a bug in code the change calls. The builders then fixed
every caret defect the review named, 3 of 3, but the lead session reverted two of those fixes
after the loop, citing the fixture's spec, and two reviews never named the defect. The plugin's
text did not change then.
Iteration 7 ([#148](https://github.com/kuan51/claude-skills/issues/148)) landed both patches in
0.14.0 and made the loop return the builder's deviations matched to the must-fix that demanded
each one, with a gate rule that a matched fix stands. The lead kept the caret fix in 4 of 4 runs
where the loop made it, against 1 of 3 before; 3 of 5 runs passed the whole bar, the misses being
a review that never read the callee and a run that hit the rework cap with the fix in place.
Iteration 8 ([#154](https://github.com/kuan51/claude-skills/issues/154)) made the first review
sweep each callee case by case and later reviews judge the rework only, in 0.15.0. All 5 runs
passed the whole bar: every first review listed `caret()`'s cases and probed the `^0.M.P` one,
every loop ended ACCEPT after one rework round, and no lead reverted the fix.

The skill's description keeps it off short tasks, because iterations 1 to 3 measured the same
quality there at extra cost. Reading more than a handful of files counts as volume even when
the lead will judge the result, because with narrower wording one of two leads read all 13
files itself.

## Long sessions

The skill's [recovery reference](skills/fabflows/references/recovery.md) carries the
long-session habits. The lead delegates only when a worker keeps a large volume out of its
context, because a worker starts cold and its report is re-read on every later turn, so a small
delegation costs more than doing the task. The skill never sets the lead's effort, because
effort is the user's session setting. Only the workers pin theirs, per the table above, so a
cheap worker never inherits an expensive lead's level.

On a Claude subscription within plan usage, the main conversation's prompt cache already
lives one hour. Workers and the build loop get five minutes, so set
`"subagentPromptCacheTtl": "1h"` only if a worker idles longer than that mid-run. On an
API key, or once a subscription spills onto usage credits, both drop to five minutes:
set `"promptCacheTtl": "1h"` as well, at a higher cache-write rate (Claude Code v2.1.242
or later). Compact at task boundaries and `/clear` between unrelated tasks; `/compact`
mid-task forces one full cache rebuild.

## Why not the built-in Explore agent

`Explore` inherits the main conversation's model, capped at Opus. Under an expensive
lead it costs roughly what searching yourself would. A plugin cannot override a built-in
agent, so `fabflows:explorer` exists as the cheap alternative rather than as a
replacement for it.

## Guard rules

A `hooks/guard.js` file implements every rule below. Being one Node file with no
dependencies, it needs no install and behaves the same on every OS. It blocks with
a JSON `permissionDecision` and always exits 0, because exit 2 is reported not to block calls
made inside a subagent. The shell
rules apply to the commands of the `Bash`, `PowerShell` and `Monitor` tools alike. A
command is split into segments on `&&`, `||`, `;`, `|`, `&` and line breaks outside
quotes, and each rule is anchored at the start of a segment. A commit message, a PR body or
a `grep` pattern that mentions `npx`, `sudo` or `git push` is text, not a command. A command
with a quote still open at the end is split everywhere, which errs toward deny.

- **Package installs and package runners** across npm, pnpm, yarn, bun, pip, uv (including
  `uv sync`), dotnet,
  cargo, go, gem, apt, brew, winget, choco, scoop, and PowerShell's `Install-Module`,
  plus the runners that download on the fly: `npx`, `pnpx`, `bunx`, `npm exec`/`npm x`,
  `bun x`, `pnpm dlx`, `yarn dlx`, `uvx`, `uv tool run`/`install`, `uv run --with`,
  `pipx run`/`install`, `npm|yarn|pnpm|bun create`, and `npm init <name>` (`npm init -y`
  is allowed). In the lead, in the `default`, `acceptEdits` or `auto` mode, the
  guard returns `ask`, so you approve or refuse it in the normal permission prompt, and
  Claude is told to stop if you decline. It only asks once every other rule has passed,
  so an install next to a denied segment is still denied. A worker, and any other mode
  (`plan`, `bypassPermissions`, `dontAsk`, missing), gets `deny`; in a mode that cannot
  prompt, Claude asks you to run the command yourself. The lead asks instead of a flat deny
  because a deny gives you no way to say yes and pushes the model to find another route. A
  worker gets `deny` because a background worker cannot show a prompt. The prompt names every install in
  the command, not only the first. An install aimed at live configuration is always
  denied: run from a session directory there, after a `cd`, `pushd` or `Set-Location`
  into it, or naming it in its own `VAR=` prefix, `--prefix=` or `--target=`, whether
  written as `~`, `$HOME` or an absolute home such as `/home/<user>` or `/root`. A
  mention of live config elsewhere in the command (`cat ~/.claude/settings.json`) does
  not turn an install into a deny. A local bin is not a download: `npx` and `npm exec`/`npm x` pass when they name
  a plain bin (no `@`, `/` or `:`) as the first word, with no runner flag before it
  found in `node_modules/.bin` of the nearest directory with a `package.json` or
  `node_modules`, or of any directory above it, which is where npm looks. That lets
  `npx vitest run` and `npx tsc -p x.json` work in a project that has them installed, and in
  a workspace package whose bins are hoisted to the monorepo root. `pnpx`, `bunx` and `bun x` always count as
  downloads. One more exception:
  `pip install --isolated --target <dir> pypdf` (also `python -m pip`) when `<dir>` is a
  literal path with a `scratchpad` directory in it and outside the live configuration below,
  so a session can read a PDF without anything landing in site-packages. `--isolated` is
  required because it makes pip ignore `PIP_*` variables and user config, the two ways the
  install could be pointed at another index. A variable in the path, a second package, an
  index flag, or a `-r` file is still denied.
- **Commits, pushes, merges and rebases on a default branch.** The default is read from
  `origin/HEAD` at runtime, falling back to `main` or `master`. The branch is read from the
  directory a `cd`, `pushd`, `chdir`, `Set-Location`, `sl` or `Push-Location` earlier in the
  same command moves into, so `cd <worktree> && git commit` is judged against that
  worktree. A branch the same command creates or switches to (`git checkout -b`,
  `git switch -c`, `git switch <name>`) is the one a later commit, merge or rebase is judged
  on, so `git checkout -b fix && git commit` passes on main. A bare `git checkout <x>` is
  not followed, because `<x>` can be a file. `git merge-base`, `git commit-graph` and other
  subcommands that only share a prefix pass, and so do `git merge --abort` and
  `git rebase --quit`. A push is judged by the branch it writes to. Each refspec's
  destination is checked (`HEAD:main` and `+feat:main` push to main), and with no refspec
  the current branch is. `git push origin feat` from main passes, `git push --all` and
  `--mirror` are denied, and force-push is blocked only when it targets a default branch,
  so `--force-with-lease` on your own feature branch still works.
- **Destructive commands**: `rm -rf` and `Remove-Item -Recurse -Force` at a home,
  root, parent, or `.git` target; `git reset --hard`; `git clean -fd`; `git branch -D`
  (but not `-d`); `sudo`; a `chmod` that makes a path world-writable; `dd of=`; `mkfs`;
  `Set-ExecutionPolicy`. Piping a download straight into a shell is blocked too. A root followed by a
  glob is the root: `rm -rf /*`, `'/'`, `/?*` and `C:\*` are blocked, while `C:*`, the
  current directory on drive C, passes, and so does PowerShell's `\*` for the current
  drive. Both rules read a word as bash hands it over, with quotes and backslash escapes
  removed, so `\/*`, `/""*` and `o\+w` count too. `chmod` is blocked when its mode, the
  first word that is not an option, is an octal mode that lets others write (`-R 777`,
  `666`, `0002`, `=777`) or symbolic clauses that, applied in order, leave others able to write (`o+w`, `a+rwx`,
  `-x,o+w`, `o=u`); `+w` with no who-part, `u+w`, `755` and `a+w,o-w` pass. Under home,
  a delete is blocked at home itself
  in any spelling (`~`, `$HOME`, `/root`, `/home/<user>`, `C:\Users\<user>`), at `~/*`,
  at a direct child such as `~/projects`, anywhere under `.ssh`, `.claude`, `.aws`,
  `.config` or `.gnupg`, and at any target with a `..` segment, which can climb back to
  home. A deeper path such as `rm -rf ~/.cache/pip` passes. A dry run (`git clean -nd`)
  passes too.
- **Credential files**: reading, staging, or writing `.env`, `*.pem`, `*.key`,
  `id_rsa`, `~/.ssh/`, `~/.aws/credentials`, `.npmrc`, `.pypirc`. A `Read` or `Grep`
  of a bare `~/.ssh` or `~/.aws` directory counts, whatever trailing `/` or `/.` follows
  it. A path is also checked with `//`, `./` and `..` segments resolved, so
  `~/.aws/sso/../credentials` counts. A `Grep` `glob` is split the way the tool splits
  it, on spaces and on commas outside braces. Each piece with no wildcard is checked like
  a path (`config/.env`, `.env.development`). Otherwise its last one or two path parts
  are tried against a fixed list of sample secret names: `.env`, `.env.local`,
  `.env.production`, `x.pem`, `x.key`, `id_rsa`, `id_ed25519`, `.ssh/id_rsa`,
  `.aws/credentials`, `.npmrc`, `.pypirc`. This blocks `.en*`, `.*`, `apps/*/.env` and
  `**/.ssh/**`. A glob is blocked as too complex to check in time when it
  expands to more than 64 names once its `{a,b}` groups are expanded.
  Committed examples (`.env.example`, `.env.sample`,
  `.env.template`) are exempt, but only the example itself: `cat .env.example .env` is
  still blocked. A `.pem` or `.key` name
  followed by a source or prose extension (`monkey.pem.md`, `api.key.ts`) is not a secret,
  but `sa.key.json` still is. A `.env` directory, such as a Python virtual environment, is
  not a secret either.
- **Secrets in an edit.** AWS access key ids, GitHub tokens, Slack tokens, Google API
  keys, and private-key headers are blocked.
- **Destructive commands written into a runner file.** A `Makefile`, `justfile`,
  `package.json`, or shell or PowerShell script whose new content carries a dangerous
  delete or any command in the destructive list above is blocked, whether it arrives by
  `Write`, `Edit`, or a `printf`, `echo`, heredoc, or `tee` redirected into it. The shell
  rules cannot see inside `make nuke` once the target exists, so the payload is stopped at
  the point it is written. Prose files are not checked. A quoted string on a comment line,
  or on an `echo`, `printf`, `Write-Host` or `Write-Output` line with no redirect and no
  `| tee`, is a message and is not checked either.
- **Live configuration**: `~/.claude/settings.json`, `~/.claude/settings.local.json`,
  `~/.claude/hooks/`, `~/.claude/plugins/`, and any `.git/hooks/`. This is what stops a
  worker from disarming the guard. Reading them and running a script that lives there is
  allowed. A shell command that names one of these paths counts as a write unless it is on
  a short read-only list, which includes `cat`, `bat`, `grep` and `sed` without `-i` or
  `--in-place`. Running a script under `~/.claude/plugins/` or `~/.claude/hooks/`, directly
  or through an interpreter, counts as a read of it. A `cp` or `Copy-Item` out of live
  configuration is a read when its destination (the `-Destination` value, else the last
  word) is not live configuration, and not home, `~/.claude` itself or a `.git` directory.
  A `cp -t` is never a read. Writes and redirects to a file are blocked, including copying
  files into the plugin cache. Merging or discarding a stream (`2>&1`, `2>/dev/null`) does
  not count, and a backup name such as `settings.json.bak` is not live configuration.
  Everything else under `~/.claude/` stays writable.
- **A worker's test output is trimmed to its failures.** This is the one rule that rewrites a
  call instead of blocking it. A worker's `Bash` call (one with an `agent_id`) is rewritten when its
  repository root is a build or task worktree (`.claude/worktrees/<name>`, the check
  `fabflows:build` makes) and the whole command is `npm test`, `npm run test`, `yarn test`,
  `pnpm test`, `node --test`, `pytest`, `python -m pytest`, `go test`, `cargo test` or `bats`,
  followed only by relative paths or globs inside the worktree. Any flag, absolute path, `..`
  segment, shell operator, expansion or comment leaves the command alone, so `--prefix` or
  `-exec` cannot send the run outside the worktree. The run's output goes to
  `.fabflows/test-output/<tool_use_id>.log` in the worktree, ignored by a `.gitignore` holding
  `*`. Up to 80 lines print whole. Longer output prints the lines matching `not ok`, `fail`,
  `error`, `assert`, `✖` or `✗` with 4 lines after each (at most 150), the last 20 lines and the
  log path, and the original exit status is kept. The rewrite is allowed without a prompt,
  because the original command is its first step and the rest only reads the log; your deny and
  ask rules still apply to each step. In exchange, a test runner runs project code the worker can
  edit (a `package.json` script, `conftest.py`), and that code is approved too. Rewriting before
  the call is the only option, because a failing call's output cannot be replaced afterwards.

A `SubagentStop` hook checks that a worker's final report actually includes its contract
fields, and sends it back to be re-emitted if two or more are missing. A researcher's
searches and fetches, and an `exit status`, count as its commands, and a `Files read` or
`Local files you read` line counts as its files. It checks only fabflows' own workers
(`fabflows:<name>`), so another plugin's agent or your own with the same name is left alone.

### Known gaps

The guard matches patterns on shell strings. It does not understand shells, and it can
be walked around:

- Base64, variable expansion (`X=rm; $X -rf ~`), command substitution (`$(...)`),
  heredocs, `bash -c`, `python -c`, and full binary paths all evade it. Newlines, `&`, a
  leading `(`, a `VAR=value` prefix, a quoted command name (`"npx" foo`), and the prefixes
  `time`, `exec`, `nohup`, `command`, `timeout`, `nice`, `stdbuf`, `watch`, `ionice`, `!`,
  `{`, `env` and `xargs`, with their flags, do not: each segment is anchored separately.
  Any other wrapper (`taskset`, `chrt`, `unbuffer`, `caffeinate`) still hides the command
  after it. A prefix flag whose value is a separate word is stripped only when the
  guard knows it takes one (`xargs -n 1`, `xargs --max-args 1`, `xargs -I {}`,
  `env -u VAR`, `exec -a name`); an unlisted one hides the command after it, and so does
  `env -S'cmd'` written with no space. Prefix names match in any case (`Env`, `TIME`).
- Any binary whose basename is an interpreter name (`./x/python.exe`) is trusted to run a
  script from the plugin cache.
- `git -C <other-repo> commit` is evaluated against the session's directory, not the
  repository the command targets.
- `cd elsewhere && git commit`: the second segment is judged in `elsewhere` when that
  is a repository, and in the session directory when the guard cannot resolve it (a
  variable, `-`, a missing path). A real second repository on a feature branch is
  judged there, whatever branch the session is on.
- The runner-file rule keys on the **file name**. A payload written to `notes.txt` and
  then run with `bash notes.txt` is not caught, and neither is one assembled from pieces.
- A script that spawns a package runner itself is invisible to it, since only the shell
  string is checked. docs-warden's `audit.py --run-generators` skips a runner or installer generator,
  but any other script, and `pre-commit` on its first run, can still download where no
  hook sees it.
- `npm.cmd` and flags before the subcommand (`npm --global install`) evade the install
  rules, just as full binary paths do.
- A command inside quotes, including a quoted `$(...)`, is text. `git commit -m "$(npm i x)"`
  runs the install unseen, as `bash -c` already does.
- `sed` without `-i` counts as a read, though its `w` command can write a file.
- An `ask` can be answered with no human looking: a `PermissionRequest` hook, an SDK
  `canUseTool` callback, or `--permission-prompt-tool` can approve it automatically.
- Workers are told apart by the `agent_id` field. Whether agent-team teammates carry it
  is not documented.
- A delete of a system directory such as `/usr`, `/etc` or `/var` is not blocked; only
  the root itself is, including behind a bracket or wildcard brace glob (`/[a-z]*`,
  `/{*,.*}`).
- `chmod --reference` passes, and so does a chmod run by its full path (`/bin/chmod`).
- Removing every quote to read an `rm` target as bash would can join words that bash
  keeps apart, so a quoted target with a `*` word of its own (`rm -rf "old *"`) is blocked.
- A `Grep` glob is tested against a fixed list of sample secret names, so a glob that
  matches only a secret name missing from the list (`prod.env`) passes. A glob of only
  `*`, `?` and `/` (`*`, `**/*`) is not checked. Rare broad globs such as `*.local`, `*rc`
  and `*.p*` are blocked because they can match a secret name.
- Only the `Read` and `Grep` tools and cat-style shell readers (`cat`, `head`, `tail`,
  `less` and similar) are checked for credential files. The same search run from the
  shell is not: `rg -g .env`, `grep -r . ~/.aws`, `sed -n p .env` and `awk 1 .env` pass.
- A `Grep` over `.` or `~` with no glob can still read `.env` or `~/.ssh`: the guard
  cannot see which files a search opens. The `Glob` tool is not checked; it lists names
  but not contents.
- It matches on **paths, not content**. A `Grep` scoped at `~/.ssh/` is denied because
  the path gives it away, but a `Grep` over `.` searching for `AKIA` is not: the guard
  cannot see what a search is looking for, only where it is pointed.

It also **fails open**. Malformed input, a missing `git`, a directory that is not a
repository, a timeout: all of those allow the call. That is deliberate: a guard that
failed closed would block every shell call in every session of anyone who installed this
plugin, and the cost of the wrong default there is far higher than a missed tripwire.

A call that was not blocked is not a call that was approved. The real containment on
a worker is its tool allowlist: `fabflows:researcher`, the agent most exposed to
untrusted web content, has no Bash and no Write at all, and no hook is needed to enforce
that. It still holds Read, Grep and the web tools, so a page that talks it into reading a local
file could send that text out in a fetched URL. Its prompt, not its allowlist, is what stops that.

## Disabling it

`/plugin disable fabflows`. No environment-variable escape hatch exists, on purpose:
an off switch a model can set is not an off switch. Note that because the guard protects
`~/.claude/plugins/`, upgrading or removing this plugin is a manual action you perform
yourself.

The one environment variable the guard reads is `FABFLOWS_PROBE`. Set it to a file path
and the guard appends each raw hook payload it receives to that file, which is how you
confirm the hook runs at all and see the exact payload format your version sends. It
**logs the payload, then continues to the normal rules**. It does not short-circuit
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
