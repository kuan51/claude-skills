---
id: DEC-0005
title: Uncommitted work fails the build loop's review and gate
status: proposed
date: 2026-09-13
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0005: Uncommitted work fails the build loop's review and gate

## Context and problem statement

In `fabflows:build` (DEC-0004) the refuter reads `git diff <baseRef>..HEAD`, which shows
only committed work, but runs the test command and reads files in the working tree, which
also holds anything the builder left uncommitted. A builder could report `done` having
committed part of the change, or none of it, and the tests would still see the files and
pass. The refuter was allowed `git status` but never told to run it; the lead's gate
re-ran the tests and read `git diff --stat` but never checked the tree either. The rework
brief also told each new builder that its earlier commits were on the branch, which could
be false.

## Decision drivers

- **The workflow script has no shell.** It cannot inspect the tree itself, so any check
  has to be an instruction to an agent or to the lead.
- **The lead starts from a clean tree.** The skill already requires `git status
  --porcelain` to print nothing before the loop runs, so anything it prints afterwards was
  left by the loop.
- **A review round costs money.** A Fable review is the most expensive step in a round, so
  catching the problem before the review is worth one sentence in the builder's brief.
- **Smallest change that closes the gap.** Prefer wording in briefs that already exist
  over new schema fields or new branches in the script.

## Considered options

1. **Add a `head` field to the builder's result** and have the refuter compare it to
   `git rev-parse HEAD`. It cannot see this failure: HEAD is the same whether the tree is
   dirty or clean. And a builder that committed nothing already shows up as an empty
   `git diff <baseRef>..HEAD`.
2. **Check only in the lead's gate.** One line in the skill, and it catches the problem,
   but only after the loop has ended, so the lead has to fix the leftovers by hand.
3. **Escalate on a dirty tree.** It would need a new branch in `build.js`, and a fresh
   builder can fix the problem by committing, so escalating hands the lead work the loop
   could have done.
4. **Check the tree in every brief and in the gate, and treat a dirty tree as REWORK.**

## Decision outcome

Chose **option 4**, because it closes the gap inside the loop, where a fresh builder can
commit the leftovers, and keeps the lead's own check as the final one:

- The builder's brief says `git status --porcelain` must print nothing before it reports
  `done`: commit what the change needs and delete anything else it created.
- The refuter's brief says to run `git status --porcelain` before the test command, and
  that every path it prints is must-fix. Running it first keeps files the tests create
  out of the count.
- The rework brief says only that whatever the previous round committed is on the
  branch, and starts the builder with `git status --porcelain` and the diff.
- The lead's gate in the skill confirms `git status --porcelain` still prints nothing
  before re-running the tests.

Untracked files count: a new test file that was never committed is the case this exists
to catch. Ignored files do not show. `refuter.md` is unchanged: the agent is used outside
the loop, and the brief narrows must-fix for this review.

## Consequences

**Good:**

- A passing test in review now tells you something about the committed change, because
  the working tree and HEAD are the same.
- A builder that forgets to commit costs one rework round, not a wrong `accepted`.
- No schema or control-flow change; `build.js` gains only brief wording.

**Bad:**

- A test command that writes files `.gitignore` does not cover leaves them behind after
  the refuter's test run, which comes after its status check. The lead's gate then lists
  them even when the change is correct. The lead sees the paths and can tell a test
  artifact from uncommitted work. The builder is told to delete what its own test run
  left, so the review itself does not trip on them unless the builder skips that.
- Three places now carry the same check. If the rule changes, all three change with it.

## Gaps accepted

- **Prose enforcement.** The builder and the refuter are told to check the tree; nothing
  deterministic makes them. The lead's gate is the backstop, and it is prose too. This is
  the same class of gap as DEC-0004's unverified hooks inside workflow agents.
- **The dirty-tree finding reaches the next builder as unmarked must-fix text,** the same
  path every finding takes. That is a separate gap, not solved here.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0004, which this refines and does not supersede
