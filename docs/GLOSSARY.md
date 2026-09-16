---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Glossary

One word, one meaning: the `Do not use` column is what makes this enforceable
rather than decorative, because it becomes the Vale reject list.

Seeded by hand. The `ontological-documentation` skill's extractor now ships with
docs-warden, and running it over this repository returns two domain concepts: one
PowerShell noun inside a test fixture, and one class in the extractor itself. Both
are code-structure entities, not this repository's vocabulary, so there is still
nothing to merge and `docs/architecture/domain-model.md` reports them as an
`ontology` warn rather than being tagged into a document that does not describe
them. The entries below come instead from this repo's own plugin vocabulary as
documented in each plugin's `SKILL.md` and `references/`.

`Concept` and `Category` were considered and rejected by the same test as the
synonyms below: both are ordinary English words that collide with unrelated real
usage in this repo.

The `Do not use` column is intentionally left blank below: none of these terms
have a documented rejected synonym, and every candidate tried during scaffolding
("type" for Archetype, "app" for Plugin, "spec"/"report" for Decision
record/Scorecard) turned out to be an ordinary English word that collides with
unrelated real usage elsewhere in this repo ("SOC 2 Type II," "the desktop
app," planning documents literally named `*-design.md`). A rejected synonym
belongs here only once someone can point to one that will not do that.

| Term | Definition | Do not use | Source |
|------|------------|------------|--------|
| Plugin | A self-contained unit under `plugins/<name>/` with its own `.claude-plugin/plugin.json`, installable independently. |  | [README.md](../README.md) |
| Marketplace | This repository, registered in Claude Code via `/plugin marketplace add`; the catalogue of installable plugins, declared in `.claude-plugin/marketplace.json`. |  | [README.md](../README.md) |
| Skill | A packaged set of instructions inside a plugin that Claude Code loads and can be invoked by name. |  | [plugins/docs-warden/skills/docs-warden/SKILL.md](../plugins/docs-warden/skills/docs-warden/SKILL.md) |
| Archetype | The repo type (`it-tooling`, `service`, `library`, `firmware`) that determines which documents docs-warden requires beyond the universal set. |  | [references/archetypes.md](../plugins/docs-warden/skills/docs-warden/references/archetypes.md) |
| Standard (overlay) | A compliance framework (such as IEC 62304, OSPS Baseline) declared under `standards:` in `.docs-warden.yml`. Adds required artifacts on top of an archetype and never removes any. |  | [references/standards.md](../plugins/docs-warden/skills/docs-warden/references/standards.md) |
| Decision record (ADR) | One immutable file at `docs/decisions/DEC-NNNN-slug.md` answering *why* a decision was made. Never edited once `status: accepted`. |  | [references/adr-format.md](../plugins/docs-warden/skills/docs-warden/references/adr-format.md) |
| Scorecard | The Markdown table `audit.py` prints (and the accompanying `docs-scorecard.json`) reporting each check as `pass`, `warn`, `fail`, `waived`, or `skipped`. |  | [references/audit-schema.md](../plugins/docs-warden/skills/docs-warden/references/audit-schema.md) |
| Domain model | The generated `docs/architecture/domain-model.md`: the repo's concepts split into domain and technical, how they relate, and which document describes each. |  | [ontological-documentation/SKILL.md](../plugins/docs-warden/skills/ontological-documentation/SKILL.md) |
| Waiver | An excused check, recorded under `waivers:` in `.docs-warden.yml` with a reason; shows in the scorecard as `waived`, never as a silent pass. |  | [references/audit-schema.md](../plugins/docs-warden/skills/docs-warden/references/audit-schema.md) |
