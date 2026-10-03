"""The install line a stranger copies off the website, pinned.

The defect this file pins, measured on a stock Mac 3 Sep 2026: the site's copy button handed out
`git clone ... && cd agentgrinder && pip install -e . && agentgrinder grind --coach`. Under
`/usr/bin/python3` (3.9.6, the python the README names) the third command exits 1 —
`editable mode currently requires a setuptools-based build`, because macOS ships pip 21.2.4 and
that predates PEP 660. The `&&` chain meant the card never rendered. The tool then printed, as
the remedy, the same `pip install -e ".[coach]"` that had just failed.

These are source contract tests. The copy command uses an isolated same-release uvx package,
never an editable system-Python install. Coach setup still names its required virtual environment.
"""
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = open(os.path.join(REPO, "site", "index.html"), encoding="utf-8").read()
README = open(os.path.join(REPO, "README.md"), encoding="utf-8").read()


def _install_cmd() -> str:
    m = re.search(r'const INSTALL_CMD="([^"]+)"', HTML)
    assert m, "site/index.html no longer defines INSTALL_CMD"
    return m.group(1)


def test_the_copy_button_uses_the_deployed_capture_package():
    cmd = _install_cmd()
    assert "pip install" not in cmd, cmd          # the command that fails on stock macOS python
    assert cmd == "uvx --from __CAPTURE_PACKAGE__ agentgrinder grind --harness auto"
    assert "git+" not in cmd and "git clone" not in cmd
    # Build/HTTP/hash and offline installed-package acceptance: test-agent-frontdoor.mjs.


def test_the_copy_button_does_not_promise_the_coach_on_a_python_that_cannot_run_it():
    # --coach on 3.9 renders the card and prints a hint. Promising it on the button is the lie.
    assert "--coach" not in _install_cmd()


def test_the_coach_line_is_separate_and_names_a_venv_on_a_newer_python():
    m = re.search(r"const COACH_CMD='([^']+)'", HTML)
    assert m, "the coach needs its own line on the page"
    coach = m.group(1)
    assert "venv" in coach and "--coach" in coach
    assert "3.10 or newer" in HTML


def test_every_coach_hint_in_the_cli_names_a_venv():
    """No message may hand back `pip install -e \".[coach]\"` bare: it cannot succeed on 3.9."""
    for rel in ("agentgrinder/cli.py", "agentgrinder/coach/tools.py"):
        src = open(os.path.join(REPO, rel), encoding="utf-8").read()
        for line_no, line in enumerate(src.splitlines(), 1):
            if "[coach]" not in line or line.lstrip().startswith("#"):
                continue
            window = "\n".join(src.splitlines()[max(0, line_no - 8):line_no + 3])
            assert "venv" in window, f"{rel}:{line_no} hints [coach] without naming a venv"


def test_the_readme_lead_command_matches_the_website():
    assert "python3 -m agentgrinder grind" in README
    # The first command block works without depending on editable-install support.
    first_block = re.search(r'```(?:sh|bash)\n(.*?)```', README, re.S).group(1)
    assert "pip install" not in first_block


def test_the_hint_the_user_actually_sees_names_a_venv_and_the_running_version():
    """Run it, do not read it: the string the coach prints when Strands is missing."""
    out = subprocess.run(
        [sys.executable, "-c",
         "import sys;sys.path.insert(0,%r);from agentgrinder.cli import coach_install_hint;"
         "print(coach_install_hint())" % REPO],
        capture_output=True, text=True, check=True).stdout
    assert "venv" in out
    assert "3.10 or newer" in out
    assert f"{sys.version_info[0]}.{sys.version_info[1]}" in out   # says which python you are on


def test_no_command_the_page_prints_promises_the_coach_without_a_venv():
    """The event page hardcoded `grind --coach --push` twice, outside INSTALL_CMD, so the fix to
    the copy button did not reach it. On a stock Mac that command now exits 1 with no verdict."""
    for n, line in enumerate(HTML.splitlines(), 1):
        if "agentgrinder grind --coach" not in line:
            continue
        if line.lstrip().startswith("//"):
            continue                      # prose about the old command, not a command
        assert "venv" in line, f"site/index.html:{n} tells a stranger to run --coach with no venv"
