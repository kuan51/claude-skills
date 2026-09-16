---
name: using-fabflows
description: The single entrypoint for a fabflows session. Invoke it at the start of every conversation to put the session on fabflows discipline: the routing table, the delegation brief, the report contract and the verification gate load from the fabflows skill, and the lead prepares and launches fabflows:build itself for any spec-able change instead of asking for opt-in again. Triggers on "using fabflows", "start fabflows", "fabflows session", "/using-fabflows".
---

# Using fabflows

Start here, once, at the top of the conversation.

## First action

Invoke the `fabflows:fabflows` skill with the Skill tool, before anything else. It carries
the routing table, the four-part delegation brief, the worker report contract and the
verification gate. They are not duplicated here; read them there.

## Standing rule

Invoking this skill is the user's opt-in to the Workflow tool and to `fabflows:build` for
the rest of the session. Do not ask for permission again per task. Route every task per
the fabflows routing table; a spec'd, sizeable change goes to `fabflows:build`, prepared
and launched per that skill's build-loop section.

