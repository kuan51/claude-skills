# claude-skills

A Claude Code plugin marketplace: a growing collection of skills spanning different subject
matters, not limited to any one domain.

## Quick start

This is a Claude Code plugin marketplace — the same slash commands work wherever you're running
Claude Code: the CLI, the desktop app, or the web app (claude.ai/code).

Add this repo as a marketplace, then install whichever plugins you want:

```
/plugin marketplace add kuan51/claude-skills
/plugin install data-analysis-review
/plugin install ciso
```

(Use the full URL, `/plugin marketplace add https://github.com/kuan51/claude-skills`, if your
client doesn't resolve the `owner/repo` shorthand.) Restart Claude Code, or start a new session,
so it picks up the newly installed plugin.

## Plugins

- **[data-analysis-review](plugins/data-analysis-review/)** — empirical, objective review of a
  data science project: independently re-derives findings from raw data and code, then checks
  whether the project's own stated conclusions hold up.
- **[ciso](plugins/ciso/)** — organizes work toward security certifications (HITRUST CSF,
  SOC 2 Type II, ISO/IEC 27001:2022 and CMMC) alongside the development work that satisfies them.
  Action-oriented verbs — register a control set, run the assessment interview, review a PR for
  control impact, attach a merged PR or CI run as evidence, audit how ready you actually are —
  tracked via persistent local HTML dashboards: an index across every supported certification,
  plus a page for each.
- **[docs-warden](plugins/docs-warden/)** — repository documentation governance:
  scaffolds a document set scaled to what the repo actually is, audits it for what is
  missing, stale, or off-standard, keeps architecture decision records append-only
  and indexed, and reports where the docs have drifted from the code instead of
  silently rewriting them. Includes a plain-English Vale style and compliance
  overlays for IEC 62304, the OSPS Baseline, the EU Cyber Resilience Act and
  NIST SSDF.

## Adding a new plugin

Each plugin is self-contained under its own directory in `plugins/`, with its own
`.claude-plugin/plugin.json`. To add one:

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json` (see
   `plugins/data-analysis-review/.claude-plugin/plugin.json` for the shape).
2. Add the plugin's own `skills/`, `agents/`, `commands/`, etc. under `plugins/<plugin-name>/`.
3. Register it in the root `.claude-plugin/marketplace.json`'s `plugins` array, with
   `"source": "./plugins/<plugin-name>"`, and a `version` matching the one in its `plugin.json`.

Unrelated plugins should not share files — each one owns its own directory tree.

A plugin's `version` is duplicated between its own `plugin.json` and its `marketplace.json` entry,
and the two must always agree — `plugin.json` is the source of truth. `test/marketplace-consistency.test.js`
enforces that; see [CLAUDE.md](CLAUDE.md) for when to bump.
