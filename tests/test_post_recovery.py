"""Capture > preview > deliberate post: recovery, no duplicate, honest exact-reply target.

String contracts on the committed shell. The browser proof is scripts/check-post-recovery.py.
"""
import base64
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import quote

import pytest

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
SOCIAL_CSS = (ROOT / "site" / "social.css").read_text()
PUSH = (ROOT / "agentgrinder" / "push.py").read_text()
WALK = (ROOT / "scripts" / "check-post-recovery.py").read_text()
IMPORT = INDEX[INDEX.index("async function importRun(){") : INDEX.index("async function viewShareRun(")]
PHOTO_DRAFT = (ROOT / "site" / "photo-draft.js").read_text()
PROBE = ROOT / "tests" / "fixtures" / "import_flow_probe.mjs"
REVISION = "c" * 64
CAPTURE = {"schema_version": 1, "measurement_revision": REVISION, "harness": "Codex", "project": "alpha",
           "turns_typed": 1, "tool_calls": 2, "trace_basis": "timestamped native events", "rhythm": [1, 1]}


def import_flow(run, **spec):
    """Open this capture in the shipped import preview (jsdom), signed in, and press Save."""
    token = quote(base64.b64encode(json.dumps(run).encode()).decode(), safe="")
    out = subprocess.run(["node", str(PROBE), str(ROOT), "https://striverun.app/#import=" + token,
                          json.dumps({"me": True, **spec})], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def test_failed_save_keeps_the_draft_and_offers_an_explicit_retry():
    assert 'id="i_recover"' in IMPORT
    assert "Save not confirmed." in IMPORT
    assert "cannot tell whether the service received the run" in IMPORT
    assert 'id="i_retry"' in IMPORT and "Check and try again" in IMPORT
    assert 'href="/?mine">My runs' in IMPORT
    # no timer or loop re-sends the insert; the only retry is the person's click
    save_handler = IMPORT[IMPORT.index("$('i_pub').addEventListener('click'") :]
    assert "setTimeout" not in save_handler and "setInterval" not in save_handler
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
    lookup = {"table": "runs", "filters": {"profile_id": "owner", "measurement_revision": REVISION}}
    # First save: one lookup by the capture's measurement reference, then one insert that
    # carries the reference, so a later retry can find the row (site/import-row.js).
    first = import_flow(CAPTURE)
    assert first["lookups"] == [lookup]
    assert [i["row"]["measurement_revision"] for i in first["inserts"]] == [REVISION]
    assert first["viewed"] == ["saved-run"]
    # Saving the same capture again opens the first run. Nothing is inserted or updated.
    again = import_flow(CAPTURE, prior=[{"id": "first-run", "visibility": "private"}], edits={"i_caption": "second note"})
    assert again["lookups"] == [lookup]
    assert again["inserts"] == [] and again["updates"] == []
    assert again["viewed"] == ["first-run"] and again["location"] == "/?run=first-run"
    assert again["statuses"] == [{"text": "This session was already saved as a run (Only me). Opening it. "
                                  "Your note was not applied; edit the run if you want to keep it.", "bad": False}]
    # Two tabs at once: the unique index refuses the second insert (23505), and the page opens
    # the row the other tab made instead of reporting a failed save.
    raced = import_flow(CAPTURE, insertError={"code": "23505", "message": "duplicate key"},
                        priorAfterInsert=[{"id": "other-tab", "visibility": "private"}])
    assert raced["lookups"] == [lookup, lookup] and len(raced["inserts"]) == 1
    assert raced["viewed"] == ["other-tab"] and raced["recovery"] is None
    # A lost response keeps the draft and promises the check that makes the retry safe.
    lost = import_flow(CAPTURE, insertError={"message": "Failed to fetch"})
    assert lost["viewed"] == [] and "cannot be posted twice" in lost["recovery"]
    assert lost["location"].startswith("/#import=")
    # The reference is saved even from a schema 0 export, and never invented when absent.
    built = json.loads(subprocess.check_output(["node", "-e", """
const Row=require('./site/import-row.js'),o={profileId:'p',title:'t',project:null};
process.stdout.write(JSON.stringify([
  Row.build({measurement_revision:'r'.repeat(64),harness:'Codex'},o),
  Row.build({schema_version:1,measurement_revision:'r'.repeat(64)},o),
  Row.build({harness:'Codex'},o)]));
"""], cwd=ROOT, text=True))
    assert [row.get("measurement_revision") for row in built] == ["r" * 64, "r" * 64, None]
    assert "schema_version" not in built[0] and "measurement_revision" not in built[2]


def test_a_capture_without_a_reference_cannot_be_saved_from_the_preview():
    # No measurement reference means no safe duplicate key. Since 3db3fd4 the preview refuses
    # such an import instead of saving a row that a retry could not find.
    legacy = {key: value for key, value in CAPTURE.items() if key != "measurement_revision"}
    for spec in ({}, {"unlock": True}):
        seen = import_flow(legacy, **spec)
        assert seen["pubDisabled"] is True and seen["pubLabel"] == "Capture this session again"
        assert seen["lookups"] == [] and seen["inserts"] == [] and seen["updates"] == []
        assert seen["statuses"] == [{"text": "This older import cannot be saved. Use the current STRIVE session picker above.", "bad": True}]


def test_the_save_with_images_checks_the_same_reference_before_it_inserts():
    # The second save path (site/photo-draft.js, used when images are attached) must refuse a
    # capture that is already a run, and must refuse a row with no reference at all.
    save = PHOTO_DRAFT[PHOTO_DRAFT.index("async function save({token") : PHOTO_DRAFT.index("const savingButtons=")]
    guard = "if(!row.measurement_revision||row.trace_basis==='typed-by-author')throw new Error("
    lookup = ".eq('profile_id',profileId).eq('measurement_revision',row.measurement_revision).limit(1)"
    refuse = "if(prior?.length&&prior[0].id!==runId){const error=new Error('This session is already saved."
    insert = "client.from('runs').insert("
    assert save.count(insert) == 1
    assert save.index(guard) < save.index(lookup) < save.index(refuse) < save.index(insert)
    assert "error.existingRunId=prior[0].id;throw error;" in save


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
        # capture_metadata (ce9b610): recorded model names and token counts, a closed set of keys.
        "harness", "capture_metadata", "is_sample", "activity_label", "project", "turns_typed", "prompt_provenance", "duration_s", "tool_calls",
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
    # The one field added since the words were written cannot carry free text: the exporter
    # validates it, and an unknown key or a path-shaped model name stops the export.
    from agentgrinder.push import export_run
    usage = {"basis": "codex-records", "models": ["gpt-5.1-codex"], "input_tokens": 10, "output_tokens": 4}
    assert export_run({**CAPTURE, "capture_metadata": usage})["capture_metadata"] == usage
    for bad in ({**usage, "prompt": "private_title_prompt"}, {**usage, "models": ["/Users/someone/project"]},
                {**usage, "models": ["~/code/the-fair"]}, {**usage, "basis": "typed"}):
        with pytest.raises(ValueError):
            export_run({**CAPTURE, "capture_metadata": bad})
    # The preview the person reads carries that sentence, drawn by the shipped page.
    assert import_flow(CAPTURE)["exportDisclosure"] == "Counts, timing and the activity trace are imported. Prompts, code and file paths are not."


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
