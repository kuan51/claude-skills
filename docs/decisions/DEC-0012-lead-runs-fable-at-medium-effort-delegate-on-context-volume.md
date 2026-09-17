---
id: DEC-0012
title: Lead runs Fable at medium effort; delegate on context volume
status: proposed
date: 2026-09-17
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0012: Lead runs Fable at medium effort; delegate on context volume

## Context and problem statement

DEC-0004 put Fable on the lead seat and told it to run at `low` effort for routine turns.
The target user runs a Claude subscription with a weekly cap and wants Fable at `medium`
or `high` by default without watching the meter. A review of Anthropic's pricing and
Claude Code caching docs (September 2026) showed where a Fable-led session's allowance
actually goes: the cached re-read of the conversation is cheap (Fable cache reads are
0.025x base input), while thinking is billed as output at Fable's full rate. The two
levers are how far the conversation grows and how much output each turn writes. The
skill's guidance pulled the wrong way on both: `low` effort as the default, a
"never do mechanical work while a worker fits" rule that invited tiny delegations, and
worker contracts that pasted whole test logs into the lead.

## Decision drivers

- **Output, not re-reads, drains the cap.** Fable cache reads cost $0.25 per million
  tokens; output costs $50. A turn stays cheaper on Fable than Opus only while cache
  reads exceed roughly 100x its output tokens, so tens of thousands of thinking tokens
  per turn erase the advantage.
- **A worker starts cold.** It shares no cache with the lead, and its report is appended
  to the lead's context and re-read on every later turn. Multi-agent work runs several
  times the tokens of a single thread, so a delegation pays only when it keeps a large
  volume out of the lead.
- **Changing effort on Fable keeps the cache.** So the lead can raise effort for one
  planning turn and drop back at no rebuild cost.
- **The weekly conversion is unpublished.** Anthropic does not say how cached, uncached
  or thinking tokens weigh against a plan's allowance, so every figure here is
  API-billing logic used as a direction, not a formula.

## Considered options

1. **Keep `low` as the default.** Cheapest per turn, but it is not what the user wants
   to run, and the target is to make `medium` affordable, not to avoid it.
2. **`medium` default, `xhigh`/`max` for the plan turn only, and delegate on context
   volume.** Prose changes to the skill, the worker contracts and the README. No new
   files or agents.
3. **Move the lead to Opus 5.** Half the output price, but effort changes rebuild the
   cache, cache reads cost twice Fable's, and DEC-0004's measured reasons for a Fable
   lead still hold.
4. **Enforce output caps in the SubagentStop hook.** A hook could reject a long report.
   It would false-block real failure output, and every false block costs a whole worker
   turn.

## Decision outcome

Chose **option 2**, because it addresses the two real levers with the smallest change:
the lead's own output (effort guidance) and the lead's context growth (delegate only
when it keeps volume out; workers return summaries and failing lines, never logs or
diffs). The routing table, the tiers and the build loop are untouched. The README's
cache tip is corrected so a subscription user does not set a TTL they already have.

## Consequences

**Good:**

- Routine turns at `medium` are the stated default, and the reason is on the page where
  the lead reads it.
- Tiny delegations, which cost more than they save, are now named as a case not to
  delegate rather than encouraged by rule 5.
- Worker reports stop carrying passing-test noise and diffs into every later turn.

**Bad:**

- A failing test now comes back as its failing lines and summary, not the whole run; a
  lead that needs the surrounding context has to re-run the command itself, which the
  verification gate already requires.
- Two rules in the skill now pull in different directions by design (hand off
  mechanical work, but not when it keeps nothing out of the lead), and the lead has to
  judge the boundary.
- Nothing measures the effect. The break-even is list-price arithmetic.

## Gaps accepted

- **No eval.** Neither the effort default nor the volume rule is measured on real
  sessions; `/usage` is the only feedback.
- **Subscription weighting is unknown.** How Fable-tier tokens count against a weekly
  cap is not published, and secondary sources say Fable is capped at a share of the
  weekly limit on Max. The guidance is directional.
- **User habits stay in the README.** Compaction, `/clear` and TTL settings are the
  user's to run; the skill cannot do them.
- **Not exercised in a live session.** Verified by tests and reading only.

## Links

- Ticket: none
- Pull request: pending
- Related: DEC-0004, which this refines and does not supersede
