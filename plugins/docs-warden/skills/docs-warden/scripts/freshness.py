#!/usr/bin/env python3
"""Report documents that have gone stale.

Usage: freshness.py <repo>

Two independent ways a document goes stale:

  1. Calendar   -- review_by has passed. The point is not that the document is
                   wrong on that date; it is that somebody has to look.
  2. Code drift -- the document references a source path whose last commit is
                   newer than the document's. This catches the real failure
                   mode, where the code moved and no date was involved.

Calendar staleness fails. Code drift warns: a document can legitimately outlive
a refactor. A review_by further out than the declared review_cadence_days warns
too -- that is the loophole the cadence exists to close.
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

from _common import (
    RUNLOG,
    RUNLOG_ARCHIVE_DIR,
    git,
    is_git_repo,
    load_config,
    markdown_docs,
    read_front_matter,
    review_date,
)

RUNLOG_ROTATE_LINES = 500

# Backticked things that look like a path into the repo.
PATH_REF_RE = re.compile(r"`([\w./-]+\.[A-Za-z0-9]{1,6})`")


def last_commit_epoch(repo: Path, rel: str):
    out = git(repo, "log", "-1", "--format=%ct", "--", rel)
    if not out or not out.strip():
        return None
    return int(out.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description="Report stale documents")
    parser.add_argument("repo", type=Path)
    args = parser.parse_args()

    repo = args.repo.resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 1

    config = load_config(repo) or {}
    today = dt.date.today()
    # The cadence used to be printed and nothing else, so a document could
    # declare review_by 2099-01-01 under a 180-day cadence and never be
    # reported again. A date further out than the cadence is not a promise to
    # review; it is a promise not to.
    cadence = config.get("review_cadence_days")
    horizon = None
    if isinstance(cadence, int) and not isinstance(cadence, bool) and cadence > 0:
        horizon = today + dt.timedelta(days=cadence)
    # Asked once. This was inside the loop below, forking a git process per
    # document to re-answer a question that cannot change during the run.
    tracked = is_git_repo(repo)
    failures, warnings = [], []

    for path in markdown_docs(repo):
        rel = path.relative_to(repo).as_posix()
        front, body = read_front_matter(path)

        if front.get("generated") is True:
            continue

        review_by = front.get("review_by")
        if review_by:
            due = review_date(review_by)
            if due is None:
                warnings.append(f"{rel}: review_by '{review_by}' is not an ISO date")
            if due and due < today:
                failures.append(f"{rel}: review_by {due.isoformat()} passed {(today - due).days} day(s) ago")
            elif due and horizon and due > horizon:
                warnings.append(
                    f"{rel}: review_by {due.isoformat()} is {(due - today).days} "
                    f"day(s) out, past the {cadence} day cadence")

        if not tracked:
            continue
        doc_epoch = last_commit_epoch(repo, rel)
        if doc_epoch is None:
            continue
        for ref in sorted(set(PATH_REF_RE.findall(body))):
            if ref.endswith(".md") or not (repo / ref).is_file():
                continue
            code_epoch = last_commit_epoch(repo, ref)
            if code_epoch and code_epoch > doc_epoch:
                days = (code_epoch - doc_epoch) // 86400
                warnings.append(f"{rel}: references `{ref}`, which changed {days} day(s) later")

    runlog = repo / RUNLOG
    if runlog.is_file():
        lines = len(runlog.read_text(
            encoding="utf-8", errors="replace").splitlines())
        if lines > RUNLOG_ROTATE_LINES:
            warnings.append(
                f"{RUNLOG}: {lines} lines, past the {RUNLOG_ROTATE_LINES} line rotation point. "
                f"Move entries older than 90 days into {RUNLOG_ARCHIVE_DIR}/YYYY-QN.md."
            )

    if cadence:
        print(f"review cadence: {cadence} days\n")

    for line in failures:
        print(f"FAIL  {line}")
    for line in warnings:
        print(f"WARN  {line}")
    if not failures and not warnings:
        print("All documents fresh.")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
