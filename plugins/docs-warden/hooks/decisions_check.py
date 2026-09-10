#!/usr/bin/env python3
"""SessionStart hook: pass through adr_compact.py --check, which prints one
line when docs/decisions is due for compaction and nothing otherwise. Fails
open: any error, including a missing PyYAML, means silence and exit 0."""
import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "skills" / "docs-warden" / "scripts" / "adr_compact.py"

try:
    cwd = json.load(sys.stdin).get("cwd") or "."
    print(subprocess.run([sys.executable, str(SCRIPT), cwd, "--check"],
                         capture_output=True, text=True, timeout=4).stdout, end="")
except Exception:
    pass
