#!/usr/bin/env python3
"""Compact the oldest decision records into one digest.

Usage: adr_compact.py <repo> [--dry-run]

Once docs/decisions/ holds COMPACT_AT records, the COMPACT_BATCH oldest that
are not still proposed are moved unchanged (git mv) into docs/decisions/archive/
and one new DEC-NNNN digest record is written in their place. The digest
carries each archived record's id, title, status, date, supersedes list, and
its "Decision outcome" and "Gaps accepted" sections verbatim -- enough to read
the project's history from docs/decisions/ alone. Context, drivers and rejected
options stay in the archive, bytes untouched, so the immutability rule holds.

Below the threshold the script does nothing. Re-run adr_index.py afterwards.
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

from _common import DECISIONS_DIR, git, load_adrs
from adr_new import next_id, slugify

# ponytail: constants; make them .docs-warden.yml keys when a repo needs others.
COMPACT_AT = 50
COMPACT_BATCH = 25
ARCHIVE_DIR = "archive"
KEEP_SECTIONS = ("Decision outcome", "Gaps accepted")


def section(body: str, heading: str) -> str:
    """Text of `## <heading>` up to the next `## `, or a placeholder."""
    match = re.search(rf"^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)",
                      body, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else "_(section absent in original)_"


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
        "tags: [compaction]",
        "---",
        "",
        f"# {record_id}: Compaction of {first} to {last}",
        "",
        f"Digest of {len(records)} records moved unchanged into `{ARCHIVE_DIR}/`. Each",
        "keeps its outcome and accepted gaps here; the full record is one link away.",
        "",
    ]
    for r in records:
        body = r["path"].read_text(encoding="utf-8", errors="replace")
        sup = ", ".join(r["supersedes"]) or "nothing"
        lines += [
            f"## {r['id']}: {r['title']}",
            "",
            f"{r['status']} · {r['date']} · supersedes {sup} · "
            f"[full record]({ARCHIVE_DIR}/{r['path'].name})",
            "",
        ]
        for heading in KEEP_SECTIONS:
            lines += [f"### {heading}", "", section(body, heading), ""]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive the oldest decision records into a digest")
    parser.add_argument("repo", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="show the plan, write nothing")
    args = parser.parse_args()

    repo = args.repo.resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 1

    records = load_adrs(repo)
    if len(records) < COMPACT_AT:
        print(f"{len(records)} record(s), below the compaction point of {COMPACT_AT}")
        return 0
    batch = [r for r in records if r["status"] != "proposed"][:COMPACT_BATCH]
    if not batch:
        print("nothing to compact: every record is still proposed")
        return 0

    digest_id = next_id(repo)
    slug = slugify(f"compaction of {batch[0]['id']} to {batch[-1]['id']}")
    digest_path = repo / DECISIONS_DIR / f"{digest_id}-{slug}.md"
    archive = repo / DECISIONS_DIR / ARCHIVE_DIR
    for r in batch:
        print(f"{r['path'].relative_to(repo)} -> {ARCHIVE_DIR}/{r['path'].name}")
    print(f"digest: {digest_path.relative_to(repo)}")
    if args.dry_run:
        return 0

    content = render(digest_id, batch)  # read bodies before anything moves
    archive.mkdir(exist_ok=True)
    for r in batch:
        dest = archive / r["path"].name
        if git(repo, "mv", str(r["path"]), str(dest)) is None:
            r["path"].rename(dest)  # not a git repo, or the file is untracked
    digest_path.write_text(content, encoding="utf-8")
    print(f"created {digest_path.relative_to(repo)}; now run adr_index.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
