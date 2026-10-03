"""Footer, favicon, titles, About and 404 on every page (fresh-eyes review, 25 Sep 2026)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
READING = ["privacy.html", "terms.html", "methodology.html", "about.html", "404.html"]


def test_every_page_has_the_icon_and_the_footer():
    for name in READING + ["index.html"]:
        html = (SITE / name).read_text()
        assert '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' in html, name
        foot = html[html.index('<footer class="site-foot">'):]
        for href in ('/about', '/privacy', '/terms', '/?feedback', '/privacy#deletion'):
            assert f'href="{href}' in foot or f'href="https://{href}' in foot, (name, href)
    assert (SITE / "favicon.svg").read_text().startswith("<svg")


def test_deletion_has_an_anchor_and_terms_link_clean_urls():
    assert '<h2 id="deletion">Delete your data</h2>' in (SITE / "privacy.html").read_text()
    terms = (SITE / "terms.html").read_text()
    assert "/privacy.html" not in terms and "←" not in terms


def test_each_spa_page_sets_its_own_title():
    html = (SITE / "index.html").read_text()
    assert "document.title=pageTitle(new URLSearchParams(location.search))" in html
    for label in ("'Leaderboard'", "'Add a run'", "'Find people'", "'Settings'"):
        assert label in html


def test_the_404_page_is_branded_and_not_indexed():
    page = (SITE / "404.html").read_text()
    assert '<meta name="robots" content="noindex">' in page and 'href="/"' in page


def test_server_pages_carry_footer_and_favicon():
    for name in ("server/public-run.mjs", "server/dropin-link.mjs"):
        src = (ROOT / name).read_text()
        assert 'rel="icon" href="/favicon.svg"' in src
        assert src.count("</main>") == src.count("</main>${siteFoot}")


def test_page_titles_follow_route_order():
    src = (ROOT / "site/index.html").read_text()
    block = src[src.index("function pageTitle(q)"):src.index("async function route(){")]
    # route() opens a run before a profile, so the title must too.
    assert block.index("if(q.get('run'))") < block.index("if(q.get('u'))")
    for key in ("segment", "join", "agent", "example"):
        assert f"['{key}'," in src
    assert "q.get('event')" in block and "q.get('share')" in block


def test_about_does_not_claim_runs_start_private():
    assert "Every run starts private" not in (ROOT / "site/about.html").read_text()


def test_upload_copy_makes_no_counts_only_claim():
    # uploadPayload also sends the start hour, the activity shape and folder station indices.
    for name in ("site/dropin.js", "site/index.html", "server/dropin-link.mjs"):
        src = (ROOT / name).read_text()
        for claim in ("Only the numbers on this card", "Only the counts and your title", "Counts only."):
            assert claim not in src, (name, claim)


def test_post_is_step_by_step_with_no_preselected_audience():
    src = (ROOT / "site/dropin.js").read_text()
    assert 'const STEPS = ["Capture", "Preview", "Who sees it", "Share"]' in src
    assert 'id="drop-continue" disabled' in src
    assert 'type="radio" name="drop-aud"' in src and "checked" not in src.split("AUDIENCES.map")[1].split("</fieldset>")[0]
    assert 'i_vis: "public"' not in src and "i_vis: audience" in src
