#!/usr/bin/env python3
"""Assert that a scorecard reports the states we expect.

Usage: assert_scorecard.py <scorecard.json> <check-id>=<state> [...]

Used by CI on the regulated fixture, which carries planted defects. Asserting
the specific checks that must fail is what makes it a real negative test: a bare
non-zero exit would still pass if the audit started failing for some unrelated
reason and stopped detecting the planted defects.
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    path, expectations = sys.argv[1], sys.argv[2:]
    states = {c["id"]: c["state"] for c in json.load(open(path))["checks"]}
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
