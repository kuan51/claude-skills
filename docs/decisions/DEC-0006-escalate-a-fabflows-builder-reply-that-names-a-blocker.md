---
id: DEC-0006
title: Escalate a fabflows builder reply that names a blocker
status: proposed
date: 2026-09-13
deciders: [kuan51]
supersedes: []
tags: [fabflows]
---

# DEC-0006: Escalate a fabflows builder reply that names a blocker

## Context and problem statement

DEC-0004's build loop takes the builder's reply as `{status: 'done' | 'blocked', blocker?,
report}` and reads only `status`. A stub run of `build.js` showed three replies ending
`accepted`: `done` with a blocker such as "could not run tests", `done` with an empty
report, and `done` with a permission denial only in its report. A fourth, `blocked` with
no blocker and an empty report, escalated with nothing for the lead to act on. A
three-agent review of the 0.2.0 branch raised it. DEC-0005 left the question of whether
`blocker` is required to this decision.

## Decision drivers

- The loop must not review, and so possibly accept, a reply that contradicts itself.
- Every rule has to be testable against the stub agents in `build.test.js`, which never
  run the runtime's schema validator.
- The loop does not parse prose; the reviewer and the lead read reports.
- The smallest change, reusing an escalation the lead already handles.

## Considered options

1. **A loop check** -- any non-blank `blocker` escalates with reason `blocked`, whatever
   `status` says; the shared report schema gains `minLength: 1`; the builder's brief says
   a permission denial is a blocker.
2. **Schema `if/then`** -- `blocker` required when blocked and forbidden when done.
3. **A new reason, `done-with-blocker`** -- the same check with its own escalation reason.
4. **Scan the report** for denial text and escalate on a match.
5. **Leave it to the reviewer and the lead's gate.**

## Decision outcome

Chose **option 1**, because one condition closes the only case that reached `accepted`
through a reply the builder itself flagged, and a stub test pins it. Option 2 depends on
the Workflow runtime honouring JSON Schema conditionals, which is unverified and cannot
be tested through stubs; a rejected reply would also turn into a retry the lead never
sees rather than an escalation. Option 3 buys nothing: the lead does the same thing for
both, reading the blocker and taking the work over. Option 4 greps prose, which breaks on
wording, and the reviewer already re-runs the test command itself. Option 5 is the failure
being fixed: the reviewer never sees the builder's reply, so a blocker the builder named
is lost.

The rule DEC-0005 deferred: `blocker` stays optional in the schema, and the loop treats
any non-blank `blocker` as blocked. The reviewer's verdict could take the same rule for an
`ACCEPT` that carries a blocker; that is not changed here.

## Consequences

**Good:**

- A `done` reply that names a blocker reaches the lead instead of a review.
- A builder that follows its brief puts a permission denial in `blocker`, where the loop
  sees it.
- The skill tells the lead where the builder's reason lives on `blocked`.

**Bad:**

- A builder that writes "none" in `blocker` on a finished build escalates needlessly. That
  costs the lead a look, not a wrong accept.
- Whether the runtime enforces `minLength` is unverified. If it does not, an empty report
  still passes, and one character satisfies it anyway.

## Gaps accepted

The loop never reads report prose. A denial that appears only in the report, and a
`blocked` reply with no reason, still rest on the lead, who reads the report and
`git log <baseRef>..HEAD`. No live run: whether a real builder puts a denial in `blocker`
needs the plugin installed from this branch and a new session.

## Links

- Ticket: none
- Pull request: none yet
- Related: DEC-0004, DEC-0005
