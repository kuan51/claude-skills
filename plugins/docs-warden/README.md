# docs-warden

Repository documentation governance: scaffold a document set, audit it, and keep it
from drifting away from the code.

Most repositories collect documentation the same way — a README written on day one,
a decision nobody wrote down, a runbook that was true last quarter. Layout is the
easy half; drift is the real problem. This plugin treats the parts that can be
generated as generated, and reports the rest rather than quietly rewriting it.

It scales what it asks for to what the repository actually is. A 200-line PowerShell
repo does not need arc42 and four Diátaxis folders, and forcing them on it guarantees
they rot.

## Skills

| Skill | Job |
|-------|-----|
| `docs-warden` | Scaffold, audit, and maintain a consistent document set per repo archetype. Keeps decision records append-only and indexed. |
| `clarity` | A plain-English writing standard for technical prose, plus the `Clarity` Vale style that enforces the machine-checkable part. |

## What it does

- **`init`** — detect the repo archetype, propose it, and scaffold only the missing
  documents.
- **`audit`** — score a repo against the standard and report what is missing, stale,
  or off-standard. Never fixes silently.
- **`maintain`** — find documents that drifted from changed code and propose edits.
- **`decide`** — scaffold and index architecture decision records.

Repositories under a standard such as IEC 62304 take a further overlay, scaled by
safety class. It describes document *structure* only — every regulated template
marks where a qualified human has to supply the substance, and the skill will not
invent it.

## What it does not do

Visual design. Colors, logos, Mermaid theming, badges, and product-name casing are
out of scope; if your project has a brand or style guide, that owns them.

**Organisational compliance.** This marketplace holds two plugins that both say
the word "standard", and the split is worth knowing before you pick one:

| | `docs-warden` | `ciso` |
|---|---|---|
| Scope | one repository's files | an organisation's control programme |
| Asks | does this repo hold the documents its standards require? | is this control implemented, and where is the evidence? |
| Standards | IEC 62304, OSPS Baseline, EU CRA, NIST SSDF | HITRUST CSF, SOC 2 Type II, ISO/IEC 27001, CMMC |
| Output | a scorecard per repo | a persistent dashboard per certification |

They do not overlap and neither reads the other's state. A repository question
("does this repo have an SBOM directory?") is this plugin. An organisational one
("who approves access reviews, and when did we last run one?") is `ciso`.

Neither answers *"are we compliant"*. A passing `standards` row is an existence
test over file paths — see `skills/docs-warden/references/standards.md`.

## Scripts

Run with `python3`; each takes a repo path and is safe to run repeatedly. They need
`pyyaml`.

```text
skills/docs-warden/scripts/audit.py       <repo> [<repo> ...]
skills/docs-warden/scripts/adr_index.py   <repo>
skills/docs-warden/scripts/adr_new.py     <repo> "<title>"
skills/docs-warden/scripts/freshness.py   <repo>
skills/docs-warden/scripts/trace_matrix.py <repo> [--write]
skills/docs-warden/scripts/glossary_to_vale.py <repo>
```

Each exits non-zero on failure, so CI can gate on it — though nothing wires them
into CI yet. See the known gap in
`skills/docs-warden/references/anti-drift.md`.

## Tests

```bash
python3 test/test_scripts.py
```

Assert-based, no framework; prints one line per check and exits non-zero on any
failure. `test/fixtures/` holds two small synthetic repos the scripts run against —
one IT-tooling, one regulated. All fixture data is synthetic. No PHI, no real
personal data, no secrets.
