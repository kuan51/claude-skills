#!/usr/bin/env python3
"""Regenerate the decision-record index.

Usage: adr_index.py <repo> [--check]

Writes docs/DECISIONS.md (the full table -- the single source) and
docs/decisions/README.md (a short pointer to it, so the table is not
duplicated). Idempotent: a second run must produce no diff, which is how CI
detects a hand edit of a generated file.

--check writes nothing and exits non-zero if either file is out of date.
"""
import argparse
import sys
from pathlib import Path

from _common import DECISIONS, DECISIONS_DIR, GENERATED_MARKER, load_adrs

FOOTER = (
    "\nTo add a decision, run `adr_new.py <repo> \"<title>\"`, fill the sections with\n"
    "the deciders, then re-run `adr_index.py`. Accepted records are never edited --\n"
    "reverse one by writing a new record with `supersedes: [DEC-NNNN]`.\n"
)


def render(records) -> str:
    lines = [
        GENERATED_MARKER,
        "",
        "# Decisions",
        "",
        "Why this repository is the way it is. Newest first.",
        "",
        "| ID | Title | Status | Date | Supersedes | Superseded by |",
        "|----|-------|--------|------|------------|---------------|",
    ]
    for record in sorted(records, key=lambda r: r["id"], reverse=True):
        status = record["status"] or "unknown"
        if record["superseded_by"]:
            status = f"{status} (superseded)"
        lines.append(
            "| [{id}]({link}) | {title} | {status} | {date} | {sup} | {by} |".format(
                id=record["id"],
                link=f"decisions/{record['path'].name}",
                title=record["title"] or "-",
                status=status,
                date=record["date"] or "-",
                sup=", ".join(record["supersedes"]) or "-",
                by=", ".join(record["superseded_by"]) or "-",
            )
        )
    if not records:
        lines.append("| - | No decisions recorded yet | - | - | - | - |")
    lines.append(FOOTER)
    return "\n".join(lines)


def render_pointer() -> str:
    """The docs/decisions/README.md content: a short pointer to the index,
    not a second copy of its table. No record count here -- that would make
    this file churn on every new decision, which is the duplication this
    pointer exists to remove; it should change only when its own wording
    changes."""
    return "\n".join(
        [
            GENERATED_MARKER,
            "",
            "# Decision records",
            "",
            "One decision per file, named `DEC-NNNN-slug.md`, immutable once accepted.",
            "",
            "The index of every record -- status, date, and what supersedes what --",
            "is [DECISIONS.md](../DECISIONS.md), generated from the files in this",
            "folder. Read it there; this folder holds the records themselves.",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate the decision-record index")
    parser.add_argument("repo", type=Path)
    parser.add_argument("--check", action="store_true", help="verify only, write nothing")
    args = parser.parse_args()

    repo = args.repo.resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 1

    records = load_adrs(repo)
    targets = {
        repo / DECISIONS: render(records),
        repo / DECISIONS_DIR / "README.md": render_pointer(),
    }

    stale = []
    for path, content in targets.items():
        current = (path.read_text(encoding="utf-8", errors="replace")
                   if path.is_file() else None)
        if current == content:
            continue
        stale.append(path)
        if not args.check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    if args.check:
        if stale:
            for path in stale:
                print(f"out of date: {path}", file=sys.stderr)
            print("run adr_index.py and commit the result", file=sys.stderr)
            return 1
        print(f"index up to date ({len(records)} record(s))")
        return 0

    if stale:
        for path in stale:
            print(f"wrote {path}")
    else:
        print("index already up to date")
    print(f"{len(records)} record(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
