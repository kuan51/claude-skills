# OSPS Baseline

An overlay on any archetype, declared under `standards:` in `.docs-warden.yml`
as `osps-baseline: <level>` and scaled by that maturity level. See
`../standards.md` for the mechanism.

Derived from the **Open Source Project Security Baseline v2026.08.28**,
published by the OpenSSF under Apache-2.0 at
<https://github.com/ossf/security-baseline>. Control ids below are theirs; the
file paths are this plugin's.

## Currency warning

The Baseline is versioned and moves. This overlay encodes **v2026.08.28** and
nothing here detects a newer release. Check the published version before
treating this table as current.

**A passing check is not a conformity claim.** It says the documents exist. It
does not say they say the right things, and the Baseline's own assessment
requirements are about content this plugin never reads.

## Maturity levels

Levels come from the project's shape, not from a hazard analysis, so unlike an
IEC 62304 safety class this one may be **proposed** from what the repository
shows — then confirmed, never assumed:

| Level | For |
|-------|-----|
| 1 | Any project, any number of maintainers or users |
| 2 | At least two maintainers and a small, consistent user base |
| 3 | A large, consistent user base |

## Artifacts by level

Levels are cumulative. Rows marked **(not checked)** are Baseline requirements
this overlay declares but cannot verify — they are about the *content* of a
document, or about something that is not a file at all. A row without the marker
is a promise the `standards` check keeps.

| Artifact | Control | 1 | 2 | 3 |
|----------|---------|---|---|---|
| `CONTRIBUTING.md` (or `CONTRIBUTING/`) | GV-03.01 | yes | yes | yes |
| `LICENSE` (or `COPYING`, `LICENSES/`, `LICENSE/`) | LE-02, LE-03 | yes | yes | yes |
| `docs/SECURITY.md` — already in the universal set, so `required-files` checks it | VM-02.01 | yes | yes | yes |
| User guides **(not checked)** — only approximated by `readme-shape`, which is a `warn` under another check | DO-01.01 | yes | yes | yes |
| A defect-reporting guide **(not checked)** | DO-02.01 | yes | yes | yes |
| A public discussion mechanism **(not checked)** — not a repository file | GV-02.01 | yes | yes | yes |
| `docs/MAINTAINERS.md` | GV-01.01, .02 | – | yes | yes |
| `docs/dependencies.md` | DO-06.01 | – | yes | yes |
| `docs/how-to/build.md` | DO-07.01 | – | yes | yes |
| `docs/architecture/` | SA-01.01 | – | yes | yes |
| `docs/reference/` | SA-02.01 | – | yes | yes |
| `docs/security-assessment.md` | SA-03.01 | – | yes | yes |
| Contributor requirements **(not checked)** — content of `CONTRIBUTING.md` | GV-03.02 | – | yes | yes |
| A CVD policy with a response timeframe **(not checked)** — content of `docs/SECURITY.md` | VM-01.01 | – | yes | yes |
| A private reporting channel **(not checked)** — a setting, not a file | VM-03.01 | – | yes | yes |
| Published vulnerabilities **(not checked)** — an external channel | VM-04.01 | – | yes | yes |
| `SUPPORT.md` | DO-04.01, DO-05.01 | – | – | yes |
| `docs/threat-model.md` | SA-03.02 | – | – | yes |
| `docs/how-to/verify-release.md` | DO-03.01, .02 | – | – | yes |
| `docs/remediation-policy.md` | VM-05.01, VM-06.01 | – | – | yes |
| A permission-review policy **(not checked)** — content of `docs/MAINTAINERS.md` | GV-04.01 | – | – | yes |
| VEX documents **(not checked)** | VM-04.02 | – | – | yes |

## Control families this overlay leaves out

The Baseline is broader than documentation. Three families are **deliberately
not represented**, because they govern repository settings and pipeline
configuration that this plugin does not inspect:

- **OSPS-AC** — access control: branch protection, MFA, token scopes.
- **OSPS-BR** — build and release: pipeline hardening, signed releases.
- **OSPS-QA** — quality assurance, except where a control produces a document.

Anyone comparing this table against the published Baseline will find those
missing. That is by design, not an omission — but it means **this overlay
passing is not the Baseline passing**. Use the OpenSSF's own tooling for the
parts that are configuration.

## Overlap with other standards

The Baseline is officially crosswalked to the EU CRA, NIST SSDF, NIST CSF,
SP 800-161, SLSA and OWASP SAMM, with mappings published alongside each release.
Where a repository declares both the Baseline and one of those, the artifacts
overlap rather than conflict: the check takes the union and requires each path
once.

One path disagrees. IEC 62304 keeps its threat model at
`docs/regulatory/threat-model.md`; this overlay asks for `docs/threat-model.md`.
They mean the same document — where both apply, keep the regulatory copy and
make the other a pointer. See `../standards.md`.
