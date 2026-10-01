---
name: roadmap
description: Use when researching budget-appropriate vendor, SaaS, or open-source solutions for controls that the assessment recorded as gaps or in progress -- what to buy or adopt to close them. Runs the research in the background without blocking other work.
allowed-tools: Read, Bash, AskUserQuestion, Workflow
---

# Research solutions for gaps

## Overview

Takes the controls that came out of the assessment as `gap` or `in_progress` and researches real,
cited vendor, SaaS and open-source options appropriate to the organization's budget tier. Research
runs as fire-and-forget background work and is merged back once it finishes, so it never blocks an
interview in progress.

## Routing

Always start here, every invocation:

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop.** Do not scaffold it yourself.
3. **Resolve the certification** from `state.certifications`: the one the user named, else the only
   registered certification, else `AskUserQuestion` over the registered ones.
4. **Resolve the framework, then read its ground rules.** Follow
   `${CLAUDE_PLUGIN_ROOT}/skills/_shared/resolve-framework.md`.
   Mandatory, before step 5.
5. **Follow the flow.** A bundled framework's `<dir>/flows/roadmap.md` when present, else
   `${CLAUDE_PLUGIN_ROOT}/skills/roadmap/references/generic.md`.

Every certification supports this verb.

## The one invariant that matters most here

**An org's posture never reaches vendor research.** This is the plugin's web-research flow (sync-tasks also
sends data out, to the org's own tracker), and the only control
fields permitted to reach a web-searching agent are the control's *public subject*:
`relatedControlCode`, `relatedControlName`, `legacyCategoryPrefix`, `topicLabel`, `topicSummary`,
`domain`, `domainKey`. Justifications, in-progress notes, and evidence records never leave the
project. For a control whose `statementSource` is `imported`, or missing, only its codes go (`id`,
`relatedControlCode`, `legacyCategoryPrefix`, `domainKey`, each a plain token): its wording, names
and domains included, is licensed. The allowlist in `lib/roadmap/sanitize-control.js` is fail-closed and enforces this
mechanically. Do not bypass it.

## After the research

Re-render the dashboard once the findings are merged, then present a **brief, non-blocking**
summary, call out any `confidence: "low"` or empty-vendor results as needing manual follow-up rather
than silently accepted, and offer `ciso:sync-tasks` to push the remaining gaps into a tracker.
