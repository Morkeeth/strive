"""'+ Add run' is where connecting an agent starts, so its page must say so (First Users connect run, 14 Oct:
3 of 4 test visitors opened it while looking for 'Connect your agent', did not recognise it, and left)."""
import re
from pathlib import Path

INDEX = (Path(__file__).resolve().parents[1] / "site" / "index.html").read_text()


def view_post_head():
    body = INDEX.split("async function viewPost(){", 1)[1].split("\n}\n", 1)[0]
    return re.search(r'<div class="head post-page-head">(.*?)</div>', body, re.S).group(1)


def test_add_run_page_names_connect_your_agent():
    head = view_post_head()
    assert "<h1>Add a project update</h1>" in head
    assert "Recorded agent sessions are optional" in head


def test_add_run_page_links_the_install_guide():
    body = INDEX.split("async function viewPost(){", 1)[1].split("\n}\n", 1)[0]
    assert '<details class="recorded-update-entry">' in body
    assert "Use a recorded agent session instead" in body
    assert "${connectBodyHtml()}" in body
    assert 'href="/install"' in INDEX


def test_sign_in_panel_says_it_is_not_needed_to_start():
    # Run 2 (15 Oct): a visitor reached /?post, then read the sign-in panel as the next step and stopped.
    body = INDEX.split("async function viewPost(){", 1)[1].split("\n}\n", 1)[0]
    panel = body.split('<div class="panel pad auth-empty">', 1)[1].split("</div>", 1)[0]
    assert "No account needed to start" in panel
    assert panel.index("No account needed to start") < panel.index("Sign in when you choose to save privately.")


def test_empty_feed_points_to_add_run():
    # Run 3 (15 Oct): with no public runs, a visitor stopped on the home page and never opened Add run.
    empty = INDEX.split("body.innerHTML=runsFailed?failed:", 1)[1].split(";", 1)[0]
    assert 'href="/?post"' in empty and "Connect your agent" in empty
