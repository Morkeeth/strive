"""Run the whole Python suite and fail on any failure outside the pinned inventory.

docs/testing/failure-triage-20261012.jsonl names every test that already failed when
the inventory was taken. Those tests still run unchanged and their results are
printed; nothing is skipped or marked expected to fail. Any other failure, error or
collection problem fails this check. An inventoried test that passes also fails this
check until its row is deleted, so the inventory always equals the set of real
failures and a repaired test cannot break again unseen. Extra arguments go to pytest.
"""
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
INVENTORY = ROOT / "docs" / "testing" / "failure-triage-20261012.jsonl"


class Outcomes:
    def __init__(self):
        self.failed = set()
        self.passed = set()

    def pytest_collectreport(self, report):
        if report.failed:
            self.failed.add(report.nodeid)

    def pytest_runtest_logreport(self, report):
        if report.failed:
            self.failed.add(report.nodeid)
        elif report.when == "call" and report.passed:
            self.passed.add(report.nodeid)


def failures(count):
    return f"{count} failure is" if count == 1 else f"{count} failures are"


def main(argv):
    os.chdir(ROOT)
    pinned = {json.loads(line)["test"] for line in INVENTORY.read_text().splitlines() if line.strip()}
    outcomes = Outcomes()
    code = pytest.main(["-q", *argv], plugins=[outcomes])
    if code not in (pytest.ExitCode.OK, pytest.ExitCode.TESTS_FAILED):
        print(f"\npytest stopped with exit code {int(code)}; the suite did not run completely.")
        return int(code) or 1
    unexpected = sorted(outcomes.failed - pinned)
    repaired = sorted((pinned & outcomes.passed) - outcomes.failed)
    inventoried = len(outcomes.failed & pinned)
    print(f"\n{failures(inventoried)} in the pinned inventory ({INVENTORY.relative_to(ROOT)}).")
    if repaired:
        print(f"Inventoried tests that pass now ({len(repaired)}). Delete their rows from {INVENTORY.relative_to(ROOT)}:")
        for test in repaired:
            print(f"  {test}")
    if unexpected:
        print(f"{failures(len(unexpected))} not in the inventory:")
        for test in unexpected:
            print(f"  {test}")
    if unexpected or repaired:
        return 1
    if code == pytest.ExitCode.TESTS_FAILED and not outcomes.failed:
        print("pytest reported failures this check did not record.")
        return 1
    print("No failure outside the inventory, and no inventoried test passes.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
