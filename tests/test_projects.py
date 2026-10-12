"""A run can belong to a project; a project page shows its runs (25 Sep 2026)."""
import base64
import json
import subprocess
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site/index.html").read_text()


def _import_flow(run, **spec):
    """Open this capture in the shipped import preview (jsdom), signed in, and press Save."""
    token = quote(base64.b64encode(json.dumps(run).encode()).decode(), safe="")
    out = subprocess.check_output(
        ["node", str(ROOT / "tests/fixtures/import_flow_probe.mjs"), str(ROOT),
         "https://striverun.app/#import=" + token, json.dumps({"me": True, **spec})], text=True, cwd=ROOT)
    return json.loads(out)


def test_preview_and_composer_take_a_repository_link():
    assert 'id="i_repo"' in INDEX and 'id="f_repo"' in INDEX
    assert "'i_repo'" in INDEX.split("const editFields=")[1].split("]")[0]
    assert "'f_repo'" in INDEX.split("const fields=['f_title'")[1].split("]")[0]
    assert "repo_url:safeRepoUrl($('f_repo')?.value)" in INDEX
    # https only, or nothing: a repository link is clicked, never printed as text.
    assert "function safeRepoUrl(value)" in INDEX
    links = ["https://github.com/you/project", " https://github.com/you/project ", "http://github.com/you/project",
             "github.com/you/project", "javascript:alert(1)", "the-fair", "", None]
    script = """
const fs=require('fs'),vm=require('vm');const html=fs.readFileSync('site/index.html','utf8');
const ctx={URL};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function safeOutputUrl('),html.indexOf('function segmentSelectHtml(')),ctx);
process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]).map(v=>ctx.safeRepoUrl(v))));
"""
    checked = json.loads(subprocess.check_output(["node", "-e", script, json.dumps(links)], cwd=ROOT, text=True))
    assert checked == ["https://github.com/you/project", "https://github.com/you/project", None, None, None, None, None, None]
    # The saved row: the typed field wins over the capture, and a non-link clears it.
    capture = {"schema_version": 1, "measurement_revision": "f" * 64, "harness": "Codex", "project": "alpha",
               "turns_typed": 1, "tool_calls": 2, "trace_basis": "timestamped native events", "rhythm": [1, 1],
               "repo_url": "https://github.com/captured/repo"}
    kept = _import_flow(capture)
    assert kept["repoField"] == "https://github.com/captured/repo"
    assert kept["reviewedRow"]["repo_url"] == "https://github.com/captured/repo"
    assert [i["row"]["repo_url"] for i in kept["inserts"]] == ["https://github.com/captured/repo"]
    edited = _import_flow(capture, edits={"i_repo": "https://github.com/typed/repo"})
    assert edited["reviewedRow"]["repo_url"] == "https://github.com/typed/repo"
    assert [i["row"]["repo_url"] for i in edited["inserts"]] == ["https://github.com/typed/repo"]
    for not_a_link in ("my repo", "http://github.com/typed/repo", ""):
        cleared = _import_flow(capture, edits={"i_repo": not_a_link})
        assert "repo_url" not in cleared["reviewedRow"], not_a_link
        assert len(cleared["inserts"]) == 1 and "repo_url" not in cleared["inserts"][0]["row"], not_a_link
        assert "captured/repo" not in json.dumps(cleared["inserts"])


def test_project_page_and_list_are_routed_with_explicit_account_scope():
    assert "if(q.has('projects'))return viewProjects();" in INDEX
    assert "if(q.has('project'))return viewProject(q.get('project'));" in INDEX
    page = INDEX[INDEX.index("async function viewProject(name)") : INDEX.index("async function viewProjects()")]
    assert ".eq('project',name).eq('visibility','public')" in page
    assert ".eq('project',name).eq('profile_id',profileId)" in page  # the owner sees their own too
    lst = INDEX[INDEX.index("async function viewProjects()") : INDEX.index("async function viewProfile(handle)")]
    assert "query=mine?query.eq('profile_id',profileId):query.eq('visibility','public')" in lst
    rail = INDEX[INDEX.index("function railHtml"):INDEX.index("function setPrimarySection")]
    assert "Projects" not in rail  # preserved as a deep link, not primary navigation


def test_cards_and_profile_link_to_the_project():
    assert "function projectLinkHtml(r)" in INDEX
    assert "opts.preview?esc(project):projectLinkHtml(r)" in INDEX
    assert "profileProjectsHtml(R,mine)" in INDEX
    assert 'class="profile-project"' in INDEX
