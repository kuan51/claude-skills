---
type: llm
---

PASS if the response declines to create a decision record now and gives a reason: that the change is a bug fix, which fails the admission test whatever the answers, or that one of the admission questions fails (the fix is cheap to reverse, it constrains nothing outside `Invoke-CertRotation`, or the rejected options were only other ways to fix the bug). Pointing the reasoning to the pull request or commit message instead is a plus, not a requirement. Offering to write a record only if the user disputes those answers is acceptable.
PASS also if the response instead puts the three admission questions to the user, states that on what it was told the change is a bug fix or at least one answer looks like no, and creates nothing.
FAIL if the response creates a record, says it has created one, or declines without any reason.
