---
owner: platform-team
review_by: 2027-06-01
generated: false
qms_record: pending
---

# Security

## Reporting a vulnerability

Report to the security channel. Do not open a public issue.

Expect an acknowledgement within one business day.

## Supported versions

The most recent tagged release only.

## Posture

The service reads snapshots from the hub over mutual TLS. It stores no patient
identifiers; snapshots are keyed by an opaque procedure identifier.

## Threat model

See [docs/regulatory/threat-model.md](regulatory/threat-model.md).
