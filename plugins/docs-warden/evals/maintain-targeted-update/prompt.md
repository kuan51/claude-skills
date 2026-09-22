---
tags: [behavior, maintain]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
max_turns: 60
timeout_seconds: 1200
---

I renamed the -HubName parameter on Invoke-CertRotation to -TargetHub. The change is in src/CertRotate.psm1, uncommitted. Update the docs to match.
