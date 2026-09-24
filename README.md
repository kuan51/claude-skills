# claude-skills

A Claude Code plugin marketplace: a growing collection of skills spanning different subject
matters, not limited to one domain.

## Quick start

This is a Claude Code plugin marketplace. The same slash commands work wherever you're running
Claude Code, including the CLI, the desktop app, and the web app (claude.ai/code).

Add this repo as a marketplace, then install whichever plugins you want:

```text
/plugin marketplace add kuan51/claude-skills
/plugin install data-analysis-review
/plugin install ciso
```

(Use the full URL, `/plugin marketplace add https://github.com/kuan51/claude-skills`, if your
client doesn't resolve the `owner/repo` shorthand.) Restart Claude Code, or start a new session,
so it picks up the newly installed plugin.

## Plugins

- **[data-analysis-review](plugins/data-analysis-review/)**: empirical, objective review of a
  data science project: independently re-derives findings from raw data and code, then checks
  whether the project's own stated conclusions hold up.
- **[ciso](plugins/ciso/)**: organizes work toward security certifications (HITRUST CSF,
  SOC 2 Type II, ISO/IEC 27001:2022 and CMMC) alongside the development work that satisfies them.
  Action-oriented verbs (register a control set, run the assessment interview, review a PR for
  control impact, attach a merged PR or CI run as evidence, audit how ready you actually are)
  tracked via persistent local HTML dashboards: an index across every supported certification,
  plus a page for each.
- **[docs-warden](plugins/docs-warden/)**: repository documentation governance:
  scaffolds a document set scaled to what the repo actually is, audits it for what is
  missing, stale, or off-standard, keeps architecture decision records append-only
  and indexed, offers to archive the oldest into a digest once fifty are decided, and reports
  where the docs have drifted from the code instead of silently rewriting them.
  Includes a domain-model skill that maps a repo's concepts, their relationships,
  and which document describes each, in Python, JS/TS, PowerShell and Terraform;
  a plain-English Vale style; and compliance
  overlays for IEC 62304, the OSPS Baseline, the EU Cyber Resilience Act and
  NIST SSDF.
- **[fabflows](plugins/fabflows/)**: orchestration for a session whose lead runs on an
  expensive model: six worker agents, each pinned to a tier (`explorer` and
  `researcher` on Haiku, `editor` and `test-runner` on Sonnet, `refuter` and
  `investigator` on Opus) and scoped to the smallest tool list that does its job; a
  skill that makes the lead write a proper delegation brief and re-verify what comes
  back instead of trusting it; `fabflows:build`, a deterministic build-and-review
  loop for a spec'd change; and `using-fabflows`, the entrypoint skill you invoke at the
  start of a conversation to put the whole session on that discipline; and `brainstorming`,
  which turns a rough idea into a spec the build loop can take, with the refuter attacking
  the draft before it is written. Includes an
  **active guard hook** that blocks package installs (one exception: `pypdf` into a
  literal scratchpad `--target` with `--isolated`), default-branch commits,
  destructive commands, and credential reads and writes. Read that plugin's README
  before installing, including its "Known gaps" section. Benchmarked: on a spec'd build with
  Opus 5.5 workers it matched a plain Fable session on 41 hidden tests at 18% lower list price
  and 83% fewer lead output tokens (see that README's "Measured performance").

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
