#!/usr/bin/env python3
"""Score a repository against the documentation standard.

Usage: audit.py <repo> [<repo> ...] [--json-out PATH] [--quiet]

Prints a Markdown scorecard and writes docs-scorecard.json. Several paths gives
one row per repo, which is the cross-repo view.

Every check returns pass, warn, fail, or skipped. A check whose tool is missing
reports skipped and never pass -- a scorecard that quietly passes checks it never
ran is worse than no scorecard, because people believe it.

Exit code is non-zero if any check failed.
"""
import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from standards import STANDARDS
from _common import (
    ARCHETYPE_FILES,
    DECISIONS,
    DECISIONS_DIR,
    GENERATED_MARKER,
    GLOSSARY,
    README,
    RUNLOG,
    RUNLOG_ARCHIVE_DIR,
    UNIVERSAL_FILES,
    git,
    is_git_repo,
    load_adrs,
    load_config,
    markdown_docs,
    parse_front_matter,
    parse_glossary,
    read_front_matter,
    review_date,
    strip_code,
)

SCHEMA_VERSION = 2

# Deliberately broad. A false positive costs a minute; a miss puts patient data
# into a git history that cannot be rewritten.
PHI_PATTERNS = [
    (r"\b\d{3}-\d{2}-\d{4}\b", "social security number"),
    (r"\bMRN[:\s#]*\d{4,}\b", "medical record number"),
    (r"\b(?:DOB|date of birth)[:\s]*\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b", "date of birth"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "private key"),
    (r"\b(?:password|pwd|secret|api[_-]?key)\s*=\s*['\"][^'\"]{6,}['\"]", "hardcoded credential"),
    (r"\b(?:Server|Data Source)=[^;\s]+;.*(?:Password|Pwd)=", "connection string"),
]

README_SECTIONS = ["quick start", "documentation"]
README_MAX_LINES = 150
README_TOC_THRESHOLD = 100
# A generated region (see references/anti-drift.md) is machine-owned: its line
# count grows with the data it renders, not with anything a human wrote, and
# this check's fix ("move depth into docs/") cannot be applied to it. Excluded
# from the line count so a generator doing its job does not trip this check.
GENERATED_REGION_RE = re.compile(
    r"<!-- BEGIN GENERATED:[^\n]*-->\n.*?<!-- END GENERATED:[^\n]*-->\n?", re.DOTALL,
)


def check(cid, state, reason, fix=""):
    return {"id": cid, "state": state, "reason": reason, "fix": fix}


def check_required_files(repo, config):
    expected = list(UNIVERSAL_FILES)
    archetype = (config or {}).get("archetype")
    for extra in ARCHETYPE_FILES.get(archetype, []):
        expected.append(extra)
    missing = [
        f for f in expected
        if not ((repo / f).is_dir() if f.endswith("/") else (repo / f).is_file())
    ]
    if not missing:
        return check("required-files", "pass", f"All {len(expected)} required files present.")
    return check(
        "required-files", "fail", "Missing: " + ", ".join(missing),
        "Run init mode; it creates only what is missing.",
    )


def long_lived_docs(repo):
    """Everything under docs/ that requires owner/review_by front matter. A stale
    architecture note is exactly as misleading as a stale CONVENTIONS, so this
    walks the whole tree rather than a fixed list of names."""
    docs = repo / "docs"
    if not docs.is_dir():
        return
    exempt = {(repo / RUNLOG).resolve()}
    archive = (repo / RUNLOG_ARCHIVE_DIR).resolve()
    decisions = (repo / DECISIONS_DIR).resolve()
    for path in sorted(docs.rglob("*.md")):
        if path.name == "README.md":
            continue
        # The run log is append-only and has no owner in the review sense: a
        # review_by on it would be a promise about entries nobody may edit.
        # Same for the rotated quarterly archives it spills into.
        if path.resolve() in exempt or archive in path.resolve().parents:
            continue
        # Decision records carry their own front matter (id, status, date) and
        # are immutable once accepted, so a review_by on one would be a promise
        # nobody is allowed to keep.
        if path.resolve().parent == decisions:
            continue
        yield path


def check_front_matter(repo):
    today = dt.date.today()
    missing, overdue = [], []
    examined = 0
    for path in long_lived_docs(repo):
        name = path.relative_to(repo).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        if text.startswith(GENERATED_MARKER):
            continue
        front, _ = read_front_matter(path)
        if front.get("generated") is True:
            continue
        examined += 1
        absent = [k for k in ("owner", "review_by") if not front.get(k)]
        if absent:
            missing.append(f"{name} ({', '.join(absent)})")
            continue
        due = review_date(front["review_by"])
        if due is None:
            missing.append(f"{name} (review_by not an ISO date)")
            continue
        if due < today:
            overdue.append(f"{name} (due {due.isoformat()})")
    if missing:
        return check(
            "front-matter", "fail", "Missing owner/review_by: " + ", ".join(missing),
            "Add the front matter block. See references/universal-set.md.",
        )
    if overdue:
        return check(
            "front-matter", "warn", "Past review_by: " + ", ".join(overdue),
            "Review the document, then push review_by out by the cadence.",
        )
    if not examined:
        # A pass over an empty population is the false green this tool exists to
        # catch. "skipped" is the honest state: nothing was verified.
        return check(
            "front-matter", "skipped", "No long-lived documents to check.",
            "Add the universal set. See references/universal-set.md.",
        )
    return check("front-matter", "pass", "Owner and review_by present and current.")


def check_adr_immutability(repo):
    if not is_git_repo(repo):
        return check("adr-immutability", "skipped", "Not a git repository.", "")
    records = [r for r in load_adrs(repo) if r["status"] == "accepted"]
    if not records:
        return check("adr-immutability", "skipped", "No accepted decision records.", "")
    violations, uncommitted, unaccepted = [], [], []
    for record in records:
        rel = record["path"].relative_to(repo).as_posix()
        # No --follow: it combines badly with --reverse (git silently drops
        # commits), and its rename detection traces a scaffolded record's
        # history back into the template it came from. Reverse in Python.
        # ponytail: a record renamed after acceptance loses the history before
        # the rename, so that edit goes unseen. Renaming an accepted record is
        # rare; the alternative is a false positive on every scaffolded record.
        log = git(repo, "log", "--format=%H", "--", rel)
        if log is None or not log.strip():
            uncommitted.append(record["id"])
            continue
        commits = log.split()[::-1]  # oldest first
        # Edits made while the record was still 'proposed' are legitimate. Only
        # commits after the one that set status: accepted are violations.
        accepted_at = None
        for index, sha in enumerate(commits):
            # "sha:path" resolves from the repository root; the "./" prefix
            # makes it relative to -C instead, which is what we need when the
            # audited tree is nested inside a larger repository.
            blob = git(repo, "show", f"{sha}:./{rel}")
            # Parsed, not regexed: load_adrs selected this record by reading
            # status out of the YAML, so the historical test has to ask the
            # question the same way. A regex for a bare "accepted" at end of
            # line missed status: "accepted" and a trailing "# ratified"
            # comment, leaving a real post-acceptance edit unreported.
            if blob and parse_front_matter(blob)[0].get("status") == "accepted":
                accepted_at = index
                break
        if accepted_at is None:
            # The record is committed -- the log above is non-empty -- but no
            # revision of it says accepted, so there is no point in history to
            # measure "after acceptance" from. Reported as its own fact: the
            # old reason claimed the record was "not yet committed", which is
            # false for a record that is.
            unaccepted.append(record["id"])
            continue
        later = commits[accepted_at + 1:]
        if later:
            violations.append(
                f"{record['id']} edited in {len(later)} commit(s) after acceptance, "
                f"latest {later[-1][:8]}"
            )
    if violations:
        return check(
            "adr-immutability", "fail", "; ".join(violations),
            "Revert the edit and write a superseding record instead. "
            "Do not fix the accepted file.",
        )
    # Both buckets mean "history cannot answer for this record", but for
    # different reasons, and saying which is the difference between a nudge to
    # commit and a nudge to commit the acceptance itself.
    unchecked = []
    if uncommitted:
        unchecked.append(f"not yet committed: {', '.join(uncommitted)}")
    if unaccepted:
        unchecked.append("committed but no revision sets status: accepted, so "
                         f"post-acceptance edits are unchecked: {', '.join(unaccepted)}")
    if len(uncommitted) + len(unaccepted) == len(records):
        return check("adr-immutability", "skipped", "; ".join(unchecked) + ".",
                     "Commit the records, and the acceptance itself; the check "
                     "reads git history.")
    checked = len(records) - len(uncommitted) - len(unaccepted)
    reason = f"{checked} accepted record(s), none edited after acceptance."
    if unchecked:
        reason += " Unchecked -- " + "; ".join(unchecked) + "."
    return check("adr-immutability", "pass", reason)


def check_adr_index(repo, script_dir):
    if not (repo / DECISIONS_DIR).is_dir():
        return check("adr-index", "skipped", f"No {DECISIONS_DIR} directory.", "")
    result = subprocess.run(
        [sys.executable, str(script_dir / "adr_index.py"), str(repo), "--check"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode == 0:
        return check("adr-index", "pass", f"{DECISIONS} matches the records.")
    return check(
        "adr-index", "fail",
        (result.stderr.strip().splitlines() or ["index out of date"])[0],
        "Run adr_index.py and commit the result.",
    )


# A manifest defect, not a generator defect, so it names the file to edit.
GENERATED_DOCS_FIX = ("Give generated_docs as a list of entries, each a mapping "
                      "with path and command, in .docs-warden.yml. "
                      "See references/audit-schema.md.")


def check_generated_docs(repo, config, run_generators):
    entries = (config or {}).get("generated_docs") or []
    if not entries:
        return check("generated-docs", "skipped", "No generated_docs declared.", "")
    # Shape is checked before the --run-generators gate, because a wrong
    # manifest is worth reporting on the default, safe invocation and not only
    # on the opt-in one -- the skipped branch below used to answer a malformed
    # manifest with a count of entries it does not have. A single entry written
    # as a mapping rather than a one-item list is the natural mistake, and
    # iterating it yielded that mapping's keys: bare strings, whose .get raised
    # AttributeError and took the whole audit down with it.
    if not isinstance(entries, list):
        return check(
            "generated-docs", "fail",
            f"generated_docs must be a list of entries, "
            f"got {type(entries).__name__}.",
            GENERATED_DOCS_FIX)
    malformed = []
    for entry in entries:
        if not isinstance(entry, dict):
            malformed.append(f"{entry!r} (entry must be a mapping)")
        elif (not entry.get("path")
                or not isinstance(entry.get("command"), list)
                or not entry.get("command")):
            malformed.append(
                f"{entry.get('path') or '?'} (command must be a non-empty list)")
    if malformed:
        return check("generated-docs", "fail",
                     "Invalid entries: " + ", ".join(malformed),
                     GENERATED_DOCS_FIX + " Keep path inside the repository.")
    if not run_generators:
        return check(
            "generated-docs", "skipped",
            f"{len(entries)} entry/entries declared; generators not run.",
            "Pass --run-generators to execute them. They are repo-supplied "
            "commands, so review them before running.",
        )
    stale, skipped, rejected, errored, missing = [], [], [], [], []
    for entry in entries:
        path, command = entry["path"], entry["command"]
        # Confines the comparison target, not the command. "repo / path"
        # silently discards repo for an absolute path and ".." escapes upward;
        # .resolve() also follows a symlink out before the prefix test. Either
        # would aim the before/after diff at a file outside the audited tree,
        # so this check keeps the file being compared inside the repo. It does
        # not confine what the generator writes: command is repo-supplied code
        # running with this audit's privileges and can write anywhere. That is
        # why --run-generators is opt-in and says to review the commands first.
        target = (repo / path).resolve()
        if not str(target).startswith(str(repo.resolve()) + os.sep):
            rejected.append(f"{path} (resolves outside the repository)")
            continue
        if target.is_dir():
            # A directory can never be read as the generated document, so
            # before and after are both None and staleness is unmeasurable.
            # Rejected here rather than passing vacuously.
            rejected.append(f"{path} (is a directory, not a document)")
            continue
        # Same reason _lint_runner resolves its runner: a bare name that which()
        # found is still unrunnable on Windows, where npm and npx are .CMD
        # shims, and the FileNotFoundError would cost the whole scorecard.
        executable = shutil.which(command[0])
        if executable is None:
            skipped.append(f"{path} ({command[0]} not on PATH)")
            continue
        existed = target.is_file()
        before = target.read_bytes() if existed else None
        result = subprocess.run([executable, *command[1:]], cwd=repo,
                                capture_output=True, check=False)
        after = target.read_bytes() if target.is_file() else None
        # A crashing or no-op generator must not be mistaken for "already
        # current" -- before == after either way, so returncode is the only
        # signal that distinguishes them. Checked before the diff so a
        # generator that both fails AND leaves a stray write is reported as
        # the failure, not silently as staleness.
        if result.returncode != 0:
            tail = result.stderr.decode("utf-8", errors="replace").strip().splitlines()[-3:]
            errored.append(f"{path} (exit {result.returncode}: {' | '.join(tail) or 'no stderr'})")
        elif after is None:
            # Absence of change read as success, one condition over from the
            # returncode bug above: before and after are both None when the
            # declared path does not exist, so a generator that exits 0 and
            # never writes it was byte-identical to one already in sync. A typo
            # in path, or output that moved, turned this gate permanently green.
            missing.append(path)
        elif before != after:
            stale.append(path)
        if before != after:
            # Restore regardless of success/failure/staleness: the check only
            # verifies, it never leaves the generator's write behind.
            if existed:
                target.write_bytes(before)
            elif target.is_file():
                target.unlink()  # generator created it; do not leave it behind
    if rejected:
        return check("generated-docs", "fail", "Invalid entries: " + ", ".join(rejected),
                     GENERATED_DOCS_FIX + " Keep path inside the repository.")
    if errored:
        return check("generated-docs", "fail", "Generator failed: " + "; ".join(errored),
                     "Fix the generator so it exits 0, then re-run.")
    if missing:
        return check("generated-docs", "fail",
                     "Generator exited 0 but produced nothing at: " + ", ".join(missing),
                     "Fix path to name what the generator actually writes.")
    if stale:
        return check("generated-docs", "fail", "Out of date: " + ", ".join(stale),
                     "Run the generator and commit the result.")
    if skipped:
        return check("generated-docs", "skipped", "Could not check: " + ", ".join(skipped),
                     "Install the tool, or let CI run this check.")
    return check("generated-docs", "pass", f"{len(entries)} generated document(s) in sync.")


# A markdown link's target: [text](target), and the target half of ![alt](target).
# Reference-style [text][label] links are not matched -- they carry no path.
# Neither half may span a newline: strip_code() removes URLs, which can leave an
# unbalanced "[text](" behind, and a newline-crossing match then swallows the next
# line's link as one target.
LINK_RE = re.compile(r"\[[^\]\n]*\]\(([^)\n]+)\)")

# Shipped examples and templates cross-reference documents an adopting repository
# would generate, so their targets are placeholders rather than broken links.
# Mirrors lychee.toml's exclude_path, which already skips whole trees by path.
EXAMPLE_ASSET_DIRS = ("examples", "templates")


def _documentation_files(repo):
    """Markdown that counts as this repository's documentation.

    Tracked files when git can answer, so git-ignored scratch (.superpowers/,
    .claude/worktrees/) is excluded -- markdown_docs() does not skip those.
    """
    if is_git_repo(repo):
        out = git(repo, "ls-files", "-z", "*.md")
        if out is not None:
            return [repo / name for name in out.split("\0") if name]
    return list(markdown_docs(repo))


def _is_example_asset(path, repo):
    parts = path.relative_to(repo).parts
    return "assets" in parts and any(d in parts for d in EXAMPLE_ASSET_DIRS)


def _relative_link_targets(text):
    """In-repo link targets only: no scheme, no mailto, not a bare anchor."""
    for raw in LINK_RE.findall(strip_code(text)):
        target = raw.strip()
        if target.startswith("<"):
            target = target[1:].split(">")[0]
        # Drop a trailing link title: [x](path "Title").
        target = target.split()[0] if target.split() else ""
        target = target.split("#")[0].strip()
        if not target or "://" in target or target.startswith("mailto:"):
            continue
        yield target


def check_links(repo):
    """Relative links resolve to a file that exists.

    Needs no tool, no network and no config, which is the point: lychee is
    optional and offline=false, so nothing caught trace_matrix.py emitting links
    that resolved to docs/regulatory/docs/regulatory. Anchors within a document
    are not validated -- that is lychee's job.
    """
    docs = [p for p in _documentation_files(repo) if not _is_example_asset(p, repo)]
    if not docs:
        return check("links", "skipped", "No documentation files to check.", "")
    broken, checked = [], 0
    for path in docs:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        name = path.relative_to(repo).as_posix()
        for target in _relative_link_targets(text):
            checked += 1
            if not (path.parent / target).exists():
                broken.append(f"{name} -> {target}")
    if broken:
        shown = "; ".join(broken[:10])
        if len(broken) > 10:
            shown += f"; and {len(broken) - 10} more"
        return check(
            "links", "fail", "Broken relative links: " + shown,
            "Fix the path, or delete the link if its target is not coming.",
        )
    return check("links", "pass",
                 f"{checked} relative link(s) across {len(docs)} document(s) resolve.")


# DEC-0004: markdownlint and lychee block from the start -- structural breakage
# and dead links are defects. Vale is advisory until its rules are promoted.
# Each tool runs only when its config is present: these are config-driven, `init`
# copies the configs, and running one without its config either errors out or
# silently applies defaults nobody chose.
# One source for the pin: anti-drift.md requires every tool version pinned, and
# it now appears in both runner argvs and the install hint.
MARKDOWNLINT = "markdownlint-cli2@0.23.2"

LINT_TOOLS = [
    {
        "name": "markdownlint-cli2",
        "configs": (".markdownlint-cli2.yaml", ".markdownlint-cli2.jsonc"),
        "blocking": True,
        # No path argument: the config's globs decide, exactly as CI invokes it.
        "argv": lambda path: [path],
        # CI never installs it globally, so accept a package runner instead.
        # Ordered fallbacks, each with its own argv: npx requires --yes to
        # skip its install prompt, and bunx documents no such flag (it never
        # prompts). Verified: bun 1.3.11 silently ignores a stray --yes, so
        # one shared argv happens to work today -- on undocumented tolerance.
        # npx stays first so a machine with both keeps running what CI runs.
        "runners": [["npx", "--yes", MARKDOWNLINT], ["bunx", MARKDOWNLINT]],
        "install": f"npx --yes {MARKDOWNLINT}, or bunx {MARKDOWNLINT} "
                   "(no install needed)",
    },
    {
        "name": "vale",
        "configs": (".vale.ini",),
        "blocking": False,
        "argv": lambda path: [path, "--minAlertLevel=warning", "."],
        "runners": [],
        "install": "download vale 3.17.1 from errata-ai/vale releases",
    },
    {
        "name": "lychee",
        "configs": ("lychee.toml",),
        "blocking": True,
        "argv": lambda path: [path, "--config", "lychee.toml", "--no-progress", "."],
        "runners": [],
        "install": "download lychee 0.24.2 from lycheeverse/lychee releases",
    },
]


def _lint_runner(tool):
    """How to invoke this tool here, or None if it cannot run."""
    path = shutil.which(tool["name"])
    if path:
        return tool["argv"](path)
    # Resolved, not the bare name: subprocess.run does not go through a shell,
    # and Windows CreateProcess does no PATHEXT probing -- Node ships npx.CMD
    # and Bun ships bunx.exe, so a bare name raises FileNotFoundError and costs
    # the whole scorecard. which() resolves it; do not discard the answer.
    for runner in tool["runners"]:
        resolved = shutil.which(runner[0])
        if resolved:
            return [resolved, *runner[1:]]
    return None


def check_lint(repo):
    findings, clean, no_config, no_tool = [], [], [], []
    for tool in LINT_TOOLS:
        name = tool["name"]
        if not any((repo / c).is_file() for c in tool["configs"]):
            no_config.append(f"{name} (no {tool['configs'][0]})")
            continue
        argv = _lint_runner(tool)
        if argv is None:
            no_tool.append(f"{name} (not installed)")
            continue
        try:
            result = subprocess.run(argv, cwd=repo, capture_output=True,
                                    text=True, check=False, timeout=300)
        except subprocess.TimeoutExpired:
            findings.append(f"{name} (timed out)")
            continue
        (findings if result.returncode != 0 else clean).append(name)

    blocking = [t["name"] for t in LINT_TOOLS if t["blocking"]]
    fix_parts = [f"{t['name']}: {t['install']}"
                 for t in LINT_TOOLS
                 if any(t["name"] in entry for entry in no_tool)]
    if no_config:
        fix_parts.append("copy the configs from the skill's assets/lint/ to the "
                         "repository root")
    fix = ". ".join(fix_parts)
    if fix:
        fix += f". CI blocks on {' and '.join(blocking)}."

    if any(f.split()[0] in blocking for f in findings):
        return check("lint", "fail", "Findings from: " + ", ".join(findings),
                     "Run the linter and fix what it reports. "
                     f"CI blocks on {' and '.join(blocking)}.")
    if findings:
        return check("lint", "warn", "Findings from: " + ", ".join(findings),
                     "Advisory until the rules are promoted (DEC-0004).")

    # Never a bare pass while anything went unrun: the module docstring promises
    # a check whose tool is missing reports skipped, never pass.
    unrun = no_config + no_tool
    if unrun:
        state = "skipped" if not clean else "warn"
        ran = f"Ran {', '.join(clean)} clean. " if clean else ""
        return check("lint", state, f"{ran}Not run: {', '.join(unrun)}.", fix)
    return check("lint", "pass", f"Ran {', '.join(clean)} clean.")


def check_glossary_reject_terms(repo):
    glossary = repo / GLOSSARY
    if not glossary.is_file():
        return check("glossary-reject-terms", "skipped", f"No {GLOSSARY}.", "")
    # The same parser glossary_to_vale.py builds the Vale reject list with. A
    # second split of the same table lived here and was the stricter of the two:
    # it needed six cells, so a row without a trailing pipe -- valid GitHub
    # Markdown -- was dropped, and the audit reported "declares no rejected
    # terms" about a glossary the generator was already enforcing. Its
    # separator-row guard also missed alignment colons.
    rejects = sorted({r for _, rejected in parse_glossary(glossary) for r in rejected})
    if not rejects:
        return check("glossary-reject-terms", "skipped",
                     "Glossary declares no rejected terms.",
                     "Fill the 'Do not use' column to make the glossary enforceable.")
    hits = []
    for path in markdown_docs(repo):
        if path == glossary:
            continue
        prose = strip_code(path.read_text(encoding="utf-8", errors="replace"))
        for term in rejects:
            if re.search(rf"\b{re.escape(term)}\b", prose, re.IGNORECASE):
                hits.append(f"'{term}' in {path.relative_to(repo).as_posix()}")
    if hits:
        return check("glossary-reject-terms", "fail", "; ".join(hits[:10]),
                     f"Use the approved term from {GLOSSARY}.")
    return check("glossary-reject-terms", "pass",
                 f"None of {len(rejects)} rejected term(s) found in prose.")


def check_phi_secrets(repo):
    hits = []
    for path in markdown_docs(repo):
        text = path.read_text(encoding="utf-8", errors="replace")
        for pattern, label in PHI_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                line = text[: match.start()].count("\n") + 1
                hits.append(f"{label} at {path.relative_to(repo).as_posix()}:{line}")
    if hits:
        return check("phi-secrets", "fail", "; ".join(hits),
                     "Remove it and rotate anything exposed. If a synthetic example "
                     "tripped this, change the example rather than adding an exception.")
    return check("phi-secrets", "pass", "No PHI or secret patterns in documentation.")


def _rule_qms_record(repo, script_dir):
    """Every regulated document names the eQMS record it belongs to.

    Git holds the working artifact; the eQMS holds the signed record. A repo of
    unsigned Markdown is not a design history, so the link is mandatory --
    'pending' is a legitimate value, absent is not.
    """
    root = repo / "docs" / "regulatory"
    if not root.is_dir():
        return []
    problems = []
    for path in sorted(root.rglob("*.md")):
        if path.read_text(encoding="utf-8", errors="replace").startswith(GENERATED_MARKER):
            continue  # generated from the source; the source carries the record
        front, _ = read_front_matter(path)
        if "qms_record" not in front:
            problems.append(f"{path.relative_to(repo).as_posix()} has no qms_record")
    return problems


def _rule_trace_requirements(repo, script_dir):
    """Every requirement has at least one test, per trace_matrix.py."""
    result = subprocess.run(
        [sys.executable, str(script_dir / "trace_matrix.py"), str(repo)],
        capture_output=True, text=True, check=False,
    )
    untested = [line.split()[1] for line in result.stderr.splitlines()
                if line.startswith("FAIL ")]
    problems = []
    # A non-zero exit with no FAIL line is trace_matrix.py declining to trace at
    # all -- no requirements directory, nothing declared, or a crash. Only FAIL
    # lines were read, so those exits left "untested" empty and the check
    # reported "every requirement tested" because the tracing step did nothing.
    # Reported as its own problem, distinct from "no test for X". Diagnostics go
    # to stderr; stdout carries the matrix itself, so only stderr is quoted.
    if result.returncode != 0 and not untested:
        tail = result.stderr.strip().splitlines()[-3:]
        problems.append(f"trace_matrix.py exited {result.returncode}: "
                        f"{' | '.join(tail) or 'no stderr'}")
    if untested:
        problems.append("no test for " + ", ".join(untested))
    return problems


# Rules that belong to one standard rather than to the check. Keyed by the names
# used in standards.py's "extra". Dispatched per declared standard, never once
# for the whole check: a repo declaring only a standard that wants none of these
# must not have them run against it.
EXTRA_RULES = {
    "qms_record": _rule_qms_record,
    "trace_requirements": _rule_trace_requirements,
}


def _artifact_present(repo, name):
    """One artifact path. A trailing slash means a directory with something in
    it -- an empty docs/reference/ is not an interface description."""
    target = repo / name
    if name.endswith("/"):
        return target.is_dir() and any(target.iterdir())
    return target.is_file()


def _artifact_satisfied(repo, entry):
    """`entry` is a path, or a tuple of paths any one of which satisfies it.

    Standards name alternatives for the same artifact -- the OSPS Baseline
    accepts a licence at LICENSE, COPYING, LICENSES/ or LICENSE/. Demanding one
    spelling would report a conforming repository as failing, which is the
    fastest way to teach people the overlay is wrong.
    """
    if isinstance(entry, tuple):
        return any(_artifact_present(repo, alt) for alt in entry)
    return _artifact_present(repo, entry)


# Two fixes, because two different things go wrong here and they are repaired in
# different files. Telling someone with a typo in .docs-warden.yml to scaffold
# artifacts sends them to the wrong place entirely.
CONFIG_FIX = ("Correct the standards map in .docs-warden.yml, or the entry in "
              "scripts/standards.py that it names. See references/standards.md.")
ARTIFACT_FIX = ("Scaffold the missing artifacts, and add a test for every requirement. "
                "Regulatory content needs the regulatory lead, not a generated draft.")


def check_standards(repo, config, script_dir):
    declared = (config or {}).get("standards") or {}
    if not declared:
        return check("standards", "skipped", "No standards declared.", "")
    # Every other shape YAML can produce here used to reach .items() and take the
    # whole run down with an AttributeError -- no scorecard, and the ten other
    # checks lost with it. "standards: true" is what someone migrating from the
    # old "regulated: true" writes first.
    if not isinstance(declared, dict):
        return check(
            "standards", "fail",
            f"standards must be a mapping of standard to level, "
            f"got {type(declared).__name__}.",
            CONFIG_FIX)

    # Config problems are a wrong manifest or a malformed standards table entry;
    # artifact problems are documents that are genuinely absent. Kept apart so
    # each gets the fix that actually applies, and so a wrong manifest is
    # reported before a list of artifacts derived from it.
    config_problems, problems, labels = [], [], []
    # Path -> the standards that want it, so an artifact two standards share is
    # required once and reported once, naming both.
    wanted = {}
    for sid, level in declared.items():
        spec = STANDARDS.get(sid)
        if spec is None:
            config_problems.append(
                f"unknown standard {sid!r}; known: {', '.join(sorted(STANDARDS))}")
            continue
        # spec.get throughout, not spec[...]: a malformed entry is a bug in the
        # standards table, and references/standards.md invites people to add
        # entries. It should be reported, not raised through the whole audit.
        name = spec.get("name", sid)
        levels = spec.get("levels")
        if levels is None:
            # Identity, not equality: Python's 1 == True would let a level slip
            # through on a standard that has no level axis.
            if level is not True:
                config_problems.append(
                    f"{sid} takes no level; expected true, got {level!r}")
                continue
            artifacts = spec.get("artifacts")
            if artifacts is None:
                config_problems.append(
                    f"the standards table entry for {sid} declares neither "
                    "levels nor artifacts")
                continue
            label = name
        else:
            level_name = spec.get("level_name") or "level"
            # YAML gives back a str for "C" and an int for 2, and both are valid
            # levels. Normalise before the lookup or every numeric axis is
            # rejected as unknown on its happy path.
            key = str(level)
            if key not in levels:
                config_problems.append(
                    f"{sid} {level_name} is {level!r}; expected "
                    + " or ".join(sorted(levels)))
                continue
            artifacts = levels[key]
            label = f"{name} {level_name} {key}"
        labels.append(label)
        for entry in artifacts:
            wanted.setdefault(entry, []).append(name)
        for rule in spec.get("extra", ()):
            runner = EXTRA_RULES.get(rule)
            if runner is None:
                config_problems.append(
                    f"the standards table entry for {sid} names unknown rule {rule!r}")
                continue
            problems += runner(repo, script_dir)

    for entry, owners in wanted.items():
        if not _artifact_satisfied(repo, entry):
            shown = " or ".join(entry) if isinstance(entry, tuple) else entry
            problems.append(f"missing {shown} ({', '.join(owners)})")

    if config_problems or problems:
        # Config first: while the manifest is wrong the artifact list derived
        # from it cannot be trusted, so that is the fix worth showing.
        return check("standards", "fail", "; ".join(config_problems + problems),
                     CONFIG_FIX if config_problems else ARTIFACT_FIX)
    return check("standards", "pass",
                 f"{len(wanted)} artifact(s) present for {', '.join(labels)}.")


def check_readme_shape(repo):
    readme = repo / README
    if not readme.is_file():
        return check("readme-shape", "fail", f"No {README}.",
                     "Copy assets/templates/README.md.tmpl.")
    # errors="replace", like every other document this file reads: one
    # non-UTF-8 byte -- a Latin-1 accent out of a legacy editor -- used to
    # raise UnicodeDecodeError here and cost the whole scorecard, all ten
    # other checks with it.
    text = readme.read_text(encoding="utf-8", errors="replace")
    lowered = text.lower()
    # Line count only: a generated region is machine-owned, so its length
    # measures the data it renders, not anything a human wrote. Section
    # presence and the table-of-contents check still read the whole file --
    # required section names or TOC links could legitimately sit inside a
    # generated region and this check has no reason to blind itself to that.
    lines = len(GENERATED_REGION_RE.sub("", text).splitlines())
    problems = [f"missing '{s}' section" for s in README_SECTIONS if s not in lowered]
    has_toc = "contents" in lowered or re.search(r"^\s*[-*] \[.+\]\(#", text, re.M)
    if lines > README_MAX_LINES:
        problems.append(f"{lines} lines, target is {README_MAX_LINES}")
    elif lines > README_TOC_THRESHOLD and not has_toc:
        problems.append(f"{lines} lines with no table of contents")
    if problems:
        return check("readme-shape", "warn", "; ".join(problems),
                     "Move depth into docs/ and link to it from the README.")
    return check("readme-shape", "pass", f"Sections present, {lines} lines.")


def audit(repo: Path, script_dir: Path, run_generators=False):
    config = load_config(repo)
    checks = [
        check_required_files(repo, config),
        check_front_matter(repo),
        check_adr_immutability(repo),
        check_adr_index(repo, script_dir),
        check_generated_docs(repo, config, run_generators),
        check_lint(repo),
        check_links(repo),
        check_glossary_reject_terms(repo),
        check_phi_secrets(repo),
        check_standards(repo, config, script_dir),
        check_readme_shape(repo),
    ]
    if config is None:
        checks.insert(0, check(
            "manifest", "fail", "No .docs-warden.yml; archetype unknown.",
            "Run init mode to propose one. Do not guess the archetype.",
        ))
    summary = {s: sum(1 for c in checks if c["state"] == s)
               for s in ("pass", "warn", "fail", "skipped")}
    return {
        "schema": SCHEMA_VERSION,
        "repo": str(repo),
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "archetype": (config or {}).get("archetype"),
        "standards": (config or {}).get("standards") or {},
        "summary": summary,
        "checks": checks,
    }


ICON = {"pass": "pass", "warn": "warn", "fail": "FAIL", "skipped": "skip"}


def _standards_label(declared):
    """"iec-62304 C, eu-cra" -- a level is shown only where one exists.

    Guarded the same way check_standards is: this renders whatever the manifest
    held, and a non-mapping there must not take the renderer down after the
    check already reported it honestly.
    """
    if not declared:
        return "none"
    if not isinstance(declared, dict):
        return "malformed"
    return ", ".join(k if v is True else f"{k} {v}" for k, v in declared.items())


def render_single(report):
    out = [f"# Documentation scorecard: {Path(report['repo']).name}", ""]
    s = report["summary"]
    out.append(f"archetype `{report['archetype']}` | "
               f"standards `{_standards_label(report['standards'])}` | "
               f"{s['pass']} pass, {s['warn']} warn, {s['fail']} fail, {s['skipped']} skipped")
    out += ["", "| Check | State | Reason | Fix |", "|-------|-------|--------|-----|"]
    for c in report["checks"]:
        out.append(f"| `{c['id']}` | {ICON[c['state']]} | {c['reason']} | {c['fix'] or '-'} |")
    return "\n".join(out)


def render_aggregate(reports):
    out = ["# Documentation scorecard: all repositories", "",
           "| Repository | Archetype | Pass | Warn | Fail | Skipped | Failing checks |",
           "|------------|-----------|------|------|------|---------|----------------|"]
    for r in reports:
        s = r["summary"]
        failing = ", ".join(f"`{c['id']}`" for c in r["checks"] if c["state"] == "fail") or "-"
        out.append(f"| {Path(r['repo']).name} | {r['archetype'] or '-'} | {s['pass']} | "
                   f"{s['warn']} | {s['fail']} | {s['skipped']} | {failing} |")
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit repository documentation")
    parser.add_argument("repos", nargs="+", type=Path)
    parser.add_argument("--json-out", type=Path,
                        help="where to write the scorecard (default: <repo>/docs-scorecard.json)")
    parser.add_argument("--quiet", action="store_true", help="write JSON only")
    parser.add_argument("--run-generators", action="store_true",
                        help="execute generated_docs commands (repo-supplied; review them first)")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    reports = []
    for raw in args.repos:
        repo = raw.resolve()
        if not repo.is_dir():
            print(f"error: {repo} is not a directory", file=sys.stderr)
            return 1
        reports.append(audit(repo, script_dir, args.run_generators))

    if not args.quiet:
        print(render_aggregate(reports) if len(reports) > 1 else render_single(reports[0]))

    payload = reports if len(reports) > 1 else reports[0]
    out_path = args.json_out or (Path(reports[0]["repo"]) / "docs-scorecard.json")
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    if not args.quiet:
        print(f"\nwrote {out_path}")

    return 1 if any(r["summary"]["fail"] for r in reports) else 0


if __name__ == "__main__":
    sys.exit(main())
