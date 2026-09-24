#!/usr/bin/env python3
"""Hook, at session start and after an edit in docs/decisions/: pass through
adr_compact.py --check, which prints one line when docs/decisions is due for
compaction or waiting on proposed records, and nothing otherwise. After an edit
the line goes out as PostToolUse additionalContext, since plain stdout there
reaches only the debug log. Fails open: any error, including a missing PyYAML,
means silence and exit 0."""
import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "skills" / "docs-warden" / "scripts" / "adr_compact.py"


def check(repo) -> str:
    return subprocess.run([sys.executable, str(SCRIPT), str(repo), "--check"],
                          capture_output=True, text=True, timeout=4).stdout


try:
    payload = json.load(sys.stdin)
    cwd = payload.get("cwd") or "."
    if payload.get("hook_event_name") == "PostToolUse":
        edited = (Path(cwd) / payload["tool_input"]["file_path"]).resolve()
        folder = edited.parent
        if (folder.parent.name, folder.name) == ("docs", "decisions"):
            line = check(folder.parent.parent).strip()
            if line:
                print(json.dumps({"hookSpecificOutput": {
                    "hookEventName": "PostToolUse", "additionalContext": line}}))
    else:
        print(check(cwd), end="")
except Exception:
    pass
