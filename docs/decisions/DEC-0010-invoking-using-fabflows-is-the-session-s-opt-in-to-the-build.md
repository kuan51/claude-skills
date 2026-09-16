---
id: DEC-0010
title: Invoking using-fabflows is the session's opt-in to the build loop
status: proposed
date: 2026-09-16
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0010: Invoking using-fabflows is the session's opt-in to the build loop

## Context and problem statement

DEC-0004 built `fabflows:build` as a Workflow the lead offers and the user approves, and
the `fabflows` skill said to start it "only when the user asks for it or agrees to it".
That reads as per-run consent: every spec-able task ended with the lead asking again, and
the answer was the same every time. The plugin also had no entrypoint. A user who wanted
a whole session on fabflows discipline had to know to invoke the `fabflows` skill by name,
or hope a trigger phrase matched mid-conversation, which is a poor way to load a routing
table that is supposed to govern the session from its first turn.

## Decision drivers

- **Consent should be granted once, at a point the user chooses.** A prompt whose answer
  never changes is not consent, it is friction.
- **Skills load at session start.** Whatever is going to govern the session has to be
  invocable at the top of the conversation, not discovered halfway through.
- **The routing table already exists in one place.** Anything new must point at the
  `fabflows` skill rather than restate it, or the two copies drift.
- **No new machinery.** A skill file is the cheapest thing that can carry this.

## Considered options

1. **Per-run opt-in, as today.** The lead offers the loop and waits for agreement each
   time. Correct and conservative, but it asks a question whose answer is already known,
   and it leaves the plugin with no entrypoint at all.
2. **An entrypoint skill that carries a standing opt-in.** One `using-fabflows` skill the
   user invokes at the start of a conversation. It invokes the `fabflows` skill for the
   routing table and the gate, then states that its own invocation is the opt-in for the
   rest of the session.
3. **A SessionStart hook that auto-injects it.** Every session would get the discipline
   with no action from the user. It also opts a user into the Workflow tool without them
   doing anything, in a plugin that already ships one active hook, and it spends context
   on sessions that never needed the loop.

## Decision outcome

Chose **option 2**, the entrypoint skill. It makes the opt-in explicit and deliberate, at
a moment the user picks, and it keeps the single source of truth: `using-fabflows` invokes
`fabflows:fabflows` as its first action and references that skill's build-loop procedure,
gate and escalation handling instead of copying them. The skill is short on purpose, so it
costs little when a session invokes it and never builds anything.

Option 3 was rejected because consent that arrives without a user action is not consent,
and because this plugin's hook budget is better spent on the guard.

## Consequences

**Good:**

- A session gets the routing table, the delegation brief, the report contract and the
  verification gate from its first turn, by one invocation.
- The lead stops asking the same question per task and just prepares and launches the
  loop for a spec-able change.
- Nothing is duplicated: the entrypoint points at `fabflows`, so a change to the loop's
  procedure lands in one file.

**Bad:**

- Two skills now describe when the build loop starts, and their wording has to stay in
  agreement even though only one carries the procedure.
- A user who invokes the entrypoint out of habit has opted into the loop for the whole
  session, including tasks they might have wanted to hand-hold.
- The opt-in is invisible after the fact: nothing in the transcript restates it, so a
  later reader of a long session sees the loop start without a prompt.

## Gaps accepted

- **No SessionStart hook.** A user who forgets to invoke the entrypoint gets an ordinary
  session; nothing reminds them.
- **Nothing enforces "sizeable".** The triage table is prose, so whether a task is
  spec-able enough for the loop stays the lead's judgement, with the same class of gap as
  DEC-0009's prose checks.
- **Not exercised in a live session.** Skills load at startup, so this was verified by
  tests and reading only, not by invoking it from an installed plugin.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0004, which this refines and does not supersede
