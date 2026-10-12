"""The public product name and tagline come from one file and reach the built site.

Ruling 2026-09-16 09:22: the public product is STRIVE, tagline "Post your strides".
The source tree carries the __BRAND__ and __TAGLINE__ tokens; scripts/build-site.mjs
replaces them from server/brand.mjs. These checks go red if the token stops being
replaced, if a second brand literal appears in the plumbing, or if the old name
returns to a stranger-visible string.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BRAND_FILE = (ROOT / "server" / "brand.mjs").read_text()
HEALTH = (ROOT / "api" / "health.js").read_text()
PUBLIC_RUN = (ROOT / "server" / "public-run.mjs").read_text()
SOURCE_INDEX = (ROOT / "site" / "index.html").read_text()


def build():
    subprocess.run(["node", str(ROOT / "scripts" / "build-site.mjs")], cwd=ROOT, check=True)
    return ROOT / "dist"


def test_one_file_holds_the_name_and_the_tagline():
    assert "export const BRAND='STRIVE';" in BRAND_FILE
    assert "export const TAGLINE='Post your strides';" in BRAND_FILE


def test_the_plumbing_derives_the_name_and_never_repeats_it():
    assert "from './brand.mjs'" in PUBLIC_RUN
    assert "brand.mjs" in HEALTH
    assert "service:SERVICE" in HEALTH
    assert "pacecard" not in HEALTH.lower()
    assert "pacecard" not in PUBLIC_RUN.lower()


def test_the_source_tree_keeps_the_token_so_a_rename_is_one_edit():
    assert "<title>__BRAND__ · __TAGLINE__</title>" in SOURCE_INDEX
    # Product names in prose, environment keys and captured user data are not branding plumbing.
    # The browser title and social title/alt tags remain renameable build tokens.
    assert SOURCE_INDEX.count('content="__BRAND__ · __TAGLINE__"') == 4
    assert '>__BRAND__</a>' in SOURCE_INDEX


def test_the_built_site_carries_the_name_and_leaves_no_token():
    dist = build()
    index = (dist / "index.html").read_text()
    assert "<title>STRIVE · Post your strides</title>" in index
    for name in ("index.html", "account.js", "origin.js", "fork-run.js", "privacy.html", "terms.html", "methodology.html"):
        text = (dist / name).read_text()
        assert "__BRAND__" not in text and "__TAGLINE__" not in text
    for name in ("privacy.html", "terms.html", "methodology.html"):
        assert "Pacecard" not in (dist / name).read_text()
    for phrase in ("Welcome to Pacecard", ">Pacecard<", "Pacecard profile", "Pacecard identity"):
        assert phrase not in index
