"""A sceptic asks what STRIVE costs. The answer is visible and matches the README (First Users finding 4, 14 Oct)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANSWER = "STRIVE is free and open source"


def test_readme_is_the_source_of_the_answer():
    assert ANSWER in (ROOT / "README.md").read_text()
    assert (ROOT / "LICENSE").read_text().startswith("MIT License")


def test_install_page_answers_cost_near_the_top():
    html = (ROOT / "site" / "install.html").read_text()
    main = html.split("<main>", 1)[1]
    assert ANSWER in main.split('class="install-grid"', 1)[0]


def test_front_door_footer_answers_cost():
    for page in ("index.html", "install.html"):
        html = (ROOT / "site" / page).read_text()
        footer = html.split('<footer class="site-foot">', 1)[1].split("</footer>", 1)[0]
        assert ANSWER in footer, page
