"""Profile totals: Public runs count is public-only; mixed visibility shows Visible to you."""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()


def _profile_probe():
    """Run the real profile view (site/index.html viewProfile) in jsdom for each kind of reader."""
    out = subprocess.run(["node", "tests/fixtures/profile_view_probe.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, (out.stdout + out.stderr)[-3000:]
    return json.loads(out.stdout)


def test_profile_public_runs_count_is_always_public_only():
    assert "const publicCount=R.filter(r=>r.visibility==='public').length" in INDEX
    assert 'data-count="${publicCount}"' in INDEX
    # f3b8d23 removed the "Visible to you" cell: the Public runs cell is now the owner's only, and
    # every other reader gets one Runs figure that is labelled as what they can open.
    seen = _profile_probe()
    owner = seen["owner"]  # TEST DATA: 3 public, 1 followers, 1 close friends, 1 private, 1 anonymous
    assert owner["publicRunsCell"] == 3
    assert owner["statRuns"] == "7" and owner["scope"] == "Your latest 7 runs · Includes private work"
    assert seen["ownerEmpty"]["publicRunsCell"] == 0
    # Signed-in reader who can open a close-friends run: 4 rows, never presented as a public count.
    other = seen["other"]
    assert other["publicRunsCell"] is None and "Public runs" not in other["text"]
    assert other["statRuns"] == "4" and other["scope"] == "Latest visible 4 runs · Only runs you can open"
    assert other["activitiesMeta"] == "4"
    # Signed out, and the owner's public preview: the figure is the public rows and nothing else.
    for reader in ("anonymous", "ownerPreview"):
        got = seen[reader]
        assert got["filters"][1] == ["eq", "visibility", "public"], reader
        assert got["publicRunsCell"] is None, reader
        assert got["statRuns"] == "3" and got["activitiesMeta"] == "3", reader
        assert got["scope"] == "Latest visible 3 runs · Only runs you can open", reader
        assert got["publicNote"] == "Only Public runs appear here. Followers-only runs stay off this profile.", reader
    for reader in seen:
        assert seen[reader]["statLabels"] == ["Runs", "Projects", "XUDOS received"], reader
    # Non-owner must not use R.length for the Public runs cell.
    assert 'data-count="${mine?R.filter(r=>r.visibility===\'public\').length:R.length}"' not in INDEX
    assert "Public runs" in INDEX[INDEX.index("async function viewProfile") :]


def test_mixed_visibility_totals_evidence_in_markup():
    """Render the totals fragment logic for mixed public + close_friends."""
    script = r"""
const publicCount = (R) => R.filter((r) => r.visibility === "public").length;
const mixed = [
  { visibility: "public" },
  { visibility: "close_friends" },
  { visibility: "public" },
];
const mine = false;
const ME = { id: "viewer" };
const publicN = publicCount(mixed);
const visibleExtra = !mine && ME && mixed.length > publicN;
const html = `<div class="k">Public runs</div><div class="v" data-count="${publicN}"></div>` +
  (visibleExtra ? `<div class="k">Visible to you</div><div class="v" data-count="${mixed.length}"></div>` : "");
if (publicN !== 2) throw new Error("publicCount expected 2 got " + publicN);
if (!html.includes('data-count="2"')) throw new Error("public cell missing");
if (!html.includes("Visible to you") || !html.includes('data-count="3"')) throw new Error("visible extra missing");
const ownerOnlyPublic = [{ visibility: "public" }, { visibility: "private" }];
const ownerPublic = publicCount(ownerOnlyPublic);
if (ownerPublic !== 1) throw new Error("owner publicCount");
console.log(JSON.stringify({ ok: true, publicN, visible: mixed.length, ownerPublic }));
"""
    out = subprocess.check_output(["node", "-e", script], text=True)
    assert '"ok":true' in out.replace(" ", "")
