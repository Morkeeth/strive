"""The Connect page tells a phone the truth: the session file is on the computer the agent ran on.

Until 25 Sep 2026 this lived in a four-step onboarding wizard at /?onboard. That wizard is gone;
/?onboard, /?connect and the top of /?post are one page. The phone honesty moved with it.
"""
from pathlib import Path

HTML = (Path(__file__).resolve().parents[1] / 'site/index.html').read_text()


def connect_body():
    return HTML[HTML.index('function connectBodyHtml()'):HTML.index('function wireConnectCopies(')]


def test_connect_leads_with_computer_capture():
    body = connect_body()
    assert "Run this on the computer where you build" in body
    assert "opens it privately for review" in body
    assert "Copy command" in body


def test_one_page_auto_capture_with_advanced_import():
    body = connect_body()
    assert "${dropZoneHtml()}" in body
    assert "const capture=ONE_LINE('auto')" in body
    assert "Other import methods" in body
    assert "Connect through MCP" in body
    assert "uvx --from __CAPTURE_PACKAGE__ agentgrinder grind" in HTML
    for path in ("~/.claude/projects/", "~/.cursor/projects/", "~/.codex/sessions/"):
        assert path in HTML
    # No account for the card or the link; sign-in only to post. No email, no mailto.
    assert "opens it privately for review" in body
    assert "mailto:" not in body and "signInWithOtp" not in body
    # Bots and unsupported agents have documented paths under Advanced.
    assert "docs/AGENT-UPLOAD-API.md" in body and "docs/GROK-PUSH.md" in body


def test_onboard_and_connect_and_post_are_the_same_page():
    assert "async function viewOnboard(){ return viewConnect(); }" in HTML
    assert "if(q.get('connect')==='auto')" in HTML
    post = HTML[HTML.index("async function viewPost(){"):HTML.index("async function viewExplore(){")]
    assert "${connectBodyHtml()}" in post
    assert "firstRunPrompt" not in HTML and "FIRST_RUN_CMD" not in HTML
