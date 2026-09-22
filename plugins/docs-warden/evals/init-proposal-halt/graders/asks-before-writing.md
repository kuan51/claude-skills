---
type: llm
---

PASS if the response proposes a documentation setup for the repository (it names an archetype such as it-tooling, a forge such as github, and an owner, or asks for the ones it cannot infer) and explicitly asks the user to confirm before any file is written.
FAIL if the response states that it has already created, written, or scaffolded any file, or if it neither proposes a setup nor asks for confirmation.
