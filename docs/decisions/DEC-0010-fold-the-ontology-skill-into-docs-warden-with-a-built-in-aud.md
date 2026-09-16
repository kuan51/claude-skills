---
id: DEC-0010
title: Fold the ontology skill into docs-warden with a built-in audit check
status: proposed
date: 2026-09-16
deciders: [kuan51]
supersedes: []
tags: [docs-warden, ontology, audit]
---

# DEC-0010: Fold the ontology skill into docs-warden with a built-in audit check

## Context and problem statement

docs-warden's `init` mode told Claude to seed `docs/GLOSSARY.md` from an
`ontological-documentation` skill "if installed". Nothing shipped that skill, so
the branch never fired and every scaffolded glossary started empty. This
repository's own `docs/GLOSSARY.md` records the outcome in its own words.

An uploaded `ontological-docs` plugin was the source of that skill. The question
was where it should live and how a repository would be held to its output.

## Decision drivers

- A cross-plugin "if installed" branch is not a feature; it is a branch that is
  never taken, and nothing reports that it was not.
- Wiring a generator through `generated_docs:` would need an absolute path to the
  installed plugin in every consuming repository's manifest.
- The uploaded plugin's own quality: three generic reference documents nothing
  read, an agent whose front matter and body disagreed on its name, and a script
  that raised `NameError` on import.

## Considered options

1. **Register it as a standalone marketplace plugin** — leaves the "if installed"
   branch exactly as it is, which is what left glossaries empty.
2. **Vendor it into docs-warden verbatim** — ships the generic references, the
   unrelated agent, and the import bug along with the useful half.
3. **Fold it in as a third skill, rewritten, with an `ontology` audit check** —
   the extractor and a generator, a reference table a test holds to the code, a
   repurposed read-only infra agent, and check 13 running the generator's
   `--check` the way `adr-index` runs `adr_index.py`.

## Decision outcome

Chose **option 3**, because the skill only earns its place if something reports
when its output goes stale, and an audit check is the only surface docs-warden has
for that. Running the generator from the plugin's own directory keeps every
consuming manifest free of absolute paths.

## Consequences

**Good:**

- The glossary seeding step now has a script that exists and prints JSON only.
- `docs/architecture/domain-model.md` is generated, checked, and optional: a
  repository in a language the extractor cannot read reports `skipped`.
- `concepts:` front matter turns the document into a map of the documentation,
  not only of the code.

**Bad:**

- docs-warden grows a third skill and its first agent, so the plugin is larger and
  a consumer loading it pays for all of it.
- One more generated file that a hand edit will break, reported as a `fail`.

## Gaps accepted

- Domain versus technical is a **suffix heuristic**. It reads the end of a name,
  never the meaning, and will be wrong. `ontology.overrides:` is the correction.
- Four languages only: Python, JS/TS, PowerShell, Terraform. C, Rust, Go and Java
  repositories get nothing.
- `depends_on` comes from constructor parameters, imports and Terraform
  references. Wiring done at runtime by a container or a config file is missed.
- Coverage is advisory: an undocumented domain concept is a `warn` and never a
  `fail`, so nothing forces the documentation to be organised.

## Links

- Ticket: none; agreed in plan mode with the user before the build.
- Pull request: pending
- Related: DEC-0009
