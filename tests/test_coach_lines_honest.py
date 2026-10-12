"""Local coach lines state what this run measured, never an uncited statistic or a name."""
import re

from agentgrinder import ingest

NAMES = re.compile(r"Karpathy|Osmani|Hashimoto|Willison|Huntley")


def test_every_coach_line_is_free_of_statistics_and_names(monkeypatch):
    monkeypatch.setattr(ingest, "scan_history", lambda: [(None, 10, 3600), (None, 20, 7200), (None, 5, 900)])
    run = dict(duration_s=7300, turns_typed=40, tool_calls=120, commits=0, route=[0, 1, 2, 3, 4, 5, 6],
               rig={"mcps": 0, "skills": 0}, project="demo", has_rules=False, has_plan=False)
    lines = ingest.coach_lines(run)
    assert lines
    for line in lines + ingest.coach_lines(dict(run, has_rules=None, rules_lines=4, commits=1)):
        assert not NAMES.search(line), line
        assert "%" not in line, line
