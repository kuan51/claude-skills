---
id: DEC-0003
title: Archive old decision records into a digest instead of deleting them
status: proposed
date: 2026-09-10
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0003: Archive old decision records into a digest instead of deleting them

## Context and problem statement

`docs/decisions/` in a repo using docs-warden gains one `DEC-NNNN` file per
decision and never loses one, because an accepted record is immutable. Fifty or
a hundred files later the folder is hard to browse and hard for the skill to
read whole. The ask was to compact the oldest 25 into one record once 50 exist,
and to have a hook notice when that point is reached.

## Decision drivers

- The immutability rule in `references/adr-format.md`, enforced from git history
  by `audit.py`, must stay true for every record ever accepted.
- A reader, human or the skill, must be able to follow the architectural history
  from `docs/decisions/` alone, without opening an archive.
- `supersedes: [DEC-0003]` in a live record must keep naming a real file.
- The plugin already rotates the run log by moving whole entries untouched into
  `docs/runlog/`; the decisions rule should rhyme with that.

## Considered options

1. **Archive plus digest**: `git mv` the 25 oldest accepted or rejected records into
   `docs/decisions/archive/` unchanged, and write one new accepted digest record
   carrying each one's id, title, status, date, supersedes, and its Decision
   outcome and Gaps accepted sections verbatim.
2. **Merge and delete**: write one summary record and delete the 25 originals.
   Smallest folder, but it deletes accepted records, so the immutability check
   has to be weakened and every cross-reference into the deleted ids breaks.
3. **Digest only**: write the digest and move nothing. Keeps everything but the
   folder never shrinks, which was the whole point.

## Decision outcome

Chose **archive plus digest**, because it is the only option that shrinks the
folder without touching a byte of an accepted record. The digest copies the two
sections a later reader needs mechanically, so no summarising happens and the
result is deterministic and testable.

The trigger is a hook, run at session start and after an edit in
`docs/decisions/`, that counts the archivable records in `docs/decisions/`
(accepted or rejected, not a digest) and prints one line at 50 or more, the same count
the script uses. When 50 records exist but fewer than 50 are decided, it prints
a line saying how many are not yet accepted or rejected instead. A hook cannot run the
compaction itself; it tells the session to run the skill's `compact` mode,
which runs `adr_compact.py --dry-run`, shows the mapping, and moves on a yes.
Compaction lands as its own pull request.

## Consequences

**Good:**

- `docs/decisions/` stays under about 50 files with no loss of history.
- `audit.py`'s immutability check reads the archive too, so an edit to an
  archived record after the move is still caught. The links and front-matter
  walks leave the archive alone: a moved record's `../` links break by
  construction and the rule forbids fixing them in place.
- Digests are never archived themselves, so what one carries stays at the top
  level for as long as the folder exists.

**Bad:**

- The digest is written `status: accepted` on creation, so a mistake in it can
  only be fixed by a superseding record.
- Links written by hand as `decisions/DEC-0001-...` outside the generated index
  break once that file moves; the index itself does not list archived records.

## Gaps accepted

- The 50 and 25 are constants in `adr_compact.py`; the hook imports the same
  check `--check` prints, so there is one definition of "due." A repo wanting different
  numbers edits the script; a manifest key can come later.
- The immutability check sees an archived record's history only from the move
  onward; an edit made between acceptance and archiving is not visible after.
- Records are counted, not sized. A repo with 49 very long records gets no
  nudge.
- The nudge runs at session start and after an edit in `docs/decisions/`;
  changes made through Bash wait for the next session start.

## Links

- Ticket: none
- Pull request: branch `claude/practical-archimedes-araxza`
- Related: DEC-0001 (run log rotation, the pattern this follows)
