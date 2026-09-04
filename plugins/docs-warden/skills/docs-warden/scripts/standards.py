"""The compliance standards docs-warden can enforce, as data.

Adding a standard is a dict entry here: the artifact paths it wants, its level
axis if it has one, and the names of any extra rules only it needs. audit.py's
check_standards walks this table and never names a standard itself.

**Nothing here reproduces a standard's text.** Every entry names file paths --
what a document set looks like on disk -- which is what makes an overlay for a
paid standard shippable in a public plugin at all. See references/standards.md
before adding one.
"""

# Paths wanted by more than one standard, named once so the union dedupes and a
# move stays a single edit. Entries below reference these, never the literal.
SBOM = "sbom/"
ARCHITECTURE_DIR = "docs/architecture/"
ARC42 = "docs/architecture/arc42.md"

# IEC 62304 keeps its threat model under docs/regulatory/ with the rest of its
# design history. Another standard asking for a threat model at docs/ is a
# documented overlap, not a second document -- see references/standards.md.
REGULATORY_THREAT_MODEL = "docs/regulatory/threat-model.md"
THREAT_MODEL = "docs/threat-model.md"

REFERENCE_DIR = "docs/reference/"
SECURITY_ASSESSMENT = "docs/security-assessment.md"
SUPPORT = "SUPPORT.md"

# A tuple means any one of these satisfies the artifact. Both spellings below
# are the ones the OSPS Baseline names as acceptable locations.
LICENSE = ("LICENSE", "COPYING", "LICENSES/", "LICENSE/")
CONTRIBUTING = ("CONTRIBUTING.md", "CONTRIBUTING/")

PRODUCT_DESCRIPTION = "docs/product-description.md"
VULNERABILITY_HANDLING = "docs/vulnerability-handling.md"
APPLIED_STANDARDS = "docs/applied-standards.md"
DECLARATION_OF_CONFORMITY = "docs/declaration-of-conformity.md"
VERIFICATION_DIR = "docs/verification/"

_IEC_62304_A = [
    "docs/regulatory/software-development-plan.md",
    "docs/regulatory/requirements/",
    "docs/regulatory/soup.md",
    REGULATORY_THREAT_MODEL,
    "docs/regulatory/ddf-index.md",
    SBOM,
    "docs/regulatory/verification/unit.md",
]
_IEC_62304_B = _IEC_62304_A + [
    ARC42,
    "docs/regulatory/verification/integration.md",
    "docs/regulatory/verification/system.md",
]
_IEC_62304_C = _IEC_62304_B + ["docs/architecture/detailed-design.md"]

# OSPS Baseline v2026.08.28, Apache-2.0, from ossf/security-baseline.
# Only the documentation-shaped control families are represented: DO, GV, LE,
# SA and VM. AC, BR and most of QA govern repository settings and CI
# configuration, which this plugin does not inspect and should not pretend to.
# references/standards/osps-baseline.md lists what that leaves unchecked.
_OSPS_1 = [
    CONTRIBUTING,               # OSPS-GV-03.01
    LICENSE,                    # OSPS-LE-02, OSPS-LE-03
]
_OSPS_2 = _OSPS_1 + [
    "docs/MAINTAINERS.md",      # OSPS-GV-01.01, .02
    "docs/dependencies.md",     # OSPS-DO-06.01
    "docs/how-to/build.md",     # OSPS-DO-07.01
    ARCHITECTURE_DIR,           # OSPS-SA-01.01
    REFERENCE_DIR,              # OSPS-SA-02.01
    SECURITY_ASSESSMENT,        # OSPS-SA-03.01
]
_OSPS_3 = _OSPS_2 + [
    SUPPORT,                    # OSPS-DO-04.01, OSPS-DO-05.01
    THREAT_MODEL,               # OSPS-SA-03.02
    "docs/how-to/verify-release.md",   # OSPS-DO-03.01, .02
    "docs/remediation-policy.md",      # OSPS-VM-05.01, OSPS-VM-06.01
]

# Regulation (EU) 2024/2847, free from EUR-Lex. Paths follow Annex VII's eight
# numbered points; the comment on each row says which. No level axis: the CRA's
# risk classes (default, important class I and II, critical) select the
# conformity assessment route, not the document set, so encoding one here would
# imply a scaling the regulation does not have.
_EU_CRA = [
    PRODUCT_DESCRIPTION,          # VII.1  general description, purpose, versions
    ARCHITECTURE_DIR,             # VII.2  design and development
    VULNERABILITY_HANDLING,       # VII.2  vulnerability handling processes
    SBOM,                         # VII.2 and VII.8, and Annex I Pt II(1)
    SECURITY_ASSESSMENT,          # VII.3  cybersecurity risk assessment
    SUPPORT,                      # VII.4  support period
    APPLIED_STANDARDS,            # VII.5  standards and specifications applied
    VERIFICATION_DIR,             # VII.6  test reports
    DECLARATION_OF_CONFORMITY,    # VII.7  EU declaration of conformity
]

STANDARDS = {
    "iec-62304": {
        "name": "IEC 62304",
        "level_name": "safety class",
        # A hazard assignment made outside the repository. The skill proposes
        # an archetype; it must never propose this. See SKILL.md's init step.
        "infer": False,
        "levels": {"A": _IEC_62304_A, "B": _IEC_62304_B, "C": _IEC_62304_C},
        "extra": ["qms_record", "trace_requirements"],
        "reference": "references/standards/iec-62304.md",
    },
    "osps-baseline": {
        "name": "OSPS Baseline",
        "level_name": "maturity level",
        # Keyed on maintainer and user count, both observable from the repo, so
        # this one may be proposed -- then confirmed, like the archetype.
        "infer": True,
        "source_version": "v2026.08.28",
        "levels": {"1": _OSPS_1, "2": _OSPS_2, "3": _OSPS_3},
        "extra": [],
        "reference": "references/standards/osps-baseline.md",
    },
    "eu-cra": {
        "name": "EU Cyber Resilience Act",
        "level_name": None,
        # Whether a product is placed on the EU market is a commercial fact the
        # repository cannot show. Ask.
        "infer": False,
        "source_version": "Regulation (EU) 2024/2847",
        "levels": None,
        "artifacts": _EU_CRA,
        "extra": [],
        "reference": "references/standards/eu-cra.md",
    },
}
