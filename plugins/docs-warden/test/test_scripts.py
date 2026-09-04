#!/usr/bin/env python3
"""Assert-based checks for the docs-warden scripts.

No test framework: the repo has none, and these need to run in CI behind a
plain python3 invocation. Each check builds its own scratch repo under /tmp.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "skills" / "docs-warden" / "scripts"


def test_matrix_links_are_relative_to_the_matrix():
    """A link in docs/regulatory/traceability-matrix.md must resolve from
    docs/regulatory/, not from the repo root."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        req = repo / "docs" / "regulatory" / "requirements"
        req.mkdir(parents=True)
        (req / "pressure.md").write_text("## REQ-FIX-001\n\nThe system shall work.\n")
        (repo / "src").mkdir()
        (repo / "src" / "p.py").write_text("# REQ-FIX-001\n")
        (repo / "tests").mkdir()
        (repo / "tests" / "test_p.py").write_text("def test_REQ_FIX_001(): pass\n")

        subprocess.run([sys.executable, str(SCRIPTS / "trace_matrix.py"), str(repo), "--write"],
                       capture_output=True, check=False)
        matrix = repo / "docs" / "regulatory" / "traceability-matrix.md"
        text = matrix.read_text()

        assert "(requirements/pressure.md)" in text, \
            f"link is not relative to the matrix:\n{text}"
        assert "(docs/regulatory/requirements" not in text, \
            f"link still relative to repo root:\n{text}"
        # The link must actually resolve from the matrix's own directory --
        # parse it out of the generated text rather than assuming it, so a
        # wrong or missing link fails this instead of a coincidental match.
        m = re.search(r"\[docs/regulatory/requirements/pressure\.md\]\(([^)]+)\)", text)
        assert m, f"no link found for pressure.md in:\n{text}"
        target = (matrix.parent / m.group(1)).resolve()
        assert target.is_file(), f"{target} does not exist"


def test_audit_reports_a_failing_generator_instead_of_in_sync():
    """The headline defect this test exists for: audit.py ran the command with
    check=False and never read returncode, judging staleness only by
    before != after. A generator that exits non-zero without writing is
    byte-identical to one with nothing to do, so a broken generator reported
    'in sync' -- a gate that is green precisely because it stopped working."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / "gen.py").write_text(
            "import sys\nsys.stderr.write('generator is broken\\n')\nsys.exit(3)\n",
            encoding="utf-8")
        (repo / "target.md").write_text("untouched\n", encoding="utf-8")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling\nregulated: false\nsafety_class: null\n"
            "owner: t\nreview_cadence_days: 180\n"
            'generated_docs:\n  - path: target.md\n    command: ["python3", "gen.py"]\n',
            encoding="utf-8")
        out = repo / "s.json"
        subprocess.run(
            [sys.executable, str(SCRIPTS / "audit.py"), str(repo),
             "--run-generators", "--json-out", str(out)],
            capture_output=True, check=False)
        import json
        card = json.loads(out.read_text(encoding="utf-8"))
        entry = [c for c in card["checks"] if c["id"] == "generated-docs"][0]
        assert entry["state"] != "pass", \
            f"a generator exiting 3 was reported as {entry['state']}: {entry['reason']}"
        assert "3" in entry["reason"], \
            f"the exit code should be diagnosable from the reason: {entry['reason']}"
        assert (repo / "target.md").read_text(encoding="utf-8") == "untouched\n"


def _one_check(card, check_id):
    """Pull one scorecard entry out by id. A missing id is a test failure with a
    readable message, not an IndexError that aborts the whole run."""
    matches = [c for c in card["checks"] if c["id"] == check_id]
    assert matches, \
        f"no check with id {check_id!r}; got {sorted(c['id'] for c in card['checks'])}"
    return matches[0]


def _audit_check(repo, check_id, *extra):
    """Run audit.py over repo and return the one scorecard entry asked for."""
    out = Path(repo) / "scorecard.json"
    subprocess.run(
        [sys.executable, str(SCRIPTS / "audit.py"), str(repo),
         "--json-out", str(out), "--quiet", *extra],
        capture_output=True, check=False)
    card = json.loads(out.read_text(encoding="utf-8"))
    return _one_check(card, check_id)


def _regulated_repo(tmp):
    """A class-A regulated repo with every required artifact present, and a
    requirements/ directory that is non-empty but declares no REQ heading --
    so trace_matrix.py exits non-zero without emitting a single FAIL line."""
    repo = Path(tmp)
    front = "---\nowner: t\nreview_by: 2099-01-01\nqms_record: Q-1\n---\n\n# Doc\n\nx\n"
    for rel in ["docs/regulatory/software-development-plan.md",
                "docs/regulatory/requirements/index.md",
                "docs/regulatory/soup.md",
                "docs/regulatory/threat-model.md",
                "docs/regulatory/ddf-index.md",
                "docs/regulatory/verification/unit.md"]:
        target = repo / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(front, encoding="utf-8")
    (repo / "sbom").mkdir()
    (repo / "sbom" / "sbom.json").write_text("{}\n", encoding="utf-8")
    (repo / ".docs-warden.yml").write_text(
        "archetype: service\nregulated: true\nsafety_class: A\n"
        "owner: t\nreview_cadence_days: 180\n", encoding="utf-8")
    return repo


def test_audit_reports_a_failing_trace_matrix_instead_of_every_requirement_tested():
    """check_regulated grepped trace_matrix.py's stderr for 'FAIL ' lines and
    never read its returncode. trace_matrix.py exits 1 with no FAIL line when
    there is no requirements directory, or one that declares nothing -- so
    'untested' came back empty and a regulated repo with zero requirements was
    told every requirement is tested."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _regulated_repo(tmp)
        matrix = subprocess.run(
            [sys.executable, str(SCRIPTS / "trace_matrix.py"), str(repo)],
            capture_output=True, text=True, check=False)
        assert matrix.returncode != 0, "premise broken: trace_matrix.py exited 0"

        entry = _audit_check(repo, "regulated")
        assert entry["state"] != "pass", \
            f"a repo with no declared requirements was reported {entry['state']}: {entry['reason']}"
        assert "trace_matrix" in entry["reason"], \
            f"the failing trace step should be named in the reason: {entry['reason']}"
        assert str(matrix.returncode) in entry["reason"], \
            f"the exit code should be diagnosable from the reason: {entry['reason']}"
        assert "no requirements declared" in entry["reason"], \
            f"the subprocess output should be diagnosable from the reason: {entry['reason']}"
        assert "no test for" not in entry["reason"], \
            f"a broken trace step must not be reported as an untested requirement: {entry['reason']}"


def _accepted_record_edited_after_acceptance(tmp, status_line):
    """A git repo with one accepted DEC record and one commit that edits it
    after acceptance. status_line is written verbatim into the front matter."""
    repo = Path(tmp)
    (repo / "docs" / "decisions").mkdir(parents=True)
    record = repo / "docs" / "decisions" / "DEC-0001-t.md"
    record.write_text(
        f"---\nid: DEC-0001\ntitle: T\nstatus: {status_line}\ndate: 2026-01-01\n"
        "owner: t\nreview_by: 2099-01-01\n---\n\n# T\n\nbody\n", encoding="utf-8")
    for args in (["init", "-q", "."], ["config", "user.email", "t@t"],
                 ["config", "user.name", "t"], ["add", "-A"],
                 ["commit", "-qm", "accept"]):
        subprocess.run(["git", *args], cwd=repo, capture_output=True, check=True)
    record.write_text(record.read_text(encoding="utf-8") + "EDITED AFTER ACCEPTANCE\n",
                      encoding="utf-8")
    for args in (["add", "-A"], ["commit", "-qm", "edit"]):
        subprocess.run(["git", *args], cwd=repo, capture_output=True, check=True)
    return repo


def test_adr_immutability_asks_accepted_the_same_way_load_adrs_does():
    """The check selected records by parsing YAML (status == 'accepted') but
    located the acceptance commit with a raw-blob regex requiring a bare
    'accepted' at end of line. status: "accepted" and an accepted line with a
    trailing comment satisfy one and not the other, so a real post-acceptance
    edit was reported as 'skipped | not yet committed' -- a false reason on a
    record that is committed."""
    for status_line in ['accepted', '"accepted"', 'accepted  # ratified']:
        with tempfile.TemporaryDirectory() as tmp:
            repo = _accepted_record_edited_after_acceptance(tmp, status_line)
            entry = _audit_check(repo, "adr-immutability")
            assert entry["state"] == "fail", \
                (f"status: {status_line} -- post-acceptance edit reported as "
                 f"{entry['state']}: {entry['reason']}")
            assert "DEC-0001" in entry["reason"], \
                f"status: {status_line} -- {entry['reason']}"


def test_audit_fails_a_generator_that_never_writes_its_declared_path():
    """Staleness is before != after, and both are None when the target does not
    exist -- so a generator that exits 0 and writes nothing to the declared path
    was byte-identical to one already in sync. A typo in path, or output that
    moved, turned this gate permanently green."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling\nregulated: false\nsafety_class: null\n"
            "owner: t\nreview_cadence_days: 180\n"
            'generated_docs:\n  - path: does-not-exist.md\n    command: ["true"]\n',
            encoding="utf-8")
        entry = _audit_check(repo, "generated-docs", "--run-generators")
        assert entry["state"] != "pass", \
            f"a path the generator never wrote was reported {entry['state']}: {entry['reason']}"
        assert "does-not-exist.md" in entry["reason"], \
            f"the missing path should be named in the reason: {entry['reason']}"


def test_generated_docs_confines_the_declared_path_to_the_repo():
    """Pins the one property the containment comment may claim: the declared
    path -- the before/after comparison target -- cannot be pointed outside the
    audited tree, by absolute path, by .., or through a symlink. The command
    itself is unconstrained and the comment must not claim otherwise."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "repo"
        repo.mkdir()
        outside = Path(tmp) / "outside3.md"
        outside.write_text("---\nowner: t\nreview_by: 2099-01-01\n---\n\nx\n",
                           encoding="utf-8")
        vectors = {
            "outside1.md":
                f'  - path: {Path(tmp) / "outside1.md"}\n    command: ["true"]\n',
            "outside2.md":
                '  - path: ../outside2.md\n    command: ["true"]\n',
        }
        try:
            (repo / "escape.md").symlink_to(outside)
        except OSError:
            # Creating one needs SeCreateSymbolicLinkPrivilege on Windows,
            # which a stock account does not hold. The absolute and .. vectors
            # still run; say the third did not rather than passing quietly.
            print("  note: symlink vector not covered -- cannot create one here")
        else:
            vectors["escape.md"] = (
                '  - path: escape.md\n    command: ["true"]\n')

        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling\nregulated: false\nsafety_class: null\n"
            "owner: t\nreview_cadence_days: 180\ngenerated_docs:\n"
            + "".join(vectors.values()),
            encoding="utf-8")
        entry = _audit_check(repo, "generated-docs", "--run-generators")
        assert entry["state"] == "fail", \
            f"an out-of-repo path was reported {entry['state']}: {entry['reason']}"
        for name in vectors:
            assert name in entry["reason"], \
                f"{name} was not rejected: {entry['reason']}"


def test_adr_pointer_has_no_table_and_link_resolves():
    """docs/decisions/README.md is a pointer to docs/DECISIONS.md, not a second
    copy of its table -- adr_index.py used to render() the same table twice,
    differing only in title and link prefix, so every new decision rewrote the
    table in two places.

    The link assertion is the one that earns its place: the index sits one level
    up from the records, so it is ../DECISIONS.md. ../../DECISIONS.md points at a
    repository-root path that has not existed since DEC-0010."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs" / "decisions").mkdir(parents=True)
        (repo / "docs" / "decisions" / "DEC-0001-t.md").write_text(
            "---\nid: DEC-0001\ntitle: T\nstatus: accepted\ndate: 2026-01-01\n"
            "owner: t\nreview_by: 2099-01-01\n---\n\n# T\n\nbody\n", encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "adr_index.py"), str(repo)],
            capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

        pointer = repo / "docs" / "decisions" / "README.md"
        text = pointer.read_text(encoding="utf-8")
        assert text.startswith(
            "<!-- GENERATED by docs-warden - do not edit -->"
        ), f"pointer does not start with the generated marker: {text!r}"
        assert "|" not in text, f"pointer still carries a table row: {text!r}"
        # A named record would make the file churn on every new decision,
        # which is the duplication the pointer exists to remove. The literal
        # DEC-NNNN in the prose is a placeholder and does not match.
        assert not re.search(r"DEC-\d{4}", text), \
            f"pointer names a decision record: {text!r}"

        match = re.search(r"\]\(([^)]+)\)", text)
        assert match, f"pointer has no link: {text!r}"
        target = (pointer.parent / match.group(1)).resolve()
        assert target.is_file(), f"link target does not resolve: {target}"
        assert target == (repo / "docs" / "DECISIONS.md").resolve(), \
            f"link points to {target}, not docs/DECISIONS.md"


def test_links_fails_on_a_dangling_relative_link_and_passes_once_it_resolves():
    """The one class of broken link that needs no tooling at all. lychee is
    optional and offline=false, so nothing caught it locally -- which is how
    trace_matrix.py shipped links resolving to docs/regulatory/docs/regulatory."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "README.md").write_text(
            "# R\n\nSee [the guide](docs/guide.md).\n", encoding="utf-8")

        entry = _audit_check(repo, "links")
        assert entry["state"] == "fail", \
            f"a dangling relative link was reported {entry['state']}: {entry['reason']}"
        assert "README.md" in entry["reason"], \
            f"the containing file should be named: {entry['reason']}"
        assert "docs/guide.md" in entry["reason"], \
            f"the missing target should be named: {entry['reason']}"

        (repo / "docs").mkdir()
        (repo / "docs" / "guide.md").write_text("# G\n", encoding="utf-8")
        after = _audit_check(repo, "links")
        assert after["state"] == "pass", \
            f"a resolving link was reported {after['state']}: {after['reason']}"


def test_links_ignores_targets_inside_code_fences():
    """A link in a documentation example is not a defect. strip_code() already
    exists for exactly this and is reused rather than re-implemented."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "README.md").write_text(
            "# R\n\nExample:\n\n```markdown\n[a](never-created.md)\n```\n\n"
            "And inline `[b](also-never.md)` too.\n", encoding="utf-8")

        entry = _audit_check(repo, "links")
        assert entry["state"] == "pass", \
            f"a link inside a code sample was treated as real: {entry['reason']}"


def test_links_ignores_anchors_and_external_urls():
    """Anchor resolution is lychee's job and external URLs need the network;
    neither belongs in a check that must run everywhere with no dependency."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "README.md").write_text(
            "# R\n\n[up](#a-heading) [out](https://example.invalid/nope)\n"
            "[mail](mailto:nobody@example.com)\n", encoding="utf-8")

        entry = _audit_check(repo, "links")
        assert entry["state"] == "pass", \
            f"an anchor, URL or mailto was treated as a repo path: {entry['reason']}"


def test_links_skips_shipped_example_assets():
    """Example and template assets cross-reference documents an adopting repo
    would generate. Those placeholders are not broken documentation."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "README.md").write_text("# R\n", encoding="utf-8")
        example = repo / "plugins" / "x" / "skills" / "y" / "assets" / "examples"
        example.mkdir(parents=True)
        (example / "sample-ontology.md").write_text(
            "# S\n\n[Customer](customer-concept.md)\n", encoding="utf-8")

        entry = _audit_check(repo, "links")
        assert entry["state"] == "pass", \
            f"a placeholder inside assets/examples was reported: {entry['reason']}"


def test_links_ignores_untracked_and_ignored_markdown_in_a_git_repo():
    """Git-ignored scratch (.superpowers/, .claude/worktrees/) is not this
    repository's documentation. markdown_docs() does not skip it, so the check
    enumerates tracked files when it can."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        (repo / "README.md").write_text("# R\n", encoding="utf-8")
        (repo / ".gitignore").write_text("scratch/\n", encoding="utf-8")
        scratch = repo / "scratch"
        scratch.mkdir()
        (scratch / "notes.md").write_text(
            "# N\n\n[gone](nowhere-at-all.md)\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "README.md", ".gitignore"],
                       check=True, capture_output=True)

        entry = _audit_check(repo, "links")
        assert entry["state"] == "pass", \
            f"a git-ignored file was scanned: {entry['reason']}"


def _lint_entry(repo, installed):
    """check_lint against `repo` with exactly `installed` discoverable -- a map
    of tool name to the exit code its run reports.

    Patches which() and run() in-process rather than putting a stub on PATH. A
    stub written as an extensionless sh script is invisible to which() on
    Windows, which matches PATHEXT extensions only, so whichever linters the
    machine happened to have installed answered instead -- and these tests
    flipped between one box and the next, and between before and after someone
    installed vale.
    """
    audit = _import_audit()
    real_which, real_run = audit.shutil.which, audit.subprocess.run
    audit.shutil.which = lambda name, *a, **k: (
        f"/stub/{name}" if name in installed else None)
    audit.subprocess.run = lambda argv, **k: subprocess.CompletedProcess(
        argv, installed[Path(argv[0]).name], stdout="", stderr="")
    try:
        return audit.check_lint(Path(repo))
    finally:
        audit.shutil.which, audit.subprocess.run = real_which, real_run


def test_lint_fails_when_a_blocking_tool_reports_findings():
    """DEC-0004: markdownlint and lychee block from the start. check_lint capped
    every tool at warn, so audit.py exited 0 where CI blocks."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "repo"
        repo.mkdir()
        (repo / "README.md").write_text("# R\n", encoding="utf-8")
        (repo / "lychee.toml").write_text("offline = false\n", encoding="utf-8")

        entry = _lint_entry(repo, {"lychee": 1})
        assert entry["state"] == "fail", \
            f"lychee findings were reported {entry['state']}, not fail: {entry['reason']}"
        assert "lychee" in entry["reason"], \
            f"the failing tool should be named: {entry['reason']}"


def test_lint_only_warns_when_vale_alone_reports_findings():
    """Vale stays advisory until its rules are promoted, per DEC-0004."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "repo"
        repo.mkdir()
        (repo / "README.md").write_text("# R\n", encoding="utf-8")
        (repo / ".vale.ini").write_text("StylesPath = styles\n", encoding="utf-8")

        entry = _lint_entry(repo, {"vale": 1})
        assert entry["state"] == "warn", \
            f"vale findings were reported {entry['state']}, not warn: {entry['reason']}"


def test_lint_never_reports_a_bare_pass_when_a_tool_was_absent():
    """The module docstring promises a check whose tool is missing reports
    skipped and never pass. With one of three present and clean, check_lint
    returned pass."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "repo"
        repo.mkdir()
        (repo / "README.md").write_text("# R\n", encoding="utf-8")
        (repo / ".vale.ini").write_text("StylesPath = styles\n", encoding="utf-8")

        entry = _lint_entry(repo, {"vale": 0})
        assert entry["state"] != "pass", \
            f"one clean tool of three reported {entry['state']}: {entry['reason']}"
        assert "markdownlint-cli2" in entry["reason"] and "lychee" in entry["reason"], \
            f"the tools that never ran should be named: {entry['reason']}"


def test_lint_reports_skipped_and_says_how_to_unskip_when_nothing_is_adopted():
    """A skipped cell that does not say how to unskip it is why all three sat
    quietly absent on every local run."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "README.md").write_text("# R\n", encoding="utf-8")

        entry = _audit_check(repo, "lint")
        assert entry["state"] == "skipped", \
            f"no linter adopted should be skipped, got {entry['state']}: {entry['reason']}"
        assert "assets/lint" in entry["fix"], \
            f"the fix should say where the configs come from: {entry['fix']}"
        assert "CI blocks on" in entry["fix"], \
            f"the fix should warn that CI blocks: {entry['fix']}"


def test_lint_names_the_install_for_an_adopted_but_missing_tool():
    """Config present, binary absent: the cell must name how to get it."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "README.md").write_text("# R\n", encoding="utf-8")
        (repo / ".vale.ini").write_text("StylesPath = styles\n", encoding="utf-8")

        entry = _lint_entry(repo, {})
        assert entry["state"] == "skipped", \
            f"expected skipped, got {entry['state']}: {entry['reason']}"
        assert "vale" in entry["fix"] and "vale" in entry["reason"], \
            f"vale should be named as adopted but unrun: {entry['reason']} / {entry['fix']}"


def _import_audit():
    """Import audit.py as a module. It does `from _common import ...`, so its
    own directory has to be importable, not just the file."""
    sys.path.insert(0, str(SCRIPTS))
    try:
        import audit
        return audit
    finally:
        sys.path.pop(0)


def test_lint_runner_resolves_npx_instead_of_returning_a_bare_name():
    """Windows CreateProcess does not probe PATHEXT and Node ships npx.CMD, not
    npx.exe, so a bare "npx" in the argv raised FileNotFoundError and cost the
    whole scorecard -- not just the lint row, but every check that needs no
    tooling at all. which() had already resolved the path; this threw it away.

    Asserted on the argv rather than through a stub on PATH: a stub written as
    an extensionless sh script is invisible to which() on Windows.
    """
    audit = _import_audit()
    tool = next(t for t in audit.LINT_TOOLS if t["name"] == "markdownlint-cli2")
    resolved = r"C:\Program Files\nodejs\npx.CMD"

    real_which = audit.shutil.which
    audit.shutil.which = lambda name, *a, **k: resolved if name == "npx" else None
    try:
        argv = audit._lint_runner(tool)
    finally:
        audit.shutil.which = real_which

    assert argv is not None, "npx resolves, so the fallback should be usable"
    assert argv[0] == resolved, \
        f"argv[0] is {argv[0]!r}, not the path which() resolved -- subprocess cannot run it"
    assert argv[1:] == ["--yes", audit.MARKDOWNLINT], \
        f"the pinned npx arguments changed: {argv[1:]}"


def test_lint_runner_falls_back_to_bunx_when_only_bun_is_installed():
    """Some machines have Bun and no Node, so npx is not on PATH but bunx is.

    Not a drop-in argv swap. npx needs --yes to skip its install prompt; bunx
    never prompts and documents no --yes, so it is not sent one. (bun 1.3.11
    does silently ignore a stray --yes -- tolerance that is not in `bunx
    --help` and so is not a contract.) Hence ordered candidate argvs.

    Monkeypatched rather than stubbed on PATH for the same reason as the npx
    test above -- and here it also matters that bunx is bunx.exe on Windows.
    """
    audit = _import_audit()
    tool = next(t for t in audit.LINT_TOOLS if t["name"] == "markdownlint-cli2")
    resolved = r"C:\Users\dev\.bun\bin\bunx.exe"

    real_which = audit.shutil.which
    audit.shutil.which = lambda name, *a, **k: resolved if name == "bunx" else None
    try:
        argv = audit._lint_runner(tool)
    finally:
        audit.shutil.which = real_which

    assert argv is not None, "bunx resolves, so it should be usable as a fallback"
    assert argv[0] == resolved, \
        f"argv[0] is {argv[0]!r}, not the path which() resolved -- subprocess cannot run it"
    assert "--yes" not in argv, \
        f"bunx documents no --yes; npx's argv was reused verbatim: {argv}"
    assert argv[1:] == [audit.MARKDOWNLINT], \
        f"the pinned bunx arguments changed: {argv[1:]}"


def test_lint_runner_prefers_npx_when_both_runners_are_installed():
    """The fallbacks are ordered, not a set. A machine with both Node and Bun
    keeps running what CI runs; bunx is the fallback, never the default."""
    audit = _import_audit()
    tool = next(t for t in audit.LINT_TOOLS if t["name"] == "markdownlint-cli2")

    real_which = audit.shutil.which
    audit.shutil.which = lambda name, *a, **k: (
        None if name == "markdownlint-cli2" else f"/usr/bin/{name}")
    try:
        argv = audit._lint_runner(tool)
    finally:
        audit.shutil.which = real_which

    assert argv[0] == "/usr/bin/npx", \
        f"npx is first in the fallback order, but {argv[0]!r} was chosen"


def main():
    failures = []
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_"):
            continue
        try:
            fn()
            print(f"PASS {name}")
        except Exception as exc:
            # Catch Exception, not just AssertionError: an unexpected error used
            # to abort the run, so every check after it silently never ran.
            label = "" if isinstance(exc, AssertionError) else f"{type(exc).__name__}: "
            failures.append(f"{name}: {label}{exc}")
            print(f"FAIL {name}")
    for line in failures:
        print(f"error: {line}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
