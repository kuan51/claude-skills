# Run log

Append-only. Newest at the bottom.

Operational actions that leave no commit behind.

---

## 2026-08-03 — Deploy 1.4.0 to the validation environment

- PLANNED: deploy tag `v1.4.0`; expect the smoke suite to pass.
- CONFIRMED: deployed 11:20 UTC. Verified with
  `python3 -m tests.smoke --env validation` -> 12 passed, 0 failed.
