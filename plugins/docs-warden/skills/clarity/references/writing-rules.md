# Writing rules

Every rule here is advisory unless marked otherwise. Two things only are `error`:
glossary rejected terms, and PHI or secret patterns. Everything else is a
suggestion or a warning, because a linter that blocks a merge over sentence length
gets switched off, and then it checks nothing at all.

## Enforced by `Clarity`

### SafetyConditionFirst — `warning`

In anything touching patient safety, the condition precedes the instruction.

<!-- vale off -->

> Wrong: Stop the procedure if the sensor is disconnected.
> Right: If the sensor is disconnected, stop the procedure.

<!-- vale on -->

A reader working through a procedure acts on the first clause they read. Leading
with the instruction lets them act before learning it does not apply. This is the
one rule here that is about safety rather than readability.

The check looks for a small set of imperative verbs followed later in the same
sentence by `if`, `when`, or `unless`. It is heuristic: it will miss unusual
phrasings, and it does not know which documents are safety-relevant. Treat a clean
run as "nothing obvious", not as a clearance.

### GlossaryTerms — `error`

One word, one meaning. Generated per repository by `glossary_to_vale.py` from the
`Do not use` column of that repository's `docs/GLOSSARY.md`.

`error` because inconsistent vocabulary in a regulated document is a real finding,
and because the repository's own maintainers chose the list — it is not a style
opinion imposed from outside.

### ProtectedHealthInformation — `error`

Social security numbers, medical record numbers, dates of birth, private key
blocks, and hardcoded credentials.

Deliberately broad. A false positive costs a minute. A miss puts patient data into
a git history that cannot be rewritten once it is merged and pulled. If a synthetic
example trips it, change the example rather than adding an exception.

### RequirementStatement — `suggestion`

Marks any text carrying a `REQ-` ID.

This rule exists to **stop** an edit, not to prompt one. Requirement wording is
traceable and may be under change control; rewriting it for readability can change
what was verified. Raise the concern with the requirement's owner instead.

### OneInstructionPerStep — `suggestion`

Flags `, then` and `and then`. A step that contains two actions is two steps, and a
reader who is interrupted between them cannot tell where they stopped.

## Delegated to Microsoft and write-good

Loaded by the shipped `.vale.ini`; not reimplemented here. Confirmed present in
those packages:

| Concern | Rule that covers it |
|---------|---------------------|
| Sentence length | `Microsoft.SentenceLength` |
| Passive voice | `Microsoft.Passive`, `write-good.Passive` |
| Acronyms on first use | `Microsoft.Acronyms`, `Microsoft.HeadingAcronyms` |
| Wordiness | `Microsoft.Wordiness`, `write-good.TooWordy` |
| Weasel words | `write-good.Weasel` |
| Clichés | `write-good.Cliches` |
| Vague openers | `write-good.ThereIs`, `write-good.So` |
| Headings, dates, units, plurals | `Microsoft.Headings` and siblings |

Those two packages default to their own thresholds. We do not override them: one
set of numbers, maintained upstream, beats two sets drifting apart here.

## Quoted prose is linted too

Vale scans blockquote content in Markdown: prose inside `>` is checked like any
other line. So quoting a bad example to illustrate a rule trips that rule, and
quoted regulatory text is flagged like your own wording.

Wrap those passages in `<!-- vale off -->` and `<!-- vale on -->` rather than
assuming the quote hides them. `examples/before-after.md` does exactly this.

Checked with vale 3.17.1. Vale 3.9.1 skipped blockquotes, and documentation
written against that behaviour will start reporting findings on the bump.

## Applied by hand, not by the linter

These are worth doing and not worth automating. Vale checks text, not intent.

- **Read the whole passage before editing.** Rules applied sentence by sentence
  without the surrounding meaning produce fluent nonsense.
- **Never drop a qualifier, tolerance, condition, or safety statement** to shorten
  a sentence. If the sentence cannot be shortened without losing one, leave it and
  say why.
- **Use a vertical list** when a sentence contains three or more sequential
  actions.
- **Keep paragraphs to about six sentences.** Past that, the reader is skimming.
- **Warning callouts are plain.** Write `Warning:` followed by the condition. No
  aerospace WARNING/CAUTION formatting; it signals a rigour this documentation set
  does not claim.

## Deliberately not adopted

- **A restricted base vocabulary.** Full common English is allowed. A 900-word list
  cannot express software concepts, and enforcing one would produce constant
  findings nobody can act on.
- **Noun-cluster limits.** The part-of-speech matching needed is unreliable on
  technical prose, where `hub certificate rotation script` is correct and clear.
  The rule would produce more false positives than findings.
- **Simple-tense enforcement.** Low value once sentence length and passive voice
  are already checked.
- **Article and subject presence checks.** Not reliably detectable, and headings
  and table cells legitimately drop both.
