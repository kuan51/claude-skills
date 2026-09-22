---
tags: [trigger-negative]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 30
expected_outcome: neither docs-warden nor clarity is invoked; the request is answered directly
---

Convert this to CSV, header row included:

| Term | Definition |
|---|---|
| Hub | An edge device that holds the client certificate |
| Rotation | Replacing a certificate before it expires |
| Preview | A dry run that reports what rotation would do |
