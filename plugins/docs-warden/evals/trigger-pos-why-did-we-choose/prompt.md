---
tags: [trigger-positive, phrasing]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 30
expected_outcome: >
  the docs-warden skill is invoked. A technology choice the repository actually embodies
  is unexplained anywhere in its documents, and the ask is both whether the reasoning is
  recorded and whether it is worth recording -- which is decide mode's admission test.
  This wording uses the description's literal trigger phrase "why did we choose"; the
  paired case trigger-pos-decision-rationale-paraphrase asks the same thing without it.
---

A new engineer asked why did we choose PowerShell for this tooling rather than Python, and I couldn't point them at anything. It isn't in the README and it isn't in the conventions. Is the reasoning recorded somewhere I've missed? If it isn't, is a technology choice like that worth writing down properly, or is it too small to bother with?
