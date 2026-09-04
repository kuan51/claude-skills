---
owner: platform-team
review_by: 2027-06-01
generated: false
qms_record: pending
---

# FIX requirements

Synthetic requirements for the fixture. IDs are never reused or renumbered.

## REQ-FIX-001

**Requirement.** The service shall reject a snapshot whose sample count is zero.

**Rationale.** An empty snapshot yields no valid gradient; computing one would
return a number with no meaning behind it.

**Verification.** Unit test with an empty snapshot.

## REQ-FIX-002

**Requirement.** The service shall reject a snapshot whose timestamps are not
monotonically increasing.

**Rationale.** Out-of-order samples indicate a transport fault. Integrating across
them produces a plausible but wrong gradient.

**Verification.** Unit test with shuffled timestamps.

<!-- This requirement is deliberately left with no test, so the fixture proves
     trace_matrix.py catches an untested requirement. Do not add a test. -->

## REQ-FIX-003

**Requirement.** The service shall round the reported gradient to one decimal
place.

**Rationale.** The hub reports pressure to one decimal; more precision implies
accuracy the sensor does not have.

**Verification.** Unit test asserting the rounding.
