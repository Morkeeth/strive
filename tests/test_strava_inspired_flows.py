"""The Strava-inspired pass stays inside STRIVE's response-led core loop."""
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
MAP = (ROOT / "docs" / "STRAVA-INSPIRED-FLOWS.md").read_text()


def _profile_probe():
    """Run the real profile view (site/index.html viewProfile) in jsdom for each kind of reader."""
    out = subprocess.run(["node", "tests/fixtures/profile_view_probe.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, (out.stdout + out.stderr)[-3000:]
    return json.loads(out.stdout)


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
    assert 'Project purpose / context <span class="hint">(optional)</span><textarea id="i_caption"' in preview
    caption_field = preview.split('<textarea id="i_caption"', 1)[1].split('>', 1)[0]
    assert "required" not in caption_field
    assert 'placeholder="Who is this for, what problem does it solve, and is it for a hackathon?"' in caption_field
    assert '<option value="private" selected>Only me</option>' in preview
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
    # Projects are owner-aware (89fdb82) and the run list is headed Activities (f3b8d23).
    assert profile.index("profileProjectsHtml(R,mine)") < profile.index("<h2>Activities</h2>")
    seen = _profile_probe()
    for reader in ("owner", "ownerPreview", "other", "anonymous"):
        got = seen[reader]
        # The person first, then their projects, then the runs.
        assert got["name"] == "TEST DATA Ada", reader
        assert got["headerBeforeProjects"] is True and got["projectsBeforeActivities"] is True, reader
        # Editing is the owner's own view only; every other reader gets the follow control instead.
        assert got["editButton"] is (reader == "owner") and got["editDialog"] is (reader == "owner"), reader
        assert got["followSlot"] is (reader != "owner"), reader
    assert "Edit profile" in profile and "profile-edit-dialog" in profile
    # eb4023e reworded the empty inbox and sends the owner to their runs instead of a new post.
    assert "No responses yet. Share a public run with a friend to start a conversation." in SOCIAL
    assert '<a class="act blue" href="/?mine">Open your runs</a><a class="act" href="/?people">Find people</a>' in SOCIAL
    assert "Open the exact conversation, then come back here" in SOCIAL
    assert "Post your next run" in SOCIAL
    assert "nobody is imported or followed automatically" in SOCIAL
