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
    assert "<h1>Add a run</h1>" in head
    assert "Connect your agent" in head


def test_add_run_page_links_the_install_guide():
    assert 'href="/install"' in view_post_head()


def test_sign_in_panel_says_it_is_not_needed_to_start():
    # Run 2 (15 Oct): a visitor reached /?post, then read the sign-in panel as the next step and stopped.
    body = INDEX.split("async function viewPost(){", 1)[1].split("\n}\n", 1)[0]
    panel = body.split('<div class="panel pad auth-empty">', 1)[1].split("</div>", 1)[0]
    assert "No account needed to start" in panel
    assert panel.index("No account needed to start") < panel.index("Sign in to save the run")
