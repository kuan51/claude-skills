# claude-skills

Plugins for Claude Code that review data science work, track security certifications, keep
repository docs honest, and route work from an expensive lead model to cheaper workers.

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)
[![docs](https://img.shields.io/github/actions/workflow/status/kuan51/claude-skills/docs.yml?branch=master&label=docs)](https://github.com/kuan51/claude-skills/actions/workflows/docs.yml)
[![plugins: 4](https://img.shields.io/badge/plugins-4-informational)](#plugins)

## Contents

- [Plugins](#plugins)
- [Quick start](#quick-start)
- [What each plugin does](#what-each-plugin-does)
- [Adding a new plugin](#adding-a-new-plugin)
- [Docs, contributing and license](#docs-contributing-and-license)

## Plugins

| Plugin | What it does |
| --- | --- |
| [data-analysis-review](plugins/data-analysis-review/) | Re-derives a data science project's findings from its raw data and code, then checks its stated conclusions. |
| [ciso](plugins/ciso/) | Tracks work toward HITRUST CSF, SOC 2 Type II, ISO/IEC 27001:2022 and CMMC in local HTML dashboards. |
| [docs-warden](plugins/docs-warden/) | Scaffolds and audits a repository's documents and keeps its decision records append-only. |
| [fabflows](plugins/fabflows/) | Routes work from an expensive lead model to tool-scoped workers and makes the lead re-verify what they report. |

How each plugin did in its evals is in [docs/EVALS.md](docs/EVALS.md).

## Quick start

This is a Claude Code plugin marketplace. The same slash commands work wherever you're running
Claude Code, including the CLI, the desktop app, and the web app (claude.ai/code).

Add this repo as a marketplace, then install whichever plugins you want:

```text
/plugin marketplace add kuan51/claude-skills
/plugin install data-analysis-review
/plugin install ciso
/plugin install docs-warden
/plugin install fabflows
```

(Use the full URL, `/plugin marketplace add https://github.com/kuan51/claude-skills`, if your
client doesn't resolve the `owner/repo` shorthand.) Restart Claude Code, or start a new session,
so it picks up the newly installed plugin.

Read the fabflows README before installing that plugin: its guard hook is active from the
first session.

## What each plugin does

### data-analysis-review

Empirical, objective review of a data science project: independently re-derives findings from
raw data and code, then checks whether the project's own stated conclusions hold up.

### ciso

Organizes work toward security certifications (HITRUST CSF, SOC 2 Type II, ISO/IEC 27001:2022
and CMMC) alongside the development work that satisfies them. Action-oriented verbs (register a
control set, run the assessment interview, review a PR for control impact, attach a merged PR or
CI run as evidence, audit how ready you actually are) tracked via persistent local HTML
dashboards: an index across every supported certification, plus a page for each.

### docs-warden

Repository documentation governance: scaffolds a document set scaled to what the repo actually
is, audits it for what is missing, stale, or off-standard, keeps architecture decision records
append-only and indexed, offers to archive the oldest into a digest once fifty are decided, and
reports where the docs have drifted from the code instead of silently rewriting them. Includes a
domain-model skill that maps a repo's concepts, their relationships, and which document
describes each, in Python, JS/TS, PowerShell and Terraform. It also includes a plain-English Vale
style and compliance overlays for IEC 62304, the OSPS Baseline, the EU Cyber Resilience Act and
NIST SSDF.

### fabflows

- **[fabflows](plugins/fabflows/)**: orchestration for a session whose lead runs on an expensive
  model. The lead writes a proper brief for each worker and re-verifies what comes back instead
  of trusting it.
  - **Workers.** Six agents, each pinned to a tier (`explorer` and `researcher` on Haiku,
    `editor` and `test-runner` on Sonnet, `refuter` and `investigator` on Opus) and scoped to the
    smallest tool list that does its job.
  - **Build loop.** `fabflows:build` has an Opus builder implement a spec and a fresh reviewer
    return ACCEPT or REWORK. `using-fabflows` is the entrypoint skill that puts a session on it.
  - **Brainstorming.** `brainstorming` turns a rough idea into a spec the build loop can take,
    with the refuter attacking the draft before it is written.
  - **Tickets.** `fabflows-setup` and `ticket` keep specs in a GitHub Issues, Jira or Linear
    ticket, and a hook puts the ticket key on every commit and PR.
  - **Trace.** `trace` writes an audit trace report tracing every merged change to its ticket,
    approved spec and approvers.
  - **Guard hook.** An active hook asks before package installs and runners such as `npx`,
    denies them in workers, and blocks default-branch commits, destructive commands, and
    credential reads and writes. Read the plugin's README, including its "Known gaps"
    section, before installing.

On a spec'd build with Opus 5.5 workers, fabflows matched a plain Fable session on 41 hidden
tests at 18% lower list price and 83% fewer lead output tokens (see that README's "Measured
performance").

## Adding a new plugin

Each plugin is self-contained under its own directory in `plugins/`, with its own
`.claude-plugin/plugin.json`. To add one:

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json` (see
   `plugins/data-analysis-review/.claude-plugin/plugin.json` for the format).
2. Add the plugin's own `skills/`, `agents/`, `commands/`, etc. under `plugins/<plugin-name>/`.
3. Register it in the root `.claude-plugin/marketplace.json`'s `plugins` array, with
   `"source": "./plugins/<plugin-name>"`, and a `version` matching the one in its `plugin.json`.

Unrelated plugins should not share files: each plugin's files live only in its own directory tree.

A plugin's `version` is duplicated between its own `plugin.json` and its `marketplace.json` entry,
and the two must always agree: `plugin.json` is the source of truth. `test/marketplace-consistency.test.js`
enforces that. See [CLAUDE.md](CLAUDE.md) for when to bump.

## Docs, contributing and license

- [Documentation](docs/CONVENTIONS.md): how this repository works today, with the decision
  records in [docs/DECISIONS.md](docs/DECISIONS.md).
- [Eval results](docs/EVALS.md) for every plugin.
- [Contributing](CONTRIBUTING.md).
- [Security policy](docs/SECURITY.md).
- [License](LICENSE): GPL-3.0.
