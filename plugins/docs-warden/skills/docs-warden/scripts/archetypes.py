"""What each kind of repository is, as data.

The archetype scales the document set to what the repo actually is: a 200-line
PowerShell repo does not need arc42, and forcing it on one guarantees it rots.
Kept beside standards.py and read the same way -- audit.py walks this table and
never names an archetype itself.

Each entry has:

  files      paths required-files demands. Checked.
  unchecked  documents the archetype wants that no path test can verify -- a
             generated API reference is real work, but "there is a file at
             docs/reference/" does not prove it happened. Named here so the
             count is reported rather than implied, and so a reader comparing
             references/archetypes.md against the audit finds the two agree.

See references/archetypes.md before adding one.
"""

ARCHETYPES = {
    "it-tooling": {
        "files": ["docs/runbook.md"],
        "unchecked": [
            "a generated command reference (PowerShell comment-based help "
            "export, or terraform-docs)",
        ],
    },
    "service": {
        "files": ["docs/architecture/arc42.md"],
        "unchecked": [
            "a generated API reference (typedoc, DocFX, or an OpenAPI render)",
            "docs/how-to/",
            "docs/reference/",
        ],
    },
    "library": {
        # CHANGELOG stays at root: npm, GitHub releases, and
        # @semantic-release/changelog all look for it there by default.
        "files": ["CHANGELOG.md"],
        "unchecked": [
            "a generated API reference",
            "docs/tutorials/",
        ],
    },
    "firmware": {
        "files": ["docs/architecture/"],
        "unchecked": [
            "a hardware interface (ICD) section within docs/architecture/",
            "a build-and-flash runbook",
        ],
    },
}
