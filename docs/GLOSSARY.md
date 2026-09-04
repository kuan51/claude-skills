---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Glossary

One word, one meaning. The `Do not use` column is what makes this enforceable
rather than decorative — it becomes the Vale reject list.

Seeded by hand: the `ontological-documentation` skill's concept extractor
returns code-structure entities (function and class names), not domain terms,
for this repository — there was nothing worth merging from its output. These
entries instead come from this repo's own plugin vocabulary as documented in
each plugin's `SKILL.md` and `references/`.

The `Do not use` column is intentionally left blank below: none of these terms
have a documented rejected synonym, and every candidate tried during scaffolding
("type" for Archetype, "app" for Plugin, "spec"/"report" for Decision
record/Scorecard) turned out to be an ordinary English word that collides with
unrelated real usage elsewhere in this repo ("SOC 2 Type II", "the desktop
app", planning documents literally named `*-design.md`). A rejected synonym
belongs here only once someone can name one that will not do that.

| Term | Definition | Do not use | Source |
|------|------------|------------|--------|
| Plugin | A self-contained unit under `plugins/<name>/` with its own `.claude-plugin/plugin.json`, installable independently. |  | [README.md](../README.md) |
| Marketplace | This repository, registered in Claude Code via `/plugin marketplace add`; the catalogue of installable plugins, declared in `.claude-plugin/marketplace.json`. |  | [README.md](../README.md) |
| Skill | A packaged set of instructions inside a plugin that Claude Code loads and can be invoked by name. |  | [plugins/docs-warden/skills/docs-warden/SKILL.md](../plugins/docs-warden/skills/docs-warden/SKILL.md) |
| Archetype | The repo shape (`it-tooling`, `service`, `library`, `firmware`) that determines which documents docs-warden requires beyond the universal set. |  | [references/archetypes.md](../plugins/docs-warden/skills/docs-warden/references/archetypes.md) |
| Standard (overlay) | A compliance framework (for example IEC 62304, OSPS Baseline) declared under `standards:` in `.docs-warden.yml`; adds required artifacts on top of an archetype and never removes any. |  | [references/standards.md](../plugins/docs-warden/skills/docs-warden/references/standards.md) |
| Decision record (ADR) | One immutable file at `docs/decisions/DEC-NNNN-slug.md` answering *why* a decision was made; never edited once `status: accepted`. |  | [references/adr-format.md](../plugins/docs-warden/skills/docs-warden/references/adr-format.md) |
| Scorecard | The Markdown table `audit.py` prints (and the accompanying `docs-scorecard.json`) reporting each check as `pass`, `warn`, `fail`, `waived`, or `skipped`. |  | [references/audit-schema.md](../plugins/docs-warden/skills/docs-warden/references/audit-schema.md) |
| Waiver | An excused check, recorded under `waivers:` in `.docs-warden.yml` with a reason; shows in the scorecard as `waived`, never as a silent pass. |  | [references/audit-schema.md](../plugins/docs-warden/skills/docs-warden/references/audit-schema.md) |
