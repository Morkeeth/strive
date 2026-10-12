"""Pin runs to a profile: migration 015 in PGlite, and the profile and edit panel use it."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site/index.html").read_text()


def _profile_probe():
    """Run the real profile view (site/index.html viewProfile) in jsdom for each kind of reader."""
    out = subprocess.run(["node", "tests/fixtures/profile_view_probe.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, (out.stdout + out.stderr)[-3000:]
    return json.loads(out.stdout)


def test_migration_015_owner_pins_up_to_three():
    out = subprocess.run(["node", "scripts/test-pin-migration.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, (out.stdout + out.stderr)[-2000:]


def test_profile_shows_pinned_first_and_only_visible_runs():
    view = INDEX[INDEX.index("async function viewProfile("):INDEX.index("function signInWithGitHub")]
    # Pinned runs come from R, which is already filtered to what this reader may see.
    assert "const PINNED=R.filter(r=>r.pinned_at)" in view and ".slice(0,3)" in view
    assert "const RECENT=R.filter(r=>!PINNED.includes(r))" in view
    # "Your recent runs" became the Activities heading (f3b8d23); the order is checked in the page.
    assert view.index("${pinnedHtml}") < view.index("<h2>Activities</h2>")
    seen = _profile_probe()
    owner_id = "00000000-0000-4000-8000-0000000000a1"
    # TEST DATA: runs 1..7, newest is 7. Pins, newest pin first: 2 public, 5 close friends,
    # 6 private, 1 public. Run 4 is followers-only, run 7 anonymous, run 3 public and unpinned.
    expected = {
        "owner": (["in", "visibility", ["public", "link", "private", "close_friends", "anonymous"]], [2, 5, 6], [7, 4, 3, 1], "3 of 3"),
        "other": (["in", "visibility", ["public", "close_friends"]], [2, 5, 1], [3], "3 of 3"),
        "anonymous": (["eq", "visibility", "public"], [2, 1], [3], "2 of 3"),
        "ownerPreview": (["eq", "visibility", "public"], [2, 1], [3], "2 of 3"),
    }
    for reader, (visibility_filter, pinned, recent, meta) in expected.items():
        got = seen[reader]
        # The only rows on the page are the ones this exact query asked for.
        assert got["filters"] == [["eq", "profile_id", owner_id], visibility_filter], reader
        assert got["pinned"] == pinned, reader
        assert got["recent"] == recent, reader
        assert got["rendered"] == pinned + recent, reader
        assert got["pinnedMeta"] == meta, reader
        assert got["pinnedBeforeActivities"] is True and got["lastPinnedBeforeFirstRecent"] is True, reader
    # A pin never widens the audience: private and followers-only pins stay off other readers' pages.
    assert seen["other"]["renderedVisibilities"] == ["close_friends", "public"]
    assert seen["anonymous"]["renderedVisibilities"] == ["public"]
    assert seen["ownerPreview"]["renderedVisibilities"] == ["public"]
    # Nothing pinned among the readable rows: no Pinned section at all.
    assert seen["otherEmpty"]["pinned"] == [] and seen["otherEmpty"]["pinnedMeta"] is None


def test_edit_panel_pins_and_unpins():
    panel = INDEX[INDEX.index("controls.id='run-edit'"):INDEX.index("$('run-delete').onclick")]
    assert 'id="run-pin"' in panel
    assert "pinned_at:pin?(r.pinned_at||new Date().toISOString()):null" in panel
