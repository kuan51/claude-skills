---
name: register
description: Use when adding a security certification -- HITRUST CSF, SOC 2, ISO/IEC 27001, or CMMC -- to ciso tracking for the first time, loading its control set into docs/ciso/state.json so the controls can then be assessed. This is the setup step that comes before any assessment; use ciso:interview to actually assess the controls it registers.
allowed-tools: Read, Bash, AskUserQuestion
---

# Register a control set

## Overview

Loads a certification's control set into a project's `docs/ciso/` tracking data, creating the
certification entry and its tier so every later verb has something to work against. Safe to re-run:
existing controls and assessments are never touched, only ids missing from state get added.

This is a **dispatching verb** -- it resolves which certification the user means and then follows
that certification module's own `register.md`. The mechanics differ per certification (HITRUST picks
one of three nested tiers; SOC 2 and ISO 27001 each have exactly one).

## Routing

Always start here, every invocation:

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop** -- do not scaffold it yourself.
3. **Resolve the certification.** Unlike every other verb, register works on certifications that
   are *not* in state yet, so resolve against the shipped catalog at
   `${CLAUDE_PLUGIN_ROOT}/assets/certifications.json` rather than against `state.certifications`:
   - The user named one (or said "HITRUST", "SOC 2", "ISO 27001", "27001") → use it.
   - Otherwise `AskUserQuestion` with the catalog's entries, showing each `summary` so the choice is
     informed. Mention which are already registered -- re-registering is safe but usually means the
     user wanted a different verb.
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/invariants.md` and follow it.**
   Mandatory, before step 5 -- registering a non-authoritative control set without saying so is the
   failure this step prevents.
5. **Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/register.md`.**

All three certifications support this verb.

## After registering

Re-render the dashboard, then point the user at the natural next step:

- **SOC 2** → `ciso:scope`. Which Trust Services Categories are in scope decides which criteria even
  get asked, so it must come before the interview.
- **HITRUST** → offer `ciso:import` if the org has its own licensed MyCSF export; otherwise
  `ciso:interview`.
- **ISO 27001** → `ciso:interview`.
