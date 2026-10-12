"""THE HOME PAGE, AS A POST SEES IT.

Launch audit of production 7858535: the address people actually post — the root — carried zero
`og:` and zero `twitter:` tags. A run page has had them since it shipped, so a link to one run
unfurled with a title, a description and a 1200x630 image, while a link to the product itself
showed as a bare URL. If a post sends a thousand people, that bare link is the first thing all
thousand see.

Every test here fails on the old head: it had none of these tags.
"""
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
INDEX = (ROOT / "site" / "index.html").read_text()
BUILD = (ROOT / "scripts" / "build-site.mjs").read_text()
PUBLIC_RUN = (ROOT / "server" / "public-run.mjs").read_text()
# Read lazily: on a tree that has no share-image endpoint at all, this file's assertions are the
# report, not a collection error.
OG_ENDPOINT = (ROOT / "api" / "og.js").read_text() if (ROOT / "api" / "og.js").is_file() else ""


def _built() -> str:
    subprocess.run(["node", str(ROOT / "scripts" / "build-site.mjs")], cwd=ROOT, check=True)
    return (ROOT / "dist" / "index.html").read_text()


def test_the_home_page_source_carries_the_share_tags():
    for tag in ('property="og:type"', 'property="og:title"', 'property="og:description"',
                'property="og:image"', 'property="og:url"', 'name="twitter:card"',
                'name="twitter:image"'):
        assert tag in INDEX, tag
    assert 'name="twitter:card" content="summary_large_image"' in INDEX
    assert 'property="og:image:width" content="1200"' in INDEX
    assert 'property="og:image:height" content="630"' in INDEX
    # The name and address stay tokens, so renaming or moving the site is still one edit.
    assert '<meta property="og:title" content="__BRAND__ · __TAGLINE__">' in INDEX
    assert '<meta property="og:image" content="__ORIGIN__/api/og">' in INDEX


def test_the_built_page_points_a_crawler_at_an_absolute_image():
    built = _built()
    assert "__ORIGIN__" not in built and "__BRAND__" not in built
    image = re.search(r'<meta property="og:image" content="([^"]+)">', built).group(1)
    assert image.startswith(("https://", "http://localhost")), image
    assert image.endswith("/api/og")
    assert re.search(r'<meta property="og:title" content="STRIVE · Post your strides">', built)
    assert '<meta name="twitter:card" content="summary_large_image">' in built
    for tag in ("og:image", "twitter:card"):
        assert built.count(tag) >= 1
    # A relative image is the failure mode this replaced: crawlers do not resolve one.
    assert 'content="/api/og"' not in built


def test_the_build_refuses_to_ship_a_page_that_lost_its_share_tags():
    assert "The home page lost its share tag" in BUILD
    assert "The share image must be an absolute URL" in BUILD
    assert "__ORIGIN__" in BUILD


HOME_IMAGE = r"""
const assert=require('node:assert/strict');
const realFetch=globalThis.fetch,calls=[];
// The endpoint, offline: every database read is recorded and refused. (The image library loads
// its own bundled data: resources through fetch; those are not reads of anything.)
globalThis.fetch=async(url,options)=>{if(String(url).startsWith('data:'))return realFetch(url,options);calls.push(String(url));throw new Error('offline')};
const handler=require('./api/og.js');
const res={headers:{},setHeader(k,v){this.headers[k]=v},end(b){this.body=b}};
(async()=>{
 await handler({query:{}},res);
 const {homeCard}=await import('./server/public-run.mjs');
 const {BRAND,TAGLINE}=await import('./server/brand.mjs');
 const text=n=>n==null||n===false?[]:typeof n==='string'||typeof n==='number'?[String(n)]:Array.isArray(n)?n.flatMap(text):text(n.props&&n.props.children);
 const lines=n=>JSON.stringify(n).includes('"polyline"');
 const trail={id:'90a16040-8ad5-4096-978c-8b1f78f3dd2f',title:'TEST DATA public trail',rhythm:[1,4,2,8,3]};
 const empty=homeCard(),hidden=homeCard({...trail,visibility:'private'}),shown=homeCard({...trail,visibility:'public'});
 process.stdout.write(JSON.stringify({status:res.statusCode,type:res.headers['Content-Type'],cache:res.headers['Cache-Control'],
  png:res.body.subarray(1,4).toString(),width:res.body.readUInt32BE(16),height:res.body.readUInt32BE(20),calls,
  brand:BRAND,tagline:TAGLINE,empty:text(empty),hiddenSame:JSON.stringify(hidden)===JSON.stringify(empty),
  shown:text(shown),emptyLine:lines(empty),shownLine:lines(shown)}));
})().catch(e=>{console.error(e);process.exitCode=1});
"""


def _home_image() -> dict:
    return json.loads(subprocess.run(["node", "-e", HOME_IMAGE], cwd=ROOT, check=True, capture_output=True, text=True).stdout)


def test_the_share_image_is_the_run_image_pipeline_not_a_committed_png():
    assert "homeCard" in OG_ENDPOINT and "@vercel/og" in OG_ENDPOINT
    assert "width:1200,height:630" in OG_ENDPOINT
    assert "export function homeCard(run=null)" in PUBLIC_RUN
    # Run the endpoint itself. It answers with a 1200x630 PNG drawn on request, with no database.
    out = _home_image()
    assert (out["status"], out["type"], out["png"], out["width"], out["height"]) == (200, "image/png", "PNG", 1200, 630)
    assert out["cache"] == "private, no-store, max-age=0"
    # Until 00bdaf8 (11 Oct 2026) the home image read no run at all. It may now draw one featured
    # trail, and reads exactly that one row through the public-visibility filter and nothing else.
    assert len(out["calls"]) == 1
    query = out["calls"][0].split("/rest/v1/runs?", 1)[1].split("&")
    assert "id=eq.90a16040-8ad5-4096-978c-8b1f78f3dd2f" in query and "visibility=eq.public" in query and "limit=1" in query
    # The tree it draws: the brand and tagline from server/brand.mjs, and no home directory slug.
    assert out["empty"] == [out["brand"], out["tagline"], "Show what you made.",
                            "Real sessions. The work behind them. The people building next."]
    assert (out["brand"], out["tagline"]) == ("STRIVE", "Post your strides")
    assert not out["emptyLine"] and "Users-" not in " ".join(out["empty"] + out["shown"])
    # A run that is not public leaves no trace on the image; a public one draws its title and trail.
    assert out["hiddenSame"] is True
    assert out["shown"] == [out["brand"], out["tagline"], "TEST DATA public trail", "Recorded activity · one public run on STRIVE"]
    assert out["shownLine"] is True


def test_the_unfurl_describes_the_product_and_the_page_names_the_tools_it_reads():
    # The unfurl stopped listing tools, and dropped the Strava line, with the product's own copy
    # (09294e4, 8 Oct 2026). It still says what the product does and that the audience is a choice.
    description = re.search(r'<meta property="og:description" content="([^"]+)">', INDEX).group(1)
    assert description == ("Preview a real coding session, add your story and images, then choose who can see "
                           "your run on __BRAND__.")
    assert re.search(r'<meta name="twitter:description" content="([^"]+)">', INDEX).group(1) == description
    assert "Strava" not in description
    # The page's own description is where the tools are named now: the three the drop-in reads
    # (site/dropin-parse.js HARNESSES) and Grok Bot, and no tool the product has no reader for.
    page = re.search(r'<meta name="description" content="([^"]+)">', INDEX).group(1)
    assert page == ("Turn a Cursor, Grok Bot, Claude Code or Codex session into a run card. Post your runs and see "
                    "what other builders are making. Private until you choose to share.")
    dropin = json.loads(subprocess.run(["node", "-e", "process.stdout.write(JSON.stringify(require('./site/dropin-parse.js').HARNESSES))"],
                                       cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    assert sorted(dropin) == ["Claude Code", "Codex", "Cursor"]
    for tool in dropin:
        assert tool in page, tool
    from agentgrinder.ingest import HARNESSES
    named = re.search(r"Turn a (.+) session into", page).group(1).replace(" or ", ", ").split(", ")
    assert sorted(named) == sorted(set(HARNESSES.values()))
    assert "private until you choose" in page.lower()
