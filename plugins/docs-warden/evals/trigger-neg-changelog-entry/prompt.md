---
tags: [trigger-negative]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 30
expected_outcome: neither docs-warden nor clarity is invoked; the request is answered directly
---

Draft a CHANGELOG entry for v2.3.0 in keep-a-changelog format. Changes: added a --dry-run flag to the rotate command, fixed the bug where expiry dates were compared in local time instead of UTC, dropped Python 3.9 support.
