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
- **docs-warden 0.3.0** -- two more Vale packages beside `Microsoft` and `write-good`:
  `proselint` (misused words, hedging, jargon, typography) and `ai-tells` (patterns of
  machine-written prose), both pinned by release URL. `ai-tells` stays at error level on
  purpose, so prose is fixed before it is committed. The configs skip YAML front matter
  titles and descriptions, which decide when a skill triggers, and eleven rules that
  flagged accurate wording are set to warning. Decision records, run logs and
  changelogs skip the two new packages because they are append-only.

### Changed

- **ciso 1.1.3, data-analysis-review 0.1.1, fabflows 0.2.1** -- wording only. Every
  living document is reworded to pass the new Vale rules without changing what it
  says. Front matter descriptions are untouched, so skill routing does not change.

### Fixed

- **docs-warden 0.1.1** -- the run log rotation rule required an entry to be both
  past the 500-line trigger and older than 90 days. Both had to hold, so a busy
  repository tripped the line count with nothing old enough to move: the rule
  selected nothing and the warning stood with advice nobody could follow. The age
  filter is gone; the oldest entries now move until the log is back under the limit.
