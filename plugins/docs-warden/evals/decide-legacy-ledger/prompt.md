---
tags: [behavior, decide]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
max_turns: 60
timeout_seconds: 1200
---

Record a decision: we run Invoke-CertRotation from a Windows scheduled task on each hub, not from a long-running Windows service. The reason is that a service would need an always-on footprint and has to run as LocalSystem. Write it down with its reason.
