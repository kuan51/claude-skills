# Archetypes and overlay tiers

The universal set is the floor. An archetype adds documents on top of it, scaled to
what the repo actually is. A 200-line PowerShell repo does not need arc42 and four
Diátaxis folders, and forcing them on it guarantees they rot.

The archetype is declared in `.docs-warden.yml` and the table lives in
`scripts/archetypes.py`. The hints below **propose** a value. Always show the
proposal and wait for confirmation before writing it.

An archetype the table does not know is a `required-files` **failure**, not a
silent fallback to the universal set. A one-character typo used to remove that
archetype's documents from the required set and report a pass.

**`(not checked)` means what it means in `standards.md`:** the archetype wants
that document, and no path test can prove it exists in any useful sense. A
generated API reference is real work that an empty `docs/reference/` would
satisfy. Those rows are carried in each entry's `unchecked` list and counted in
the scorecard's `required-files` reason, so this document and the audit report
the same number.

## it-tooling

PowerShell automation, IaC, internal scripts.

| Adds | Checked? |
|------|----------|
| `docs/runbook.md` | yes |
| a generated command reference (PowerShell comment-based help export, or `terraform-docs`) | **(not checked)** |

**Hints:** `*.ps1` / `*.psm1` / `*.tf` at or near the root; a `Dockerfile` with no
`src/`; no application entry point.

## service

A deployed thing that runs and serves requests.

| Adds | Checked? |
|------|----------|
| `docs/architecture/arc42.md` — the useful subset only, sections 1, 3, 5, 6, 7, 9 and 12; C4 diagrams as Mermaid | yes |
| a generated API reference (typedoc, DocFX, or an OpenAPI render) | **(not checked)** |
| `docs/how-to/` | **(not checked)** |
| `docs/reference/` | **(not checked)** |

**Hints:** web framework configuration, `Dockerfile` alongside `src/`, an OpenAPI
or gRPC specification, health-check endpoints.

## library

Something other code imports.

| Adds | Checked? |
|------|----------|
| `CHANGELOG.md` | yes |
| a generated API reference | **(not checked)** |
| `docs/tutorials/` | **(not checked)** |

`CHANGELOG.md` stays at the repository root while the rest of the universal set
lives under `docs/`: npm, GitHub releases, and `@semantic-release/changelog` all
look for it there by default. A repo that wants it under `docs/` must set
`changelogFile` explicitly, and the audit will then report it missing.

**Hints:** a package manifest with a library entry point and no service
configuration — no Dockerfile, no bind address, no deployment manifest.

## firmware

Code that runs on the device.

| Adds | Checked? |
|------|----------|
| `docs/architecture/` | yes |
| a hardware interface (ICD) section within it | **(not checked)** |
| a build-and-flash runbook | **(not checked)** |

**Hints:** embedded toolchain files, `*.c` / `*.h` / `*.rs` with board
configuration, linker scripts, a partition table.

## Adding an archetype

One entry in `scripts/archetypes.py`. The same discipline `standards.md` asks
for, for the same reason — the table is the contract, and prose that disagrees
with it is how people learn to distrust the scorecard:

- **`files` is a promise the check keeps.** Every path there is demanded of
  every repo declaring the archetype. Put a document in `files` only if its
  mere existence is worth something; a folder that will be created empty
  belongs in `unchecked`, or nowhere.
- **`unchecked` is the honest half.** Anything the archetype wants that a path
  test cannot verify goes here and gets a **(not checked)** row in the table
  above. The count is reported in the scorecard, so the two cannot drift.
- **Name the hints, and keep them observable.** An archetype is proposed from
  the file tree, which is why every entry sets `infer: True`. Never invent a
  hint that requires knowing something the repository does not show.
- **Do not add an archetype speculatively.** Four cover the repos this has met.
  A fifth should arrive with a real repository that the existing four describe
  badly, not with a guess about one.
- **Add a fixture or extend a test.** `required-files` is one check with two
  inputs, and the archetype half went untested until an unknown value was found
  passing.

The `infer` field is read by the `init` step in `SKILL.md`, not by any script.
It is there so a future archetype that must be *asked for* rather than proposed
has somewhere to say so, the way an IEC 62304 safety class does.

## Standards are overlays, not archetypes

A standard applies on top of any of the four above rather than replacing one.
Declare them under `standards:` in `.docs-warden.yml`; each has its own
artifact set, scaled by a level axis where it has one. See
`standards.md`.

**Hints:** `REQ-` tags in code or test names, references to IEC 62304 or the FDA, a
safety class already set, an existing `docs/regulatory/` tree.

Never infer a safety class and act on it. Ask. Getting this wrong in either
direction is expensive: false positive buries an IT repo in regulatory stubs, false
negative hides a gap in a device repo. Not every standard is like this --
`standards.md` says which may be proposed.

## On Diátaxis

Use the Diátaxis names — `tutorials/`, `how-to/`, `reference/`, `explanation/` —
only where the archetype above calls for a `docs/` tree, and only create the folders
that will actually hold something. Four empty folders are not a documentation
structure; they are four empty folders. This is why those rows are
**(not checked)**: a check that demanded them would manufacture exactly the empty
folders this paragraph warns against.

## On arc42

`service`, and IEC 62304 class B or C, only. Take the subset listed above. A full
arc42 with five empty sections is worse than a one-page architecture note that is
true.
