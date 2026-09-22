---
id: DEC-0021
title: A regulation that incorporates a standard by reference binds the cited edition
status: proposed
date: 2026-09-22
deciders: [kuan51]
supersedes: []
tags: [ciso, cmmc, sourcing]
---

# DEC-0021: A regulation that incorporates a standard by reference binds the cited edition

Recorded on 2026-09-22 from the retired superpowers CMMC design of 2026-07-31 (its section "The
two findings"). The decision itself dates from 2026-07-31.

## Context and problem statement

CMMC Level 2 is defined by 32 CFR 170.2, which incorporates NIST SP 800-171 Revision 2 and NIST SP
800-172 (February 2021) by reference. NIST withdrew both, superseded by Revision 3, which
reorganised the requirements so the identifiers no longer correspond one to one. Compiling the
Level 2 and Level 3 control sets from "the current NIST publication" would have produced a clean,
well-cited and entirely wrong control set.

## Decision drivers

- The plugin's discipline is to never invent or drift from what the certifying authority
  actually assesses.
- Future certification modules will face the same choice whenever a regulation and a standard
  move at different speeds.

## Considered options

1. **Compile from the current publication** — always the freshest text, but not what an assessor
   under 32 CFR Part 170 checks against.
2. **Compile from the edition the regulation cites, and say so** — the control set matches the
   rule as written; the module's `invariants.md`, both `coverageNote`s and a test state the binding
   and the withdrawal dates.

## Decision outcome

Chose **option 2**, because the regulation, not the publisher, decides what is assessed. The rule
is general: when a regulation incorporates a standard by reference, the regulation's cited edition
wins until the regulation is amended.

## Consequences

**Good:**

- Level 2 ships the 110 requirements a C3PAO assesses, verified against the document's own
  Appendix D mapping tables.
- The precedent is written down for the next module.

**Bad:**

- The plugin knowingly ships text NIST has withdrawn, which surprises users who look up the
  standard directly; the invariants document has to explain why.

## Gaps accepted

When 32 CFR Part 170 is amended to cite Revision 3, the module needs a new structure file version
and a reconciliation path; nothing watches for that amendment.

## Links

- Ticket: none
- Pull request: the 2026-07-31 ciso CMMC work; recorded on the branch that retired
  `docs/superpowers/`
- Related: `docs/specs/2026-09-22-ciso-cmmc.md`, `plugins/ciso/ADDING-A-CERTIFICATION.md`
