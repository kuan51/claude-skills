# Changelog

Notable changes to this repository, grouped by release. Each plugin also
versions independently in its own `plugin.json`; see `plugins/<name>/` for
per-plugin history until entries are recorded here going forward.

## [Unreleased]

### Added

- **docs-warden 0.6.0** -- compaction reminders that explain themselves. When fifty
  decision records exist but fewer than fifty are decided, `adr_compact.py --check` now says
  how many are still proposed instead of staying silent, and compact mode walks the human
  through accepting or rejecting them. The decisions hook also runs after an `Edit` or
  `Write` in `docs/decisions/` (one `PostToolUse` handler per tool, each with an `if` rule), passing the line to
  Claude as `additionalContext`, not only at session start. Compaction now lands as its own
  pull request: `adr_compact.py` refuses to archive on a working tree that is not clean, and
  compact mode starts a new branch or a separate worktree off the default branch and offers
  the push and pull request rather than folding the moves into a code branch. The plugin
  description now says it offers to archive once fifty are decided.
- **fabflows 0.5.0** -- brought in line with Anthropic's skill guide. The guard gains one
  exception: `pip install --isolated --target <dir> pypdf` (also `python -m pip`) when `<dir>`
  is a literal path with a `scratchpad` directory in it and outside live configuration, so a
  session can read a PDF without anything landing in site-packages; `--isolated` keeps pip
  from reading `PIP_*` variables or user config, and every other install stays blocked. The
  `fabflows` description drops "any task a Haiku or Sonnet worker could do" for the shapes
  that pay (DEC-0014, now accepted) and ends with a negative trigger for short tasks. All
  three skills declare `compatibility` (Claude Code only), the `fabflows` skill gains a
  troubleshooting table, and `evals/trigger-corpus.json` adds the trigger-accuracy corpus the
  benchmark could not measure, in ciso's format with a shape test.
- **fabflows 0.4.0** -- `brainstorming`, a design skill that turns a rough idea into the
  spec `fabflows:build` needs. The lead sizes the request (bounded, in chat; or full, with a
  spec written to `docs/specs/`), sends `explorer` and `researcher` for the facts instead of
  asking the user, opens with an assumptions round, then asks rounds of at most three numbered
  questions each with a recommended answer, at most three rounds, states the maximal version
  and cuts it to the smallest shippable slice, and hands off only after the user has read the
  spec. `refuter` gains a spec mode: given a draft instead of a diff, it attacks it across seven
  lenses and blocks the spec on a security gap. DEC-0017 records why the refuter was reused
  rather than a new agent added. The guard gains a rule: a destructive command written into a
  Makefile, justfile, npm script or shell script is blocked at the point it is written,
  since the shell rules cannot see inside `make nuke` once the target exists.
- **fabflows 0.1.0** -- a new plugin for sessions whose lead runs on an expensive model.
  Ships four worker agents pinned to cheaper tiers, each scoped to the smallest tool set
  that does its job and none able to spawn workers of its own, plus a skill carrying the
  routing table, the four-part delegation brief, the worker report contract, and the
  verification gate the lead must pass before accepting a worker's claim. It also ships
  this repository's first **active plugin hook**: a dependency-free Node `PreToolUse`
  guard that blocks package installs, commits and pushes on a default branch, destructive
  shell commands, reads or writes of credential files, and writes to live Claude Code
  configuration or git hooks, plus a `SubagentStop` check
  that sends back a worker report missing its contract fields. The guard fails open by
  design, so a bug in it degrades to no guard rather than to a session that cannot run
  any command.
- **fabflows 0.2.0** -- two Opus agents and a build loop. `refuter` reviews a finished
  change by trying to show it is not done: it reads the diff against the spec, re-runs
  the tests itself, and returns ACCEPT or REWORK with must-fix findings, or BLOCKED when
  it cannot run them. `investigator`
  reproduces a self-contained failure and narrows it to `file:line` with ranked
  hypotheses, leaving the root-cause call to the lead. `fabflows:build` is a Workflow
  script that takes one spec'd change through a feature branch: an Opus builder
  implements and commits, a fresh reviewer (Fable by default) judges, and after two
  rework rounds it hands back to the lead. Work left uncommitted fails both the review
  and the lead's gate, so a passing test no longer vouches for files the diff never
  showed. The editor and test-runner now pin their effort (medium and low) instead of
  inheriting the lead's, and the skill gains guidance on who leads, lead effort, and
  long sessions. DEC-0004 records why Fable stays the lead rather than the
  coder. A builder reply that names a blocker escalates even when it says done, and a
  permission denial counts as a blocker; DEC-0006 records why. A report whose first line
  starts with a denial escalates too, and a reply with an empty report or a blocked reply with no
  reason escalates as `unexplained` instead of reaching review.
- **fabflows 0.3.0** -- `using-fabflows`, an entrypoint skill invoked at the start of a
  conversation. It loads the `fabflows` skill first, then treats its own invocation as the
  user's standing opt-in to the Workflow tool and `fabflows:build` for the rest of the
  session: a task that implements a feature, a component or another spec-able change goes
  straight into the build loop, prepared and launched by the lead, rather than prompting
  for opt-in again. DEC-0011 records why an entrypoint skill rather than a SessionStart
  hook.
- **docs-warden 0.3.0** -- two more Vale packages beside `Microsoft` and `write-good`:
  `proselint` (misused words, hedging, jargon, typography) and `ai-tells` (patterns of
  machine-written prose), both pinned by release URL. The shipped configs default both
  packages to warning level. The configs skip YAML front matter titles and
  descriptions, which decide when a skill triggers. This repository's own config
  promotes 17 rules to error: 15 `ai-tells` punctuation and filler rules plus
  `proselint.Uncomparables` and `proselint.CorporateSpeak`. Decision records, run
  logs, changelogs, dated plans, test fixtures and eval prompts skip the two new
  packages.

### Changed

- **docs-warden 0.4.2** -- the concept extractor reads tracked files when the repository is a
  git checkout, so untracked worktrees and scratch under `.claude/` no longer leak into
  `docs/architecture/domain-model.md` and trip the `ontology` check.
- **lint** -- markdownlint ignores session scratch, other checkouts' worktrees, accepted
  decision records and the append-only run logs, and no longer enforces ordered-list
  numbering (a "Part 2" that continues at step 6 is valid and the prose cross-references
  depend on it). Every fence in plugin docs now names its language, and the remaining
  structural findings are fixed, so the audit's blocking lint tool runs clean.

- **docs** -- retired `docs/superpowers/` (nine specs and seven plans from the previous
  toolchain, all of whose work had shipped). Four fabflows-format specs under `docs/specs/`
  now record the shipped behaviour of data-analysis-review, the ciso HITRUST module,
  ciso sync-tasks and ciso CMMC, and DEC-0018 to DEC-0021 record the hard-to-reverse
  decisions those documents carried. Code comments that cited the old paths point at the
  new specs.
- **fabflows 0.3.5** -- the lead's verification gate reads the diff instead of every
  changed file and caps command output to its tail, and the build loop's report schema
  and review brief ask for summaries and failing lines rather than whole logs, matching
  the 0.3.4 worker contract.
- **fabflows 0.3.4** -- tuned for a Fable lead on a subscription weekly cap. The lead
  keeps the session's effort; only workers pin theirs. Delegation now turns on context
  volume: a worker pays off only when it keeps a large
  log, search or file out of the lead, so a one-file grep or a one-line edit stays
  inline. Workers return each command's exit status, final summary and failing lines,
  never a whole log or diff. The README cache tip now says a subscription's main
  conversation already has a one-hour cache and only workers need
  `subagentPromptCacheTtl`. DEC-0012 and DEC-0013 record why.
- **ciso 1.1.3, data-analysis-review 0.1.1, fabflows 0.2.1** -- wording only. Every
  living document is reworded to pass the new Vale rules without changing what it
  says. Front matter descriptions are untouched, so skill routing does not change.

### Fixed

- **docs-warden 0.6.2** -- the compaction waiting line counted every record that was not
  accepted or rejected as "still proposed" in its text. A draft or a stored `superseded` then
  sent compact mode looking for proposed records that did not exist, and the line never
  cleared. The line now names them as "not yet accepted or rejected" and compact mode lists
  each such record with its status.
  Status is also matched ignoring surrounding spaces, so `" accepted "` counts. The index
  still prints each status as written, so no committed index goes out of date. A string tag
  such as `no-compaction-needed` no longer hides a record: only the whole, lowercase tag
  `compaction` marks a digest.
- **docs-warden 0.6.1** -- compaction archived any decision record whose status was not a
  lowercase `proposed`, so a `Proposed` or `draft` record, or one whose front matter did not
  parse, could be moved into `archive/` and frozen into an accepted digest. Only `accepted`
  and `rejected` records archive now, in any case, and `--check` counts the same way. The
  immutability check also reads status in any case: a record marked `Accepted` was never
  checked.
- **docs-warden 0.6.0** -- the decisions hook reads its input as UTF-8. It decoded stdin with
  Python's locale codec, cp1252 on Windows, so in a repository whose path held a non-ASCII
  character, such as `café`, the compaction reminder never appeared.
- **fabflows 0.3.6** -- `fabflows:build` failed on Windows before it ran, with the harness
  error "script contains control characters." The plugin cache is a git checkout, and with
  `core.autocrlf=true` the workflow script arrived as CRLF; the harness hands that file to
  the Workflow tool verbatim and refuses the carriage returns. A root `.gitattributes` now
  pins LF on every platform and a test keeps the script free of control bytes. A cache
  checked out before this fix still holds CRLF on disk: re-install the plugin, or
  renormalise the marketplace clone (`git rm --cached -r .` followed by a hard reset) and
  copy it into the cache again.
- **fabflows 0.3.5** -- two guard gaps. An assignment-only segment swallowed an unspaced
  redirect, so `X=1>~/.claude/settings.json` was allowed; and a `cd` the guard could not
  resolve to a repository (a variable, `-`, a missing path, a subshell) skipped the
  default-branch check. Both deny now.
- **docs-warden 0.4.1** -- a bare `waivers:` or `extra_files:` key (YAML null) no longer
  fails the manifest check, and a missing `domain_model.py` is reported as a failure
  instead of being mistaken for the generator's "no sources" exit code.
- **docs-warden 0.1.1** -- the run log rotation rule required an entry to be both
  past the 500-line trigger and older than 90 days. Both had to hold, so a busy
  repository tripped the line count with nothing old enough to move: the rule
  selected nothing and the warning stood with advice nobody could follow. The age
  filter is gone; the oldest entries now move until the log is back under the limit.

- **fabflows 0.2.4** -- the guard denied read-only inspection of `~/.claude`. Its
  shell-side allowlist held only a handful of command names, so a plain `cut`,
  `basename` or a `for d in ~/.claude/plugins/...; do cat "$d/x"; done` loop over the
  plugin cache read as an unknown command naming a protected path and was blocked, with
  a message about disarming the guard. Shell keywords are now stripped before a segment
  is matched, a `for` header counts as read-only when the loop body is read-only too,
  and the allowlist covers the common read-only text tools. `sort` and `uniq` are not
  among them: both write a file without a redirect, via `sort -o` and `uniq`'s second
  positional argument. Writes to live configuration stay denied.
