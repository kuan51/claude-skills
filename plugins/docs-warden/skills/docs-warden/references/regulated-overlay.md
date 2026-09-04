# Regulated overlay

An overlay on any archetype, switched on by `regulated: true` in
`.docs-warden.yml` and scaled by `safety_class`.

**This file describes document structure, not regulatory content.** Every template
in `../assets/regulated/` carries `<!-- CONSULT: regulatory lead -->` wherever a
human has to supply substance. Do not fill those in from a model's memory of a
standard. A plausible-sounding regulatory sentence that nobody qualified wrote is
worse than a blank marked blank.

## Currency warning

Two things here need re-confirming with the regulatory lead before anyone relies on
them:

- **QMSR** took effect 2026-02-02 and folds the design history file into ISO 13485
  "Medical Device File" language. Existing repos still say DHF.
- **IEC 62304 Edition 2** was in draft as of this writing. The class table below
  reflects the **current** edition.

This skill does not track standards. Treat the table as a starting checklist that a
qualified person confirms, never as a compliance statement.

## Artifacts by safety class

Rows marked **(not checked)** are required by the standard but not yet enforced by
`audit.py`. Rows without the marker are checked by the `regulated` check.

| Artifact | A | B | C |
|----------|---|---|---|
| `docs/regulatory/software-development-plan.md` | yes | yes | yes |
| `docs/regulatory/requirements/` (SRS, `REQ-<AREA>-NNN` IDs) | yes | yes | yes |
| `docs/architecture/arc42.md` | – | yes | yes |
| `docs/architecture/detailed-design.md` | – | – | yes |
| `docs/regulatory/verification/unit.md` | yes | yes | yes |
| `docs/regulatory/verification/integration.md`, `.../system.md` | – | yes | yes |
| `docs/regulatory/soup.md` | yes | yes | yes |
| `docs/regulatory/traceability-matrix.md` (**generated**) **(not checked)** | yes | yes | yes |
| `sbom/` (**generated**) | yes | yes | yes |
| `docs/regulatory/threat-model.md` | yes | yes | yes |
| full `docs/SECURITY.md` **(not checked)** — `required-files` only tests that the file exists | yes | yes | yes |
| `docs/regulatory/ddf-index.md` | yes | yes | yes |

## Rules the audit enforces

### Git holds working artifacts; the eQMS holds records

Git is where the work happens. The signed, approved, controlled record lives in the
eQMS. Confusing the two is the most common failure here: a repo full of unsigned
Markdown is not a design history, and an eQMS full of documents nobody can trace to
a commit is not evidence either.

So every regulated document's front matter carries `qms_record:`. `pending` is a
legitimate value; absent is not.

### A release is a tag

`ddf-index.md` references git **tags**, never branches. A branch moves. An auditor
asking "what shipped" needs something that does not.

### Requirements are traced from the code, not from a spreadsheet

`REQ-` IDs appear as tags in code comments and in test names.
`trace_matrix.py` builds `traceability-matrix.md` by grepping for them, and **fails
on any requirement with zero tests**.

This is deliberately the strictest check in the skill. A requirement nobody tests is
the exact gap these standards exist to catch, and a hand-maintained matrix always
drifts into claiming coverage that is not there. Generating it from the source of
truth means the matrix cannot lie — it can only be incomplete, visibly.

### SOUP is a list, kept current

Name, version, source, and whether anomalies were reviewed, for every piece of
software of unknown provenance. Keep this current with the lock file. **Not
currently enforced** — the audit checks that `soup.md` exists, not that it is
current. Comparing it against the lock file is a known gap.

### The SBOM is generated

CycloneDX or SPDX, produced by an existing tool such as syft. **Never hand-written.**
A hand-written SBOM is a fiction that takes real effort to maintain.

### Problem resolution lives in the tracker

Link to the Jira `SEC` or `IT` issue. Do not copy its contents into the repo; two
copies of an issue means one of them is wrong.

### No PHI, anywhere

Including test fixtures. The PHI scan is `fail` in every repo; here it is the check
that matters most. Git history cannot be rewritten after the fact once something is
merged and pulled.
