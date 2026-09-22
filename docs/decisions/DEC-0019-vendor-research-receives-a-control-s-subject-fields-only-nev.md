---
id: DEC-0019
title: Vendor research receives a control's subject fields only, never posture prose
status: proposed
date: 2026-09-22
deciders: [kuan51]
supersedes: []
tags: [ciso, security, egress]
---

# DEC-0019: Vendor research receives a control's subject fields only, never posture prose

Recorded on 2026-09-22 from the retired superpowers rubric-refactor design of 2026-07-19. The
decision itself dates from 2026-07-19.

## Context and problem statement

`ciso:roadmap` dispatches one `vendor-researcher` agent per open gap, and that agent holds
`WebSearch` and `WebFetch`. The roadmap workflow's `buildPrompt` spread every non-id field of the
control into the research prompt, and the skill built that control object with the user's
`justification` and `inProgressNotes`. Organisation-authored security-posture prose was therefore
reaching an agent that can talk to the open web, in tension with the README's promise that nothing
about the organisation leaves the project.

## Decision drivers

- The README guarantee must be true, not aspirational.
- Vendor research only needs to know what the control is about, not how the organisation fails it.
- Workflow scripts cannot `require`, so any allowlist has to be mirrored inline.

## Considered options

1. **Keep spreading fields, document the risk** — cheapest; leaves the promise false.
2. **Subject-only allowlist, with an opt-in to include posture prose** — richer research when
   the user wants it, but adds a setting whose default has to be defended and a code path to test.
3. **Subject-only allowlist, no opt-in** — `sanitize-control.js` exports a fail-closed
   `SUBJECT_FIELDS` list; `buildPrompt` inlines the same list; the skill stops passing
   justification and in-progress notes at all.

## Decision outcome

Chose **option 3**, because nobody had asked for posture-aware research and a security default
with no override is simpler to reason about and to test. Opt-in is deferred until someone wants it.

## Consequences

**Good:**

- A test proves a control carrying a justification never surfaces that text in the assembled
  prompt.
- The README guarantee is mechanically backed.

**Bad:**

- The allowlist is duplicated between `sanitize-control.js` and `workflow.js` (the repo's
  `R2_DIMENSIONS` precedent); a sync test guards it.
- Research recommendations cannot be tailored to how far along the organisation already is.

## Gaps accepted

Topic labels and summaries are public framework text, but `relatedControlName` and
`legacyCategoryPrefix` still reveal which framework the organisation is pursuing.

## Links

- Ticket: none
- Pull request: the 2026-07-19 ciso rubric-refactor work; recorded on the branch that retired
  `docs/superpowers/`
- Related: `docs/specs/2026-09-22-ciso-hitrust.md`
