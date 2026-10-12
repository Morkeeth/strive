"""Slice H: the owner edits a run's title, project and photo, and the profile photo, on existing columns."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site/index.html").read_text()


def _profile_probe():
    """Run the real profile view (site/index.html viewProfile) in jsdom for each kind of reader."""
    out = subprocess.run(["node", "tests/fixtures/profile_view_probe.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, (out.stdout + out.stderr)[-3000:]
    return json.loads(out.stdout)


def test_run_edit_panel_offers_title_project_and_photo():
    panel = INDEX[INDEX.index("controls.id='run-edit'"):INDEX.index("$('run-delete').onclick")]
    for field in ("run-title", "run-project", "run-caption", "run-output-url", "run-audience"):
        assert f'id="{field}"' in panel
    # runs.title is NOT NULL: an empty title is refused in the page, an empty project saves null.
    assert "const title=$('run-title').value.trim(),project=$('run-project').value.trim()," in panel
    assert "if(!title){status('Add a title.',true);$('run-title').focus();return}" in panel
    # The story fields (6681e56) are spread first, so they can never replace the title or project.
    assert ("sb.from('runs').update({...StriveStory.read(controls),title,project:project||null,hero_visual:heroVisual,"
            "caption:caption||null,output_url:output||null,visibility:audience,"
            "pinned_at:pin?(r.pinned_at||new Date().toISOString()):null}).eq('id',r.id)") in panel
    assert panel.index("if(!title){status('Add a title.',true)") < panel.index("sb.from('runs').update(")
    assert "image_url:imageUrl" not in panel
    # The photo is the run-photos slot, moved into the editor and saved before the row is updated.
    view = INDEX[INDEX.index("async function viewRun(id){"):INDEX.index("$('run-delete').onclick")]
    assert '<section id="run-photos"></section>' in view
    assert "StriveRunPhotos.mount({client:sb,run:r,slot:$('run-photos'),owner,staged:owner," in view
    assert "$('run-editor-photos').append($('run-photos'))" in panel
    assert panel.index("await photoEditor?.save?.()") < panel.index("sb.from('runs').update(")
    # Only the owner gets the panel.
    assert "if(ME?.id===r.profile_id){" in INDEX[INDEX.index("async function viewRun(id){"):INDEX.index("controls.id='run-edit'")]


def test_owner_actions_are_beside_the_title_and_editing_precedes_replies():
    card = INDEX[INDEX.index("function runCard(") : INDEX.index("function wireKudos(")]
    view = INDEX[INDEX.index("async function viewRun(id){") : INDEX.index("async function trendingRepos(")]
    assert 'href="#run-edit">Edit run</a>' in card
    assert 'href="#run-photos">Add photos</a>' in card
    assert "ownerActions:owner" in view
    assert "$('grind-thread').before(controls)" in view
    assert "app.append(controls)" not in view


def test_run_photo_rule_matches_the_contract():
    import json, subprocess
    start = INDEX.index("function isRunPhotoUrl(u){")
    fn = INDEX[start:INDEX.index("\n}\n", start) + 2]
    cases = {
        "https://example.com/a.jpg": True,
        "https://example.com/a.webp?x=1": True,
        "http://example.com/a.jpg": False,
        "https://example.com/a.gif": False,
        "https://example.com/\"onerror=\"x.jpg": False,
        "https://example.com/" + "a" * 300 + ".png": False,
        "javascript:alert(1)//.png": False,
    }
    js = fn + "\nconst c=" + json.dumps(cases) + ";process.stdout.write(JSON.stringify(Object.keys(c).map(k=>isRunPhotoUrl(k)===c[k])))"
    out = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
    assert all(out), dict(zip(cases, out))


def test_profile_edit_uses_the_linked_github_photo_not_a_typed_url():
    assert 'id="e_avatar"' not in INDEX
    assert 'id="use-github-photo"' in INDEX
    save = INDEX[INDEX.index("$('savep').addEventListener"):INDEX.index("function signInWithGitHub")]
    assert "avatar_url:avatarUrl" in save
    assert "let avatarUrl=prof.avatar_url||null" in INDEX
    assert "avatarUrl=`https://github.com/${encodeURIComponent(prof.github_handle)}.png?size=160`" in INDEX


def test_profile_header_shows_the_face_for_a_person():
    # 0c784e3 passes profileFace (the owner's provider photo when signed in) instead of prof.
    assert "GrinderFeed.face({profiles:profileFace},56)" in INDEX
    seen = _profile_probe()
    for reader in ("owner", "ownerPreview", "other", "anonymous"):
        face = seen[reader]
        assert face["faceClass"] == "fc-face fc-brand", reader
        assert face["faceSize"] == "--s:56px", reader
        assert face["faceImg"] == "https://example.test/ada.png", reader
    # No photo: the same 56 px face slot with no image, never a broken picture.
    assert seen["otherNoLinksX"]["faceClass"] == "fc-face fc-brand" and seen["otherNoLinksX"]["faceImg"] is None
    # An agent keeps its trace tile, not a person's face.
    assert seen["agent"]["faceClass"] == "probe-trace-tile" and seen["agent"]["faceImg"] is None
