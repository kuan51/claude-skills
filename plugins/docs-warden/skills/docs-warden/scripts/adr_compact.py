#!/usr/bin/env python3
"""Compact the oldest decision records into one digest.

Usage: adr_compact.py <repo> [--dry-run | --check]

Once docs/decisions/ holds COMPACT_AT eligible records -- accepted or rejected,
and not themselves digests -- the COMPACT_BATCH oldest are moved unchanged
(git mv) into docs/decisions/archive/ and one new DEC-NNNN digest record is
written in their place. The digest carries each archived record's id, title,
status, date, supersedes and superseded-by lists, and its "Decision outcome"
and "Gaps accepted" sections verbatim -- enough to read the project's history
from docs/decisions/ alone. Context, drivers and rejected options stay in the
archive, bytes untouched, so the immutability rule holds. Digests are never
archived, so what they carry stays at the top level.

The script archives nothing below 50 decided. Re-run adr_index.py afterwards.
--check prints one line when compaction is due, or when 50 records exist but
too many are not yet accepted or rejected, and nothing otherwise. That line comes from
check_line(), which the hook imports at session start and after an edit in
docs/decisions/, so "due" is defined in exactly one place.
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

from _common import DECISIONS_ARCHIVE_DIR, DECISIONS_DIR, adr_status, git, load_adrs
from adr_new import next_id, slugify

# ponytail: constants; make them .docs-warden.yml keys when a repo needs others.
COMPACT_AT = 50
COMPACT_BATCH = 25
DIGEST_TAG = "compaction"
DECIDED = ("accepted", "rejected")  # in any case, through adr_status
KEEP_SECTIONS = ("Decision outcome", "Gaps accepted")


def section(body: str, heading: str) -> str:
    """Text of `## <heading>` up to the next `## `, ignoring headings inside
    fenced code blocks, or a placeholder when the section is missing."""
    keep, fenced, inside = [], False, False
    for line in body.splitlines():
        if line.startswith("```"):
            fenced = not fenced
        elif not fenced and line.startswith("## "):
            if inside:
                break
            inside = line[3:].strip().lower() == heading.lower()
            continue
        if inside:
            keep.append(line)
    return "\n".join(keep).strip() if inside else "_(section absent in original)_"


def render(record_id: str, records) -> str:
    first, last = records[0]["id"], records[-1]["id"]
    lines = [
        "---",
        f"id: {record_id}",
        f"title: Compaction of {first} to {last}",
        "status: accepted",
        f"date: {dt.date.today().isoformat()}",
        "deciders: []",
        "supersedes: []",
        f"tags: [{DIGEST_TAG}]",
        "---",
        "",
        f"# {record_id}: Compaction of {first} to {last}",
        "",
        f"Digest of {len(records)} records moved unchanged into `archive/`. Each",
        "keeps its outcome and accepted gaps here; the full record is one link away.",
        "",
    ]
    for r in records:
        body = r["path"].read_text(encoding="utf-8", errors="replace")
        facts = [r["status"], r["date"], "supersedes " + (", ".join(r["supersedes"]) or "nothing")]
        if r["superseded_by"]:
            facts.append("superseded by " + ", ".join(r["superseded_by"]))
        facts.append(f"[full record](archive/{r['path'].name})")
        lines += [f"## {r['id']}: {r['title']}", "", " · ".join(facts), ""]
        for heading in KEEP_SECTIONS:
            lines += [f"### {heading}", "", section(body, heading), ""]
    return "\n".join(lines)


def is_digest(record) -> bool:
    """Tagged as a digest, in any case. Whole tags only: a string tag such as
    "no-compaction-needed" is one tag, not a list to search inside."""
    tags = record["tags"]
    if not isinstance(tags, list):
        tags = [tags]
    return DIGEST_TAG in (str(tag).strip().lower() for tag in tags)


def split(repo: Path):
    """Top-level records that are not digests, and the decided ones among them.
    Decided is a closed list, not "anything but proposed": a draft, a "Proposed"
    or front matter that did not parse is no decision, and the digest would
    freeze it as one."""
    records = [r for r in load_adrs(repo) if not is_digest(r)]
    return records, [r for r in records if adr_status(r) in DECIDED]


def check_line(repo: Path) -> str:
    """The line --check prints, or "" when compaction is neither due nor
    waiting. The decisions hook imports this, so "due" is defined in exactly
    one place. Counts and fixed text only: the line enters Claude's context."""
    records, decided = split(repo)
    if len(decided) >= COMPACT_AT:
        return (f"docs-warden: {len(decided)} decision records in {DECISIONS_DIR} are ready "
                f"to archive (compaction point is {COMPACT_AT}). Run the docs-warden "
                f"skill's compact mode to move the oldest {COMPACT_BATCH} into a digest.")
    if len(records) >= COMPACT_AT:
        return (f"docs-warden: {len(records)} decision records in {DECISIONS_DIR}, "
                f"{len(decided)} decided and {len(records) - len(decided)} not yet "
                f"accepted or rejected. Compaction archives decided records only and "
                f"starts at {COMPACT_AT}. Run the docs-warden skill's compact mode to "
                f"review the undecided ones.")
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive the oldest decision records into a digest")
    parser.add_argument("repo", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="show the plan, write nothing")
    parser.add_argument("--check", action="store_true", help="say whether compaction is due")
    args = parser.parse_args()

    repo = args.repo.resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 1

    if args.check:
        line = check_line(repo)
        if line:
            print(line)
        return 0

    _, candidates = split(repo)
    if len(candidates) < COMPACT_AT:
        print(f"{len(candidates)} eligible record(s), below the compaction point of {COMPACT_AT}")
        return 0
    batch = candidates[:COMPACT_BATCH]

    archive = repo / DECISIONS_ARCHIVE_DIR
    clashes = [r["path"].name for r in batch if (archive / r["path"].name).exists()]
    if clashes:
        print("error: already in archive/, refusing to overwrite: " + ", ".join(clashes),
              file=sys.stderr)
        return 1

    digest_id = next_id(repo)
    slug = slugify(f"compaction of {batch[0]['id']} to {batch[-1]['id']}")
    digest_path = repo / DECISIONS_DIR / f"{digest_id}-{slug}.md"
    if args.dry_run:
        for r in batch:
            print(f"{r['path'].relative_to(repo)} -> archive/{r['path'].name}")
        print(f"digest: {digest_path.relative_to(repo)}")
        return 0

    # Only the path that runs git mv asks git; --check and --dry-run stay git-free.
    if git(repo, "status", "--porcelain") != "":
        print("error: the working tree is not clean, or git cannot tell: compaction must "
              "land as its own commit; start from a clean checkout of a new branch off "
              "the default branch", file=sys.stderr)
        return 1

    content = render(digest_id, batch)  # read bodies before anything moves
    archive.mkdir(exist_ok=True)
    for r in batch:
        if git(repo, "mv", str(r["path"]), str(archive / r["path"].name)) is None:
            print(f"error: git mv failed on {r['path'].name}; is the record committed?",
                  file=sys.stderr)
            return 1
    digest_path.write_text(content, encoding="utf-8")
    print(f"created {digest_path.relative_to(repo)}; now run adr_index.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
