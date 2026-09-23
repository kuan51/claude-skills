# Archetypes and overlay tiers

The universal set is the floor. An archetype adds documents on top of it, scaled to
what the repo actually is. A 200-line PowerShell repo does not need arc42 and four
Diátaxis folders, and forcing them on it guarantees they rot.

The archetype is declared in `.docs-warden.yml` and the table is defined in
`scripts/archetypes.py`. The hints below **propose** a value. Always show the
proposal and wait for confirmation before writing it.

An archetype the table does not know is a `required-files` **failure**, not a
silent fallback to the universal set. A one-character typo used to remove that
archetype's documents from the required set and report a pass.

**`(not checked)` means what it means in `standards.md`:** the archetype requires
that document, and no path test can prove it exists in any useful sense. A
generated API reference is real work that an empty `docs/reference/` would
satisfy. Those rows are listed in each entry's `unchecked` list and counted in
the scorecard's `required-files` reason, so this document and the audit report
the same number.

## it-tooling

PowerShell automation, IaC, internal scripts.

| Adds | Checked? |
|------|----------|
| `docs/runbook.md` | yes |
| `docs/RUNLOG.md` (see below) | yes |
| a generated command reference (PowerShell comment-based help export, or `terraform-docs`) | **(not checked)** |

**Hints:** `*.ps1` / `*.psm1` / `*.tf` at or near the root, a `Dockerfile` with no
`src/`, and no application entry point.

## service

A deployed thing that runs and serves requests.

| Adds | Checked? |
|------|----------|
| `docs/architecture/arc42.md`: the useful subset only, sections 1, 3, 5, 6, 7, 9 and 12; C4 diagrams as Mermaid | yes |
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
look for it there by default. A repo that needs it under `docs/` must set
`changelogFile` explicitly, and the audit will then report it missing.

**Hints:** a package manifest with a library entry point and none of a service's
configuration, such as a Dockerfile, bind address, or deployment manifest.

## firmware

Code that runs on the device.

| Adds | Checked? |
|------|----------|
| `docs/architecture/` | yes |
| `docs/RUNLOG.md` (see below) | yes |
| a hardware interface (ICD) section within it | **(not checked)** |
| a build-and-flash runbook | **(not checked)** |

**Hints:** embedded toolchain files, `*.c` / `*.h` / `*.rs` with board
configuration, linker scripts, a partition table.

## docs/RUNLOG.md (it-tooling and firmware only)

Required by `it-tooling` and `firmware`, whose work includes hand-run scripts
against live systems and flash runs: actions git cannot see. `library` and
`service` repos are not asked for one. A service with CI/CD has no manual
actions by design, and a manual one belongs in the incident tracker. A repo of
any archetype that wants a log lists `docs/RUNLOG.md` in `extra_files`, and it
is then required and checked the same way. Elsewhere, `freshness.py` warns once
that the file is not required: its contents belong in the PR description or a
decision record.

Append-only. The narrowest scope of any file here, and the one most often abused.

**In scope:** operational actions whose effect doesn't leave a commit behind:
deploys, data migrations, credential rotations, scripts run against live systems,
manual verification steps, and checks that were skipped.

**Out of scope:** code edits, documentation edits, refactors, dependency bumps.
Git already records those, and the PR already explains them. Writing them here
twice just makes the file too long to read.

Every action is **two entries**, not one:

```text
## 2026-09-01 — Rotate the hub service account credential

- PLANNED: rotate via `az ad app credential reset --id <app-id>`; expect the
  15:00 UTC health check to stay green.
- CONFIRMED: rotated 14:41 UTC. Verified with
  `curl -sf https://hub.internal/healthz` -> 200. Health check green at 15:00.
```

The second entry is `CONFIRMED`, `FAILED`, or `SKIPPED`, and it specifies the exact
command or check used, not just the outcome. An entry nobody can re-run later is
not evidence. A skipped check gets its own `SKIPPED` entry; a silent gap is worse
than an admitted one.

**The entry rule.** Each level-two (`##`) heading starts an entry. `freshness.py` warns on
an entry that has no line starting `- CONFIRMED`, `- FAILED` or `- SKIPPED`,
whose outcome line (with its indented continuation) names no command or check in
backticks, or that runs past 12 lines. The example above passes all three.

Rotation: `freshness.py` warns past 500 lines. Move the oldest entries into
`docs/runlog/YYYY-QN.md` (the archive for the quarter each entry falls in) until
the log is back under the limit, and leave a one-line pointer behind. Whole entries
only. Never split one.

The line count is the whole trigger, deliberately. This rule once also required an
entry to be older than 90 days, and both halves had to hold: a repository that wrote
674 lines in five days tripped the line count with nothing old enough to move, so the
rule selected nothing and the warning stood forever. Recency is what the archive is
for, not age.

## docs/architecture/domain-model.md

Every archetype may carry it and none requires it: it is generated from the code
by `domain_model.py`, so a repository written in a language the extractor does not
read has none, and that is not a defect. The `ontology` check reports `skipped`
there rather than a miss.

## Adding an archetype

One entry in `scripts/archetypes.py`. The same discipline `standards.md` asks
for, for the same reason: the table is the contract, and prose that disagrees
with it is how people learn to distrust the scorecard:

- **`files` is a promise the check keeps.** Each path listed in `files` gets
  checked against every repo declaring the archetype. Put a document in `files`
  only if its existence is worth something; a folder that will be created
  empty belongs in `unchecked`, or nowhere.
- **`unchecked` is the honest half.** Anything the archetype wants that a path
  test cannot verify goes here and gets a **(not checked)** row in the table
  above. The scorecard names them, so the two cannot drift.
- **Name the hints, and keep them observable.** An archetype is proposed from
  the file tree, and confirmed with the human before anything is written
  (unlike an IEC 62304 safety class, which is a hazard assignment made outside
  the repository and must never be proposed). Never invent a hint that requires
  knowing something the repository does not show.
- **Do not add an archetype speculatively.** The existing archetypes cover the
  repos this has met. A fifth should arrive with a real repository that the
  existing four describe badly, not with a guess about one.
- **Add a fixture or extend a test.** `required-files` is one check with two
  inputs, and the archetype half had no test until an unknown value was found
  passing.

## Standards are overlays on archetypes

A standard applies on top of any of the four above rather than replacing one.
Declare them under `standards:` in `.docs-warden.yml`; each has its own
artifact set, scaled by a level axis where it has one. See
`standards.md`.

**Hints:** `REQ-` tags in code or test names, references to IEC 62304 or the FDA, a
safety class already set, an existing `docs/regulatory/` tree.

Never infer a safety class and act on it. Ask. Getting this wrong in either
direction is expensive: a false positive fills an IT repo with unnecessary
regulatory stubs, a false negative hides a gap in a device repo. Not every
standard is like this: `standards.md` says which may be proposed.

## On Diátaxis

Use the Diátaxis names (`tutorials/`, `how-to/`, `reference/`, `explanation/`)
only where the archetype above calls for a `docs/` tree, and only create the folders
that will actually hold something. Creating empty folders for their own sake does
not make a documentation structure; they remain empty folders regardless of the
labels applied to them. Those rows are
**(not checked)** because a check that demanded them would manufacture exactly the
empty folders this paragraph warns against.

## On arc42

`service`, and IEC 62304 class B or C, only. Take the subset listed above. A full
arc42 with five empty sections is worse than a one-page architecture note that is
true.
