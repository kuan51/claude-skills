# Changelog

Notable changes to this repository, grouped by release. Each plugin also
versions independently in its own `plugin.json`; see `plugins/<name>/` for
per-plugin history until entries are recorded here going forward.

## [Unreleased]

### Added

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

- **ciso 1.1.3, data-analysis-review 0.1.1, fabflows 0.2.1** -- wording only. Every
  living document is reworded to pass the new Vale rules without changing what it
  says. Front matter descriptions are untouched, so skill routing does not change.

### Fixed

- **fabflows 0.3.4** -- `fabflows:build` failed on Windows before it ran, with the harness
  error "script contains control characters". The plugin cache is a git checkout, and with
  `core.autocrlf=true` the workflow script arrived as CRLF; the harness hands that file to
  the Workflow tool verbatim and refuses the carriage returns. A root `.gitattributes` now
  pins LF on every platform and a test keeps the script free of control bytes. A cache
  checked out before this fix still holds CRLF on disk: re-install the plugin, or
  renormalise the marketplace clone (`git rm --cached -r .` followed by a hard reset) and
  copy it into the cache again.

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
