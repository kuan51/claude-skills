"""What each kind of repository is, as data.

The archetype scales the document set to what the repo actually is: a 200-line
PowerShell repo does not need arc42, and forcing it on one guarantees it rots.
Kept beside standards.py and read the same way -- audit.py walks this table and
never names an archetype itself.

See references/archetypes.md before adding one.
"""

ARCHETYPE_FILES = {
    "it-tooling": ["docs/runbook.md"],
    "service": ["docs/architecture/arc42.md"],
    # CHANGELOG stays at root: npm, GitHub releases, and
    # @semantic-release/changelog all look for it there by default.
    "library": ["CHANGELOG.md"],
    "firmware": ["docs/architecture/"],
}
