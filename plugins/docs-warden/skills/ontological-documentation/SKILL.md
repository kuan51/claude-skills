---
name: ontological-documentation
description: Maps a repository's domain -- which concepts exist, how they relate, and which document describes each -- into a generated docs/architecture/domain-model.md, and seeds glossary rows from the domain half. Use for "domain model", "what concepts does this repo have", "how do the components relate", "map the docs to the code", "seed the glossary", "extract concepts". Reads Python, JavaScript/TypeScript, PowerShell and Terraform. Used by docs-warden's init and maintain modes, and directly on an explicit ask.
---

# Ontological documentation

A repository's documentation is worth more when you can say which document
describes which concept. This skill answers that from the code, not from memory.

## What it produces

- `docs/architecture/domain-model.md`: a generated document with a table of domain
  concepts, a table of technical ones, a `Documented in` column naming the
  documents tagged with each concept, and a Mermaid relationship graph.
- Glossary rows: one per domain concept `docs/GLOSSARY.md` does not already carry,
  with the concept's first docstring line as the definition and its `file:line` as
  the source.

Done means: the generated document is committed and `domain_model.py --check`
exits 0, and every glossary row a human wrote is untouched.

## Scripts

They live in the installed plugin, never in the target repo:

```text
${CLAUDE_PLUGIN_ROOT}/skills/ontological-documentation/scripts/
```

| Script | Does | Writes |
|--------|------|--------|
| `scripts/extract_concepts.py <path>` | Prints the ontology JSON below to stdout. Nothing else on stdout. | Nothing |
| `scripts/domain_model.py <repo>` | Prints the domain model document. | Nothing |
| `scripts/domain_model.py <repo> --write` | Same, to disk. Idempotent: a second run gives an empty diff. | `docs/architecture/domain-model.md` |
| `scripts/domain_model.py <repo> --check` | Exits 1 when the committed document is stale or hand-edited, 2 when no readable source exists, 0 when current. | Nothing |

The JSON:

```json
{
  "sources": {"python": 3, "javascript": 0, "powershell": 1, "terraform": 2},
  "concepts": {
    "CertRotation": {"kind": "noun", "category": "domain", "language": "powershell",
                     "defined_in": "src/CertRotate.psm1:2", "summary": ""},
    "Invoke-CertRotation": {"kind": "function", "category": "technical",
                            "language": "powershell",
                            "defined_in": "src/CertRotate.psm1:2", "summary": ""}
  },
  "relationships": {"is_a": [], "part_of": [], "depends_on": [], "associates_with": []}
}
```

Each relationship entry is `{"subject": ..., "object": ...}`, both of them concept
names. An edge pointing at something that is not a concept here is dropped: an
external library is not this repository's domain.

## Domain or technical

A concept is technical when it is a function, a Terraform resource, or its name
ends with a role suffix (`Service`, `Repository`, `Gateway`, `Config`, and the rest
of the table in `references/concept-categories.md`). Everything else is domain. A
Terraform `module` is always domain.

## Limits, stated plainly

- The category is a **naming heuristic**. It reads the end of a name, never the
  meaning. Expect to correct it.
- Languages read: Python, JavaScript/TypeScript, PowerShell, Terraform. A C, Rust,
  Go or Java repository yields nothing, and the `ontology` audit check reports
  `skipped` rather than a failure.
- `depends_on` comes from constructor parameters, imports and Terraform
  references. Wiring done at runtime by a container or a config file is missed.
- `summary` is the first docstring line, a PowerShell `.SYNOPSIS`, or a Terraform
  `description`. Where there is none, the cell is empty.

## Boundaries

- **Never invent a definition.** A summary comes from the code or stays empty. An
  empty cell is a true statement; a plausible sentence is not.
- **Never overwrite a glossary row a human wrote.** Merge by term, add only what is
  missing.
- **Never hand-edit `docs/architecture/domain-model.md`.** It carries the generated
  marker. Fix a wrong row by renaming the thing in code, or with
  `ontology.overrides:` in `.docs-warden.yml` (`{ConceptName: domain|technical|ignore}`).
- **Never widen the scope on a guess.** `ontology.source_paths:` in the manifest is
  the only way to narrow the walk, and it is optional.

## Standalone use

"Map this repo's domain" or "what concepts does this have": run
`domain_model.py <repo>` and show the two tables and the graph. Offer `--write`;
do not write without a yes.

## References

- `references/concept-categories.md`: the suffix table the extractor implements,
  and what the extractor cannot see.
- `../docs-warden/SKILL.md`: the init and maintain modes that call this one.
- `../docs-warden/references/audit-schema.md`: the `ontology` check, which is how a
  stale or untagged model is reported.
