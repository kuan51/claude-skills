---
name: scope
description: Use when defining the boundaries of a SOC 2 engagement before the assessment starts -- Type I versus Type II, which Trust Services Categories are in scope, the observation period, subservice organizations and how they are treated, the system description. Only SOC 2 has a scope step; HITRUST and ISO 27001 do not.
allowed-tools: Read, Bash, AskUserQuestion
---

# Record engagement scope

## Overview

Records the decisions made *before* any criterion is assessed -- report type, in-scope categories,
observation period, subservice treatment. These are properties of the engagement rather than of any
one control, so they live on the tier's `scope` object.

Scope must be recorded **before** the interview: which Trust Services Categories are in scope
decides which criteria get asked at all, and out-of-scope categories are marked `not_applicable`
through `apply-assessment.js` as part of this flow rather than being skipped.

Safe to re-run -- it merges, so recording the observation period later never erases the category
selection recorded earlier.

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
5. **Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/scope.md`.**

## Only SOC 2 supports this verb

If the resolved certification is not SOC 2, there is no `references/scope.md` to read. **Say so
plainly and stop** -- do not improvise a scoping conversation, and do not write anything to
`state.json`. The invariants file you just read explains why that certification has no scope step;
give the user that reason and send them to `ciso:interview`.
