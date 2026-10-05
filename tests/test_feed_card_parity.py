"""The command-line card and the web feed card are one design.

site/feed-card.js draws the card in the feed, on /r/<id> and (its numbers) on the share image.
agentgrinder/feedcard.py is its Python port for the local card the CLI and the Cursor hook write.
Same rows in, same visible text and the same activity line out; same card CSS. If either file
changes alone, this fails.
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agentgrinder import feedcard  # noqa: E402

ROWS = [
    {"id": "a1", "title": "Users-morkeeth · Cursor sitting", "harness": "Cursor",
     "started": "2026-09-04T22:15:00", "prompts": 1, "tool_calls": 28, "duration_s": 340,
     "ridge": [i % 7 for i in range(50)], "profiles": {"handle": "morkeeth", "display_name": "@morkeeth"}},
    {"id": "a2", "title": "agentgrinder-public · Put the outcome on top", "harness": "Claude Code",
     "caption": "Two commits, one review.", "commits": 2, "files_touched": 5, "prompts": 12,
     "tool_calls": 1234, "wall_time_s": 5400, "rhythm": [1, 3, 2, 8, 1],
     "output_url": "https://github.com/o/r/pull/9", "profiles": {"display_name": "Local run"}},
    {"id": "a3", "title": "", "harness": "Codex", "started": "2026-09-24T09:00:00Z",
     "prompts": 0, "tool_calls": 0, "ridge_tool_calls": 98, "ridge": [0, 2, 5, 1] * 12,
     "profiles": {}},
    {"id": "a4", "title": "fix the home-page layout", "prompts": None, "tool_calls": None,
     "commits": 1, "files_touched": 1, "profiles": {"handle": "x", "github_handle": "x"}},
    {"id": "a5", "title": "<script>alert(1)</script>", "harness": "Grok Bot", "duration_s": 30,
     "meta_extra": "bot activity", "ridge": [1, 0, 0, 1, 0, 1, 0, 0, 0, 1],
     "profiles": {"display_name": "O'Neil & \"co\""}, "visibility": "anonymous"},
    {"id": "story", "title": "An unfinished attempt", "story_result": "A working draft <script>",
     "caption": "Older caption", "feedback_question": "Does this help & why?", "commits": 0},
    {"id": "bounded", "title": "Long description", "story_result": "word " * 80},
    {"id": "typed", "title": "An idea", "trace_basis": "typed-by-author", "tool_calls": 99},
    {"id": "observed", "title": "Partial recording", "trace_basis": "observed native events; timestamps unavailable", "prompts": 3},
]

JS = r"""
const F=require(process.argv[1]+'/site/feed-card.js');
const rows=JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify(rows.map(r=>F.card(r,{preview:true,heading:'h1',metaExtra:r.meta_extra||''}))));
"""


def visible(markup: str) -> str:
    text = re.sub(r"<[^>]+>", " ", markup)
    return " ".join(html.unescape(text).split())


def points(markup: str) -> list:
    return re.findall(r'points="([^"]*)"', markup)


def _js_cards():
    out = subprocess.run(["node", "-e", JS, str(ROOT), json.dumps(ROWS)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def test_python_card_is_the_web_preview_card_character_for_character():
    for row, web in zip(ROWS, _js_cards()):
        assert feedcard.card(row, meta_extra=row.get("meta_extra", ""), avatars=True) == web, row["id"]


def test_a_short_sitting_draws_a_shape_not_a_comb():
    comb = {"title": "t", "tool_calls": 34, "ridge": [1 if i % 3 else 0 for i in range(50)]}
    line = points(feedcard.card(comb))[1].split()
    assert len(line) == 33 // 2     # 33 calls on the line settle into 16 bins of about two
    ys = {p.split(",")[1] for p in line}
    assert len(ys) <= 3             # nearly flat: the calls were spread evenly
    busy = {"title": "t", "tool_calls": 500, "ridge": [i % 9 + 5 for i in range(50)]}
    assert len(points(feedcard.card(busy))[1].split()) == 50


def test_titles_never_print_a_folder_name():
    cards = [visible(feedcard.card(r)) for r in ROWS]
    assert "Users-morkeeth" not in cards[0] and "sitting" not in cards[0]
    assert "Cursor session, 4 Sep" in cards[0]
    assert "Codex session, " in cards[2]
    assert "fix the home-page layout" in cards[3]    # a sentence with "home" in it is a title


def test_no_unknown_no_dash_and_one_commit_is_singular():
    for row in ROWS:
        text = visible(feedcard.card(row))
        assert "Unknown" not in text and " — " not in text and "1 prompts" not in text
    assert "1 commit recorded" in visible(feedcard.card(ROWS[3]))


def test_author_story_leads_without_metric_hero_or_long_session_award():
    markup = feedcard.card({"title": "An attempt", "story_result": "Still exploring", "duration_s": 50000,
                           "tool_calls": 300, "feedback_question": "What would you try?"})
    assert "Still exploring" in markup and "Feedback welcome" in markup
    assert "fc-hero" not in markup and "fc-numbers" not in markup and "Marathon" not in markup
    assert markup.index("Still exploring") < markup.index("fc-route-secondary")


def test_card_css_is_the_feed_css():
    css = (ROOT / "site" / "feed.css").read_text()
    section = css[css.index("/* the card */"):css.index("/* the empty chair")].rstrip()
    assert feedcard.CARD_CSS == section
    tokens = (ROOT / "site" / "design.css").read_text()
    assert feedcard.TOKENS_CSS == tokens[:tokens.index("}") + 1]
