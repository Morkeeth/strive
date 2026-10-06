"""The Strava-inspired pass stays inside STRIVE's response-led core loop."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
MAP = (ROOT / "docs" / "STRAVA-INSPIRED-FLOWS.md").read_text()


def test_all_twelve_flows_are_mapped_with_lanes_and_boundaries():
    for number in range(1, 13):
        assert f"### {number}." in MAP
    for phrase in (
        "Current:",
        "Strava-inspired improvement:",
        "Backlog / lane:",
        "#27",
        "#28",
        "#23",
        "do not expand segments or",
    ):
        assert phrase in MAP


def test_private_preview_leads_with_populated_run_and_optional_details():
    preview = INDEX[INDEX.index("const sample=run.is_sample===true;") : INDEX.index("const editFields=")]
    assert preview.index('id="import-card-preview"') < preview.index('id="i_title"')
    assert 'value="${esc(importedTitle())}"' in preview
    assert 'Add a note <span class="hint">(optional)</span>' in preview
    assert preview.index('id="i_vis"') < preview.index("Edit details")
    assert preview.index("Edit details") < preview.index('id="i_project"')
    assert "Prompts, code and file paths are not" in preview


def test_run_detail_promotes_audience_aware_next_action():
    detail = INDEX[INDEX.index("async function viewRun(") : INDEX.index("async function trendingRepos(")]
    for phrase in (
        "Saved to Public feed and profile",
        "Copy public link",
        "Open shared post",
        "Saved for Followers",
        "Saved for Only me",
        "Open builder profile",
        "Follow, send XUDOS or share from the card above.",
    ):
        assert phrase in detail
    assert "Followers means signed-in followers and close friends" in detail
    assert "runCard(r" in detail
    assert detail.index("+nextAction") < detail.index("grind-thread")
    assert "Grokbot Builders Sunday" not in INDEX
    assert "Send XUDOS" in INDEX
    assert "Oscar and Eric" in SOCIAL


def test_profile_and_response_return_are_people_first():
    profile = INDEX[INDEX.index("async function viewProfile(") : INDEX.index("function showSignIn(")]
    assert profile.index("profileProjectsHtml(R)") < profile.index("Recent public runs")
    assert "Edit profile" in profile and "profile-edit-dialog" in profile
    assert "Post a real run and share it with a friend" in SOCIAL
    assert "Open the exact conversation, then come back here" in SOCIAL
    assert "Post your next run" in SOCIAL
    assert "nobody is imported or followed automatically" in SOCIAL
