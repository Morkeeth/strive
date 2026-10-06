"""Returning-friend social flow with DOM proof of Follow click and auth return."""
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
PROBE = ROOT / "tests" / "fixtures" / "social_follow_auth_probe.mjs"


def test_follow_and_auth_return_dom_probe():
    out = subprocess.check_output(
        ["node", str(PROBE)],
        text=True,
        cwd=str(ROOT),
    )
    assert '"ok":true' in out.replace(" ", "")
    assert '"followClick":true' in out.replace(" ", "")
    assert '"inboxFilterReturn":true' in out.replace(" ", "")


def test_route_uses_apply_stored_social_return():
    assert "applyStoredSocialReturn" in SOCIAL
    assert "social.applyStoredSocialReturn" in INDEX
    assert "isSocialReturn" in SOCIAL


def test_following_states_public_only_and_points_close_friends_to_profile():
    assert "Close-friends runs stay on their profile, not here" in SOCIAL
    assert "Following only lists Public runs" in SOCIAL
    assert '.eq("visibility", "public")' in SOCIAL


def test_profile_empty_and_heading_respect_viewer():
    assert "Recent runs you can see" in INDEX
    assert "No runs you can see yet" in INDEX
    assert "Close friends runs (if you are on their list)" in INDEX


def test_responses_return_and_ack_paths_remain():
    assert "ag_response_return" in SOCIAL
    assert "Back to Notifications" in SOCIAL
    assert "Open exact reply" in SOCIAL
    assert "Send XUDOS" in INDEX
    assert "Send XUDOS" in INDEX


def test_auth_return_allowlist_source():
    assert "people|account|connect|explore|boards|projects?|crews?)(=|&|$)" in INDEX and "SOCIAL_RETURN_RE" in SOCIAL
    pat = re.compile(r"^\?(post|mine|following|inbox|run|u|example|people|account|connect|explore|boards|projects?|crews?)(=|&|$)")
    assert pat.match("?inbox&filter=unread")
    assert pat.match("?explore")          # home is the feed now, so Discover is a place to return to
    assert not pat.match("?forum")
