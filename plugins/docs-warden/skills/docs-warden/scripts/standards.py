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
}
