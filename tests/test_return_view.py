"""Return view: practice + comparable metrics + unknowns + next practice."""
import json
import re
from agentgrinder.metrics import headline_of
from agentgrinder.return_view import build_return_model, render_return_html
from agentgrinder.render import render_card
from agentgrinder.metrics import build_activity


def test_return_view_marks_same_artifacts_metric_comparable():
    before = {"turns_typed": 6, "artifacts_produced": 12, "claims_verified": None,
              "capabilities": {"claim_evidence": False}, "title": "A", "started": "2026-09-11T12:00:00+00:00",
              "measurement_revision": "a" * 64, "harness": "Cursor", "trace_basis": "typed-turn order"}
    after = {"turns_typed": 6, "artifacts_produced": 13, "claims_verified": None,
             "capabilities": {"claim_evidence": False}, "title": "B", "started": "2026-09-11T13:00:00+00:00",
             "measurement_revision": "b" * 64, "harness": "Cursor", "trace_basis": "typed-turn order"}
    practice = {"title": "Freeze raw before grind", "expected": "non-null revision", "source_revision": "a" * 64}
    model = build_return_model(practice, before, after, {"tried": "yes", "outcome": "keep"})
    assert model["metric"]["comparable"] is True
    assert model["metric"]["delta"] == round(13 / 6 - 12 / 6, 4)
    assert "verified claims" in model["unknowns"]
    html = render_return_html(model)
    assert "artifacts per turn" in html or "artifacts_per_turn" in html or "Comparable" in html
    assert "Export this return view" in html
    assert "Choose your next practice" in html
    assert "does not establish" in html


def test_return_view_marks_different_harness_incomparable_even_with_claims():
    """A green comparable badge must not appear when harness differs and claims are measured."""
    before = {"turns_typed": 6, "artifacts_produced": 12, "claims_verified": 2,
              "capabilities": {"claim_evidence": True}, "harness": "Claude Code",
              "trace_basis": "elapsed"}
    after = {"turns_typed": 6, "artifacts_produced": 12, "claims_verified": 3,
             "capabilities": {"claim_evidence": True}, "harness": "Cursor",
             "trace_basis": "elapsed"}
    model = build_return_model({"title": "x", "expected": "y"}, before, after)
    assert model["metric"]["comparable"] is False
    html = render_return_html(model)
    assert "Comparable under the same measurements" not in html
    assert "two separate sittings" in html


def test_return_view_marks_different_trace_basis_incomparable():
    before = {"turns_typed": 6, "artifacts_produced": 12, "claims_verified": 2,
              "capabilities": {"claim_evidence": True}, "harness": "Cursor",
              "trace_basis": "typed-turn order"}
    after = {"turns_typed": 6, "artifacts_produced": 12, "claims_verified": 3,
             "capabilities": {"claim_evidence": True}, "harness": "Cursor",
             "trace_basis": "elapsed"}
    model = build_return_model({"title": "x", "expected": "y"}, before, after)
    assert model["metric"]["comparable"] is False


def test_return_view_marks_mixed_metrics_incomparable():
    before = {"turns_typed": 6, "artifacts_produced": 12, "claims_verified": 2,
              "capabilities": {"claim_evidence": True}}
    after = {"turns_typed": 6, "artifacts_produced": 12, "claims_verified": None,
             "capabilities": {"claim_evidence": False}}
    model = build_return_model({"title": "x", "expected": "y"}, before, after)
    assert model["metric"]["comparable"] is False
    assert model["metric"]["before_id"] == "verified_per_turn"
    assert model["metric"]["after_id"] == "artifacts_per_turn"


def test_card_html_uses_artifacts_per_turn_label():
    run = {"athlete": "you", "title": "t", "harness": "Cursor", "project": "p",
           "started": "2026-09-11T12:00:00+00:00", "turns_typed": 6, "artifacts_produced": 12,
           "claims": 3, "claims_verified": None, "tool_calls": 10, "files_touched": 2,
           "commits": 0, "duration_s": 900, "rhythm": [1, 1, 1],
           "capabilities": {"claim_evidence": False}, "trace_basis": "typed-turn order"}
    html = render_card(build_activity(run))
    # The ratio is the terminal's and the return view's. The card is the feed card: since d442d80
    # (5 Oct 2026) it carries no metric hero at all, so neither a ratio nor the prompt count can
    # sit in that slot. The run's leading count is still a count it measured (here: files, before
    # tool calls), and the command line prints it from the same row the card is drawn from.
    from agentgrinder import feedcard
    row = build_activity(run).card_row
    article = html[html.index('<article class="card fc">'):html.index("</article>")]
    text = " ".join(re.sub(r"<[^>]+>", " ", html[html.index("<body"):]).split())
    assert "verified per turn" not in html and "artifacts per turn" not in html
    assert headline_of(run).text == "2.00" and "2.00" not in text       # the ratio's value is not on the page either
    assert not re.search(r'class="fc-(?:hero|numbers|n|u|stats)[ "]', article)
    assert re.search(r'<h1 class="fc-title">(.*?)</h1>', article).group(1) == "t"
    assert feedcard.headline(row) == {"n": "2", "unit": "files changed", "key": "files"}
    assert feedcard.stats(row, feedcard.headline(row)) == [("Time", "15m"), ("Turns", 6), ("Tool calls", "10")]
    assert feedcard.terminal_lines(row)[2] == "\n  2 files changed · Time 15m · Turns 6 · Tool calls 10"
    assert headline_of(run).label == "artifacts per turn"
