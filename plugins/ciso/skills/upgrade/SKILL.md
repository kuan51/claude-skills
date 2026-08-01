---
name: upgrade
description: Use when the plugin ships a newer version of a certification's control set than a project has recorded, and the existing assessment data needs reconciling against it -- controls added, removed, or changed between framework versions. Also use when a version-mismatch warning sends you here.
allowed-tools: Read, Bash, AskUserQuestion
---

# Reconcile a control-set version

## Overview

Diffs the control set recorded in `state.json` against the newer one the plugin now bundles, then
reconciles the difference without losing assessment work: controls that still exist keep their
assessments, controls that changed are flagged `needsReview: true`, and controls that are gone are
archived rather than deleted.

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
5. **Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/upgrade.md`.**

## Only HITRUST supports this verb today

HITRUST is the only module that has shipped a second control-set version, so it is the only one with
a written flow. SOC 2 and ISO 27001 gain one if and when they rev.

If the resolved certification has no `references/upgrade.md`, first **check whether an upgrade is
even pending**: compare the bundled `controls/<tier>.v*.structure.json`'s `controlSetVersion`
against `state.certifications[certKey].tiers[tierKey].controlSetVersion`. If they match, tell the
user their control set is current and stop -- that is the ordinary answer, not an error. If they
differ, say plainly that this certification has no reconciliation flow written yet and do not
improvise one against real assessment data.
