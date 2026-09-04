---
owner: it-team
review_by: 2027-06-01
generated: false
---

# Certificate rotation runbook

## When to use this

A hub certificate expires in under 30 days, or the certificate authority was
rotated.

## Before you start

- You can reach the hub on the management network.
- You have the rotation role in the internal certificate authority.

## Procedure

1. Confirm the hub is reachable.
2. Run the rotation in preview mode.
3. If the preview reports no errors, run it for real.
4. Confirm the new expiry.

## Verify it worked

```powershell
Get-HubCertificate -HubName hub-lab-01
```

Expected: an expiry roughly twelve months out.

## If it goes wrong

| Symptom | Cause | Do this |
|---------|-------|---------|
| Hub unreachable | Management VLAN down | Stop. Escalate to network. |
| Rotation succeeds, hub offline | Key store did not reload | Restart the hub agent. |

## Rollback

The previous certificate stays in the key store until it expires. Restore it with
`Restore-HubCertificate -HubName <name> -Previous`.
