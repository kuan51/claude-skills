---
tags: [trigger-positive, phrasing]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 30
expected_outcome: >
  the docs-warden skill is invoked. This is the paired paraphrase of
  trigger-pos-why-did-we-choose: same situation, same fixture, same gap, but deliberately
  avoiding every literal trigger phrase in the skill's description. It says "why we went
  with" rather than "why did we choose", and never says decision record or ADR. The gap
  between the two cases is the measurement: it says how much of the skill's triggering
  depends on a user happening to use the skill's own vocabulary.
---

A new engineer asked why we went with PowerShell for this tooling rather than Python, and I couldn't point them at anything. It isn't in the README and it isn't in the conventions. Is the reasoning captured somewhere I've missed? If it isn't, is a technology choice like that worth writing down properly, or is it too small to bother with?
