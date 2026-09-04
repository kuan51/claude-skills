#!/usr/bin/env python3
"""Assert-based checks for the docs-warden scripts.

No test framework: the repo has none, and these need to run in CI behind a
plain python3 invocation. Each check builds its own scratch repo under /tmp.
"""
import datetime as dt
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
            "archetype: it-tooling\n"
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


def test_audit_reports_an_unknown_archetype_instead_of_passing():
    """Reproduced before it was fixed: copying repo-it-tooling and mistyping
    it-tooling as it-toolng left the two scorecards identical -- 8 pass, 0 fail
    both times -- differing only in "All 11" becoming "All 10" inside a reason
    string. The typo removed docs/runbook.md from the required set, so a repo
    that had actually lost its runbook would have passed."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-toolng" + chr(10) + "owner: t" + chr(10),
            encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "fail", entry
        assert "it-toolng" in entry["reason"], entry["reason"]
        assert "it-tooling" in entry["reason"], \
            f"an unknown archetype should name the known ones: {entry['reason']}"
        assert ".docs-warden.yml" in entry["fix"], entry["fix"]


def test_a_known_archetype_still_demands_its_own_documents():
    """The guard above must not be satisfiable by removing the archetype's
    contribution to the required set -- that is the bug, not the fix."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + chr(10) + "owner: t" + chr(10),
            encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "fail", entry
        assert "docs/runbook.md" in entry["reason"], \
            f"it-tooling's own document should still be required: {entry['reason']}"


def _universal_repo(repo, archetype):
    """A repo carrying every universal file, so required-files turns on the
    archetype's contribution alone. Derived from UNIVERSAL_FILES rather than
    retyped, so a change to that set cannot quietly make these assert nothing.
    """
    common = _table("_common")
    # The default forge's paths too: they left the universal set when forge
    # became declarable, and a helper that stopped writing them would make
    # every caller assert against a required-files failure it did not mean.
    expected = (list(common.UNIVERSAL_FILES)
                + list(common.FORGES[common.FORGE_DEFAULT]))
    for rel in expected:
        rel = rel[0] if isinstance(rel, tuple) else rel
        target = repo / rel
        if rel.endswith("/"):
            target.mkdir(parents=True, exist_ok=True)
            target = target / "Default.md"
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("x" + chr(10), encoding="utf-8")
    (repo / ".docs-warden.yml").write_text(
        "archetype: " + archetype + chr(10) + "owner: t" + chr(10),
        encoding="utf-8")
    return repo


def test_an_empty_required_directory_is_not_a_present_document():
    """A firmware repo whose docs/architecture/ existed and was empty reported
    "All 11 required files present". check_standards refused the same shape in
    the same file -- "an empty docs/reference/ is not an interface
    description" -- so the audit answered one question two ways depending on
    which check asked it."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "firmware")
        (repo / "docs" / "architecture").mkdir(parents=True, exist_ok=True)
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "fail", \
            f"an empty directory should not satisfy the archetype: {entry}"
        assert "docs/architecture/" in entry["reason"], entry["reason"]
        (repo / "docs" / "architecture" / "overview.md").write_text(
            "x", encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "pass", \
            f"one document in it is enough: {entry}"


def test_a_gitlab_repo_is_not_failed_for_having_no_dot_github():
    """.github/PULL_REQUEST_TEMPLATE.md and .github/CODEOWNERS were universal,
    so a GitLab repository failed required-files permanently for a forge
    convention it does not use. The plugin already refused to put LICENSE in
    the universal set on exactly this reasoning."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / "docs" / "runbook.md").write_text("x", encoding="utf-8")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + chr(10) + "forge: gitlab" + chr(10),
            encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "fail", "GitLab's own paths are still required"
        assert "merge_request_templates" in entry["reason"], entry["reason"]
        # Any of GitLab's three documented CODEOWNERS locations satisfies it.
        (repo / ".gitlab" / "merge_request_templates").mkdir(parents=True)
        (repo / ".gitlab" / "merge_request_templates" / "Default.md").write_text(
            "x", encoding="utf-8")
        (repo / "docs" / "CODEOWNERS").write_text("* @team", encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "pass", entry


def test_an_unknown_forge_fails_rather_than_requiring_nothing():
    """Same shape as the archetype guard: a typo must not quietly delete the
    review gate from the required set."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + chr(10) + "forge: githbu" + chr(10),
            encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "fail", entry
        assert "githbu" in entry["reason"] and "github" in entry["reason"], \
            entry["reason"]


# Newline as a name, because a literal escape inside a manifest written
# by these tests is a backslash this shell mangles on the way in.
NL = chr(10)


def test_a_review_date_beyond_the_cadence_is_reported():
    """review_cadence_days was printed by freshness.py and enforced nowhere, so
    a document could declare review_by 2099-01-01 under a 180-day cadence and
    never be asked about again. Setting a date that far out is not a promise to
    review; it is a promise not to."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + NL + "review_cadence_days: 180" + NL,
            encoding="utf-8")
        (repo / "docs" / "far.md").write_text(
            "---" + NL + "owner: t" + NL + "review_by: 2099-01-01" + NL
            + "---" + NL + NL + "x" + NL, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "freshness.py"), str(repo)],
            capture_output=True, text=True, check=False)
        out = result.stdout + result.stderr
        assert "docs/far.md" in out and "cadence" in out, out
        # Within the cadence, it says nothing: the rule must not simply
        # complain about every future date.
        soon = (dt.date.today() + dt.timedelta(days=30)).isoformat()
        (repo / "docs" / "far.md").write_text(
            "---" + NL + "owner: t" + NL + "review_by: " + soon + NL
            + "---" + NL + NL + "x" + NL, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "freshness.py"), str(repo)],
            capture_output=True, text=True, check=False)
        assert "cadence" not in (result.stdout + result.stderr).replace(
            "review cadence: 180 days", ""), result.stdout


SKILL_ROOT = SCRIPTS.parent


def _table(name):
    """Import a script as a module. audit.py does `from _common import ...`,
    so its own directory has to be importable, not just the file."""
    sys.path.insert(0, str(SCRIPTS))
    try:
        return __import__(name)
    finally:
        sys.path.pop(0)


def _artifact_paths(entry):
    """Every path an artifact entry names, tuple of alternatives flattened."""
    return list(entry) if isinstance(entry, tuple) else [entry]


def test_the_shipped_standards_table_is_well_formed():
    """references/standards.md invites contributors to add a dict entry, and
    nothing checked the entries already there. The PR that added three of them
    verified the reference paths resolve by hand, which is exactly the kind of
    assurance that survives one round. ciso ships structure tests over its
    control data for this reason."""
    standards = _table("standards").STANDARDS
    audit = _import_audit()
    assert standards, "the table is empty"
    for sid, spec in standards.items():
        assert sid == sid.lower() and " " not in sid, f"{sid} is not an id"
        for field in ("name", "reference", "source_version", "infer"):
            assert field in spec, f"{sid} has no {field}"
        reference = SKILL_ROOT / spec["reference"]
        assert reference.is_file(), \
            f"{sid} points at {spec['reference']}, which does not exist"
        levels, artifacts = spec.get("levels"), spec.get("artifacts")
        assert (levels is None) != (artifacts is None), \
            f"{sid} must declare exactly one of levels or artifacts"
        if levels is not None:
            assert spec.get("level_name"), \
                f"{sid} has levels and no level_name to report a bad one with"
            assert levels, f"{sid} declares an empty levels map"
            for key, entries in levels.items():
                assert isinstance(key, str), \
                    f"{sid} level {key!r} is not a string; YAML gives an int " \
                    "back for a numeric axis and the lookup normalises to str"
                assert entries, f"{sid} level {key} requires nothing"
        for rule in spec.get("extra", ()):
            assert rule in audit.EXTRA_RULES, \
                f"{sid} names extra rule {rule!r}, which does not exist"
        pools = list(levels.values()) if levels is not None else [artifacts]
        for pool in pools:
            for entry in pool:
                for path in _artifact_paths(entry):
                    assert isinstance(path, str) and path, f"{sid}: {entry!r}"
                    assert not path.startswith(("/", "~")) and ".." not in path, \
                        f"{sid} names {path}, which is not repository-relative"


def test_every_standard_reference_marks_what_it_does_not_check():
    """Each overlay's reference document must say what it leaves out, or the
    first person comparing it against the published standard reports it as
    broken. standards.md requires this of a new entry; nothing enforced it."""
    standards = _table("standards").STANDARDS
    for sid, spec in standards.items():
        text = (SKILL_ROOT / spec["reference"]).read_text(encoding="utf-8")
        # standards.md names two ways to satisfy this, and both are in use: a
        # section saying what was left out, or a (not checked) marker on rows
        # of the artifact table. Either counts; neither does not.
        lowered = text.lower()
        assert ("(not checked)" in lowered or "does not check" in lowered
                or "leaves out" in lowered), \
            f"{spec['reference']} never says what it does not check"
        assert spec["source_version"] in text, \
            f"{spec['reference']} does not name the edition it was read from " \
            f"({spec['source_version']}), so nothing dates it"


def test_the_shipped_archetype_table_is_well_formed():
    """The half of the plugin every consumer meets, and until now the half
    with no test at all."""
    archetypes = _table("archetypes").ARCHETYPES
    assert archetypes, "the table is empty"
    reference = (SKILL_ROOT / "references" / "archetypes.md").read_text(
        encoding="utf-8")
    for aid, spec in archetypes.items():
        for field in ("files", "unchecked"):
            assert field in spec, f"{aid} has no {field}"
        assert spec["files"], f"{aid} requires nothing"
        assert f"## {aid}" in reference, \
            f"{aid} has no section in references/archetypes.md"
        for path in spec["files"]:
            assert isinstance(path, str) and not path.startswith("/"), \
                f"{aid}: {path!r}"
        if spec["unchecked"]:
            assert "(not checked)" in reference, \
                "archetypes.md must mark the rows the audit does not verify"


def test_every_check_id_is_declared_once():
    """The registry declares an id and the check reports one. audit() asserts
    they agree per run; this asserts the registry itself has no duplicate,
    which would make one check's row silently replace another's."""
    audit = _import_audit()
    ids = [cid for cid, _ in audit.CHECKS]
    assert len(ids) == len(set(ids)), sorted(ids)
    assert audit.CHECK_IDS == frozenset(ids)
    for forge, paths in _table("_common").FORGES.items():
        assert isinstance(paths, list), forge
        for entry in paths:
            for path in _artifact_paths(entry):
                assert isinstance(path, str) and not path.startswith("/"), \
                    f"{forge}: {path!r}"


def test_a_repository_can_add_a_requirement_of_its_own():
    """Every requirement was skill-owned, so a team with a document their
    standard genuinely needs had nowhere to say so and no reason to trust a
    scorecard that ignored it."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / "docs" / "runbook.md").write_text("x", encoding="utf-8")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + NL
            + "extra_files: [docs/oncall.md]" + NL, encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "fail", entry
        assert "docs/oncall.md" in entry["reason"], entry["reason"]
        (repo / "docs" / "oncall.md").write_text("x", encoding="utf-8")
        assert _audit_check(repo, "required-files")["state"] == "pass"


def test_a_waiver_keeps_the_finding_visible_and_is_not_a_pass():
    """The alternative to a waiver is a permanent red row people learn to
    ignore, which costs more than the waiver does. It only works if waiving is
    visible: waived is its own state, never pass, and the reason the check gave
    is kept alongside the excuse."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + NL + "waivers:" + NL
            + '  required-files: "runbook lives in the ops wiki"' + NL,
            encoding="utf-8")
        card = _full_card(repo)
        entry = _one_check(card, "required-files")
        assert entry["state"] == "waived", entry
        assert "ops wiki" in entry["reason"], entry["reason"]
        assert "docs/runbook.md" in entry["reason"], \
            f"the waived finding should still be readable: {entry['reason']}"
        assert card["summary"]["waived"] == 1, card["summary"]
        # About this check, not the whole scorecard: the bare repo these tests
        # build fails other checks for unrelated reasons, and asserting on the
        # totals would pass for the wrong reason.
        states = {c["id"]: c["state"] for c in card["checks"]}
        assert states["required-files"] == "waived", states
        assert states["required-files"] not in ("pass", "fail"), \
            "a waived check is neither a pass nor a failure"


def test_a_waiver_without_a_reason_is_rejected():
    """Requiring the sentence is the entire control. Without it a waiver map is
    just a way to turn checks off."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + NL + "waivers:" + NL
            + "  required-files: true" + NL, encoding="utf-8")
        entry = _audit_check(repo, "manifest")
        assert entry["state"] == "fail", entry
        assert "no reason" in entry["reason"], entry["reason"]
        assert _audit_check(repo, "required-files")["state"] != "waived", \
            "a reasonless waiver must not take effect"


def test_a_waiver_for_a_check_that_does_not_exist_is_reported():
    """Same class as the archetype typo: a waiver naming nothing waives
    nothing, and silently reads as a control that is in place."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + NL + "waivers:" + NL
            + '  requird-files: "typo"' + NL, encoding="utf-8")
        entry = _audit_check(repo, "manifest")
        assert entry["state"] == "fail", entry
        assert "requird-files" in entry["reason"], entry["reason"]


def test_a_waiver_naming_a_standard_that_does_not_exist_is_reported():
    """One missing hyphen in standards:iec62304 passed validation, because the
    family prefix was known, and then waived nothing -- leaving a manifest the
    audit believed and a check the reader thought was excused."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + NL + "standards:" + NL
            + "  iec-62304: A" + NL + "waivers:" + NL
            + '  "standards:iec62304": "regulatory lead signed off"' + NL,
            encoding="utf-8")
        entry = _audit_check(repo, "manifest")
        assert entry["state"] == "fail", entry
        assert "iec62304" in entry["reason"], entry["reason"]
        assert _audit_check(repo, "standards:iec-62304")["state"] == "fail", \
            "the real check is still reported, since nothing valid waived it"


def test_the_manifest_check_cannot_waive_itself():
    """It is the check that validates waivers. Waiving it would let a
    malformed manifest silence its own report."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "it-tooling")
        (repo / ".docs-warden.yml").write_text(
            "archetype: it-tooling" + NL + "waivers:" + NL
            + '  manifest: "trust us"' + NL, encoding="utf-8")
        entry = _audit_check(repo, "manifest")
        assert entry["state"] == "fail", entry
        assert "not a waivable check" in entry["reason"], entry["reason"]


def test_waiving_the_standards_family_covers_each_declared_standard():
    """Per-standard rows would otherwise need one waiver each, which is how a
    newly declared standard quietly arrives already excused -- or, worse, how
    people give up and waive nothing."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "service")
        (repo / ".docs-warden.yml").write_text(
            "archetype: service" + NL + "standards:" + NL
            + "  eu-cra: true" + NL + "waivers:" + NL
            + '  standards: "assessed out of scope, see DEC-0009"' + NL,
            encoding="utf-8")
        entry = _audit_check(repo, "standards:eu-cra")
        assert entry["state"] == "waived", entry
        assert "DEC-0009" in entry["reason"], entry["reason"]


def test_required_files_names_what_the_archetype_declares_but_cannot_check():
    """references/archetypes.md promises a service repo docs/how-to/,
    docs/reference/ and a generated API reference; the audit demands only
    arc42.md. Nothing said so, and the standards overlays already had the
    convention -- an artifact named without a (not checked) marker is a promise
    the check keeps. A pass that names the gap keeps the two honest about each
    other, and naming beats counting: a bare number sends the reader to another
    file to learn what it stands for."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _universal_repo(Path(tmp), "service")
        (repo / "docs" / "architecture").mkdir(parents=True, exist_ok=True)
        (repo / "docs" / "architecture" / "arc42.md").write_text(
            "x", encoding="utf-8")
        entry = _audit_check(repo, "required-files")
        assert entry["state"] == "pass", entry
        assert "not checked" in entry["reason"], entry["reason"]
        declared = _table("archetypes").ARCHETYPES["service"]["unchecked"]
        for document in declared:
            assert document in entry["reason"], \
                f"{document!r} is declared and unnamed: {entry['reason']}"


def test_documents_are_found_when_the_repo_itself_lives_under_a_skipped_directory():
    """markdown_docs() matched its skip set against the absolute path, so a repo
    checked out beneath build/ or dist/ -- a CI workspace root, commonly --
    matched every one of its own documents and yielded nothing. phi-secrets then
    reported "No PHI or secret patterns in documentation" over an empty
    population, which is the false green this tool exists to catch.

    Both directions asserted: the repo's own build/ must still be skipped, or
    the fix regresses into skipping nothing at all.
    """
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "build" / "checkout"
        (repo / "docs").mkdir(parents=True)
        (repo / "docs" / "notes.md").write_text(
            "# Notes" + chr(10) * 2 + "MRN: 12345678" + chr(10), encoding="utf-8")
        entry = _audit_check(repo, "phi-secrets")
        assert entry["state"] == "fail", \
            f"the repo is under build/, so its documents went unread: {entry}"
        assert "docs/notes.md" in entry["reason"], entry["reason"]

        # The repo's own build/ output tree is still vendored, still skipped.
        (repo / "build").mkdir()
        (repo / "build" / "generated.md").write_text(
            "MRN: 87654321" + chr(10), encoding="utf-8")
        entry = _audit_check(repo, "phi-secrets")
        assert "build/generated.md" not in entry["reason"], \
            f"the skip set stopped skipping anything: {entry['reason']}"


def test_trace_matrix_reads_the_tree_when_the_repo_lives_under_a_skipped_directory():
    """Same defect in trace_matrix.py's SKIP_DIRS filter, four lines below the
    comment warning about exactly this for is_test(). Every source file was
    skipped, so every requirement reported "no test" and the standards check
    failed a conforming repository."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "vendor" / "checkout"
        (repo / "docs" / "regulatory" / "requirements").mkdir(parents=True)
        (repo / "docs" / "regulatory" / "requirements" / "r.md").write_text(
            "## REQ-FIX-001" + chr(10) * 2 + "The thing works." + chr(10),
            encoding="utf-8")
        (repo / "src").mkdir()
        (repo / "src" / "thing.py").write_text(
            "# REQ-FIX-001" + chr(10) + "def thing(): pass" + chr(10),
            encoding="utf-8")
        (repo / "tests").mkdir()
        (repo / "tests" / "test_thing.py").write_text(
            "def test_REQ_FIX_001_works(): pass" + chr(10), encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "trace_matrix.py"), str(repo)],
            capture_output=True, text=True, check=False)
        assert result.returncode == 0, \
            f"the repo is under vendor/, so its source went unread: {result.stderr}"
        assert "REQ-FIX-001" not in result.stderr, result.stderr


def _full_card(repo, *extra):
    """The whole scorecard, not one entry. These assert the run survived at all,
    so they have to see that a scorecard exists and still carries every check."""
    out = Path(repo) / "scorecard.json"
    subprocess.run(
        [sys.executable, str(SCRIPTS / "audit.py"), str(repo),
         "--json-out", str(out), "--quiet", *extra],
        capture_output=True, check=False)
    assert out.is_file(), "the audit died before writing a scorecard"
    return json.loads(out.read_text(encoding="utf-8"))


def test_audit_reports_a_malformed_generated_docs_instead_of_crashing():
    """A single entry written as a mapping rather than a one-item list is the
    natural mistake, and iterating it yielded that mapping's keys -- bare
    strings, whose .get raised AttributeError and took the whole run down. The
    same defect the standards key had; this is the sibling reading the same
    manifest.

    Driven through the CLI, because the damage was to the run and not to the
    check: a scorecard has to exist afterwards and still carry every check.
    """
    # Each shape, and what the reason has to name. A mapping or a scalar is not
    # a list at all, and saying so beats iterating it and calling its keys or
    # its characters "invalid entries" -- which is what the reader gets without
    # the outer guard, and it points at nothing they can edit.
    shapes = {
        "a mapping": ("\n  path: docs/x.md\n  command: [echo, hi]", "must be a list"),
        "a bare scalar": (" docs/x.md", "must be a list"),
        "a list of strings": ("\n  - docs/x.md", "must be a mapping"),
    }
    for label, (value, expected) in shapes.items():
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / ".docs-warden.yml").write_text(
                "archetype: it-tooling\nowner: t\ngenerated_docs:" + value + "\n",
                encoding="utf-8")
            card = _full_card(repo, "--run-generators")
            entry = _one_check(card, "generated-docs")
            assert entry["state"] == "fail", (label, entry)
            assert expected in entry["reason"], (label, entry["reason"])
            assert ".docs-warden.yml" in entry["fix"], (label, entry["fix"])
            assert len(card["checks"]) >= 11, \
                f"{label}: the other checks were lost: {len(card['checks'])}"

            # Without --run-generators too: the manifest is wrong whether or
            # not the commands run, and the skipped branch happily reported
            # a count of entries derived from a shape that has none.
            plain = _one_check(_full_card(repo), "generated-docs")
            assert plain["state"] == "fail", (label, plain)


def test_audit_survives_a_document_that_is_not_valid_utf8():
    """One Latin-1 byte -- an accent out of a legacy Windows editor -- raised
    UnicodeDecodeError from check_readme_shape and cost the whole scorecard,
    phi-secrets included. Most documents this file reads already passed
    errors="replace"; the README, the glossary and the run log did not."""
    latin1_e = bytes([0xE9])
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "README.md").write_bytes(
            b"# Thing\n\nCaf" + latin1_e + b" latte\n")
        (repo / "docs").mkdir()
        (repo / "docs" / "GLOSSARY.md").write_bytes(
            b"| Term | Definition | Do not use | Source |\n"
            b"|------|------------|------------|--------|\n"
            b"| Caf" + latin1_e + b" | A place. | coffeeshop | here |\n")
        (repo / "docs" / "notes.md").write_text(
            "MRN: 12345678\n", encoding="utf-8")
        card = _full_card(repo)
        assert len(card["checks"]) >= 11, \
            f"the run died partway: {[c['id'] for c in card['checks']]}"
        assert _one_check(card, "phi-secrets")["state"] == "fail", \
            "the planted MRN went unreported because an earlier check crashed"
        assert _one_check(card, "readme-shape")["state"] in ("pass", "warn"), \
            _one_check(card, "readme-shape")


def test_review_by_may_carry_a_time_without_killing_the_run():
    """PyYAML resolves "review_by: 2020-01-01 09:00:00" to a datetime, and
    datetime subclasses date -- so it satisfied the isinstance(v, dt.date) test
    and then raised TypeError the moment it met today's date. The audit died
    before writing a scorecard; freshness.py died before reporting any document.

    Both readers now go through _common.review_date, so they cannot drift into
    two answers for one question.
    """
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / "docs" / "note.md").write_text(
            "---\nowner: t\nreview_by: 2020-01-01 09:00:00\n---\n\n# Note\n\nx\n",
            encoding="utf-8")
        card = _full_card(repo)
        entry = _one_check(card, "front-matter")
        assert entry["state"] == "warn", \
            f"a past review_by with a time should be overdue, not {entry}"
        assert "2020-01-01" in entry["reason"], entry["reason"]

        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "freshness.py"), str(repo)],
            capture_output=True, text=True, check=False)
        assert result.returncode == 1, \
            f"freshness.py did not report the stale document: {result.stderr}"
        assert "review_by 2020-01-01 passed" in result.stdout, result.stdout


def test_the_audit_and_the_generator_read_one_glossary_the_same_way():
    """Two parsers for one table, and the audit had the stricter one: it split
    the raw line and demanded six cells, so a row written without its trailing
    pipe -- valid GitHub Markdown -- was dropped. glossary_to_vale.py strips the
    outer pipes first and kept the row, so the Vale reject list enforced terms
    the audit simultaneously reported as nonexistent.
    """
    rows = [
        "| Term | Definition | Do not use | Source |",
        "|:-----|:-----------|:-----------|:-------|",
        "| Snapshot | A captured window. | capture | here |",
    ]
    for label, table in {
        "no trailing pipe": "\n".join(r.rstrip("|").rstrip() for r in rows),
        "alignment colons": "\n".join(rows),
    }.items():
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "docs").mkdir()
            (repo / "docs" / "GLOSSARY.md").write_text(table + "\n", encoding="utf-8")
            (repo / "docs" / "note.md").write_text(
                "We take a capture every hour.\n", encoding="utf-8")
            entry = _audit_check(repo, "glossary-reject-terms")
            assert entry["state"] == "fail", \
                f"{label}: the glossary declares 'capture' and note.md uses it: {entry}"
            assert "capture" in entry["reason"], (label, entry["reason"])


def test_each_audited_repo_gets_its_own_scorecard():
    """Auditing several repositories wrote the whole array into the first one:
    a shape references/audit-schema.md does not describe, carrying the other
    repositories' results into a tree that may be published, and leaving every
    repo after the first with no scorecard at all.

    --json-out still collects everything into the one path that was asked for.
    """
    with tempfile.TemporaryDirectory() as tmp:
        repos = []
        for name in ("one", "two"):
            repo = Path(tmp) / name
            (repo / "docs").mkdir(parents=True)
            (repo / "README.md").write_text("# " + name + "\n", encoding="utf-8")
            repos.append(repo)
        subprocess.run(
            [sys.executable, str(SCRIPTS / "audit.py"), *[str(r) for r in repos],
             "--quiet"],
            capture_output=True, check=False)
        for repo in repos:
            card_path = repo / "docs-scorecard.json"
            assert card_path.is_file(), f"{repo.name} got no scorecard"
            card = json.loads(card_path.read_text(encoding="utf-8"))
            assert isinstance(card, dict), \
                f"{repo.name}'s scorecard is a {type(card).__name__}, not the documented object"
            assert Path(card["repo"]).name == repo.name, \
                f"{repo.name}'s scorecard reports {card['repo']}"

        # One path asked for, one file written, holding both.
        out = Path(tmp) / "all.json"
        subprocess.run(
            [sys.executable, str(SCRIPTS / "audit.py"), *[str(r) for r in repos],
             "--quiet", "--json-out", str(out)],
            capture_output=True, check=False)
        both = json.loads(out.read_text(encoding="utf-8"))
        assert isinstance(both, list) and len(both) == 2, both


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_the_fixtures_still_report_what_they_were_built_to_report():
    """assert_scorecard.py existed with no caller, its docstring claiming a CI
    run that does not ship. It is the assertion the fixtures deserve: the
    regulated one carries planted defects, and a bare non-zero exit would still
    pass if the audit started failing for some unrelated reason and stopped
    detecting them.

    Only environment-independent checks are named. lint is left out: it reports
    skipped or pass depending on whether vale and lychee are installed here.
    """
    expectations = {
        "repo-it-tooling": ["required-files=pass", "adr-index=pass", "links=pass",
                            "phi-secrets=pass", "standards:osps-baseline=pass"],
        "repo-regulated": ["required-files=pass", "adr-index=pass", "links=pass",
                           "phi-secrets=pass", "front-matter=warn",
                           "standards:iec-62304=fail"],
    }
    for name, expected in expectations.items():
        with tempfile.TemporaryDirectory() as tmp:
            card = Path(tmp) / "card.json"
            subprocess.run(
                [sys.executable, str(SCRIPTS / "audit.py"), str(FIXTURES / name),
                 "--quiet", "--json-out", str(card)],
                capture_output=True, check=False)
            result = subprocess.run(
                [sys.executable, str(Path(__file__).resolve().parent
                                     / "assert_scorecard.py"), str(card), *expected],
                capture_output=True, text=True, check=False)
            assert result.returncode == 0, f"{name}: {result.stderr.strip()}"


def test_adr_new_numbers_the_next_record_and_fills_the_template():
    """adr_new.py had no test at all. Its two jobs are picking the next id and
    substituting the template's tokens; an unsubstituted {{ID}} reaching a
    record is the kind of thing nobody notices until adr_index.py renders it."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        decisions = repo / "docs" / "decisions"
        decisions.mkdir(parents=True)
        (decisions / "DEC-0007-earlier.md").write_text(
            "---\nid: DEC-0007\nstatus: accepted\n---\n", encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "adr_new.py"), str(repo),
             "Use one glossary parser"],
            capture_output=True, text=True, check=False)
        assert result.returncode == 0, result.stderr
        written = sorted(p.name for p in decisions.glob("DEC-*.md"))
        assert "DEC-0008-use-one-glossary-parser.md" in written, written
        body = (decisions / "DEC-0008-use-one-glossary-parser.md").read_text(
            encoding="utf-8")
        # Only the four the script substitutes. The rest of the {{...}} are
        # prompts for the humans who made the decision, and stay.
        for token in ("{{ID}}", "{{TITLE}}", "{{DATE}}", "{{DECIDERS}}"):
            assert token not in body, f"{token} survived:\n{body}"
        assert "DEC-0008" in body and "Use one glossary parser" in body, body
        assert "proposed" in body, "a new record starts proposed"


def test_glossary_to_vale_writes_the_swap_rule_for_a_rejected_term():
    """glossary_to_vale.py had no test either, and it is the half of the
    glossary contract the audit does not run: the audit reports a rejected term
    it finds in prose, this turns the same term into the Vale rule that catches
    it everywhere else."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / "docs" / "GLOSSARY.md").write_text(
            "| Term | Definition | Do not use | Source |\n"
            "|------|------------|------------|--------|\n"
            "| Snapshot | A captured window. | capture, grab | here |\n",
            encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "glossary_to_vale.py"), str(repo)],
            capture_output=True, text=True, check=False)
        assert result.returncode == 0, result.stderr
        vocab = repo / "styles" / "config" / "vocabularies" / "Project"
        assert vocab.joinpath("accept.txt").read_text(
            encoding="utf-8").split() == ["Snapshot"]
        assert vocab.joinpath("reject.txt").read_text(
            encoding="utf-8").split() == ["capture", "grab"]
        rule = (repo / "styles" / "Clarity" / "GlossaryTerms.yml").read_text(
            encoding="utf-8")
        assert '"capture": "Snapshot"' in rule, rule
        assert '"grab": "Snapshot"' in rule, rule


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
        "archetype: service\nstandards:\n  iec-62304: A\n"
        "owner: t\nreview_cadence_days: 180\n", encoding="utf-8")
    return repo


def test_audit_reports_a_failing_trace_matrix_instead_of_every_requirement_tested():
    """check_standards grepped trace_matrix.py's stderr for 'FAIL ' lines and
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

        entry = _audit_check(repo, "standards:iec-62304")
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
            "archetype: it-tooling\n"
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
            "archetype: it-tooling\n"
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


# A table of pretend standards. The guards below are properties of the
# mechanism, not of whichever standards happen to be registered today, so
# pinning them to the real table would re-break them every time it grows.
_SYNTHETIC = {
    "levelled": {
        "name": "Levelled", "level_name": "tier", "infer": True,
        "levels": {"1": ["docs/one.md"], "2": ["docs/one.md", "docs/two.md"]},
        "extra": [],
    },
    "flat": {
        "name": "Flat", "level_name": None, "infer": False, "levels": None,
        "artifacts": ["docs/one.md"], "extra": [],
    },
}


def _standards_entries(repo, declared, table=None):
    """Every check_standards row for `repo`, keyed by check id.

    In-process rather than through audit.py's CLI, so the standards table can
    be swapped for the synthetic one above.
    """
    audit = _import_audit()
    real = audit.STANDARDS
    if table is not None:
        audit.STANDARDS = table
    try:
        rows = audit.check_standards(Path(repo), {"standards": declared},
                                     SCRIPTS)
    finally:
        audit.STANDARDS = real
    return {row["id"]: row for row in rows}


def _standards_entry(repo, declared, table=None):
    """The single row, for the many tests that declare one standard."""
    rows = _standards_entries(repo, declared, table)
    assert len(rows) == 1, f"expected one row, got {sorted(rows)}"
    return next(iter(rows.values()))


def test_standards_accepts_an_integer_level():
    """YAML parses `tier: 2` to an int and `safety_class: C` to a str, and both
    are valid levels. A bare membership test against string keys rejects the
    int -- on the happy path, for every standard with a numeric axis."""
    with tempfile.TemporaryDirectory() as tmp:
        docs = Path(tmp) / "docs"
        docs.mkdir()
        for name in ("one.md", "two.md"):
            (docs / name).write_text("x", encoding="utf-8")
        entry = _standards_entry(tmp, {"levelled": 2}, _SYNTHETIC)
        assert entry["state"] == "pass", \
            f"a valid integer level should resolve: {entry['reason']}"


def test_standards_rejects_a_level_on_a_standard_that_has_none():
    with tempfile.TemporaryDirectory() as tmp:
        entry = _standards_entry(tmp, {"flat": 2}, _SYNTHETIC)
        assert entry["state"] == "fail", entry
        assert "takes no level" in entry["reason"], entry["reason"]


def test_standards_rejects_a_bare_true_where_a_level_is_required():
    """Python's 1 == True, so an equality-based guard would also let `flat: 1`
    through. Both directions have to be identity-checked."""
    with tempfile.TemporaryDirectory() as tmp:
        entry = _standards_entry(tmp, {"levelled": True}, _SYNTHETIC)
        assert entry["state"] == "fail", entry
        assert "tier is True" in entry["reason"], entry["reason"]
        flat = _standards_entry(tmp, {"flat": 1}, _SYNTHETIC)
        assert "takes no level" in flat["reason"], flat["reason"]


def test_standards_rejects_an_unknown_id():
    with tempfile.TemporaryDirectory() as tmp:
        entry = _standards_entry(tmp, {"nope": True}, _SYNTHETIC)
        assert entry["state"] == "fail", entry
        assert "unknown standard" in entry["reason"], entry["reason"]


def test_a_shared_artifact_is_named_in_every_row_that_wants_it():
    """Two standards wanting the same path is the normal case, not a conflict.

    This reverses the earlier contract, which named a shared artifact once
    across a single combined check so a repo adopting three overlapping
    standards was not told the same thing three times. Under per-standard rows
    that would leave the standards it was *not* reported under passing while
    their artifact is absent -- a false green, assigned by manifest order. Each
    row now names it, and names the co-claimants, so one fix visibly settles
    several rows.
    """
    with tempfile.TemporaryDirectory() as tmp:
        rows = _standards_entries(tmp, {"levelled": 1, "flat": True},
                                  _SYNTHETIC)
        assert set(rows) == {"standards:levelled", "standards:flat"}, sorted(rows)
        for cid, other in (("standards:levelled", "Flat"),
                           ("standards:flat", "Levelled")):
            reason = rows[cid]["reason"]
            assert rows[cid]["state"] == "fail", rows[cid]
            assert reason.count("missing docs/one.md") == 1, reason
            assert other in reason, \
                f"{cid} should name the co-claimant so one fix covers both: {reason}"


def test_standards_runs_extra_rules_only_for_the_standard_that_declares_them():
    """qms_record and trace_requirements belong to IEC 62304 alone. They used to
    run whenever `regulated` was truthy, which was fine while 62304 was the only
    overlay. Under a standards list they must dispatch per entry, or every
    adopter of any other standard is told to add a qms_record."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "docs").mkdir()
        (repo / "docs" / "one.md").write_text("x", encoding="utf-8")
        # A regulatory tree with no qms_record anywhere: 62304's rule would
        # flag this, and no other standard should.
        regulatory = repo / "docs" / "regulatory"
        regulatory.mkdir()
        (regulatory / "plan.md").write_text(
            """---
owner: t
---

# Plan
""", encoding="utf-8")
        entry = _standards_entry(repo, {"flat": True}, _SYNTHETIC)
        assert entry["state"] == "pass", \
            f"a standard declaring no extra rules had them run: {entry['reason']}"


def test_standards_accepts_any_spelling_of_an_alternative_artifact():
    """The OSPS Baseline names four acceptable locations for a licence. A repo
    that uses COPYING conforms, and telling it a LICENSE is missing is the
    fastest way to teach people the overlay is wrong. Runs against the real
    standards table, because the alternatives are that table's content."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "COPYING").write_text("MIT" + chr(10), encoding="utf-8")
        (repo / "CONTRIBUTING.md").write_text("# Contributing" + chr(10), encoding="utf-8")
        entry = _standards_entry(repo, {"osps-baseline": 1})
        assert entry["state"] == "pass", \
            f"COPYING should satisfy the licence artifact: {entry['reason']}"

    with tempfile.TemporaryDirectory() as tmp:
        entry = _standards_entry(tmp, {"osps-baseline": 1})
        assert entry["state"] == "fail", entry
        assert "COPYING" in entry["reason"], \
            f"the reason should name every accepted spelling: {entry['reason']}"


def test_a_real_shared_artifact_names_its_co_claimant_in_both_rows():
    """sbom/ is wanted by IEC 62304 and by the CRA's Annex VII, and a medical
    device sold in the EU is under both. One SBOM satisfies both, and each row
    says so rather than either row staying silent about a file it requires."""
    with tempfile.TemporaryDirectory() as tmp:
        rows = _standards_entries(tmp, {"iec-62304": "A", "eu-cra": True})
        assert rows["standards:iec-62304"]["reason"].count("missing sbom/") == 1
        assert rows["standards:eu-cra"]["reason"].count("missing sbom/") == 1
        assert "EU Cyber Resilience Act" in rows["standards:iec-62304"]["reason"]
        assert "IEC 62304" in rows["standards:eu-cra"]["reason"]


def test_standards_reports_a_non_mapping_instead_of_crashing():
    """`standards:` holding anything but a map used to reach .items() and take
    the whole audit down with an AttributeError -- no scorecard written, and the
    ten other checks lost with it. `standards: true` is the first thing someone
    migrating from the old `regulated: true` writes.

    Goes through audit.py's CLI rather than check_standards directly, because
    the damage was to the run, not to the check: _audit_check reads the
    scorecard file, so it raises if the audit died before writing one.
    """
    for value in ("true", "iec-62304", chr(10) + "  - iec-62304"):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / ".docs-warden.yml").write_text(
                "archetype: it-tooling" + chr(10) + "owner: t" + chr(10)
                + "standards: " + value + chr(10), encoding="utf-8")
            entry = _audit_check(repo, "standards")
            assert entry["state"] == "fail", (value, entry)
            assert "must be a mapping" in entry["reason"], (value, entry["reason"])


def test_standards_reports_a_malformed_table_entry_instead_of_crashing():
    """references/standards.md invites contributors to add an entry to
    scripts/standards.py, so a half-written one is reachable by following the
    documentation. Each of these used to raise KeyError through the whole audit
    rather than naming the entry at fault."""
    broken = {
        "no artifacts and no levels":
            ({"x": {"name": "X", "levels": None, "extra": []}}, True),
        "an extra rule that does not exist":
            ({"x": {"name": "X", "levels": None, "artifacts": [],
                    "extra": ["typo_rule"]}}, True),
        "no level_name to report a bad level with":
            ({"x": {"name": "X", "levels": {"1": []}, "extra": []}}, 9),
    }
    for label, (table, level) in broken.items():
        with tempfile.TemporaryDirectory() as tmp:
            entry = _standards_entry(tmp, {"x": level}, table)
            assert entry["state"] == "fail", (label, entry)
            assert "x" in entry["reason"], (label, entry["reason"])


def test_standards_fix_points_at_whichever_file_is_actually_wrong():
    """A typo in .docs-warden.yml and a genuinely absent document are repaired in
    different files. One shared fix string told everyone to scaffold artifacts,
    which for a misspelled standard id is advice for a problem they do not have
    and points away from the one-character edit that fixes it."""
    with tempfile.TemporaryDirectory() as tmp:
        typo = _standards_entry(tmp, {"iec62304": "C"})
        assert ".docs-warden.yml" in typo["fix"], typo["fix"]
        bad_level = _standards_entry(tmp, {"iec-62304": "D"})
        assert ".docs-warden.yml" in bad_level["fix"], bad_level["fix"]
        # An empty directory declaring a real standard at a real level: the
        # artifacts are simply not there yet, and scaffolding is the answer.
        absent = _standards_entry(tmp, {"iec-62304": "A"})
        assert "Scaffold" in absent["fix"], absent["fix"]
        assert ".docs-warden.yml" not in absent["fix"], absent["fix"]


def _import_audit():
    return _table("audit")


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
