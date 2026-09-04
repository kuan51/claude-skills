# EU Cyber Resilience Act

An overlay on any archetype, declared under `standards:` in `.docs-warden.yml`
as `eu-cra: true`. See `../standards.md` for the mechanism.

Regulation (EU) 2024/2847, published free on EUR-Lex:
<https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng>. Annex references below are
the regulation's; the file paths are this plugin's.

## Two dates

- **11 September 2026** — reporting obligations apply. Manufacturers must report
  actively exploited vulnerabilities and severe incidents, including for products
  already on the market.
- **11 December 2027** — the essential requirements and conformity assessment
  apply in full.

**A passing check is not a conformity claim, and this overlay is not legal
advice.** It says nine documents exist. Conformity is assessed against the
regulation by people qualified to do it.

## Where this table came from

The Annex VII enumeration below was taken from a **secondary reproduction** of
the annex, not from the EUR-Lex text, which serves the regulation through
JavaScript and could not be read directly here. Confirm it against the
regulation before relying on it -- more so than the other overlays in this
directory, whose artifact lists were derived from their primary sources.

The two dates above, and the SBOM obligation in Annex I Part II(1), are
corroborated across several independent sources.

## No level axis

The CRA classifies products — default, important (Annex III class I and II), and
critical (Article 7) — but those classes select the **conformity assessment
route**, not the document set. Annex VII is the same either way. Encoding a class
here would imply a scaling the regulation does not have, so this standard takes
`true` and nothing else.

## Artifacts

From Annex VII's eight numbered points. Several are shared with other overlays,
marked below; where a repository declares both, the artifact is required once.

| Annex VII | Artifact | Also wanted by |
|-----------|----------|----------------|
| 1 | `docs/product-description.md` — intended purpose, versions affecting compliance, user information | |
| 2 | `docs/architecture/` — design and development | OSPS Baseline |
| 2 | `docs/vulnerability-handling.md` — the process, not the findings | |
| 2, 8 | `sbom/` — machine-readable, top-level dependencies at minimum, kept current (Annex I Pt II(1)) | IEC 62304 |
| 3 | `docs/security-assessment.md` — cybersecurity risk assessment | OSPS Baseline |
| 4 | `SUPPORT.md` — the support period | OSPS Baseline |
| 5 | `docs/applied-standards.md` — harmonised standards applied, and what was done where one was applied only in part | |
| 6 | `docs/verification/` — test reports | |
| 7 | `docs/declaration-of-conformity.md` — a pointer to the signed declaration | |

The **README** carries part of Annex VII.1 as well, and is already in the
universal set, so `required-files` checks it.

## What this overlay does not check

- **The ten-year retention obligation.** The technical documentation must be kept
  for ten years after the product is placed on the market. That is records
  management, and a repository check cannot see it. Nothing here enforces it —
  say where those records live.
- **Whether the SBOM is current.** The `standards` check tests that `sbom/` is
  non-empty, not that it matches the lock file. Same known gap as IEC 62304's
  SOUP list.
- **Contents of any document.** Every row above is an existence test.

## Overlap with IEC 62304

Both apply to a regulated medical device sold in the EU, and two paths differ for
what is the same work:

| This overlay | IEC 62304 |
|--------------|-----------|
| `docs/verification/` | `docs/regulatory/verification/` |
| — | `docs/regulatory/threat-model.md` (the OSPS Baseline asks for `docs/threat-model.md`) |

**Do not maintain two copies.** Where both apply, keep the regulatory tree and
make the other path a pointer to it. See `../standards.md`.
