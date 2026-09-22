---
id: DEC-0017
title: Add a brainstorming skill to fabflows and reuse the refuter for design review
status: proposed
date: 2026-09-22
deciders: [kuan51]
supersedes: []
tags: [fabflows, brainstorming, refuter]
---

# DEC-0017: Add a brainstorming skill to fabflows and reuse the refuter for design review

## Context and problem statement

`fabflows:build` needs a spec: the behaviour, how to check it, what is out of scope. Nothing in
the plugin produced one. A lead facing a rough idea improvised the conversation, and the two
ways that goes wrong are well documented in the community around design-interview skills: the
lead asks the user things the repository already answers, or it agrees with everything and the
spec is the user's first guess with a heading. Research across five popular third-party
interview and planning skills (see the plan in the pull request) found the same praised
features again and again: questions in bounded rounds with a recommended answer on each, facts
gathered by the agent rather than asked of the user, an assumptions-first opening, sizing the
request before choosing the process, expand-then-cut with a deferred list, a red-team pass
before the document is written, and a hard stop on security gaps. The question was how to carry
those into fabflows without breaking its shape: the lead asks, workers read, one level deep.

## Decision drivers

- The lead owns the questions and the decisions; workers gather facts. A design conversation
  cannot be delegated whole.
- The multi-perspective pass is only worth having if it comes from a context that did not sit
  through ten rounds of agreeing with the user.
- Every agent added costs a roster entry, a hook matcher, a README row and a test pin.
- The shipped skill must not name the third-party projects it learned from.

## Considered options

1. **A new `challenger` agent for the lens pass** — Opus, read-only, briefed with the draft spec
   and seven lenses. Clean separation, fresh context, but a second Opus reviewer beside one that
   already exists to attack finished work, plus the roster, hook and test cost of a new agent.
2. **The lead runs the lens pass inline** — cheapest, no new surface. Rejected because the lead
   reviews a design it co-wrote: the agreement bias the pass exists to counter.
3. **Teach `refuter` a spec mode** — a brief may name a draft spec instead of a diff; no test
   command, so a missing one is not BLOCKED; findings sorted by lens; must-fix is a contradiction,
   an uncheckable behaviour, or a security gap. Frontmatter unchanged, so no roster, hook or
   tool-pin change.

## Decision outcome

Chose **option 3**, because the refuter is already the adversarial reviewer with the right tier
and tools, and what it needed was a paragraph, not a sibling. The brainstorming skill is a skill
rather than an agent for the same reason: asking is the lead's job.

## Consequences

**Good:**

- Unshaped requests now have a route: `using-fabflows` sends them through
  `fabflows:brainstorming` and the user reads the spec before the loop launches.
- The refuter's report contract, gate row and hook matcher apply to spec review unchanged.
- No roster change, so `frontmatter.test.js` and `hooks.json` pin the same six agents.

**Bad:**

- The refuter body now carries two modes, and a brief that names neither clearly will get the
  diff rules. The brainstorming skill says "spec mode" explicitly to avoid that.
- Nothing runs the skill end to end in a real session before merge; the plugin must be installed
  from the branch and a new session started (CLAUDE.md, "Testing a plugin change").

## Gaps accepted

Round size (three) and the two-tier sizing are judgement calls from the research, not measured
in this repository's eval harness. If the skill over-asks or under-asks in practice, those two
numbers are the first knobs.

## Links

- Ticket: none
- Pull request: to follow on branch `skill/fabflows-brainstorming`
- Related: DEC-0004, DEC-0011, DEC-0016
