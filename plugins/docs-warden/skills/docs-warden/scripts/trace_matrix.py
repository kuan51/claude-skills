#!/usr/bin/env python3
"""Build the requirements traceability matrix from the source tree.

Usage: trace_matrix.py <repo> [--write]

Requirements are declared in docs/regulatory/requirements/ as headings of the form
"## REQ-AREA-NNN". Coverage is found by grepping the tree for the same IDs:

  - an ID in a code file  -> implementation
  - an ID in a test file  -> verification

Exits non-zero if any requirement has no test. That is deliberately the strictest
check in the skill: a requirement nobody tests is the exact gap these standards
exist to catch, and a hand-maintained matrix drifts into claiming coverage that is
not there. Generated from the source, the matrix cannot lie -- only be visibly
incomplete.
"""
import argparse
import os
import re
import sys
from pathlib import Path

from _common import GENERATED_MARKER

# Accept underscores as well as hyphens. A test name cannot contain a hyphen in
# Python, C#, or most other languages, so test_REQ_FIX_001_rejects_empty is the
# only way to tag a test -- matching hyphens alone would find no tests at all.
# \b will not do here: between "_" and "REQ" there is no word boundary, so \b
# would never match test_REQ_FIX_001_rejects_empty. Exclude only letters and
# digits on either side, so an underscore-separated name still matches.
REQ_RE = re.compile(r"(?<![A-Za-z0-9])REQ[-_][A-Z][A-Z0-9]*[-_]\d+(?![A-Za-z0-9])")
DECL_RE = re.compile(r"^#{1,6}\s+(REQ-[A-Z][A-Z0-9]*-\d+)\b", re.M)

# The one place the matrix's output location is spelled out as a path. The
# link math, the write path, and the self-exclusion below all derive from
# this (the --write help text is user-facing prose, not logic, and is left
# as its own literal).
MATRIX_REL_PATH = Path("docs/regulatory/traceability-matrix.md")


def canonical(req_id: str) -> str:
    """REQ_FIX_001 and REQ-FIX-001 are the same requirement."""
    return req_id.replace("_", "-")

SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build", ".venv", "__pycache__"}
TEXT_SUFFIXES = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".cs", ".c", ".h", ".cpp", ".rs", ".go",
    ".ps1", ".psm1", ".java", ".kt", ".swift", ".rb", ".sh", ".sql", ".md", ".yml",
    ".yaml",
}


def is_test(rel: str) -> bool:
    """Classify by the path *relative to the audited repo*. Using the absolute
    path misclassifies everything when the repo itself lives under a directory
    called tests/, which is exactly how these fixtures are laid out."""
    path = Path(rel)
    parts = [p.lower() for p in path.parts]
    name = path.name.lower()
    return (
        any(p in ("test", "tests", "spec", "specs", "__tests__") for p in parts)
        or name.startswith("test_")
        or name.startswith("test-")
        or ".test." in name
        or ".spec." in name
        or name.endswith("_test" + path.suffix)
        or name.endswith("tests.ps1")
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the traceability matrix")
    parser.add_argument("repo", type=Path)
    parser.add_argument("--write", action="store_true",
                        help="write docs/regulatory/traceability-matrix.md")
    args = parser.parse_args()

    repo = args.repo.resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 1

    req_dir = repo / "docs" / "regulatory" / "requirements"
    if not req_dir.is_dir():
        print("no docs/regulatory/requirements/ directory; nothing to trace",
              file=sys.stderr)
        return 1

    declared = {}
    for path in sorted(req_dir.rglob("*.md")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for req_id in DECL_RE.findall(text):
            declared.setdefault(req_id, path.relative_to(repo).as_posix())

    if not declared:
        print("no requirements declared; expected '## REQ-AREA-NNN' headings",
              file=sys.stderr)
        return 1

    code, tests = {r: set() for r in declared}, {r: set() for r in declared}
    for path in sorted(repo.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        rel = path.relative_to(repo).as_posix()
        # The requirements themselves are the declaration, not coverage, and the
        # matrix lists every ID by definition -- counting either would let the
        # matrix prove its own completeness.
        if rel.startswith("docs/regulatory/requirements/"):
            continue
        if rel == MATRIX_REL_PATH.as_posix():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for raw in set(REQ_RE.findall(text)):
            req_id = canonical(raw)
            if req_id not in declared:
                continue
            (tests if is_test(rel) else code)[req_id].add(rel)

    out = repo / MATRIX_REL_PATH

    rows = []
    untested, unimplemented = [], []
    for req_id in sorted(declared):
        if not tests[req_id]:
            untested.append(req_id)
        if not code[req_id]:
            unimplemented.append(req_id)
        src = declared[req_id]
        # os.path.relpath returns backslashes on Windows; markdown links need
        # forward slashes, same as every other path this file emits.
        link = Path(os.path.relpath(repo / src, out.parent)).as_posix()
        rows.append(
            "| {id} | [{src}]({link}) | {impl} | {ver} | {state} |".format(
                id=req_id,
                src=src,
                link=link,
                impl=", ".join(f"`{p}`" for p in sorted(code[req_id])) or "**none**",
                ver=", ".join(f"`{p}`" for p in sorted(tests[req_id])) or "**none**",
                state="FAIL" if not tests[req_id] else "traced",
            )
        )

    doc = "\n".join([
        GENERATED_MARKER,
        "",
        "# Traceability matrix",
        "",
        f"{len(declared)} requirement(s). "
        f"{len(declared) - len(untested)} verified, {len(untested)} with no test.",
        "",
        "Built by `trace_matrix.py` from `REQ-` tags in the source tree. Do not edit:"
        " add the tag to the code and the test instead.",
        "",
        "| Requirement | Declared in | Implementation | Verification | State |",
        "|-------------|-------------|----------------|--------------|-------|",
        *rows,
        "",
    ])

    if args.write:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(doc, encoding="utf-8")
        print(f"wrote {out.relative_to(repo)}")
    else:
        print(doc)

    for req_id in unimplemented:
        print(f"WARN  {req_id} has no implementation tag", file=sys.stderr)
    for req_id in untested:
        print(f"FAIL  {req_id} has no test", file=sys.stderr)

    return 1 if untested else 0


if __name__ == "__main__":
    sys.exit(main())
