# NIST SSDF

An overlay on any archetype, declared under `standards:` in `.docs-warden.yml`
as `nist-ssdf: true`. See `../standards.md` for the mechanism.

NIST SP 800-218 v1.1, *Secure Software Development Framework*. A US Government
work, so it carries no copyright and is free from
<https://csrc.nist.gov/projects/ssdf>. Practice and task ids below are NIST's;
the file paths are this plugin's.

## Why it is here

SSDF is what the CISA Secure Software Development Attestation Form points at, so
for anyone selling software to the US federal government this is an obligation
rather than a good idea.

**A passing check is not an attestation.** It says nine documents exist. The
attestation is a signed statement about practices, made by someone with the
authority to make it.

## No level axis

SSDF has no tiers. Its 19 practices decompose into 42 tasks, all of which apply;
what varies is how an organisation implements them. So this standard takes `true`
and nothing else.

## Artifacts

Only tasks that produce a document **in the repository** are checked. Most of the
42 do not — they are activities, tracker work, or pipeline configuration.

| Artifact | Practice | Also wanted by |
|----------|----------|----------------|
| `docs/security-requirements.md` | PO.1.1, PO.1.2, PO.1.3 | |
| `docs/MAINTAINERS.md` | PO.2.1 roles and responsibilities | OSPS Baseline |
| `docs/toolchain.md` | PO.3.1 toolchain, PO.3.2 its protection, PO.5.1 environments | |
| `docs/remediation-policy.md` | PO.4.1 criteria for security checks | OSPS Baseline |
| `docs/how-to/verify-release.md` | PS.2.1 verifying release integrity | OSPS Baseline |
| `sbom/` | PS.3.2 provenance data | IEC 62304, EU CRA |
| `docs/architecture/` | PW.1 design to meet security requirements | OSPS Baseline, EU CRA |
| `docs/threat-model.md` | PW.1.1 threat and attack-surface modelling | OSPS Baseline |
| `docs/vulnerability-handling.md` | RV.1.3 disclosure and remediation policy | EU CRA |

`docs/SECURITY.md` carries the intake side of RV.1 and is already in the
universal set, so `required-files` checks it.

## What this overlay does not check

Whole practices produce no repository document, and are **not represented above**:

- **PS.1** protecting code from tampering — access control on the repository.
- **PW.2, PW.4 – PW.9** — secure coding, code review, testing, compiler
  hardening, secure defaults. These are how the code is written and built. A
  document claiming they happen is not evidence that they did.
- **RV.2, RV.3** — analysing and remediating each vulnerability, and root-cause
  analysis. NIST's own examples point at the issue tracker for these, and
  copying a tracker into the repository leaves two records, one of them wrong.

Everything above is also an existence test. None of it reads what a document
says.

## Overlap with the OSPS Baseline

The Baseline is crosswalked to SSDF and covers more ground, most of it
configuration this plugin does not inspect. Declaring both is reasonable and the
artifacts merge: the Baseline is the broader posture checklist, SSDF the
attestation-shaped subset. Nothing needs to be maintained twice.
