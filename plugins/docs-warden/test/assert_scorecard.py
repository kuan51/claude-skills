#!/usr/bin/env python3
"""Assert that a scorecard reports the states we expect.

Usage: assert_scorecard.py <scorecard.json> <check-id>=<state> [...]

Run by test_scripts.py over both fixtures, and usable by hand or from CI on any
scorecard. Asserting the specific checks that must fail is what makes the
regulated fixture a real negative test: a bare non-zero exit would still pass if
the audit started failing for some unrelated reason and stopped detecting the
planted defects.
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    path, expectations = sys.argv[1], sys.argv[2:]
    with open(path, encoding="utf-8") as handle:
        card = json.load(handle)
    # A --json-out over several repositories holds an array. Say so rather than
    # raising TypeError on a list index.
    if not isinstance(card, dict):
        print(f"error: {path} holds {type(card).__name__}, not one scorecard; "
              "point this at a single repository's docs-scorecard.json",
              file=sys.stderr)
        return 2
    states = {c["id"]: c["state"] for c in card["checks"]}
    wrong = []
    for pair in expectations:
        check_id, _, expected = pair.partition("=")
        actual = states.get(check_id, "absent")
        if actual != expected:
            wrong.append(f"{check_id}: expected {expected}, got {actual}")
    if wrong:
        for line in wrong:
            print(f"error: {line}", file=sys.stderr)
        return 1
    print(f"as expected: {', '.join(expectations)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
