---
owner: platform-team
review_by: 2027-06-01
generated: false
qms_record: pending
safety_class: B
---

# Software development plan

Synthetic fixture content. Structure only; no real regulatory statements.

<!-- CONSULT: regulatory lead -->

## Scope

The pressure derivation service and its verification.

## Safety classification

Class B.

<!-- CONSULT: regulatory lead - classification rationale and hazard analysis. -->

## Development lifecycle

Trunk-based, with a tagged release per validation cycle.

## Deliverables

| Deliverable | Where it lives | eQMS record |
|-------------|----------------|-------------|
| Requirements | `docs/regulatory/requirements/` | pending |
| Architecture | `docs/architecture/arc42.md` | pending |
| Verification | `docs/regulatory/verification/` | pending |
| SOUP list | `docs/regulatory/soup.md` | pending |
| Traceability | `docs/regulatory/traceability-matrix.md` | pending |

## Configuration management

Git holds working artifacts. A release is a tag. Controlled records live in the
eQMS, referenced by `qms_record` front matter.

## Problem resolution

Tracked in Jira. Linked, never duplicated here.

## Verification strategy

Every requirement carries an ID that appears in the implementing code and in the
name of each test that verifies it.
