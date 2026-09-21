---
tags: [trigger-negative]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 30
expected_outcome: neither docs-warden nor clarity is invoked; the request is answered directly
---

write a google-style docstring for this:

def rotate(cert, days):
    if cert.expires_in() > days:
        return None
    return cert.renew()
