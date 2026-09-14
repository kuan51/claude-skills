# The universal set

Every repo gets these files, whatever its archetype. Overlays add; they
never remove. Templates for all of them live in `../assets/templates/`.

## Front matter

Every long-lived document carries YAML front matter, `---` delimited:

```yaml
---
owner: rex
review_by: 2027-03-01
generated: false
---
```

- `owner`: a person or team, not "the team." Someone answers for it.
- `review_by`: ISO date. `freshness.py` fails once it passes.
- `generated`: `true` means a script generates this file and a human must not edit it.

`README.md` and `docs/RUNLOG.md` are exempt: a README with a YAML block at the top
renders badly on GitHub, and the run log is append-only by nature. The rotated
archives under `docs/runlog/` are exempt too.

## README.md

The front door, and the only document most people read.

Required: title, a one-line statement of purpose, what it does and why it exists,
a quick start that covers install and first usage, and links into `docs/`.

- Target **150 lines or fewer**. Depth belongs in `docs/`, not here.
- Over 100 lines, a table of contents is required.
- Status and ownership badges: five maximum.

A README that tries to cover everything doesn't explain anything useful. If a
section is longer than a screen, it belongs in `docs/` with a link from here.

## docs/CONVENTIONS.md

**Current state only.** Edited in place as the standard changes. It answers "how do
we do things here today," never "how did we get here." That is what decision
records are for. A dated entry in `docs/CONVENTIONS.md` is a bug.

Sections: stack and versions plus repository layout, branch and commit rules, naming,
testing expectations, documentation rules, and the list of generated files with the
command that regenerates each.

## docs/decisions/DEC-NNNN-slug.md

Each decision gets one file, immutable once accepted. Specified in `adr-format.md`.

Alongside them, `adr_index.py` writes a generated `docs/decisions/README.md`: a
heading, one sentence, and a link up to the index. It is a signpost for anyone
browsing the folder, not a second copy of the table.

At 50 records, `adr_compact.py` moves the 25 oldest unchanged into
`docs/decisions/archive/` and writes one digest record in their place; see
`adr-format.md`, "Compaction."

## docs/DECISIONS.md

**Generated** by `adr_index.py`. First line is the generated marker. The audit
regenerates it and fails on a non-empty diff, so a hand edit is always caught.

## docs/RUNLOG.md

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

Rotation: `freshness.py` warns past 500 lines. Move the oldest entries into
`docs/runlog/YYYY-QN.md` (the archive for the quarter each entry falls in) until
the log is back under the limit, and leave a one-line pointer behind. Whole entries
only. Never split one.

The line count is the whole trigger, deliberately. This rule once also required an
entry to be older than 90 days, and both halves had to hold: a repository that wrote
674 lines in five days tripped the line count with nothing old enough to move, so the
rule selected nothing and the warning stood forever. Recency is what the archive is
for, not age.

## docs/GLOSSARY.md

Each glossary term has exactly one meaning. A four-column table:

| Term | Definition | Do not use | Source |
|------|------------|------------|--------|

`Do not use` lists the rejected synonyms: this column is what makes the glossary
enforceable rather than decorative. It feeds the Vale vocabulary.

Seed it from `ontological-documentation` where that skill is installed, using
domain entities only. Merge by term. Never overwrite a human-edited definition.

## docs/SECURITY.md

Internal repos: a stub naming where to report a vulnerability and who is
responsible for triage.

Regulated repos: the full document. It covers supported versions and the reporting
route with its response time. It also links the threat model and states the
disclosure policy.

## The forge overlay: A change template and a review gate

Two controls, spelled differently by every hosting platform, so they are
declared rather than assumed. `forge:` in `.docs-warden.yml` selects the
spelling; omitting it means `github`, which is what every repository scaffolded
so far assumes.

| `forge:` | Required |
|---|---|
| `github` (default) | `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS` |
| `gitlab` | `.gitlab/merge_request_templates/`, and `CODEOWNERS` at the root, in `docs/`, or in `.gitlab/` |
| `none` | nothing |

These used to be required of every repository unconditionally, which failed a
GitLab or Gitea repo forever for something that is not a documentation defect:
the same reasoning that keeps `LICENSE` out of the universal set, applied
consistently.

**Choosing `none` is a real loss.** The gate still has to exist
somewhere; choosing `none` means nothing checks that it does. Prefer naming the
paths with `extra_files` over selecting it.

### Purpose of the change template

One checkbox:

```markdown
- [ ] Docs updated, or explicitly N/A because: ______
```

Forcing the "why not" into the change request is what stops docs drifting. "N/A"
alone is not an answer.

### Purpose of the review gate

`docs/` and the root documents are owned by the `owner` in `.docs-warden.yml`, so
documentation changes get a reviewer who cares about them.

## A note on `docs/`

Every path this plugin knows is rooted at `docs/`, and that is deliberate: an
opinionated layout is the thing being enforced. Consequences worth stating
rather than discovering:

- A repository that keeps documentation somewhere else (`documentation/`,
  `website/`) cannot be audited without moving it.
- A monorepo cannot be audited per-package. Point the scripts at each package
  directory separately, or accept one scorecard for the whole tree.

## .docs-warden.yml

The manifest every script reads.

```yaml
archetype: it-tooling        # it-tooling | service | library | firmware
forge: github                # github | gitlab | none; omitted means github
owner: rex
review_cadence_days: 180
standards:                   # omit when none apply; see standards.md
  iec-62304: C
generated_docs:
  - path: docs/reference/cli.md
    command: ["pwsh", "./build/Export-Help.ps1"]
```

`generated_docs` is the contract behind the anti-drift check: CI runs each
`command` and fails if the resulting `path` differs from what is committed.

`command` is a list of arguments, executed without a shell. It runs only when
`audit.py` is given `--run-generators`. This is executable repo content. Review
it as you would a script.

Only `path` is snapshotted and restored around the run; the command is not
sandboxed and runs with your own privileges. If it writes files other than
`path`, those are left behind: containment restricts where `path` may
resolve, not what the command itself can touch.

Propose these values from the detection hints in `archetypes.md`, show them, and
**wait for confirmation** before writing the file. A guessed safety class is
worse than no file at all; `standards.md` says which levels may be proposed and
which must be asked for.

## .gitignore

| File | Purpose | Rule |
|------|---------|------|
| `.gitignore` | Keeps generated and secret files out of git | Must ignore `docs-scorecard.json`, the two generated Vale paths (`styles/config/vocabularies/Project/` and `styles/Clarity/GlossaryTerms.yml`), and `*.env`. Never ignore `styles/` wholesale: that hides the hand-copied `Clarity` rule files `vale` needs. Verify with `git check-ignore -q .env` |

A missing or broken rule here is a HIPAA-severity defect if it lets a secret file
leak without being caught. See `../assets/templates/gitignore.tmpl` for the seed content.
