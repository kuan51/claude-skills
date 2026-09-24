# fabflows

Routes mechanical work from an expensive lead model down to cheaper workers, and makes
the lead prove what those workers claim.

> **This plugin installs an active hook.** Once enabled, a `PreToolUse` hook runs on
> every `Bash`, `PowerShell`, `Monitor`, `Read`, `Grep`, `Edit`, `Write`, and `NotebookEdit`
> call in your session
> and can block it. It asks before package installs and package runners, and blocks commits and pushes on a default branch,
> destructive shell commands, reads and writes of credential files, and writes to live
> Claude Code configuration. Read [Guard rules](#guard-rules) before you install it,
> including its [known gaps](#known-gaps). It behaves like a tripwire. It offers no
> sandboxing. A second hook, `ticket.js`, runs on the same shell calls and on PR tools: once
> a branch is linked to a ticket it can block commits with an inline message that lacks the
> ticket's trailers and PR creation whose title lacks its key, and it adds context at
> SessionStart and after pushes, PR creation and merges. See [Tickets](#tickets).

## The problem

Orchestration instructions that name worker agents are only as good as the agents
existing. A routing table pointing at `@explorer` when no `explorer` agent is installed
does not raise an error. The request silently resolves to a general-purpose agent
running on the lead's own model. The routing that exists to save money spends it
instead, and nothing in the transcript says so.

The second failure is quieter still. A worker returns "done, tests pass," the lead
believes it, and the run continues on a claim nobody checked.

## What's included

Six workers, each pinned to a model tier and scoped to the smallest tool list that
does its job:

| Agent | Model | Effort | Tools | For |
| --- | --- | --- | --- | --- |
| `fabflows:explorer` | Haiku | none | Read, Grep, Glob | file location, symbol tracing, and structure mapping |
| `fabflows:researcher` | Haiku | none | Read, Grep, Glob, WebFetch, WebSearch | external docs and APIs, distilled with sources |
| `fabflows:editor` | Sonnet | medium | Read, Edit, Write, Grep, Glob, Bash | scoped code changes |
| `fabflows:test-runner` | Sonnet | low | Read, Grep, Glob, Bash, Write | writing and running tests, reporting real output |
| `fabflows:refuter` | Opus | xhigh | Read, Grep, Glob, Bash | reviewing a finished change against its spec, re-running its tests; or a draft spec, lens by lens |
| `fabflows:investigator` | Opus | high | Read, Grep, Glob, Bash | reproducing and narrowing a self-contained failure |

Effort is pinned so a worker does not inherit the lead's session effort. Haiku 4.5 has
no effort levels. The Haiku workers declare none. `CLAUDE_CODE_EFFORT_LEVEL`, if you
set it, overrides every pin.

Plus the `fabflows` skill, which carries the routing table, the four-part delegation
brief, the worker report contract, and the verification gate the lead has to pass before
accepting anything; the `fabflows:build` workflow, described in
[The build loop](#the-build-loop); and the `using-fabflows` entrypoint skill, which you
invoke at the start of a conversation to run the whole session on that discipline.
Invoking it authorizes the lead to launch the build loop, which commits to your feature
branch, without asking again per task. The `brainstorming` skill sits in front of the loop
for a request that arrives without a spec; see [Brainstorming](#brainstorming). The
`fabflows-setup` skill points the repository at a tracker, and the `ticket` skill keeps the
linked ticket current; see [Tickets](#tickets). The `trace` skill writes an audit report
of merged changes with their tickets, specs and approvals; see [Compliance](#compliance).

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
`fabflows:build` launches.

## Tickets

A repository can keep its specs in a tracker ticket instead of `docs/specs/`, so a PR diff
carries no spec file and the spec sits where managers track the work.

**Setup.** Run `/fabflows-setup` once. It asks for GitHub Issues, Jira, Linear or none,
checks that the tracker's MCP tools are loaded, asks for the project, and writes
`.claude/fabflows.json`, which is committed. It never connects a server and never handles a
secret: connect the tracker's MCP server yourself first. `fabflows:ticket` carries the
rules after that: the tool table, the ticket body template, what a confirmed link lets
Claude do without asking, and how status moves from in progress to in review to done.

**Hooks.** `hooks/ticket.js` keeps a per-branch link: one state file per branch under
`fabflows/tickets` in the common git dir (`git rev-parse --git-common-dir`), named by a hash
of the branch, never in the working tree. Every worktree of the repository sees the same
links. It reads only that local state; every tracker write is Claude's own MCP
call. `ticket.js status` prints the current branch's link, and `ticket.js clear --pr '<url>'`
forgets a link after its branch is gone.

- SessionStart prints one line: the linked ticket, a link found only in a `Refs:` trailer
  (unconfirmed, so Claude asks first), or a reminder that the branch has none.
- PreToolUse denies a `git commit` with an inline message that lacks `Refs: <key>` (and
  `Spec: <hash>` once the spec is approved), and a PR creation whose title lacks the key. It
  splits a command at `&&`, `||`, `;`, `|`, `&`, parentheses and newlines, minding quotes,
  heredocs and comments, and also reads the commands inside `$(...)` and backticks, up to
  eight levels deep. Each commit needs the lines in its own message: a trailer in an `echo`
  or in another commit does not count.
- PostToolUse reminds Claude to update the ticket after a push and a PR creation. After a
  merge (not `gh pr merge --auto` or `--disable-auto`) it finds the ticket by the PR the merge
  named, or, for a bare `gh pr merge`, by the branch it started on. It asks Claude to check
  the merge happened, and closes the ticket only for a PR with a closing phrase: a Refs-only
  PR leaves it open.

**Approval.** The user approves the ticket description as raw text, never rendered: a raw
diff of what Claude wrote against what the tracker holds, or the full raw text when Claude
did not write it. `ticket.js normalize` removes only HTML comments outside fences, invisible
and control characters, and the Links section, so the build gets exactly the text approved.
A `<!--` inside inline code is kept. An unclosed `<!--` removes everything after it, as a
renderer hides it, so `ticket.js approve` refuses that text and names the line.
The approval fingerprint (`ticket.js approve`) and the `Spec:` trailer on every commit tie
the build to that text: `ticket.js check` fails if the ticket changed since, and names the
stored approved text so Claude can show the raw diff.

**Fail-open limits.** The hooks fail open, like the guard, so these pass unchecked:

- The plugin is disabled: no hook runs at all.
- The tracker's MCP server is disconnected: the hooks still demand trailers, but nothing
  updates the ticket.
- SessionStart does not fire on your surface: no reminder line, so Claude learns of the
  link only from a later hook.

**Key-matching limits.** A `Refs:` or `Spec:` trailer must stand on its own message line,
and its key or hash must match exactly (`ABC-12` does not satisfy `ABC-1`, `#70` does not
satisfy `#7`). Only an inline message (`-m`, `--message`, `-F -`) is checked; a commit
written in the editor or from a file (`-F <file>`) is not. A trailer nested inside another
quoted string still passes, and the hook does not look inside `bash -c`, `eval`, an alias,
a heredoc body, or a backtick nested in backticks.
A command whose quotes don't balance is read whole, as one command. A `gh pr create` without
`--title`/`-t` (`--fill`, `--web`) is denied on a linked branch, because its title can't be
checked. The merge reminder also fires after a failed merge command, so it asks Claude to
check first.

## Compliance

Auditors (SOC 2 CC8.1, ISO 27001 A.8.32, IEC 62304) sample merged changes and trace each
one to a ticket, an approved spec and an approval. fabflows keeps that record in the ticket
and writes the trace as a report.

**Setup.** After the tracker, `/fabflows-setup` asks which frameworks apply: SOC 2, ISO
27001, IEC 62304, or your own. It writes them to `compliance.frameworks` in
`.claude/fabflows.json`. Choosing none leaves compliance off.

**The Compliance section.** With compliance on, each ticket spec carries a `## Compliance`
section before Links:

```markdown
## Compliance
- Controls: soc2-cc8.1
- Change: normal
- Class: B
- Traces: REQ-AUTH-1
```

Controls is a list of control IDs or `none`, Change is `normal`, `standard` or `emergency`,
Class is `A`, `B`, `C` or `n/a`, and Traces is optional. Claude asks you for the values and
never guesses them. The section sits inside the approval fingerprint, and `ticket.js
approve` refuses a spec without a valid one.

**Labels.** `ticket.js labels` turns the section into tracker labels: `ctl-soc2-cc8-1`,
`change-normal`, `class-b` (`n/a` becomes `na`). Claude sets them with the tracker's MCP
tools. The section is the record, and the labels are a copy for filtering.

**The trace report.** `/fabflows:trace` asks for a range (the newest tag to `HEAD` by
default) and an output directory outside the repo. It runs `ticket.js trace`, adds each
PR's author and approvers from GitHub and each ticket's body and labels from the tracker,
and writes `trace.md` and `trace.csv`. It is never committed. The columns are commit,
date, author, AI, PR, PR author, approvers, tickets, key source, spec hashes, ticket
fingerprints, controls, change, class, traces, expected labels, actual labels and flags.

| Flag | Meaning |
| --- | --- |
| `no-ticket` | the commit names no ticket key |
| `no-spec` | the commit has no `Spec:` trailer |
| `no-pr` | no pull request was found for the commit |
| `spec-changed` | the ticket's current fingerprint differs from the commit's `Spec:` |
| `no-compliance` | compliance is on and the ticket has no valid Compliance section |
| `label-missing` | a label the Compliance section implies is missing from the ticket |
| `emergency` | the change is an emergency change |
| `no-approval` | the PR has no approving review |
| `self-approved` | the PR author approved their own PR |
| `not-enriched` | the PR or a ticket could not be read |

Claude sees only the summary and each flagged row's SHA, PR, key and flags: commit messages
can carry instructions, so they go into the files and never back into the session.

**Limits.**

- Labels are best-effort. A tracker may reject a label or lack it, and GitHub's MCP server
  cannot create one. Claude reports a label it could not set and carries on.
- AI authorship is detected by trailer and author name only (`Co-Authored-By` and the
  commit author). The trailer is opt-out, so a `no` proves nothing.
- A re-approved ticket marks earlier commits `spec-changed`, because the report compares
  each commit's `Spec:` with the ticket as it is now.
- The report is no proof of review quality. It shows that an approval happened, not that
  the review was careful.

## The build loop

`fabflows:build` takes one spec'd change through build and review: an Opus `editor`
implements the spec on the checked-out feature branch and commits, a fresh `refuter`
(Opus by default, matching the pin in `agents/refuter.md`) reviews the diff and re-runs the
tests, and after two rework rounds the loop hands back to the lead. It never merges, pushes,
or reverts. The [skill](skills/fabflows/SKILL.md) carries the preconditions and arguments;
[DEC-0004](../../docs/decisions/DEC-0004-fable-leads-fabflows-opus-builds-and-reviews-in-a-determinis.md)
records the original design and
[DEC-0016](../../docs/decisions/DEC-0016-harden-the-fabflows-build-loop-denial-classification-reviewe.md)
records why the reviewer moved off the lead's tier. Pass `reviewerModel: 'fable'` to restore
the old default.

## Measured performance

fabflows includes a benchmark (`evals/`) that runs a headless Fable lead on the same task
with and without the plugin and grades the result programmatically, never from what the lead
said it did. The benchmark has run six iterations. Every number below is a mean of two runs per arm from
`evals/RESULTS.md`, which also carries the caveats.

**The build loop, on the task fabflows is for** (iteration 6, 2026-09-22: a library and CLI
built from a spec in an empty repository, graded by 41 hidden acceptance tests, Opus 5.5
builder and reviewer):

| | with fabflows | plain session | change |
| --- | --- | --- | --- |
| hidden tests passed | 41 / 41 | 41 / 41 | same |
| list price per run | $2.92 | $3.55 | -18% |
| wall clock | 414 s | 480 s | -14% |
| lead output tokens (Fable) | 6,660 | 38,314 | -83% |
| Fable list dollars | $1.69 | $3.55 | -52% |
| lead final context | 61,714 | 85,905 | -28% |
| tokens across every category | 1.01M | 1.80M | -44% |

Both fabflows runs launched `fabflows:build` from the routing table without the prompt naming
it, the reviewer ran inside the loop and returned ACCEPT, and the lead ran the gate itself. On a
subscription the meter tracks the lead's model, so the Fable row is the one that binds.

**What the earlier iterations showed.** On short tasks (a one-file edit, a version bump, a small
test file) the skill is overhead: about +21% list price for identical results, because the lead
loads the skill and deliberates instead of just doing it. On a large read (13 records, ~60k
characters) the Haiku explorer came in 12% cheaper with a lead context 12k tokens smaller. On
the same build task under Opus 5, with shell denials knocking the review out of the loop, the
loop cost +53% (iteration 5). The fixes that followed (DEC-0016) and Opus 5.5 turned that into
the table above. The `brainstorming` skill's own evals score 100% with the skill against 87.5%
without on spec quality.

**What the review does and does not catch** (iterations 7 and 8, a brownfield fixture with one
planted bug). When the spec states the rule the bug breaks, every lead and builder fixes it before
any review runs (9 of 9). When the spec is silent on it, the bug survives every time (10 of 10), and
the loop's reviewer returns ACCEPT every time (5 of 5): it checks the diff against the spec, line
by line, and does not audit baseline code the spec does not describe. `fabflows:build` gets a
spec'd change implemented and checked against its spec by a second model. It is not a bug hunt.
On that small task the loop cost +31% list price and 1.65x wall clock over inline for the same
result, while moving 40% of the lead's output onto Opus. With two to five runs per arm, these figures give direction,
not significance. Delegate sizeable, spec'd work; do the small things yourself; write the rule
into the spec if you need it enforced.

## Long sessions

The [skill](skills/fabflows/SKILL.md) carries the long-session habits. The lead runs at
the session's effort; only the workers pin their own, per the table above.

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

A `hooks/guard.js` file (Node, no dependencies) implements every rule below. The shell
rules apply to the commands of the `Bash`, `PowerShell` and `Monitor` tools alike:

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
  prompt, Claude asks you to run the command yourself. The prompt names every install in
  the command, not only the first. An install aimed at live configuration is always
  denied: run from a session directory there, after a `cd`, `pushd` or `Set-Location`
  into it, or naming it in its own `VAR=` prefix, `--prefix=` or `--target=`, whether
  written as `~`, `$HOME` or an absolute home such as `/home/<user>` or `/root`. A
  mention of live config elsewhere in the command (`cat ~/.claude/settings.json`) does
  not turn an install into a deny. A local bin is not a download: `npx` and `npm exec`/`npm x` pass when they name
  a plain bin (no `@`, `/` or `:`) as the first word, with no runner flag before it
  found in `node_modules/.bin` of the nearest directory with a `package.json` or
  `node_modules`, which is where npm looks. That lets `npx vitest run` and `npx tsc -p x.json`
  work in a project that has them installed. `pnpx`, `bunx` and `bun x` always count as
  downloads. One more exception:
  `pip install --isolated --target <dir> pypdf` (also `python -m pip`) when `<dir>` is a
  literal path with a `scratchpad` directory in it and outside the live configuration below,
  so a session can read a PDF without anything landing in site-packages. `--isolated` is
  required because it makes pip ignore `PIP_*` variables and user config, the two ways the
  install could be pointed at another index. A variable in the path, a second package, an
  index flag, or a `-r` file is still denied.
- **Commits, pushes, merges and rebases on a default branch.** The default is read from
  `origin/HEAD` at runtime, falling back to `main` or `master`. Force-push is blocked
  only when it targets a default branch, so `--force-with-lease` on your own feature
  branch still works. The branch is read from the directory a `cd` earlier in the same
  command moves into, so `cd <worktree> && git commit` is judged against that worktree.
- **Destructive commands**: `rm -rf` and `Remove-Item -Recurse -Force` at a home,
  root, parent, or `.git` target; `git reset --hard`; `git clean -fd`; `git branch -D`
  (but not `-d`); `sudo`; `chmod 777`; `dd of=`; `mkfs`; `Set-ExecutionPolicy`; and
  piping a download straight into a shell.
- **Credential files**: reading, staging, or writing `.env`, `*.pem`, `*.key`,
  `id_rsa`, `~/.ssh/`, `~/.aws/credentials`, `.npmrc`, `.pypirc`. Committed examples
  (`.env.example`, `.env.sample`, `.env.template`) are exempt.
- **Secrets in an edit.** AWS access key ids, GitHub tokens, Slack tokens, Google API
  keys, and private-key headers are blocked.
- **Destructive commands written into a runner file.** A `Makefile`, `justfile`,
  `package.json`, or shell or PowerShell script whose new content carries a dangerous
  delete or any command in the destructive list above is blocked, whether it arrives by
  `Write`, `Edit`, or a `printf`, `echo`, heredoc, or `tee` redirected into it. The shell
  rules cannot see inside `make nuke` once the target exists, so the payload is stopped at
  the point it is written. Prose files are not checked.
- **Live configuration**: `~/.claude/settings.json`, `~/.claude/hooks/`,
  `~/.claude/plugins/`, and any `.git/hooks/`. This is what stops a worker from
  disarming the guard. Reading them and running a script that lives there is allowed.
  Only writes and redirects to a file are blocked, including copying files into the plugin
  cache; merging or discarding a stream (`2>&1`, `2>/dev/null`) does not count.
  Everything else under `~/.claude/` stays writable.

A `SubagentStop` hook checks that a worker's final report actually includes its contract
fields, and sends it back to be re-emitted if two or more are missing.

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
- `git push origin HEAD:master` from a feature branch is not caught.
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
- A multi-line `git commit -m` body with a line that starts with a runner is judged as a
  command. That errs toward ask or deny.
- An `ask` can be answered with no human looking: a `PermissionRequest` hook, an SDK
  `canUseTool` callback, or `--permission-prompt-tool` can approve it automatically.
- Workers are told apart by the `agent_id` field. Whether agent-team teammates carry it
  is not documented.
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
that.

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
