---
id: DEC-0024
title: Frameworks are folders from two roots; project ones are data and imported wording stays local
status: proposed
date: 2026-10-01
deciders: [kuan51]
supersedes: []
tags: [ciso, frameworks, security, egress]
---

# DEC-0024: Frameworks are folders from two roots; project ones are data and imported wording stays local

## Context and problem statement

A ciso framework used to be a structure JSON under `skills/<cert>/controls/`, an entry in
`assets/certifications.json`, an `invariants.md` and per-verb Markdown, all inside the plugin. A
project could not add a framework of its own, and the format was undocumented. Letting a project
add one raises two questions the plugin had not had to answer: how much a verb should trust files
written by the project or a third party, and what happens to licensed wording a project copies in.

## Decision drivers

- Every verb has unrestricted Bash, so any file a verb treats as instructions can run commands.
- Licensed requirement wording must never leave the machine. DEC-0019 already keeps posture prose
  out of vendor research; licensed wording needs the same guarantee, and also for task sync.
- Existing `state.json` files must keep working with no migration.

## Considered options

1. **Keep frameworks plugin-only.** No new trust question, but a project still cannot track a
   framework ciso does not bundle.
2. **One folder format, loaded from the plugin and from the project, with both treated the same.**
   The simplest loader, but a project's `ground-rules.md` and `flows/` would direct verbs exactly as
   bundled ones do.
3. **One folder format from two roots with two trust levels.** Bundled folders are plugin code;
   project folders, under the gitignored `docs/ciso/frameworks/`, are data. A project may not ship
   `flows/`; verbs follow the plugin's `generic-ground-rules.md` and generic flows, report the
   project's `ground-rules.md` to the user, and never act on instructions in it. A project folder
   reusing a bundled `certKey` is excluded with an error naming both paths.

## Decision outcome

Chose **option 3**, because it gives projects their own frameworks without letting a data file
direct a verb. A tier may declare `sourceAuthority: "imported"` for licensed wording. For those
controls, and for any control whose `statementSource` a payload leaves out, vendor research gets
only codes (`id`, `relatedControlCode`, `legacyCategoryPrefix`, `domainKey`), never a name, domain,
label or summary; sync-tasks sends neither `topicLabel` nor `topicSummary`. No bundled tier may be
`imported`. This narrows DEC-0019's subject-field allowlist for those controls; it does not widen it.

## Consequences

**Good:**

- A project framework needs no plugin change, and `frameworks.js validate` checks one in seconds.
- The four bundled frameworks moved by `git mv` with control ids, certKeys, tier keys and
  `controlSetVersion` unchanged, so existing state needs no migration.
- One bad project folder never blocks a bundled framework: `list` fails only on bundled errors.

**Bad:**

- Project frameworks get only the generic flows. They have no scope, import or upgrade step.
- The trust rule is enforced by what each verb's `SKILL.md` tells the model, backed by tests that
  every verb names both ground-rules files. It is not a sandbox.
- `imported` is self-declared. A project that copies licensed text and labels it
  `public-topic-level` still sends it to vendor research.

## Gaps accepted

Flows for project frameworks, project frameworks committed outside `docs/ciso/`, maturity models
other than HITRUST r2 declared in data, upgrade reconciliation for non-HITRUST frameworks, and a
JSON Schema file are all out of scope. Core scripts stay in `skills/hitrust/lib/`.

## Links

- Ticket: #158
- Pull request: not yet opened
- Related: DEC-0019 (vendor research receives subject fields only), DEC-0021 (links
  `plugins/ciso/ADDING-A-CERTIFICATION.md`, which keeps its name for that reason)
