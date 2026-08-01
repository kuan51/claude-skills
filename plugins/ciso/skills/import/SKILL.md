---
name: import
description: Use when importing an organization's own licensed HITRUST MyCSF requirements export (an .xlsx file) into ciso tracking, replacing the shipped non-authoritative topic-level control set with the real per-statement requirements. Only HITRUST has an importable publisher export.
allowed-tools: Read, Bash, AskUserQuestion
---

# Import a publisher export

## Overview

Replaces a tier's shipped topic-level control set with an organization's own licensed export. This
is the single way to get authoritative requirement wording into the tracking data -- everything the
plugin ships is compiled from public sources and explicitly non-authoritative.

**Import replaces a tier's `controls` map wholesale.** The plugin's synthetic topic-level ids never
line up with real per-statement MyCSF ids, so there is no field-level merge path. Whatever was
previously registered is archived first, not deleted, tagged `archivedReason: "import-replaced"`.
**Say this to the user before importing** -- assessments recorded against the topic-level set do not
carry across, and they should know that before the archive happens rather than after.

## Routing

Always start here, every invocation:

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop** -- do not scaffold it yourself.
3. **Resolve the certification** from `state.certifications`: the one the user named, else the sole
   registered certification, else `AskUserQuestion` over the registered ones.
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/invariants.md` and follow it.**
   Mandatory, before step 5 -- and load-bearing here, because it also carries the unconditional
   pending-version-upgrade check.
5. **Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/import.md`.**

## Only HITRUST supports this verb (e1 only)

If the resolved certification is not HITRUST, there is no `references/import.md` to read. **Say so
plainly and stop.** The reason is the same either way: SOC 2 and ISO 27001 are published as
documents, not as per-org machine-readable exports, so there is nothing to import. The shipped set
is what there is -- point the user at `ciso:interview`.
