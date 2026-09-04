# What we relaxed, and why

This standard is inspired by the principles behind Simplified Technical English.
It is not that standard, and it is not trying to be.

## Copyright and naming

ASD-STE100 is copyrighted and trademarked by ASD.

- **No ASD material is reproduced here.** No dictionary, no approved or unapproved
  word lists, no text from the specification.
- **Nothing is named after it.** The skill is `clarity`; the Vale style is
  `Clarity`. The `description` may mention "simplified technical English" or
  "STE" because that is what someone asking for this help will type — it describes
  the request, not the product.
- **Not certified, and no compliance is claimed.** Counsel confirms before any
  external use.

Every approved and rejected term comes from the repository's own `docs/GLOSSARY.md` via
`glossary_to_vale.py`. The shipped vocabulary is empty on purpose.

## Relaxed for software

STE was written for aircraft maintenance manuals read by non-native speakers under
time pressure. Some of it transfers to software documentation. Some of it does not.

| Relaxation | Why |
|------------|-----|
| Full common English vocabulary | A restricted base list cannot express software concepts, and a rule nobody can satisfy gets ignored wholesale. |
| Code, identifiers, URLs, paths, front matter, tables of identifiers, and quoted regulatory text are exempt | These are not prose. Flagging them trains people to ignore the linter. |
| Passive voice allowed in `reference/` and `explanation/` docs | The actor is often genuinely irrelevant there. It stays flagged in procedures, where the reader needs to know who acts. |
| Plain `Warning:` callouts | Aerospace WARNING/CAUTION formatting signals a rigour this documentation set does not claim. |
| Requirement statements are flagged, never rewritten | Their wording is traceable and may be under change control. |
| Advisory by default | Only glossary rejects and PHI patterns are `error`. |

## Delegated rather than reimplemented

The shipped `.vale.ini` loads `Microsoft` and `write-good` alongside our style.
Rule lists confirmed by reading both packages: sentence length, passive voice,
acronym expansion, wordiness, weasel words, and clichés are already covered there.

Reimplementing them would mean duplicate warnings on the same sentence and two sets
of thresholds drifting apart. We ship only what nothing else covers. See
`writing-rules.md` for the full split.

## Dropped

Four candidate rules were considered and rejected. Each is recorded in
`writing-rules.md` under "Deliberately not adopted", with the reason: restricted
vocabulary, noun-cluster limits, simple-tense enforcement, and dropped-word checks.

The common thread is precision. A rule that fires often and is right rarely does
more damage than no rule, because the team learns to skip the whole linter.
