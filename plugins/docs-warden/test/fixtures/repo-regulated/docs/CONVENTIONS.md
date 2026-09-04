---
owner: platform-team
review_by: 2027-06-01
generated: false
---

# Conventions

How we work in this repository today.

## Stack

Python 3.11. No runtime dependencies outside the standard library.

## Repository layout

`src/` holds the service. `tests/` holds verification. `docs/regulatory/` holds the
artifacts the safety class requires.

## Branches and commits

Branch per ticket. Conventional Commits, imperative subject, 72 characters at most.

## Naming

Every requirement has an ID of the form `REQ-FIX-NNN`. The ID appears in the code
that implements it and in the name of every test that verifies it.

## Testing

`python3 -m pytest tests/`. A requirement with no test fails the build.

## Documentation

Every pull request updates the affected documents or says why not.
Accepted decision records are never edited; supersede them instead.

## Generated files

| Path | Regenerate with |
|------|-----------------|
| `docs/DECISIONS.md` | `adr_index.py .` |
| `docs/decisions/README.md` | the same command |
| `docs/regulatory/traceability-matrix.md` | `trace_matrix.py . --write` |
