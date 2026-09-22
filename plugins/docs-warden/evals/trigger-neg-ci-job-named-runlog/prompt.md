---
tags: [trigger-negative]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 30
expected_outcome: neither docs-warden nor clarity is invoked; the request is answered directly
---

Our GitHub Actions job is called `runlog` (it tails the deploy log into an artifact) and it started dying with exit code 137 yesterday. What does 137 mean and what's the usual fix?
