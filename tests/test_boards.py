"""Marathon, weekly boards and the profile heatmap: public runs only, one time rule (25 Sep 2026)."""
from pathlib import Path

INDEX = (Path(__file__).resolve().parents[1] / "site/index.html").read_text()
PRODUCT = (Path(__file__).resolve().parents[1] / "PRODUCT.md").read_text()


def test_boards_read_public_runs_only_and_use_the_card_time_rule():
    boards = INDEX[INDEX.index("async function viewBoards()") : INDEX.index("function heatmapSvg(")]
    assert boards.count(".eq('visibility','public')") == 2
    assert "const runSeconds=r=>{const v=r.wall_time_s??r.duration_s;" in INDEX
    assert "const MARATHON_SECS=3*3600;" in INDEX
    assert "ghost" not in boards.lower()  # the ghost board was removed 25 Sep 2026
    assert "const longest=top(evidence.durationEligible,runSeconds,fmtSecs);" in boards
    assert "Honest failure" not in boards
    assert "error:longError" in boards
    assert "latest 300 public uploads" in boards
    assert "up to 100 additional rows" in boards
    assert "Upload dates never stand in for session dates" in boards
    assert "GrinderContract.toolCallCount(r)" in INDEX
    assert ".order('wall_time_s',{ascending:false,nullsFirst:false})" in boards
    # Empty lanes say so. No sample, no placeholder row.
    for empty in ("No comparable public session window this week yet.", "No public run with tool calls this week yet", "No public run of 3 hours or more in this sample yet"):
        assert empty in boards
    assert "weekStart(" in boards and "d.getDate()-((d.getDay()+6)%7)" in INDEX


def test_boards_route_keeps_shared_navigation_and_source_links():
    assert "if(q.has('boards'))return viewBoards();" in INDEX
    boards = INDEX[INDEX.index('async function viewBoards()'):INDEX.index('function heatmapSvg(')]
    assert "frame(railHtml('boards'),null)" in boards
    menu = INDEX[INDEX.index('<nav id="product-nav"'):INDEX.index('</nav>',INDEX.index('<nav id="product-nav"'))]
    assert 'href="/"' in menu and 'href="/?post"' in menu
    assert "StriveLinks.runHref(r)" in INDEX
    # The simplified primary menu (a321b1b) deliberately removed the old Discover dropdown.
    assert 'data-nav-group="discover"' not in menu





def test_profile_carries_a_heatmap_of_visible_runs():
    assert "${heatmapSvg(R)}" in INDEX
    heat = INDEX[INDEX.index("function heatmapSvg(") : INDEX.index("// PROJECTS (25 Sep 2026)")]
    assert "runStart(r)" in heat and "52 weeks" in heat
    assert 'role="img"' in heat and "<title>" in heat


def test_product_states_the_rules():
    assert "not quality or human effort" in PRODUCT
    assert "The primary navigation, signed in or out, is Feed and Add run" in PRODUCT
