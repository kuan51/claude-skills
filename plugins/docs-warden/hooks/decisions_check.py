#!/usr/bin/env python3
"""SessionStart hook: say so when docs/decisions has reached the compaction
point, so the session runs the docs-warden skill's compact mode. Prints
nothing otherwise. Fails open: any error means silence and exit 0.

Counts what adr_compact.py would archive -- records that are not proposed
and are not digests -- with a regex over the front matter, so this file
needs nothing outside the standard library."""
import json
import re
import sys
from pathlib import Path

COMPACT_AT = 50  # keep equal to adr_compact.py's COMPACT_AT
SKIP = re.compile(r"^(status:\s*proposed|tags:.*\bcompaction\b)", re.MULTILINE)


def front_matter(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    return text[4:].split("\n---", 1)[0] if text.startswith("---\n") else ""


def main():
    cwd = Path(json.load(sys.stdin).get("cwd") or ".")
    count = sum(1 for p in (cwd / "docs" / "decisions").glob("DEC-*.md")
                if not SKIP.search(front_matter(p)))
    if count >= COMPACT_AT:
        print(f"docs-warden: {count} decision records in docs/decisions are ready "
              f"to archive (compaction point is {COMPACT_AT}). Run the docs-warden "
              "skill's compact mode to move the oldest 25 into a digest.")


try:
    main()
except Exception:
    pass
