---
tags: [behavior, decide, refusal]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
max_turns: 30
timeout_seconds: 900
---

Record a decision: `Invoke-CertRotation` in `src/CertRotate.psm1` passed `-HubName` to `ShouldProcess` untrimmed, so `" hub-01"` with a leading space missed the hub. We are fixing it by trimming `$HubName` at the top of the function. We considered adding `[ValidatePattern()]` to reject whitespace, and fixing the callers instead, and rejected both.
