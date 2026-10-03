"""--coach must never be accepted and then silently skipped.

The defect this file pins, measured 3 Sep 2026 in a 3.12 venv with the Strands SDK installed:
`grind --harness cursor --coach` printed the "trace cannot be drawn" line, no coach block, no
verdict, no warning, and exited 0. This was not a missing dependency; the coach had no inputs. The
README's own claim is "it never degrades quietly", and this was the one place it did.

Cursor and Codex now get an activity coach with explicit capability limits. Unsupported claim
evidence remains unknown, and a provider failure still prevents publishing.
"""
import os
import subprocess
import sys

from agentgrinder.cli import COACH_NEEDS, coach_degraded_banner

from test_harness_auto import codex_home, cursor_home, run_grind

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_the_banner_names_the_fields_the_parsed_run_actually_lacks():
    """Read off the run, not off a list someone must remember to update."""
    run = {"files_touched": None, "commits": None, "turns_typed": 3}
    text = coach_degraded_banner("Cursor", run)
    assert "DEGRADED" in text
    for field in COACH_NEEDS:
        assert field in text, field
    # a harness that does supply a field must not be accused of missing it
    text2 = coach_degraded_banner("Cursor", dict(run, files_touched=4, commits=1))
    assert "files_touched" not in text2 and "commits" not in text2
    assert "claims" in text2


def test_cursor_and_codex_coach_reports_supported_activity_without_inventing_claims(tmp_path,monkeypatch):
    import json
    import pytest
    pytest.importorskip('strands')
    monkeypatch.setenv('PYTHONPATH',os.pathsep.join(sys.path))
    for harness,home in [('cursor',cursor_home),('codex',codex_home)]:
        fixture_home = home(tmp_path/harness)
        selected = [str(next(fixture_home.glob('.cursor/projects/*/agent-transcripts/*/*.jsonl')))] if harness == 'cursor' else []
        proc=run_grind(fixture_home,tmp_path,*selected,'--coach','--json')
        assert proc.returncode==0,proc.stdout+proc.stderr
        run=json.loads(proc.stdout)
        assert run['coach_tool_calls']==2
        assert run['coach_numbers']['claims_verified'] is None
        assert 'unavailable' in run['coach_verdict']


def test_cursor_without_coach_is_still_a_clean_exit_zero_and_no_false_alarm(tmp_path):
    """A red light that is always on is not a check. No --coach, no banner."""
    home = cursor_home(tmp_path / "home")
    selected = str(next(home.glob(".cursor/projects/*/agent-transcripts/*/*.jsonl")))
    proc = run_grind(home, tmp_path, selected, "--harness", "cursor")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "DEGRADED" not in proc.stdout


def test_codex_without_coach_is_still_a_clean_exit_zero_and_no_false_alarm(tmp_path):
    proc = run_grind(codex_home(tmp_path / "home"), tmp_path)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "DEGRADED" not in proc.stdout


def test_a_failed_native_coach_never_opens_publish(tmp_path,monkeypatch):
    from agentgrinder.cli import main
    from agentgrinder.coach import native
    from test_harness_auto import CURSOR_LINES
    source=tmp_path/'cursor.jsonl';source.write_text(CURSOR_LINES)
    def unavailable(*args):raise RuntimeError('fixture provider unavailable')
    def opened(*args):raise AssertionError('Publishing must not run after a failed coach')
    monkeypatch.setattr(native,'review_activity',unavailable)
    monkeypatch.setattr('webbrowser.open',opened)
    assert main(['grind',str(source),'--harness','cursor','--coach','--push','--no-series'])==1


def test_no_cursor_or_codex_field_is_invented_to_feed_the_coach(tmp_path):
    """A field the transcript does not contain reads None, never a fabricated 0.

    This used to grep ingest.py for the literal `"files_touched": None`. That pinned one
    IMPLEMENTATION of the rule rather than the rule, and it went red on 4 Sep 2026 when those
    parsers learned to read the file writes that were in the transcript all along. The rule it was
    protecting is the one that matters and it is asserted here on behaviour instead: a session that
    wrote nothing reports nothing, and an empty count never becomes a zero.
    """
    from agentgrinder.ingest import parse_cursor_session, parse_codex_session
    cur = tmp_path / "c.jsonl"
    cur.write_text('{"role":"user","message":{"content":"<timestamp>Wednesday, Sep 03, 2026, '
                   '10:00 AM</timestamp><user_query>go</user_query>"}}\n', encoding="utf-8")
    cod = tmp_path / "rollout-x.jsonl"
    cod.write_text('{"type":"session_meta","payload":{"cwd":"/no/such/dir"}}\n'
                   '{"type":"event_msg","timestamp":"2026-09-03T10:01:00Z","payload":{"type":"user_message","message":"go"}}\n', encoding="utf-8")
    for run, harness in ((parse_cursor_session(str(cur)), "Cursor"),
                         (parse_codex_session(str(cod)), "Codex")):
        assert run["harness"] == harness
        for field in ("files_touched", "commits", "artifacts_produced",
                      "artifacts_promised", "corrections", "reach"):
            assert run[field] is None, f"{harness} invented {field} = {run[field]!r}"
        assert run["reach_reason"], f"{harness} prints a dash with no sentence behind it"
        # and the claim rule stays out of these parsers: see tests/test_claim_rule.py
        assert "claims" not in run and "claims_verified" not in run
