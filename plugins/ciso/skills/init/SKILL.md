---
name: init
description: Use when setting up ciso security-certification tracking in a project for the first time, or when its state file or dashboard is missing and needs to be scaffolded.
allowed-tools: Read, Bash, AskUserQuestion
---

# CISO Init

## Overview

Scaffolds the local, gitignored data store (`state.json`) and dashboard pages (`dashboard.html` plus a `cert-<certKey>.html` per registered certification) that every other `ciso` skill reads and writes. Safe to run against a project that's already been initialized -- it never overwrites an existing `state.json`, it only offers to refresh the dashboard.

## When NOT to use

- `state.json` and `dashboard.html` already exist and you just want to add or update certification data -- use `ciso:hitrust` (or the relevant certification skill) instead; this skill only scaffolds, it doesn't populate certification content.

## Process

1. **Determine the target directory.**
   - Run `git rev-parse --show-toplevel` in the current working directory to find the project root. If that fails (not a git repo), use the current working directory itself as the project root.
   - The default target is `docs/ciso/` relative to that project root.
   - Ask the user via `AskUserQuestion` whether to use the default or specify a different path. Resolve their answer to an absolute directory before continuing.

2. **Check for an existing state file.** If `<target>/state.json` already exists:
   - Do not overwrite or reset it.
   - Read it and report back to the user: `organization.name`, the certifications on file (`Object.keys(certifications)`), and `generatedAt`.
   - Offer to re-run the dashboard render (step 4) in case `dashboard.html` is missing or stale, and stop there -- do not run the scaffold script.

3. **Scaffold.** Otherwise, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/init/lib/init-project.js" <target-dir> <repo-root>
   ```
   `<repo-root>` is the project root found in step 1 (omit it if that step fell back to a non-git directory). This creates `<target-dir>/state.json` and, if `<repo-root>` is a git repository, idempotently adds a `docs/ciso/`-style entry to its `.gitignore` so this local tracking data is never committed to the consuming project's repo. The script prints a JSON summary (`targetDir`, `stateJsonPath`, `gitignoreUpdated`, `alreadyExisted`) -- use it to drive your report in step 5 rather than re-deriving these facts yourself.

4. **Render the dashboard.** Immediately after scaffolding, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <target-dir>
   ```
   This reads `<target-dir>/state.json` and writes `<target-dir>/dashboard.html` (the index: one card per certification this plugin supports) plus one `<target-dir>/cert-<certKey>.html` per certification actually registered in state. It also deletes any `cert-*.html` left over from a certification no longer in state. Do not hand-write or otherwise construct the dashboard HTML yourself -- this script is the only thing that ever produces it. With an empty `certifications: {}`, it writes only the index, which lists every supported certification as "not tracked yet"; that's expected for a brand-new project.

5. **Report to the user:**
   - The absolute path to `dashboard.html`, that it's the index across every certification, and that they can open it directly in a browser -- no server needed.
   - Whether `.gitignore` was updated (or already covered the target directory).
   - That the natural next step is `ciso:hitrust`, to start registering and importing certification controls.
