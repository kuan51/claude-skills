---
id: DEC-0007
title: Recover a thrown fabflows build by resuming it, not catching the throw
status: proposed
date: 2026-09-13
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0007: Recover a thrown fabflows build by resuming it, not catching the throw

## Context and problem statement

The branch review of fabflows 0.2.0 found that `build.js` has no try/catch around its
`agent()` calls. The Workflow reference says that once a turn's `+Nk` token budget is
spent, "further agent() calls throw". A throw mid-loop ends the script: the lead gets a
workflow error instead of an `escalate` result, and the builder may already have commits
on the branch. The skill told the lead what to do on `accepted` and on `escalate`, not on
an error.

## Decision drivers

- **Less is lost than it looks.** The lead passed `baseRef` in, so it still has it. The
  commits are in git. The reference says the run's `journal.jsonl` records every
  `agent()` return value, and `resumeFromRunId` replays the unchanged prefix of calls
  from cache.
- **The throw is the harness's hard stop.** `parallel()` and `pipeline()` turn a throw
  into null; a direct `agent()` call deliberately does not.
- **A spent budget is the only documented throw this script can hit.** A dead or skipped
  agent returns null, which `build.js` already escalates.
- **It is rare but real.** It needs a user-set budget, and the plugin ships to users who
  set one.
- **The hazard is the lead's next move.** Restarting with a fresh `baseRef` from
  `git rev-parse HEAD` hides the first builder's commits from the new reviewer.

## Considered options

1. **Document the recovery** -- one paragraph in the skill's build-loop section: read
   `git log <baseRef>..HEAD`, resume with `resumeFromRunId`, never restart with a fresh
   `baseRef`.
2. **One try/catch around the loop** returning `escalate('agent-threw')` with the error
   message. `rounds.push` runs after the review call, so a throw at review drops that
   round's finished build; keeping it means pushing before the review and back-filling,
   plus a test. It also turns the harness's hard stop into a normal return.
3. **Wrap each `agent()` call** -- the same effect as option 2 in more lines.
4. **Check `budget.remaining()` before each call** -- covers only the budget case, and
   the test harness would have to supply `budget`.
5. **Accept it unchanged** -- leaves the lead without instructions for the one move that
   matters.

## Decision outcome

Chose **option 1**, because the history the gap worried about can be rebuilt from git,
the lead's own args, and the run journal, and a resumed run continues the loop instead of
ending it. A catch would add code and a test to hand back a result the lead can already
rebuild, and it would give up the resume.

## Consequences

**Good:**

- `build.js` and its tests are unchanged.
- A resumed run keeps its finished rounds and continues from the call that threw, which
  an `escalate` result cannot do.
- The skill now warns against the fresh-`baseRef` restart.

**Bad:**

- The recovery relies on the lead reading prose -- the thing DEC-0004 chose a script to
  avoid for the loop's ordering.
- A workflow error still carries no `reason` or `verdict`; the lead reads what landed from
  git and the rounds from the journal.
- Resume works in the same session only. After the session ends, the lead works from
  `git log` alone.

## Gaps accepted

- **Resume after a throw is inferred, not observed.** The reference documents resume after
  a pause, a kill, or a script edit; no run here has thrown and been resumed.
- **Schema retries running out is undocumented.** The closest text -- an agent that "dies
  on a terminal API error after retries" returns null -- points to null, which is handled.
- **A reviewer model the session lacks is still untested** (DEC-0004). If
  `model: 'fable'` throws rather than returning null, it takes this path after the builder
  has committed.
- **An agent already running when the budget runs out** -- whether it finishes, returns
  null, or throws is undocumented.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0004, which this refines and does not supersede. DEC-0005 and DEC-0006
  record other gaps from the same review, on their own branches.
- Evidence: the Workflow authoring reference -- its `agent()`, `budget`, `parallel()`
  and Resume sections
