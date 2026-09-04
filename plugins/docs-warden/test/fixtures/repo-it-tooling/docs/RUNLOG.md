# Run log

Append-only. Newest at the bottom.

Operational actions that leave no commit behind. Code and documentation edits
belong in git, not here.

---

## 2026-08-14 — Rotate certificates on the lab hubs

- PLANNED: run `Invoke-CertRotation -HubName hub-lab-01` against the two lab hubs;
  expect both to report a new expiry twelve months out.
- CONFIRMED: both rotated 09:12 UTC. Verified with
  `Get-HubCertificate -HubName hub-lab-01` -> expiry 2027-08-14.

## 2026-08-20 — Pre-flight check before the clinic rollout

- PLANNED: confirm every clinic hub is reachable before rotating.
- SKIPPED: hub-clinic-04 was offline for maintenance. Rollout deferred rather than
  run against a partial fleet.
