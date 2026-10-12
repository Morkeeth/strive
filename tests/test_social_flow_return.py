"""Returning-friend social flow with DOM proof of Follow click and auth return."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
PROBE = ROOT / "tests" / "fixtures" / "social_follow_auth_probe.mjs"


def _profile_probe():
    """Run the real profile view (site/index.html viewProfile) in jsdom for each kind of reader."""
    out = subprocess.run(["node", "tests/fixtures/profile_view_probe.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, (out.stdout + out.stderr)[-3000:]
    return json.loads(out.stdout)


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
    seen = _profile_probe()
    # Heading. "Recent runs you can see" / "Recent public runs" became one Activities heading with a
    # reader-specific scope line (f3b8d23). Only the owner is told private work is included.
    assert seen["owner"]["scope"] == "Your latest 7 runs · Includes private work"
    assert seen["owner"]["viewMode"] == "Your profile · includes private work"
    assert seen["other"]["scope"] == "Latest visible 4 runs · Only runs you can open"
    assert seen["anonymous"]["scope"] == "Latest visible 3 runs · Only runs you can open"
    assert seen["ownerPreview"]["viewMode"] == "Public profile preview"
    public_note = "Only Public runs appear here. Followers-only runs stay off this profile."
    assert seen["anonymous"]["publicNote"] == public_note and seen["ownerPreview"]["publicNote"] == public_note
    assert seen["other"]["publicNote"] is None and seen["owner"]["publicNote"] is None
    # Empty states. The owner has only a followers-only and a private run (TEST DATA); neither
    # reader gets a row, and the wording differs by reader without saying that hidden runs exist.
    signed_in, signed_out = seen["otherEmpty"], seen["anonymousEmpty"]
    assert signed_in["rendered"] == [] and signed_out["rendered"] == []
    assert signed_in["statRuns"] == "0" and signed_out["statRuns"] == "0"
    assert signed_in["activitiesMeta"] == "none yet" and signed_out["activitiesMeta"] == "none yet"
    assert signed_in["emptyTitle"] == "No runs you can see yet"
    assert signed_in["emptyBody"] == ("Public runs and Close friends runs (if you are on their list) show here. "
                                      "Following only lists Public runs.")
    assert signed_out["emptyTitle"] == "No public runs yet"
    assert signed_out["emptyBody"] == "You can follow this builder now; their public runs will appear in Following when they post."
    for reader in (signed_in, signed_out):
        assert "TEST DATA run" not in reader["text"] and "private" not in reader["text"].lower()
    # The owner's own empty profile is an invitation to post, not a reader's empty card.
    assert seen["ownerEmpty"]["emptyTitle"] is None and seen["ownerEmpty"]["nextSlot"] is True


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
