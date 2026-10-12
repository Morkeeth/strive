"""THE PROJECT NAME IS THE AUTHOR'S TO CHOOSE, BEFORE THE RUN IS SAVED.

Launch audit of production 7858535: Claude Code capture reads the folder the session ran in and
publishes it as "Project touched". A run captured in `~/code/the-fair` therefore posted
`the-fair` — a name chosen for a laptop, shown to strangers — and the preview offered no way to
change it. Title, caption, output link, scene photo and audience were all editable; the one
field taken from the filesystem was not.

`projectForSave` is the shipped function the preview and the Save both call. These run it.
"""
from pathlib import Path
import json
import subprocess  # noqa: F401  (the probe runs the shipped function in node)

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()

PROBE = r"""
const fs=require('fs'),vm=require('vm');
const root=process.argv[1];
const html=fs.readFileSync(root+'/site/index.html','utf8');
const fn=html.slice(html.indexOf('function projectForSave('),html.indexOf('function runCard('));
const context={GrinderContract:require(root+'/site/run-contract.js')};
vm.createContext(context);vm.runInContext(fn,context);
const call=(captured,typed)=>vm.runInContext(
  'projectForSave('+JSON.stringify(captured)+','+JSON.stringify(typed)+')',context);
process.stdout.write(JSON.stringify({
  untouched:call('the-fair',undefined),
  prefilledAndKept:call('the-fair','the-fair'),
  renamed:call('the-fair','Fair pricing page'),
  cleared:call('the-fair',''),
  whitespace:call('the-fair','   '),
  homeSlug:call('Users-morkeeth',undefined),
  renamedOverSlug:call('Users-morkeeth','Pricing'),
  typedPath:call('the-fair','/Users/morkeeth/code/the-fair'),
  typedHomeSlug:call('the-fair','Users-morkeeth-code-the-fair'),
}));
"""


def _run() -> dict:
    out = subprocess.check_output(["node", "-e", PROBE, str(ROOT)], text=True, cwd=str(ROOT))
    return json.loads(out)


def test_the_preview_offers_the_project_as_a_field_prefilled_from_capture():
    assert '<label>Project<input id="i_project"' in INDEX
    assert INDEX.index("Edit details") < INDEX.index('id="i_project"')
    assert 'value="${esc(capturedProject||\'\')}"' in INDEX
    assert "placeholder=\"Project name\"" in INDEX
    # the captured value remains editable behind the one details control.
    assert "const capturedProject=GrinderContract.projectLabel(run.project)" in INDEX
    # It is an edit like the others: kept across a sign-in bounce, and repainted live.
    assert "'i_project'" in INDEX.split("const editFields=")[1].split("]")[0]


def _import_flow(run, **spec) -> dict:
    """Open this capture in the shipped import preview (jsdom), signed in, and press Save."""
    import base64
    from urllib.parse import quote
    token = quote(base64.b64encode(json.dumps(run).encode()).decode(), safe="")
    out = subprocess.check_output(
        ["node", str(ROOT / "tests/fixtures/import_flow_probe.mjs"), str(ROOT),
         "https://striverun.app/#import=" + token, json.dumps({"me": True, **spec})], text=True, cwd=str(ROOT))
    return json.loads(out)


def test_both_the_preview_and_the_save_publish_the_edited_project():
    capture = {"schema_version": 1, "measurement_revision": "e" * 64, "harness": "Claude Code", "project": "the-fair",
               "turns_typed": 1, "tool_calls": 2, "trace_basis": "timestamped native events", "rhythm": [1, 1]}
    # The title is its own field (prefilled "<project> session"); give it a fixed value so the
    # card text below can only name the project through the project field.
    shown = lambda seen: seen["previewText"].lower().replace("-", " ")
    # Untouched: the field is prefilled from the capture and both sides publish that.
    kept = _import_flow(capture, edits={"i_title": "Shipped"})
    assert kept["projectField"] == "the-fair"
    assert kept["reviewedRow"]["project"] == "the-fair" and "the fair" in shown(kept)
    assert [i["row"]["project"] for i in kept["inserts"]] == ["the-fair"]
    # Renamed: the preview card, the "exactly what is saved" row and the inserted row all say
    # the author's name, and the folder name is in none of them.
    renamed = _import_flow(capture, edits={"i_title": "Shipped", "i_project": "Fair pricing page"})
    assert renamed["reviewedRow"]["project"] == "Fair pricing page"
    assert "fair pricing page" in shown(renamed) and "the fair" not in shown(renamed)
    assert [i["row"]["project"] for i in renamed["inserts"]] == ["Fair pricing page"]
    assert "the-fair" not in json.dumps(renamed["inserts"]) and "the-fair" not in json.dumps(renamed["reviewedRow"])
    # Cleared: no project at all, in the preview and in the saved row.
    cleared = _import_flow(capture, edits={"i_title": "Shipped", "i_project": "  "})
    assert cleared["reviewedRow"]["project"] is None and "the fair" not in shown(cleared)
    assert [i["row"]["project"] for i in cleared["inserts"]] == [None]
    # Every row the import builds (the preview, the save, and the save with images) takes the
    # edited value. The count was 2 before the save with images (site/photo-draft.js) existed.
    import_run = INDEX[INDEX.index("async function importRun(){"):INDEX.index("async function viewShareRun(")]
    assert import_run.count("StriveImportRow.build(run,{") == import_run.count("project:editedProject(),") == 3
    assert INDEX.count("project:editedProject(),") == 3
    assert "const editedProject=()=>projectForSave(capturedProject,$('i_project')?.value ?? null)" in INDEX
    # the old behaviour: one value, computed from the capture, used by both and editable by none
    assert "project:importedProject,model:" not in INDEX


def test_an_untouched_field_still_publishes_what_capture_recorded():
    results = _run()
    assert results["untouched"] == "the-fair"
    assert results["prefilledAndKept"] == "the-fair"


def test_a_rename_is_what_gets_saved():
    results = _run()
    assert results["renamed"] == "Fair pricing page"
    assert results["renamedOverSlug"] == "Pricing"


def test_clearing_the_field_publishes_no_project_at_all():
    results = _run()
    assert results["cleared"] is None
    assert results["whitespace"] is None


def test_the_field_cannot_publish_a_path_or_a_home_directory():
    results = _run()
    assert results["homeSlug"] is None                     # capture prefill is cleaned first
    assert "morkeeth" not in str(results["typedPath"])
    assert "morkeeth" not in str(results["typedHomeSlug"])
    assert results["typedHomeSlug"] == "code-the-fair"
