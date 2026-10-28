"""The share page for a missing or non-public run is a neutral card, not a plain 404.

Measured live on 16 Sep 2026 at agentic-strava.vercel.app: /r/<missing id>, /r/<close friends id>
and /r/not-a-uuid all answered 404 text/plain "This public run is unavailable.", while
/api/run?id=<missing id>&image=1 answered a 200 PNG neutral card. A link pasted into a message
therefore unfurled nothing and a tap landed on plain text with no way in.

This drives api/run.js through node with a stubbed global fetch, so no database, no
@vercel/og and no network are needed. The image branch is not exercised here; the existing
scripts/check-public-preview.mjs covers it.
"""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MISSING = "00000000-0000-0000-0000-000000000000"

SCRIPT = r'''
const root=process.argv[1],id=process.argv[2],rows=JSON.parse(process.argv[3]);
let fetches=0;
globalThis.fetch=async()=>{fetches++;return{ok:true,json:async()=>rows}};
const handler=require(root+'/api/run.js');
const req={query:{id}};
const headers={};let body='';
const res={statusCode:200,setHeader:(k,v)=>{headers[k.toLowerCase()]=v},end:(b)=>{body=String(b??'')}};
handler(req,res).then(()=>{console.log(JSON.stringify({status:res.statusCode,type:headers['content-type'],body,fetches}))});
'''


def serve(run_id, rows):
    result = subprocess.run(
        ["node", "-e", SCRIPT, str(ROOT), run_id, json.dumps(rows)],
        cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_missing_run_page_is_a_neutral_html_card():
    out = serve(MISSING, [])
    assert out["status"] == 200
    assert out["type"].startswith("text/html")
    page = out["body"]
    assert "This run is private on STRIVE" in page
    assert f'/api/run?id={MISSING}&amp;image=1' in page or f'/api/run?id={MISSING}&image=1' in page
    assert 'property="og:image"' in page
    assert f'href="/?run={MISSING}"' in page
    # Neutral means neutral: no run title, caption, handle, project or counts can be present,
    # because the page was built without a row.
    for leak in ("og:title\" content=\"Grok", "Typed turns", "Wall time"):
        assert leak not in page


def test_non_public_run_page_is_byte_identical_to_the_missing_one():
    # The public-only query returns no row for a close friends run, so the handler cannot tell
    # the two cases apart and must not. Same bytes, same status.
    assert serve(MISSING, []) == serve(MISSING, [])
    other = "11111111-1111-1111-1111-111111111111"
    assert serve(other, [])["body"].replace(other, MISSING) == serve(MISSING, [])["body"]


def test_invalid_id_stays_a_plain_404_and_never_queries():
    out = serve("not-a-uuid", [])
    assert out["status"] == 404
    assert out["type"].startswith("text/plain")
    assert out["fetches"] == 0


def test_public_run_page_stays_public():
    row = {"id": MISSING, "title": "Fixture public run", "caption": "one line", "visibility": "public",
           "profiles": {"handle": "fixture-builder"}}
    out = serve(MISSING, [row])
    assert out["status"] == 200
    assert "Fixture public run" in out["body"]
    assert "This run is private on STRIVE" not in out["body"]


def test_public_run_route_renders_revocable_same_origin_photos():
    script = r'''
const root=process.argv[1],id=process.argv[2];
const run={id,title:'Fixture public run',visibility:'public',profiles:{handle:'fixture-builder'}};
const photo='22222222-2222-2222-2222-222222222222';
const seen=[];
globalThis.fetch=async(url,opts={})=>{seen.push({url:String(url),authorization:opts.headers?.Authorization||null,apikey:opts.headers?.apikey||null});
  if(String(url).includes('/rest/v1/runs?'))return new Response(JSON.stringify([run]),{status:200});
  if(String(url).includes('/rest/v1/run_photos?'))return new Response(JSON.stringify([{id:photo,run_id:id,width:1200,height:900,byte_size:1234,created_at:'2026-10-02T00:00:00Z'}]),{status:200});
  if(String(url).includes('/rest/v1/acks?'))return new Response('[]',{status:200});
  throw Error('unexpected '+url);
};
const handler=require(root+'/api/run.js');
const req={query:{id}};const headers={};let body='';
const res={statusCode:200,setHeader:(k,v)=>{headers[k.toLowerCase()]=v},end:b=>{body=String(b??'')}};
handler(req,res).then(()=>console.log(JSON.stringify({status:res.statusCode,type:headers['content-type'],body,seen})));
'''
    result = subprocess.run(
        ["node", "-e", script, str(ROOT), MISSING], cwd=ROOT,
        check=True, capture_output=True, text=True)
    out = json.loads(result.stdout.strip().splitlines()[-1])
    assert out["status"] == 200
    assert '<section class="public-run-photos"' in out["body"]
    assert f'/api/run-photos?id=22222222-2222-2222-2222-222222222222&amp;run_id={MISSING}' in out["body"]
    assert 'width="1200" height="900"' in out["body"]
    assert "storage/v1" not in out["body"] and "signed" not in out["body"].lower()
    photo_read = next(call for call in out["seen"] if "/rest/v1/run_photos?" in call["url"])
    assert photo_read["authorization"] is None
    assert photo_read["apikey"]
    assert "run_id=eq." + MISSING in photo_read["url"]


def test_link_row_that_reaches_the_handler_stays_neutral_for_strangers():
    # Oscar ruling: Link is relationship-gated, not globally readable on /r/.
    # Even if a link row reached the handler, the public-only re-check must keep the neutral page.
    row = {"id": MISSING, "title": "Fixture link night run", "caption": "one line",
           "visibility": "link", "prompts": 4, "profiles": {"handle": "link-builder"}}
    out = serve(MISSING, [row])
    assert out["status"] == 200
    assert "This run is private on STRIVE" in out["body"]
    assert "Fixture link night run" not in out["body"]
    assert "link-builder" not in out["body"]
    assert 'location.replace("/?run=' in out["body"] or "location.replace('/?run=" in out["body"]
    assert out["body"].split("<script>", 1)[0] == serve(MISSING, [])["body"].split("<script>", 1)[0]


def test_a_non_public_row_that_reaches_the_handler_still_gets_the_neutral_page():
    # The public-only filter lives in the query string. If it were ever lost, or the REST layer
    # ignored it, a close friends row would arrive here. The page must still be neutral.
    row = {"id": MISSING, "title": "SECRET TITLE", "caption": "SECRET CAPTION",
           "visibility": "close_friends", "profiles": {"handle": "secret-handle"}}
    out = serve(MISSING, [row])
    assert out["status"] == 200
    assert "This run is private on STRIVE" in out["body"]
    for leak in ("SECRET TITLE", "SECRET CAPTION", "secret-handle"):
        assert leak not in out["body"]
    # Neutral article matches the missing page; permitted readers are handed to /?run= via script.
    assert out["body"].split("<script>", 1)[0] == serve(MISSING, [])["body"].split("<script>", 1)[0]


def body(page):
    return page.split("<body", 1)[1].split(">", 1)[1].split("</body>", 1)[0]


def test_neutral_body_has_one_message_without_repeating_the_og_card():
    page = serve(MISSING, [])["body"]
    visible = body(page)
    assert visible.count("This run is private on STRIVE") == 1
    assert "<img" not in visible
    assert 'property="og:image"' in page
    assert 'content="summary_large_image"' in page
    assert 'aria-label="STRIVE home"' in visible
    assert 'href="/?run=' + MISSING + '"' in visible


def test_public_page_exposes_recorded_metrics_as_readable_html():
    # The project story leads; up to three known recorded facts remain readable below it.
    row = {"id": MISSING, "visibility": "public", "title": "A real sitting",
           "caption": "Built the import.\nThen checked the save.",
           "prompts": 6, "tool_calls": 0, "ridge_tool_calls": 28,
           "ridge_basis": "wall-time", "ridge_wall_seconds": 900,
           "duration_s": 600, "files_touched": 0, "commits": 2,
           "project": "session", "profiles": {"handle": "builder"}}
    visible = body(serve(MISSING, [row])["body"])
    assert '<article class="share-main"' in visible
    assert '<dt>Commits</dt><dd>2</dd>' in visible
    assert '<dt>Files changed</dt><dd>0</dd>' in visible
    assert '<dt>Elapsed</dt><dd>10m</dd>' in visible
    assert "Built the import." in visible
    assert 'href="/builder"' in visible
    assert 'aria-label="STRIVE home"' in visible
    assert '♥ XUDOS' in visible and 'Comments' in visible
    # Context is shown once as authored highlights, not repeated as a quote hero.
    assert 'aria-label="Project highlights"' in visible
    assert visible.count('Built the import.') == 1
    assert 'Then checked the save.' in visible
    assert 'class="share-quote"' not in visible
    highlights = visible.index('aria-label="Project highlights"')
    facts = visible.index('aria-label="Recorded facts"')
    assert highlights < facts


def test_unrecorded_metrics_are_not_guessed_and_recorded_zero_is_preserved():
    row = {"id": MISSING, "visibility": "public", "duration_s": None,
           "prompts": 0, "tool_calls": None, "files_touched": None, "commits": -1,
           "ridge_basis": "turn-order", "ridge_wall_seconds": 120}
    visible = body(serve(MISSING, [row])["body"])
    assert '<dt>Typed turns</dt><dd>0</dd>' in visible
    for label in ("Elapsed", "Tool calls", "Files changed", "Commits"):
        assert f'<dt>{label}</dt>' not in visible
    assert 'class="share-stats"' in visible
    assert "Unknown" not in visible.split('<details class="share-extra">', 1)[0]


def test_public_html_escapes_fields_and_rejects_unsafe_output_links():
    row = {"id": MISSING, "visibility": "public", "title": '<script>alert(1)</script>',
           "caption": '<img src=x onerror="alert(1)">', "project": '<svg onload="evil()">',
           "harness": '<iframe>', "profiles": {"handle": '<script>bad()</script>'},
           "output_url": 'javascript:alert(1)', "prompts": '<img src=x>'}
    page = serve(MISSING, [row])["body"]
    assert '<script>' not in page
    assert '<iframe>' not in page
    assert '<svg onload' not in page
    assert '&lt;script&gt;alert(1)&lt;/script&gt;' in page
    assert 'javascript:' not in page
    assert 'View linked output' not in page
    row["output_url"] = 'https://example.com/output?a=1&b=2'
    visible = body(serve(MISSING, [row])["body"])
    assert 'href="https://example.com/output?a=1&amp;b=2"' in visible


def test_public_page_keeps_og_preview_but_draws_the_activity_line_natively():
    row = {"id": MISSING, "visibility": "public", "title": "Measured run",
           "ridge": [0, 2, 5, 1, 0] * 10, "worker_bins": [0] * 50,
           "ridge_basis": "turn-order", "commit_bins": [12]}
    page = serve(MISSING, [row])["body"]
    visible = body(page)
    # A title-only record stays readable without inventing project context or a quote.
    assert '<h1>Measured run</h1>' in visible
    assert 'class="share-quote"' not in visible
    assert 'aria-label="Project highlights"' not in visible
    assert 'property="og:image"' in page and 'name="twitter:image"' in page
    assert '<div class="share-route-bars"' in visible
    assert 'Open in STRIVE' in visible
    for bad in (None, [0] * 50, [-1] * 50):
        row["ridge"] = bad
        assert 'share-route-bars' not in body(serve(MISSING, [row])["body"])
    # The private page for the same id never draws a card, a line or a number.
    neutral = body(serve(MISSING, [])["body"])
    for mark in ('class="share-main"', 'share-route-bars', 'share-stats'):
        assert mark not in neutral
