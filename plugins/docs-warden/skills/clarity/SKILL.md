---
name: clarity
description: A plain-English writing standard for technical documentation. Use when rewriting technical prose in plain English, simplifying a procedure or runbook step, reviewing documentation for readability, or checking that a safety instruction is worded correctly. Triggers on "rewrite this in plain English", "simplify this documentation", "make this step clearer", "plain language", "simplified technical English", "STE", "is this readable", "review the wording", "our docs are hard to follow", and on any request to edit, tighten, or review the wording of a runbook, procedure, README, architecture note, or requirement statement.
---

# Clarity

A plain-English writing standard for technical prose, plus the `Clarity` Vale
style that enforces the part a machine can check.

Inspired by the principles of Simplified Technical English. **Not an implementation
of ASD-STE100, not certified, and no ASD material is reproduced here.** See
`references/software-adaptations.md`.

## Boundaries

**This skill will:** flag wording problems by rule, rewrite prose while preserving
meaning, and explain what changed and why.

**This skill will not:** rewrite a requirement statement, drop a qualifier or a
safety condition to shorten a sentence, invent regulatory or clinical wording, or
touch anything inside code, identifiers, or quoted regulatory text.

## What this standard actually adds

Most generic prose rules are already covered by the `Microsoft` and `write-good`
Vale packages, which the shipped `.vale.ini` loads alongside ours. Reimplementing
them would produce duplicate warnings on the same sentence and two sets of
thresholds to keep in step.

So this style ships only the five rules nothing else covers:

| Rule | Level | Why this style ships it |
|------|-------|----------------|
| `SafetyConditionFirst` | warning | No general style checks instruction order. |
| `GlossaryTerms` | error | Generated per repo from its own `docs/GLOSSARY.md`. |
| `ProtectedHealthInformation` | error | For repos handling regulated data. |
| `RequirementStatement` | suggestion | Marks `REQ-` text as flag-only, never rewrite. |
| `OneInstructionPerStep` | suggestion | Runbook-specific; generic styles do not check it. |

`references/software-adaptations.md` lists what is delegated and what was
deliberately dropped.

## The rule that matters most

**In anything touching patient safety, the condition comes before the
instruction.**

> Wrong: Stop the procedure if the sensor is disconnected.
> Right: If the sensor is disconnected, stop the procedure.

A reader following a procedure under pressure acts on the first clause they read.
Putting the instruction first means they can act before they learn it does not
apply. Every other rule here is about being easier to read; this one is about not
being acted on wrongly.

## Process

1. **Read the whole passage first.** Rules applied sentence by sentence without
   the surrounding meaning produce fluent nonsense.
2. **Flag violations sentence by sentence**, naming the rule.
3. **Rewrite preserving meaning and precision.** Never drop a qualifier, a
   condition, a tolerance, or a safety statement to make a sentence shorter. If a
   sentence cannot be shortened without losing one of those, flag it and leave it.
4. **Return a table:** Rule, Original, Rewrite, Note.
5. **If the text is already compliant, say so and stop.** Do not manufacture
   findings to look useful.

Requirement statements carrying a `REQ-` ID are **flagged, never rewritten.** Their
wording is traceable and may be under change control. Say what concerns you and let
the requirement's owner decide.

## Exemptions

Never flag anything inside: code blocks, inline code, URLs, file paths, front
matter, tables of identifiers, or quoted regulatory text. The Vale configuration
handles most of this; when rewriting by hand, apply the same rule.

Passive voice is acceptable in reference and explanation documents. It is worth
flagging in procedures, where the reader needs to know who acts.

## Setting it up in a repo

```bash
# Generate the vocabulary from the repository's own glossary

python3 ../docs-warden/scripts/glossary_to_vale.py <repo>
vale sync    # fetch the pinned Microsoft and write-good packages
vale .
```

`assets/vale/.vale.ini` is the starting configuration. The vocabulary it ships is
**empty on purpose**: approved and rejected terms come only from each repo's
`docs/GLOSSARY.md`. A word list bundled with the tool would be someone else's
vocabulary imposed on every repo.

## References

- `references/writing-rules.md` — the full rule set, with severity and rationale.
- `references/software-adaptations.md` — what we relaxed, delegated, and dropped.
- `examples/before-after.md` — worked examples from our domains.
