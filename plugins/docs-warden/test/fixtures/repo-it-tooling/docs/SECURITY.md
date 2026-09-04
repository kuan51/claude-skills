---
owner: it-team
review_by: 2027-06-01
generated: false
---

# Security

## Reporting a vulnerability

Report to the IT security channel. Do not open a public issue.

Expect an acknowledgement within two business days.

## Supported versions

The tip of the default branch only.

## Posture

Certificates come from the internal certificate authority. The module never writes
private key material to disk; it hands the key to the platform key store.
