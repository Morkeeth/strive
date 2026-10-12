"""Capture > preview > deliberate post: recovery, no duplicate, honest exact-reply target.

String contracts on the committed shell. The browser proof is scripts/check-post-recovery.py.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
SOCIAL_CSS = (ROOT / "site" / "social.css").read_text()
PUSH = (ROOT / "agentgrinder" / "push.py").read_text()
WALK = (ROOT / "scripts" / "check-post-recovery.py").read_text()
IMPORT = INDEX[INDEX.index("async function importRun(){") : INDEX.index("async function viewShareRun(")]


def test_failed_save_keeps_the_draft_and_offers_an_explicit_retry():
    assert 'id="i_recover"' in IMPORT
    assert "Save not confirmed." in IMPORT
    assert "cannot tell whether the service received the run" in IMPORT
    assert 'id="i_retry"' in IMPORT and "Check and try again" in IMPORT
    assert 'href="/?mine">My runs' in IMPORT
    # no timer or loop re-sends the insert; the only retry is the person's click
    assert "setTimeout" not in IMPORT and "setInterval" not in IMPORT
    assert "Check Your runs before retrying" not in IMPORT


def test_manual_save_has_a_stable_browser_id_and_checks_before_retry():
    manual = INDEX[INDEX.index("function wireComposer(){") : INDEX.index("async function viewProfile(")]
    assert "ag_manual_post_draft" in manual
    assert "crypto.randomUUID()" in manual
    assert "id:attemptId" in manual
    assert "const prior=await existing()" in manual
    assert "Save not confirmed." in manual
    assert "cannot tell whether the service received the run" in manual
    assert "Check and try again" in manual
    assert "no duplicate was created" in manual
    assert "setTimeout" not in manual and "setInterval" not in manual


def test_same_capture_is_one_run_not_two():
    assert "const dedupe=run.measurement_revision?{measurement_revision:run.measurement_revision}:null;" in IMPORT
    assert "started_at:run.started,harness:run.harness" not in IMPORT
    assert "async function existingRun()" in IMPORT
    assert "prior=await existingRun()" in IMPORT
    assert "error.code==='23505'" in IMPORT
    assert "already saved as a run" in IMPORT and "was not applied" in IMPORT
    assert "if(run.measurement_revision!=null) coach.measurement_revision=run.measurement_revision;" in IMPORT


def test_capture_dedupe_has_a_database_unique_index():
    sql = (ROOT / "supabase" / "strava" / "run_capture_unique.sql").read_text()
    assert "runs_profile_measurement_revision_unique" in sql
    assert "unique index" in sql.lower()
    assert "measurement_revision is not null" in sql


def test_a_failed_rig_update_never_reads_as_a_failed_save():
    result = re.search(r"let \{data:published,error\}=(?:await sb\.from\('runs'\)\.insert|result;)", IMPORT)
    assert result, "save result must be handled before a profile update"
    saved = IMPORT[result.start() :]
    assert "The run is saved from here on" in saved
    assert "were not updated; edit them from your profile" in saved


def test_the_preview_names_what_the_export_carries_and_matches_the_allowlist():
    assert 'class="hint export-contents"' in IMPORT
    assert "carries only:" not in IMPORT
    assert "Counts, timing and the activity trace are imported" in IMPORT
    assert "coach_experiment" in IMPORT  # disclosure gates on the traveling field
    assert "Prompts, code and file paths are not" in IMPORT
    # the words are pinned to the exporter's allowlist: if a new field starts travelling, this
    # test must be revisited with the copy
    keys = set(re.findall(r'^\s+"([a-z_]+)":', PUSH, re.M))
    assert keys == {
        "harness", "is_sample", "activity_label", "project", "turns_typed", "duration_s", "tool_calls",
        "shell_calls", "files_touched", "commits", "claims", "claims_verified", "artifacts_produced", "reach",
        "reach_reason", "coach_verdict", "coach_plan", "coach_tool_calls", "coach_mode",
        "coach_experiment", "progress_verdict", "progress_delta", "started", "rhythm",
        "ridge", "ridge_basis", "ridge_wall_seconds", "worker_bins", "commit_bins",
        # The store's own tool-request count, carried beside tool_calls so the disagreement
        # between the two tool vocabularies is visible instead of silently vetoing the ridge.
        "ridge_tool_calls", "route",
        "trace_basis", "rig_mcps", "rig_skills", "rig_share_names", "rig_mcp_names", "rig_notes",
    }, keys
    assert "No prompt text, no paths" in PUSH


def test_a_chopped_import_link_is_named_not_swallowed():
    assert "This import link could not be read" in IMPORT
    assert "address was cut" in IMPORT
    assert "catch(_){ return false; }" not in IMPORT


def test_the_dead_retry_promise_is_gone():
    assert "the insert is retried" not in IMPORT and "const unsaved=''" not in IMPORT


def test_exact_reply_past_the_paging_cap_is_rendered_directly_not_called_removed():
    thread = SOCIAL[SOCIAL.index("async function thread(") : SOCIAL.index("async function inbox(")]
    assert "function renderReply(reply)" in thread
    assert "if (!focusKnownMissing) focusedRow = focused[0];" in thread
    assert "if (focusReply && !sawFocus && focusedRow)" in thread
    assert 'direct.className = "reply-direct"' in thread
    assert "shown here on its own" in thread
    assert "That reply was removed or is not visible to you." in thread
    assert ".reply-direct{" in SOCIAL_CSS


def test_the_browser_walk_covers_the_journey():
    for needle in (
        'route.abort("connectionfailed")',
        "no automatic retry fired",
        "lost response: Try again found the saved run by measurement revision",
        "manual retry: existing save opened and no duplicate was created",
        "re-save: opens the existing run",
        "This import link is incomplete",
        "cap: the exact reply past the 12-page load is rendered directly",
        "missing reply: named as removed or not visible",
    ):
        assert needle in WALK, needle
