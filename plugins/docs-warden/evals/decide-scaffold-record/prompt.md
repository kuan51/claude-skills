---
tags: [behavior, decide]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
max_turns: 60
timeout_seconds: 1200
---

Record a decision. Title it exactly: Rotate certificates from a scheduled task

Context: we run Invoke-CertRotation from a Windows scheduled task on each hub instead of a long-running service. Reversing it means rewriting the deployment and the runbook, so more than one PR. It constrains every future rotation feature, not just this module. Rejected alternatives: a Windows service (always-on footprint and needs LocalSystem) and a cloud function (certificates must stay on-prem). Deciders: maintainers. All three admission questions are yes — go ahead and write the record.
