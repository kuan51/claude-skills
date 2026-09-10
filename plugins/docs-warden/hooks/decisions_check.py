#!/usr/bin/env python3
"""SessionStart hook: say so when docs/decisions has reached the compaction
point, so the session runs the docs-warden skill's compact mode. Prints
nothing otherwise. Fails open: any error means silence and exit 0."""
import json
import sys
from pathlib import Path

COMPACT_AT = 50  # keep equal to adr_compact.py's COMPACT_AT


def main():
    cwd = Path(json.load(sys.stdin).get("cwd") or ".")
    count = len(list((cwd / "docs" / "decisions").glob("DEC-*.md")))
    if count >= COMPACT_AT:
        print(f"docs-warden: {count} decision records in docs/decisions "
              f"(compaction point is {COMPACT_AT}). Run the docs-warden skill's "
              "compact mode to archive the oldest 25 into a digest.")


try:
    main()
except Exception:
    pass
