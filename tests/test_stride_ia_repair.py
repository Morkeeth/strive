"""The October STRIVE shell: one home for each feature and capture before manual import."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site/index.html").read_text()
SOCIAL = (ROOT / "site/social.js").read_text()


def test_global_shell_has_no_privacy_slogan_or_more_drawer():
    body = INDEX[INDEX.index("<body>") : INDEX.index("<script src=")]
    assert "Private by default" not in body
    assert ">More<" not in body
    assert 'href="/privacy">Privacy</a>' in body.split("<footer", 1)[1]


def test_capture_is_primary_and_manual_import_is_advanced():
    connect = INDEX[INDEX.index("function connectBodyHtml()") : INDEX.index("function wireConnectCopies")]
    assert "Preview your latest session" in connect
    assert "Copy for my agent" in connect
    assert "Open a local preview when Cursor finishes" in connect
    assert '<summary>Other import methods</summary>' in connect
    assert connect.index("Copy for my agent") < connect.index("Import a session file manually")
    assert "<h2>Then</h2>" not in connect
    assert "Post a run without a Cursor export" not in INDEX


def test_notifications_reuse_the_existing_rls_backed_store():
    panel = SOCIAL[SOCIAL.index("async function notificationsPanel") : SOCIAL.index("async function resolveNotificationTargets")]
    assert '.from("grinder_notifications")' in panel
    assert '.eq("recipient_id", me().id)' in panel
    assert "notificationHref(n)" in panel
    assert "markNotificationsRead" in panel


def test_profile_projects_precede_tools_and_runs_and_edit_is_modal():
    profile = INDEX[INDEX.index("async function viewProfile(handle)") : INDEX.index("function signInWithGitHub")]
    rendered = profile[profile.index("app.innerHTML") :]
    assert rendered.index("profileProjectsHtml(R)") < rendered.index('class="profile-tools"')
    assert rendered.index('class="profile-tools"') < rendered.index("${pinnedHtml}")
    assert 'id="profile-edit-dialog"' in profile
    assert 'id="edit-profile-open"' in profile
    assert "Photo link" not in profile


def test_no_fake_feedback_submission_surface_ships():
    assert 'id="feedback-trigger"' not in INDEX
    assert "strive-feedback-draft" not in INDEX


def test_one_supported_visual_is_selected_and_persisted():
    feed = (ROOT / "site/feed-card.js").read_text()
    migration = (ROOT / "supabase/strava/016_hero_visual.sql").read_text()
    assert "function heroChoices(r)" in feed
    assert "${badge(r)}${heroVisual(r)}${strideHtml}" in feed
    assert "hero_visual:heroVisual" in INDEX
    assert "proof_route" in migration and "activity_terrain" in migration
    assert "change_atlas" in migration and "result" in migration
    assert "'photo'" not in migration


def test_typed_only_runs_do_not_pose_as_captured_or_ranked_runs():
    feed = (ROOT / "site/feed-card.js").read_text()
    boards = INDEX[INDEX.index("async function viewBoards()") : INDEX.index("function heatmapSvg")]
    assert 'trace_basis === "typed-by-author"' in feed
    assert "Typed by the author. No capture." in feed
    assert "filter(r=>!typedOnlyRun(r))" in boards
