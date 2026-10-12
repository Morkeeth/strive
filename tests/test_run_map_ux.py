"""Run map interaction: keyboard readout, horizontal scrub only, no timed output fab."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = (ROOT / "site" / "run-contract.js").read_text()
INDEX = (ROOT / "site" / "index.html").read_text()
SHARING = (ROOT / "site" / "sharing.js").read_text()
MOUNT_JS = ROOT / "tests" / "fixtures" / "run_map_mount_probe.mjs"


def test_share_labels_turn_order():
    assert "ridgeBasisLabel" in SHARING
    assert "turn order" in SHARING


def test_run_map_markup_and_copy():
    assert "mountRunMaps" in CONTRACT
    assert "run-map-plot" in CONTRACT
    assert "run-map-slider" in CONTRACT
    assert "Activity slice" in CONTRACT
    assert "run-map-help" in CONTRACT
    assert "Linked output is not placed on the map" in CONTRACT
    assert "touchOrigin.scrubbing" in CONTRACT
    ridge_fn = CONTRACT.split("function ridge")[1].split("function mountRunMaps")[0]
    assert 'role="img"' in ridge_fn
    assert 'aria-label="Tool calls across ${escText(basisLabel)}"' in ridge_fn


def test_no_fake_ranked_metrics_or_unknown_disclaimers():
    card = INDEX[INDEX.index("function runCard(") : INDEX.index("function wireKudos(")]
    assert "run-rank" not in card
    assert "ranked.push" not in card
    assert "Unknown stays Unknown" not in INDEX
    assert "Unknown measurements stay unknown" not in INDEX
    assert "Unknown stays unknown" not in INDEX
    assert "No score is invented" not in INDEX
    assert "Coming soon. Short notes on what to try next after a run." not in INDEX
    assert "if(!v&&!pv) return '';" in INDEX
    # The fold that holds the receipts says what it holds; 00bdaf8 renamed it from
    # "Explore this run". It is drawn only when the run has something to put in it.
    assert '<summary>Receipts and measurements</summary>' in card and "Explore this run" not in INDEX
    assert "const explore=exploreInner?`<details class=\"ridge-more run-explore\"" in card
    assert "Followers. Signed-in followers and close friends can open it" in INDEX


def test_sign_in_with_github_invokes_github():
    assert "function signInWithGitHub" in INDEX
    assert "auth.signIn('github'" in INDEX
    assert "signInWithGitHub" in INDEX


def test_mount_changes_readout_and_preserves_vertical_scroll():
    out = subprocess.check_output(
        ["node", str(MOUNT_JS), str(ROOT / "site" / "run-contract.js")],
        text=True,
    )
    assert '"ok":true' in out.replace(" ", "")
