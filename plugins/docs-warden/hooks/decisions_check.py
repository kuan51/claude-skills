#!/usr/bin/env python3
"""Hook, at session start and after an edit in docs/decisions/: print
adr_compact.check_line(), the one line --check prints when docs/decisions is
due for compaction or waiting on proposed records, and nothing otherwise. It
imports the check instead of running the script, so each run costs one Python
start, not two. After an edit the line goes out as PostToolUse
additionalContext, since plain stdout there reaches only the debug log. Fails
open: any error, including a missing PyYAML, means silence and exit 0, and the
timeout in hooks.json bounds a slow read."""
import json
import os
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "skills" / "docs-warden" / "scripts"

try:
    # Bytes, not sys.stdin: its locale codec (cp1252 on Windows) garbles a UTF-8 path.
    payload = json.loads(sys.stdin.buffer.read())
    cwd = payload.get("cwd") or "."
    sys.path.insert(0, str(SCRIPTS))
    from adr_compact import check_line  # a missing PyYAML raises here: silence
    if payload.get("hook_event_name") == "PostToolUse":
        # The path as the edit named it: resolve() would follow a linked
        # docs/decisions to its target, and case must match the way load_adrs
        # finds the folder on a case-insensitive filesystem.
        edited = Path(os.path.abspath(Path(cwd) / payload["tool_input"]["file_path"]))
        folder = edited.parent
        if (folder.parent.name.lower(), folder.name.lower()) == ("docs", "decisions"):
            line = check_line(folder.parent.parent)
            if line:
                print(json.dumps({"hookSpecificOutput": {
                    "hookEventName": "PostToolUse", "additionalContext": line}}))
    else:
        line = check_line(Path(cwd))
        if line:
            print(line)
except Exception:
    pass
