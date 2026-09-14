# What we relaxed, and why

This standard is inspired by the principles behind Simplified Technical English.
It is not that standard, and it is not trying to be.

## Copyright and naming

ASD-STE100 is copyrighted and trademarked by ASD.

- **No ASD material is reproduced here.** No dictionary, no approved or unapproved
  word lists, no text from the specification.
- **The names avoid the trademark.** The skill is `clarity`. The Vale style is
  `Clarity`. The `description` may mention "simplified technical English" or
  "STE" because that is what someone asking for this help will type. It describes
  the request, not the product.
- **Not certified, and no compliance is claimed.** Counsel confirms before any
  external use.

Every approved and rejected term comes from the repository's own `docs/GLOSSARY.md` via
`glossary_to_vale.py`. The included vocabulary is empty on purpose.

## Relaxed for software

STE was written for aircraft maintenance manuals read by non-native speakers under
time pressure. Some of it transfers to software documentation, and some of it does not.

| Relaxation | Why |
|------------|-----|
| Full common English vocabulary | A restricted list of base words cannot express software concepts, and a rule nobody can satisfy gets ignored wholesale. |
| Code, identifiers, URLs, paths, front matter, tables of identifiers, and quoted regulatory text are exempt | These are not prose. Flagging them trains people to ignore the linter. |
| Passive voice allowed in `reference/` and `explanation/` docs | The actor is often irrelevant there. It stays flagged in procedures, where the reader needs to know who acts. |
| Plain `Warning:` callouts | Aerospace WARNING/CAUTION formatting signals a rigour this documentation set does not claim. |
| Requirement statements are flagged, never rewritten | Their wording is traceable and may be under change control. |
| Advisory by default | Only glossary rejects and PHI patterns are `error`. |

## Delegated rather than reimplemented

The included `.vale.ini` loads `Microsoft` and `write-good` alongside our style.
Rule lists confirmed by reading both packages: sentence length, passive voice,
acronym expansion, wordiness, weasel words, and clichés are already covered there.

It also loads `proselint` and `ai-tells`. `proselint` adds misused words, redundant
phrases, hedging, jargon and typography. `ai-tells` flags the patterns of
machine-written prose, which none of the other packages look for.

Reimplementing them would mean duplicate warnings on the same sentence and two sets
of thresholds drifting apart. We add only what nothing else covers. See
`writing-rules.md` for the full split.

## Dropped

Restricted vocabulary, noun-cluster limits, simple-tense enforcement, and
dropped-word checks were considered and rejected. Each is recorded in
`writing-rules.md` under "Deliberately not adopted," with the reason.

The common thread is precision. A rule that matches often and is right rarely does
more damage than no rule, because the team learns to skip the whole linter.
