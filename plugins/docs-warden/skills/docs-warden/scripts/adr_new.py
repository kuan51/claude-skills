#!/usr/bin/env python3
"""Scaffold the next decision record.

Usage: adr_new.py <repo> "<title>"

Writes docs/decisions/DEC-NNNN-slug.md from the template with status: proposed.
Filling the sections is a conversation with the humans who made the decision, not
something this script guesses at.
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

from _common import DECISIONS_DIR, adr_files

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "templates" / "adr.md.tmpl"


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:60].rstrip("-")


def next_id(repo: Path) -> str:
    highest = 0
    for path in adr_files(repo):
        match = re.match(r"DEC-(\d+)", path.stem)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"DEC-{highest + 1:04d}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Scaffold the next decision record")
    parser.add_argument("repo", type=Path)
    parser.add_argument("title")
    parser.add_argument("--deciders", default="", help="comma-separated")
    args = parser.parse_args()

    repo = args.repo.resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 1

    record_id = next_id(repo)
    path = repo / DECISIONS_DIR / f"{record_id}-{slugify(args.title)}.md"
    if path.exists():
        print(f"error: {path} already exists", file=sys.stderr)
        return 1

    body = TEMPLATE.read_text(encoding="utf-8")
    for token, value in {
        "{{ID}}": record_id,
        "{{TITLE}}": args.title,
        "{{DATE}}": dt.date.today().isoformat(),
        "{{DECIDERS}}": args.deciders,
    }.items():
        body = body.replace(token, value)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    print(f"created {path.relative_to(repo)}")
    print("status is 'proposed'. Fill the sections with the deciders, then run adr_index.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
