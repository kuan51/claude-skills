---
id: DEC-0001
title: Rotate the run log on its line count alone
status: proposed
date: 2026-09-05
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0001: Rotate the run log on its line count alone

## Context and problem statement

The run log rotation rule this plugin ships read: "past 500 lines, move entries
older than 90 days into `docs/runlog/YYYY-QN.md`". Both halves had to hold, and
they cannot both hold in a repository that writes 500 lines of run log inside 90
days. The line trigger fires, no entry is old enough to move, the rule selects
nothing, and `freshness.py` warns on every run with advice nobody can follow.

This is not hypothetical. It surfaced in a repository whose `docs/RUNLOG.md`
reached 674 lines in five days, its oldest entry four days old against a cutoff
90 days back. Zero entries qualified. Under agent-assisted work a run log accrues
far faster than the rule assumed.

The rule was never a recorded decision here. It arrived as prose in
`references/universal-set.md` and was copied into the scaffolded template and the
warning `freshness.py` prints.

## Decision drivers

- A warning whose advice cannot be acted on trains people to ignore warnings.
- The trigger and the selection have to agree, or the rule has a state where it
  fires and does nothing.
- Age is a proxy for what actually matters, which is whether an entry is still one
  people read. Recency measures that directly; absolute age does not.
- Rotation must stay a manual chore. Nothing here rewrites the log automatically,
  and an append-only record is the last place to add a tool that moves text on its
  own.

## Considered options

1. **Drop the age filter; rotate on the line count alone** -- move the oldest
   entries into the quarterly archive until the log is back under the limit.
   Always actionable, because the thing that fires is the thing that selects.
2. **Keep both halves and lower the age threshold** -- 30 days, say. Moves the
   problem rather than fixing it: any repository that can write 500 lines inside
   the new window reaches the same dead state.
3. **Raise the line limit** -- 2000 lines instead of 500. Defers the question and
   makes the log less readable meanwhile, which is what the limit exists to
   prevent.
4. **Rotate automatically in `freshness.py`** -- no chore at all, and a tool that
   edits an append-only record on its own is a worse problem than the one it
   solves.

## Decision outcome

Chose **option 1**. Past 500 lines, move the oldest entries into
`docs/runlog/YYYY-QN.md` -- the archive for the quarter each entry falls in --
until the log is back under the limit, whole entries only, leaving a one-line
pointer behind. The line count is now the entire trigger.

The reference, the scaffolded template, this repository's own run log header and
the warning text change together, so the four cannot disagree about the rule they
each state.

## Consequences

**Good:**

- The rule can always be followed when it fires, so the warning stays meaningful.
- A busy repository and a quiet one behave sensibly under one rule: the quiet one
  simply never trips 500 lines.
- The archive keeps its quarterly shape, so `docs/runlog/YYYY-QN.md` still says at
  a glance which period it covers.

**Bad:**

- Rotation is still manual, and now fires more often on active repositories than a
  90-day rule ever would have.
- "The oldest entries, until back under the limit" leaves the exact boundary to
  judgement. Whole entries only bounds it, but two people rotating the same log may
  not cut in the same place.
- Every repository already scaffolded carries the old sentence in its own
  `docs/RUNLOG.md` header. The template is fixed for new ones; existing headers
  drift until someone updates them.

## Gaps accepted

Nothing enforces the rule. `freshness.py` warns and stops there. It does not check
that a pointer was left, that the archive filename matches the quarters of the
entries inside it, or that an entry was moved rather than dropped. Those stay
manual on purpose, because the alternative is a tool that edits an append-only
record.

The 500-line threshold itself is unexamined. It is the number the rule shipped
with, and this record keeps it rather than defending it.

## Links

- Ticket: none; found while rotating a downstream repository's run log
- Pull request: pending
- Related: none -- this is the first recorded decision in this repository
