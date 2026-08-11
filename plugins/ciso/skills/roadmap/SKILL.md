---
name: roadmap
description: Use when researching budget-appropriate vendor, SaaS, or open-source solutions for controls that the assessment recorded as gaps or in progress -- what to buy or adopt to close them. Runs the research in the background without blocking other work.
allowed-tools: Read, Bash, AskUserQuestion, Workflow
---

# Research solutions for gaps

## Overview

Takes the controls that came out of the assessment as `gap` or `in_progress` and researches real,
cited vendor, SaaS and open-source options appropriate to the organization's budget tier. Research
runs as fire-and-forget background work and is merged back when it lands, so it never blocks an
interview in progress.

## Routing

Always start here, every invocation:

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop** -- do not scaffold it yourself.
3. **Resolve the certification** from `state.certifications`: the one the user named, else the sole
   registered certification, else `AskUserQuestion` over the registered ones.
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/invariants.md` and follow it.**
   Mandatory, before step 5.
5. **Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/roadmap.md`.**

Every certification supports this verb.

## The one invariant that matters most here

**An org's posture stays local.** This is the plugin's only outbound flow, and the only control
fields permitted to reach a web-searching agent are the control's *public subject* --
`relatedControlCode`, `relatedControlName`, `legacyCategoryPrefix`, `topicLabel`, `topicSummary`,
`domain`, `domainKey`. Justifications, in-progress notes, and evidence records never leave the
project. The allowlist in `lib/roadmap/sanitize-control.js` is fail-closed and enforces this
mechanically; never route around it.
