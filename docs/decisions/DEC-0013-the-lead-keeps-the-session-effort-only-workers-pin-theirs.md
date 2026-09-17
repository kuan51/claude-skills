---
id: DEC-0013
title: The lead keeps the session effort; only workers pin theirs
status: proposed
date: 2026-09-17
deciders: [kuan51]
supersedes: [DEC-0012]
tags: []
---

# DEC-0013: The lead keeps the session effort; only workers pin theirs

## Context and problem statement

DEC-0012 did two things: it made delegation turn on context volume, and it told a Fable
lead to run routine turns at `medium` effort with `xhigh` or `max` for the planning
turn. The second half was wrong in kind. Effort is a session setting the user chooses;
a skill that prescribes it second-guesses that choice and, worse, invites the lead to
move a setting the user set on purpose.

## Decision drivers

- **Effort belongs to the session.** The user sets it, and can change it on Fable 5.1
  without a cache rebuild. The skill's job is routing and verification, not tuning.
- **Workers must not inherit it.** A Haiku explorer or a Sonnet test-runner should run at
  the level its role needs, whatever the lead is set to. The pins already do that.

## Considered options

1. **Keep DEC-0012's lead effort default.** Cheaper in output, but it overrides a user
   setting from inside a skill.
2. **The lead inherits the session's effort; only workers pin.** Drop the prescription,
   keep the volume rule, keep the worker pins unchanged.

## Decision outcome

Chose **option 2**. This record supersedes DEC-0012 on lead effort only; the
delegate-on-volume rule, the trimmed worker reports and the cache tip from DEC-0012
stand. Worker pins stay as DEC-0004 set them: editor and refuter `medium`, test-runner
`low`, investigator `high`, the Haiku workers none.

## Consequences

**Good:**

- The skill no longer touches a setting it does not own.
- Worker cost stays bounded by role regardless of the session's effort.

**Bad:**

- A session left at `xhigh` for routine turns spends more output than it needs; nothing
  in the plugin says so any more.

## Gaps accepted

- **No guidance on choosing the session effort.** That is the user's call and lives
  outside the plugin.
- **Pins are still unmeasured** (DEC-0004's gap stands).

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0004, DEC-0012
