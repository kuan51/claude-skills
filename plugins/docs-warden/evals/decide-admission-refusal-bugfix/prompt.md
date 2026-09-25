---
tags: [behavior, decide, refusal]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
max_turns: 30
timeout_seconds: 900
---

Record a decision: the deploy gate compared `$env:DeployMode` case-sensitively, so `Enforcing` silently ran as audit. We now lower-case the value inside the gate before comparing. We considered failing closed on any unrecognised value and adding a separate normaliser script, and rejected both.
