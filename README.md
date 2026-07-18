# claude-skills

A Claude Code plugin marketplace: a growing collection of skills spanning different subject
matters, not limited to any one domain.

## Installing

Add this repo as a marketplace, then install whichever plugins you want:

```
/plugin marketplace add <this-repo-url-or-path>
/plugin install data-analysis-review
```

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
