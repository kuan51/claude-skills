# Archetypes and overlay tiers

The universal set is the floor. An archetype adds documents on top of it, scaled to
what the repo actually is. A 200-line PowerShell repo does not need arc42 and four
Diátaxis folders, and forcing them on it guarantees they rot.

The archetype is declared in `.docs-warden.yml`. The hints below **propose** a
value. Always show the proposal and wait for confirmation before writing it.

## it-tooling

PowerShell automation, IaC, internal scripts.

**Adds:** `docs/runbook.md`, plus a generated command reference (PowerShell
comment-based help export, or `terraform-docs` for Terraform).

**Hints:** `*.ps1` / `*.psm1` / `*.tf` at or near the root; a `Dockerfile` with no
`src/`; no application entry point.

## service

A deployed thing that runs and serves requests.

**Adds:** `docs/architecture/arc42.md` — the useful subset only, sections 1, 3, 5,
6, 7, 9 and 12; C4 diagrams as Mermaid; a generated API reference (typedoc,
DocFX, or an OpenAPI render); `docs/how-to/`; `docs/reference/`.

**Hints:** web framework configuration, `Dockerfile` alongside `src/`, an OpenAPI
or gRPC specification, health-check endpoints.

## library

Something other code imports.

**Adds:** a generated API reference, `CHANGELOG.md`, `docs/tutorials/`.

`CHANGELOG.md` stays at the repository root while the rest of the universal set
lives under `docs/`: npm, GitHub releases, and `@semantic-release/changelog` all
look for it there by default. A repo that wants it under `docs/` must set
`changelogFile` explicitly, and the audit will then report it missing.

**Hints:** a package manifest with a library entry point and no service
configuration — no Dockerfile, no bind address, no deployment manifest.

## firmware

Code that runs on the device.

**Adds:** `docs/architecture/` including a hardware interface (ICD) section, and a
build-and-flash runbook.

**Hints:** embedded toolchain files, `*.c` / `*.h` / `*.rs` with board
configuration, linker scripts, a partition table.

## regulated: true

An overlay on any of the four above, not an archetype of its own. Its artifact set
is scaled by `safety_class` and specified separately.

**Hints:** `REQ-` tags in code or test names, references to IEC 62304 or the FDA, a
`safety_class` already set, an existing `docs/regulatory/` tree.

Never infer `regulated: true` and act on it. Ask. Getting this wrong in either
direction is expensive: false positive buries an IT repo in regulatory stubs, false
negative hides a gap in a device repo.

## On Diátaxis

Use the Diátaxis names — `tutorials/`, `how-to/`, `reference/`, `explanation/` —
only where the archetype above calls for a `docs/` tree, and only create the folders
that will actually hold something. Four empty folders are not a documentation
structure; they are four empty folders.

## On arc42

`service` and regulated class B or C only. Take the subset listed above. A full
arc42 with five empty sections is worse than a one-page architecture note that is
true.
