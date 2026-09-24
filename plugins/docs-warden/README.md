# docs-warden

Repository documentation governance: scaffold and audit a document set, and keep it
from drifting away from the code.

Most repositories collect documentation the same way: a README written on day one,
a decision nobody wrote down, a runbook that was true last quarter. Layout is the
easy half. Drift is the real problem. This plugin treats the parts that can be
generated as generated, and reports the rest rather than quietly rewriting it.

It scales what it asks for to what the repository actually is. A 200-line PowerShell
repo does not need arc42 and four Diátaxis folders, and forcing them on it guarantees
they rot.

## Skills

| Skill | Job |
|-------|-----|
| `docs-warden` | Scaffold, audit, and maintain a consistent document set per repo archetype. Keeps decision records append-only and indexed. |
| `clarity` | A plain-English writing standard for technical prose, plus the `Clarity` Vale style that enforces the machine-checkable part. |
| `ontological-documentation` | Map the repo's domain: which concepts exist, how they relate, and which document describes each. Generates `docs/architecture/domain-model.md` and seeds glossary rows. |

## Agents

| Agent | Model | Job |
|-------|-------|-----|
| `infra-inventory` | Haiku | Reads Terraform, Kubernetes/Helm and CI config and returns an inventory of how the infrastructure is wired, with `file:line` evidence, for filling an architecture document's deployment and context views. Read-only: `Read`, `Grep`, `Glob`, and nothing else. |

## Workflows

- **`init`**: detect the repo archetype, propose it, and scaffold only the missing
  documents.
- **`audit`**: score a repo against the standard and report what is missing, stale,
  or off-standard. Never fixes silently.
- **`maintain`**: find documents that drifted from changed code and propose edits.
- **`decide`**: scaffold and index records of architecture decisions. Runs on an
  explicit ask, or offers one when its own answers to a three-question
  admission test are all yes. It never writes without the human's yes. Development
  history stays in the pull request.
- **`compact`**: once `docs/decisions/` holds fifty decided records, move the oldest 25
  unchanged into `docs/decisions/archive/` and write one digest record carrying
  their outcomes and accepted gaps. A SessionStart hook says when it is due.

Repositories under a standard such as IEC 62304 take a further overlay, scaled by
safety class. It describes document *structure* only: every regulated template
marks where a qualified human has to supply the substance, and the skill will not
invent it.

## Domain model

`domain_model.py <repo> --write` generates `docs/architecture/domain-model.md`: a
table of domain concepts, a table of technical ones, and a Mermaid graph of how
they relate. Its `Documented in` column comes from a `concepts:` list in a
document's front matter, which is what turns the file into a map of the
documentation rather than only of the code. Concepts are read from Python,
JavaScript/TypeScript, PowerShell and Terraform; the domain/technical split is a
naming heuristic, corrected with `ontology.overrides:` in `.docs-warden.yml` and
never by editing the generated file. The document is optional, and the `ontology`
audit check reports it stale, untagged, or absent.

## Out of scope

Visual design. Colors, logos, Mermaid theming, badges, and product-name casing are
out of scope; if your project has a brand or style guide, that owns them.

**Organisational compliance.** This marketplace contains two plugins that both say
the word "standard," and the split is worth knowing before you pick one:

| | `docs-warden` | `ciso` |
|---|---|---|
| Scope | one repository's files | an organisation's control programme |
| Asks | does this repo contain the documents its standards require? | is this control implemented, and where is the evidence? |
| Standards | IEC 62304, OSPS Baseline, EU CRA, NIST SSDF | HITRUST CSF, SOC 2 Type II, ISO/IEC 27001, CMMC |
| Output | a scorecard per repo | a persistent dashboard per certification |

They do not overlap and neither reads the other's state. A repository question
("does this repo have an SBOM directory?") is this plugin. An organisational one
("who approves access reviews, and when did we last run one?") is `ciso`.

Neither answers *"are we compliant."* A passing `standards` row is an existence
test over file paths. See `skills/docs-warden/references/standards.md`.

## Scripts

Run with `python3`. Each takes a repo path and is safe to run repeatedly. They need
`pyyaml`.

```text
skills/docs-warden/scripts/audit.py       <repo> [<repo> ...]
skills/docs-warden/scripts/adr_index.py   <repo>
skills/docs-warden/scripts/adr_new.py     <repo> "<title>"
skills/docs-warden/scripts/freshness.py   <repo>
skills/docs-warden/scripts/trace_matrix.py <repo> [--write]
skills/docs-warden/scripts/glossary_to_vale.py <repo>
skills/ontological-documentation/scripts/domain_model.py <repo> [--write|--check]
skills/ontological-documentation/scripts/extract_concepts.py <path>
```

Each exits non-zero on failure, so CI can gate on it, though nothing wires them
into CI yet. See the known gap in
`skills/docs-warden/references/anti-drift.md`.

## Tests

```bash
python3 test/test_scripts.py
```

Assert-based, no framework; prints one line per check and exits non-zero on any
failure. `test/fixtures/` contains two small synthetic repos the scripts run against:
one IT-tooling, one regulated. All fixture data is synthetic, with no PHI,
real personal data, or secrets.

## Evals

`evals/` holds a `claude plugin eval` suite for the skills themselves: whether they
trigger on the right prompts and not on near-misses, and whether a run obeys the
non-negotiables (never fixes silently, never edits an accepted record, never fakes a
lint pass). It spends tokens and never runs under the unit tests. See
[evals/README.md](evals/README.md) for the commands and the WSL2 requirement.
