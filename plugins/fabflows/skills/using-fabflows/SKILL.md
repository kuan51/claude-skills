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
the rest of the session. Do not ask for permission again per task. When a task is
spec-able, prepare the loop and launch it.

## Task triage

| Task | Where it goes |
| --- | --- |
| implement a feature, a component, or another spec-able change | the build loop below |
| explore, research, run tests, a small scoped edit | route per the fabflows routing table |
| a question, or one short dependent chain | the lead answers it or does it |

## The build loop

Prepare and launch it per "The build loop" in the fabflows skill, gate and escalation
included.
