"""Self-test for keep_check.py: python test_keep_check.py

Each case edits a small sample prompt and runs the check in --pair mode, except the git-mode
case, which runs in a throwaway repository with no changes.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECK = os.path.join(HERE, "keep_check.py")

BASE = """---
name: sample
description: A sample prompt.
---

You are a sample agent. Run `npm test` when you are done, and report to the lead.

## Rules

- If the brief is missing a part, stop and say which one.
- Never install anything. Use `git status` before `git diff`.

| Tool | Use |
| --- | --- |
| `Read` | files |
| `Grep` | search |

## Report

Return the report in 3 parts.
"""


def write(p, text):
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def run(new, frozen=None):
    d = tempfile.mkdtemp()
    old_p, new_p, table = (os.path.join(d, n) for n in ("old.md", "new.md", "table.md"))
    write(old_p, BASE)
    write(new_p, new)
    args = [sys.executable, CHECK, "--pair", old_p, new_p, "--name", "sample.md", "--table", table]
    if frozen is not None:
        fl = os.path.join(d, "frozen.json")
        write(fl, json.dumps(frozen))
        args += ["--frozen-list", fl]
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", cwd=HERE)
    with open(table, encoding="utf-8") as f:
        return r.returncode, r.stdout + r.stderr, f.read()


def edit(old, new):
    assert old in BASE, old
    return BASE.replace(old, new, 1)


def test_git_mode_passes_with_no_changes():
    d = tempfile.mkdtemp()
    g = lambda *a: subprocess.run(["git", "-C", d, *a], check=True, capture_output=True)
    g("init", "-q")
    os.makedirs(os.path.join(d, "plugins", "x", "agents"))
    write(os.path.join(d, "plugins", "x", "agents", "a.md"), BASE)
    g("add", "-A")
    g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base")
    r = subprocess.run([sys.executable, CHECK, "HEAD", "plugins"], capture_output=True, text=True, encoding="utf-8", cwd=d)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "PASS" in r.stdout, r.stdout


def test_a_prompt_renamed_out_of_agents_fails():
    d = tempfile.mkdtemp()
    g = lambda *a: subprocess.run(["git", "-C", d, *a], check=True, capture_output=True)
    g("init", "-q")
    os.makedirs(os.path.join(d, "plugins", "x", "agents"))
    os.makedirs(os.path.join(d, "plugins", "x", "docs"))
    write(os.path.join(d, "plugins", "x", "agents", "a.md"), BASE)
    g("add", "-A")
    g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base")
    g("mv", "plugins/x/agents/a.md", "plugins/x/docs/a.md")
    r = subprocess.run([sys.executable, CHECK, "HEAD", "plugins"], capture_output=True, text=True, encoding="utf-8", cwd=d)
    assert r.returncode != 0, r.stdout + r.stderr
    assert "not added, deleted or renamed" in r.stdout, r.stdout


def test_a_shortening_that_keeps_every_literal_passes():
    code, out, _ = run(edit(" when you are done,", ""))
    assert code == 0, out


def test_a_lost_code_span_fails():
    code, out, _ = run(edit("Run `npm test` when you are done", "Run the tests when done"))
    assert code != 0, out
    assert "code span lost from section" in out, out


def test_a_code_span_moved_to_another_section_fails():
    new = edit("Run `npm test` when you are done, and report", "Report").replace("in 3 parts.", "in 3 parts. Run `npm test` first.")
    code, out, _ = run(new)
    assert code != 0, out
    assert "code span lost from section '(before the first heading)': 'npm test'" in out, out
    assert "code span new to section '2: ## Report': 'npm test'" in out, out


def test_an_edited_frozen_sentence_fails():
    frozen = [{"file": "sample.md", "quotes": ["Never install anything."]}]
    code, out, _ = run(edit("Never install anything.", "Install nothing."), frozen)
    assert code != 0, out
    assert "frozen text not kept word for word" in out, out


def test_an_inline_vale_comment_fails():
    code, out, _ = run(edit("Never install anything.", "Never install anything. <!-- vale off -->"))
    assert code != 0, out
    assert "is not an own-line Style.Rule = NO/YES directive" in out, out


def test_a_comment_line_between_two_table_lines_fails():
    code, out, _ = run(edit("| `Read` | files |\n", "| `Read` | files |\n<!-- vale Microsoft.Adverbs = NO -->\n"))
    assert code != 0, out
    assert "between two table lines splits the table" in out, out


def test_a_dropped_condition_is_a_table_row():
    _, _, table = run(edit("If the brief is missing a part, stop and say which one.", "Stop and say which part of the brief is missing."))
    assert "OLD: - If the brief is missing a part, stop and say which one." in table, table
    assert "NEW: - Stop and say which part of the brief is missing." in table, table
    assert "LOAD-BEARING lost {'if': 1" in table, table


def test_a_swapped_actor_is_a_table_row():
    _, _, table = run(edit("report to the lead.", "report to the user."))
    assert "OLD: Run `npm test` when you are done, and report to the lead." in table, table
    assert "NEW: Run `npm test` when you are done, and report to the user." in table, table
    assert "lost {'lead': 1} added {'user': 1}" in table, table


def main():
    tests = [(n, f) for n, f in globals().items() if n.startswith("test_")]
    failed = 0
    for n, f in tests:
        try:
            f()
            print(f"ok    {n}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {n}: {str(e)[:400]}")
    print(f"{len(tests) - failed}/{len(tests)} passed: {'PASS' if not failed else 'FAIL'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
