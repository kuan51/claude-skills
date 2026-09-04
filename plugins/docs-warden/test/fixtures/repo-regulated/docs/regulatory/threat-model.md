---
owner: platform-team
review_by: 2027-06-01
generated: false
qms_record: pending
---

# Threat model

Synthetic. Structure only.

## System boundary

The service and its snapshot intake. The hub firmware is out of scope.

## Assets

| Asset | Why an attacker wants it | Impact if lost |
|-------|--------------------------|----------------|
| Snapshot stream | Reveals procedure timing | Loss of confidentiality |

## Trust boundaries

The mutual TLS connection between hub and service.

## Threats

| ID | Threat | Affected asset | Mitigation | Residual risk |
|----|--------|----------------|------------|---------------|
| T-001 | Forged snapshot | Snapshot stream | Client certificate pinning | Compromised hub certificate |

## Accepted risks

A hub whose private key is extracted can submit forged snapshots until its
certificate is revoked.
