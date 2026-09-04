---
name: docs-warden
description: Maintain repository documentation consistently across a repo or a fleet of them. Use when scaffolding docs for a repo, auditing documentation, checking what docs are missing or stale, recording an architecture decision, or updating docs after a code change. Triggers on README, docs folder, CONVENTIONS, RUNLOG, GLOSSARY, SECURITY.md, CODEOWNERS, ADR, decision record, "document this repo", "set up documentation", "scaffold docs", "audit our docs", "what's missing from our docs", "is this repo compliant", "docs are out of date", "the README is wrong", "record a decision", "new ADR", "why did we choose", and on any request to create, review, or fix repository documentation even when the word documentation is not used.
---

# Docs Warden

Keep documentation consistent across your repositories, and keep it from drifting
away from the code. Layout is the easy half. Drift is the real problem.

Repositories fall into two worlds and both are in scope:

- **Regulated product repos** — device firmware, edge services, web apps, anything
  carrying `REQ-<AREA>-NNN` traceability IDs under a standard such as IEC 62304.
- **Internal IT and infrastructure repos** — PowerShell automation, IaC, MCP
  servers, tooling.

## Boundaries

**This skill will:** propose and scaffold a document set, audit a repo against the
standard, regenerate generated documents, scaffold and index decision records, and
flag documents that have drifted from the code they describe.

**This skill will not:** invent regulatory content, write clinical or legal claims,
edit an accepted decision record, fix findings without asking, or govern visual
design. Colors, logos, Mermaid theming, badges, and product-name casing are out of
scope; if your project has a brand or style guide, that owns them.

## Non-negotiables

1. **Never fix silently.** Audit reports findings and offers. The human chooses.
2. **Never fake a pass.** A check whose tool is not installed reports `skipped`,
   never `pass`.
3. **No PHI, no real patient data, no secrets** in any template, fixture, or
   example. Synthetic data only.
4. **Accepted decision records are immutable.** See `references/adr-format.md`.
5. **Do not write to the target repo's `docs/RUNLOG.md`.** Git already records
   document edits through the commit and the PR. The run log is for operational actions that
   leave no commit behind. Duplicating doc edits there only makes it grow.

## Modes

Pick the mode from what the human asked for. When it is ambiguous, ask.

### `init` — scaffold documentation

Triggered by "scaffold docs", "set up documentation", "document this repo".

1. Detect the archetype from the file tree (`references/archetypes.md`).
2. **Show the proposal and wait for confirmation.** Archetype, owner, which
   standards apply and at what level, and the exact file list you intend to
   create. Never write `.docs-warden.yml` from a guess.
   Some levels may be proposed and some must be asked for --
   `references/standards.md` says which. An IEC 62304 safety class is never
   proposed: it comes from a hazard analysis outside the repository.
3. Write `.docs-warden.yml`.
4. Create only the **missing** files from `assets/templates/`. Never overwrite an
   existing document; list what you skipped and why.
   Copy `assets/lint/` into place, and `assets/ci/.pre-commit-config.yaml` to the
   repo root; `pre-commit install` then runs the three linters before each push.
   **Never copy `scripts/` into the target repo.** A copy buys nothing and forks
   from the skill the moment anyone edits it — run them from the installed plugin
   instead. See `references/anti-drift.md` for what this does and does not
   enforce in CI.
   The `.vale.ini` sets `BasedOnStyles = Clarity, Microsoft, write-good`,
   so copy `../clarity/assets/vale/styles/Clarity/` into the
   repo's `styles/` directory **before** running
   `scripts/glossary_to_vale.py <repo>` to generate the vocabulary — that
   script overwrites `styles/Clarity/GlossaryTerms.yml`, and the copied
   one ships as an empty stub, so generating first would get silently
   reverted by the copy. Then run `vale sync` to fetch the Microsoft and
   write-good packages named in `Packages =`. Skip the copy or `vale sync`
   and `vale` cannot resolve `BasedOnStyles`; skip `glossary_to_vale.py` and
   `Vocab = Project` has no vocabulary directory to load.
5. Seed `docs/GLOSSARY.md` — see **Glossary seeding** below.
6. Run `scripts/audit.py` and show the scorecard.

### `audit` — report what is wrong

Triggered by "audit docs", "check compliance", "what's missing", "is this repo
ready for review".

Run `scripts/audit.py <repo>`. Present the Markdown table. For each `fail` and
`warn`, offer the fix and wait. See `references/audit-schema.md` for what each
check means and what a fix looks like.

Aggregate mode takes several repo paths and emits one row per repo. That is the
cross-repo view.

### `maintain` — docs drifted from code

Triggered by "docs are stale", "the README is wrong", or a code change that touched
documented behavior.

1. Get the changed paths and identifiers (`git diff --name-only`, then grep the
   changed symbols).
2. Grep `docs/` and the root documents for references to those paths and
   identifiers. Those are your candidates.
3. Run `scripts/freshness.py` for documents past `review_by` or older than the code
   they describe.
4. Propose specific edits. Do not rewrite wholesale.
5. Regenerate everything marked `generated: true`, plus `scripts/adr_index.py`.
6. Re-run `audit.py`.

### `decide` — record a decision

Triggered by "record a decision", "new ADR", "why did we choose".

1. `scripts/adr_new.py <repo> "<title>"` scaffolds the next `DEC-NNNN`.
2. Fill the sections **with the human**, not from assumption. Considered options,
   consequences good and bad, and gaps accepted are the sections that carry the
   value; a decision record without rejected alternatives is a note, not a record.
3. Leave `status: proposed` until they say it is accepted.
4. Re-run `scripts/adr_index.py`.

If the repo has a monolithic hand-written decision log with `DEC-NNN` entries,
offer to split it into one file per entry, preserving IDs and dates. Ask first.

## The universal set

Every repo, both worlds, gets these. Full specification in
`references/universal-set.md`; templates in `assets/templates/`.

| File | Job |
|------|-----|
| `README.md` | Front door. Purpose, quick start, links into `docs/`. Root, because GitHub renders it nowhere else. |
| `docs/CONVENTIONS.md` | Current state. Edited in place. No history. |
| `docs/decisions/DEC-NNNN-slug.md` | Why. One file per decision, immutable once accepted. |
| `docs/decisions/README.md` | **Generated** signpost pointing at the index. No table, no counts. |
| `docs/DECISIONS.md` | **Generated** index of those records. Never hand-edited. |
| `docs/RUNLOG.md` | What happened outside git. Append-only, `PLANNED` then `CONFIRMED`. |
| `docs/GLOSSARY.md` | One word, one meaning. |
| `docs/SECURITY.md` | Reporting route and posture. GitHub reads it from `docs/` as well as the root. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Forces docs into the same PR. |
| `.github/CODEOWNERS` | Review gate on `docs/`. |
| `.docs-warden.yml` | The manifest that drives all of the above. |

Archetype overlays add to this set; they never remove from it. See
`references/archetypes.md`. A repository may also declare one or more
standards, each adding its own artifacts -- see `references/standards.md`.

### Migrating a repo scaffolded before the docs/ move

An older scaffold put these files at the repository root, and generated a full
second copy of the index at `docs/decisions/README.md` rather than a pointer.
`audit.py` reports `required-files` as failing until the repo is moved over. There
is no automatic migration -- three commands, the last of which rewrites both
generated files:

```bash
mkdir -p docs
git mv CONVENTIONS.md DECISIONS.md GLOSSARY.md RUNLOG.md SECURITY.md docs/
python3 scripts/adr_index.py .
```

Then fix the two files that name the old paths: the README's documentation table,
and `.github/CODEOWNERS`, where the five per-file lines collapse into the `/docs/`
line already there.

## Scripts

They live in the installed plugin, never in the target repo:

```
${CLAUDE_PLUGIN_ROOT}/skills/docs-warden/scripts/
```

Every `scripts/...` path in this document is relative to that directory. They are
not currently wired into CI — see the known gap in `references/anti-drift.md`.

Run with `python3`. Each takes a repo path. `audit.py --run-generators`
EXECUTES commands from the audited repo's `.docs-warden.yml`. Show those
commands to the human before running them on a repository you did not write.

| Script | Does | Writes |
|--------|------|--------|
| `scripts/audit.py <repo> [...]` | Scorecard to stdout and `docs-scorecard.json`. Multiple paths gives the aggregate view. | `docs-scorecard.json` (default `--json-out` path). With `--run-generators`, also EXECUTES repo-supplied commands. |
| `scripts/adr_index.py <repo>` | Regenerates `docs/DECISIONS.md` (the full table) and `docs/decisions/README.md` (a short pointer to it). Idempotent — a second run must produce no diff. | `docs/DECISIONS.md`, `docs/decisions/README.md` |
| `scripts/adr_new.py <repo> "<title>"` | Scaffolds the next `DEC-NNNN` file. | A new `docs/decisions/DEC-NNNN-*.md` |
| `scripts/freshness.py <repo>` | Documents past `review_by`, or older than the code they reference. | Nothing |

Two more scripts live in `scripts/` but aren't part of the day-to-day set above:

| Script | Does | Writes |
|--------|------|--------|
| `scripts/trace_matrix.py <repo> [--write]` | Builds the requirements traceability matrix. | Nothing by default; with `--write`, `docs/regulatory/traceability-matrix.md` |
| `scripts/glossary_to_vale.py <repo>` | Turns `GLOSSARY.md` into Vale vocabulary and swap rules. | `styles/config/vocabularies/Project/{accept,reject}.txt`, `styles/Clarity/GlossaryTerms.yml` |

`audit.py`, `adr_index.py --check`, `freshness.py` and `trace_matrix.py` exit
non-zero on a finding, so CI can gate on them. `adr_new.py` and
`glossary_to_vale.py` exit non-zero only on bad input.

## Anti-drift

The standard only holds if something enforces it. `references/anti-drift.md` covers
the linters, the freshness rules, and what is not yet enforced in CI. The load-bearing idea: anything
that can be generated **is** generated, and CI regenerates it and fails on a
non-empty diff. A generated document that someone can hand-edit will be hand-edited.

## Glossary seeding

If the `ontological-documentation` skill is installed, use it rather than inventing
terms. Its `extract_concepts.py` takes one positional path and prints ontology JSON
to stdout followed by a Mermaid diagram after a literal `--- Mermaid Diagram ---`
separator; split on that separator and keep the JSON half. It has no `--output`
flag. Seed `docs/GLOSSARY.md` from **domain** entities only, not technical ones, and
merge by term — never overwrite a definition a human has edited.

If the skill is not installed, create the empty `docs/GLOSSARY.md` template and
skip the ontology step; nothing is recorded in the scorecard. Do not guess domain
terms.

## References

- `references/universal-set.md` — what each required file must contain.
- `references/archetypes.md` — the four archetypes, their overlays, detection hints.
- `references/adr-format.md` — decision record format and the immutability rule.
- `references/audit-schema.md` — every check, its meaning, and its fix.
- `references/anti-drift.md` — linters, freshness, ownership, and the CI gap.
- `references/standards.md` — how overlays are declared, and how to add one.
- `references/standards/iec-62304.md` — IEC 62304 artifacts by safety class.
- `references/standards/osps-baseline.md` — OSPS Baseline artifacts by maturity
  level, and the control families it leaves out.
- `references/standards/eu-cra.md` — EU CRA Annex VII artifacts, the two dates,
  and what the overlay cannot check.
- `../clarity/SKILL.md` — the plain-English writing standard, and the source of the
  `Clarity` Vale style this skill's `.vale.ini` depends on.
