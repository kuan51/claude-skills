# Standards

A standard is an overlay on any archetype: it adds required documents, it never
removes any. Declare the ones that apply in `.docs-warden.yml`:

```yaml
standards:
  iec-62304: C        # a standard with a level axis takes its level
  osps-baseline: 2
  eu-cra: true        # one without takes true
```

Omit the key, or leave it empty, when none apply. The `standards` check then
reports `skipped`, and nothing below is enforced.

## What an overlay is allowed to contain

**File paths, and nothing else.** No requirement text, no clause numbers, no
paraphrase of what a standard says. Two reasons, and the second is the one that
bites:

1. Some of these standards are sold. IEC 62304 costs money; naming
   `docs/regulatory/soup.md` as a path does not reproduce anything IEC owns,
   and a per-clause checklist would.
2. A plausible-sounding regulatory sentence that nobody qualified wrote is worse
   than a blank marked blank. Templates carry `<!-- CONSULT: -->` wherever a
   human has to supply substance.

**A passing check is not a conformity claim.** It says the documents exist, not
that they are right, and never that a certification body would agree. Every
reference document here says so in its own words; keep that.

## Two kinds of level axis

They look alike in the manifest and are not alike at all:

| | Assigned by | May the skill propose it? |
|---|---|---|
| IEC 62304 safety class | A hazard analysis, outside the repo | **No.** Ask. |
| OSPS Baseline maturity level | Maintainer and user count, observable | Yes, then confirm |

`infer` in the standards table carries this. Getting it wrong in either
direction is expensive: proposing a safety class invents a regulatory decision,
and demanding ceremony for a maturity level nobody disputes trains people to
skip the question.

Standards with no level axis (`levels: None`) take `true` and nothing else. The
check identity-tests that value, because Python's `1 == True` would otherwise
let a meaningless level through.

## Overlapping artifacts

Two standards wanting the same file is normal, not a conflict. The check takes
the union, requires each path once, and names every standard that wanted it.
Shared paths are constants in `standards.py` so a move stays one edit.

One genuine disagreement exists. IEC 62304 keeps its threat model at
`docs/regulatory/threat-model.md`, with the rest of its design history; a
standard that asks for one at `docs/threat-model.md` means the same document.
**Do not maintain two.** Where both apply, the regulatory path is authoritative
and the other may be a pointer to it. This is resolved here, in prose, rather
than in code, because it is one file.

## Adding a standard

One entry in `scripts/standards.py`, plus a reference document beside this one.
Before writing the entry:

- **Read the primary source.** Not a summary of it, and not a vendor's
  checklist. A published HTML summary of the OSPS Baseline collapses two
  distinct controls into one malformed id; a table built from it would ship
  that error as a requirement.
- **Record the version you read**, in `source_version` and in the reference
  document's currency warning. Nothing here detects that a standard has moved.
- **Say what you left out.** A standard whose scope is wider than documentation
  will have parts this plugin cannot check -- access-control settings, CI
  configuration, activities that produce no file. Name them, or the first
  person to compare the two reports the overlay as broken.
- **Mark what is declared but unchecked** with `(not checked)` in the artifact
  table, the way `standards/iec-62304.md` does. An artifact listed without the
  marker is a promise the check keeps.

Rules that belong to one standard rather than to the check go in `EXTRA_RULES`
in `audit.py` and are named from that standard's `extra`. They dispatch per
declared standard. Never run them for the whole check: `qms_record` is IEC
62304's rule, and running it for every adopter of every standard tells people
to add front matter no standard asked them for.
