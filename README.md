# claude-skills

A Claude Code plugin marketplace: a growing collection of skills spanning different subject
matters, not limited to any one domain.

## Installing

This is a Claude Code plugin marketplace — the same slash commands work wherever you're running
Claude Code: the CLI, the desktop app, or the web app (claude.ai/code).

Add this repo as a marketplace, then install whichever plugins you want:

```
/plugin marketplace add kuan51/claude-skills
/plugin install data-analysis-review
```

(Use the full URL, `/plugin marketplace add https://github.com/kuan51/claude-skills`, if your
client doesn't resolve the `owner/repo` shorthand.) Restart Claude Code, or start a new session,
so it picks up the newly installed plugin.

## Plugins

- **[data-analysis-review](plugins/data-analysis-review/)** — empirical, objective review of a
  data science project: independently re-derives findings from raw data and code, then checks
  whether the project's own stated conclusions hold up.

## Adding a new plugin

Each plugin is self-contained under its own directory in `plugins/`, with its own
`.claude-plugin/plugin.json`. To add one:

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json` (see
   `plugins/data-analysis-review/.claude-plugin/plugin.json` for the shape).
2. Add the plugin's own `skills/`, `agents/`, `commands/`, etc. under `plugins/<plugin-name>/`.
3. Register it in the root `.claude-plugin/marketplace.json`'s `plugins` array, with
   `"source": "./plugins/<plugin-name>"`.

Unrelated plugins should not share files — each one owns its own directory tree.
