"""The public STRIVE home is the social product: real public runs first, people to follow and the
week beside them. Adding a run is one header action that leads to Add a run (/?post), where the
drop zone has lived since 25 Sep 2026 evening."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'site/index.html').read_text()
POSTFLOW = (ROOT / 'site/post-flow.js').read_text()
NAV_CSS = (ROOT / 'site/navigation.css').read_text()


def node(script):
    """Run a script against the real site modules and return its JSON result."""
    done = subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(done.stdout)


def landing():
    return HTML[HTML.index('function landingHTML()'):HTML.index('// THE DROP ZONE. One markup')]


def view_landing():
    return HTML[HTML.index('async function viewLanding()'):HTML.index('\nasync function mountCoachExperiment(')]


# Renders the real landingHTML() signed out, then signed in, and the real page shell.
RENDER_LANDING = r"""
const fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom');
const s=fs.readFileSync('site/index.html','utf8');
const fn=s.slice(s.indexOf('function landingHTML()'),s.indexOf('// THE DROP ZONE. One markup'));
const render=ME=>{const ctx={ME,document:{documentElement:{dataset:{}}},skeletonCard:()=>'<i data-skeleton></i>'};
  vm.createContext(ctx);vm.runInContext(fn,ctx);return ctx.landingHTML()};
const facts=html=>{const d=new JSDOM(html).window.document;return {html,
  headings:[...d.querySelectorAll('h2')].map(h=>[h.id,h.textContent]),
  links:[...d.querySelectorAll('a')].map(a=>[a.getAttribute('href'),a.textContent]),
  slots:['landing-feature','landing-feature-body','public-run-count','home-builders','home-week'].filter(id=>d.getElementById(id)),
  primary:d.querySelectorAll('.act.primary').length,buttons:d.querySelectorAll('button').length,
  lists:d.querySelectorAll('ol,ul').length,inputs:d.querySelectorAll('input,#drop-zone,#drop-stage').length,
  intro:d.querySelector('.home-intro')?.textContent||'',
  skeletons:d.querySelectorAll('#landing-feature-body .feed-skeleton').length,
  busy:d.getElementById('landing-feature-body').getAttribute('aria-busy'),
  labelledby:d.getElementById('landing-feature').getAttribute('aria-labelledby')}};
const shell=new JSDOM(s,{url:'https://strive.test/',runScripts:'outside-only'}).window.document;
const adds=[...shell.querySelectorAll('.bar a[href="/?post"]')].map(a=>({cls:a.className,text:a.textContent.replace(/\s+/g,' ').trim(),
  gated:a.hidden||a.hasAttribute('data-auth')||!!a.closest('[hidden],[data-auth]')}));
const auth=shell.getElementById('auth');
process.stdout.write(JSON.stringify({out:facts(render(null)),member:facts(render({id:'fixture-member'})),adds,
  signin:{text:auth.textContent,hidden:auth.hidden}}));
"""


def test_logged_out_landing_exposes_browsing_and_first_post():
    seen = node(RENDER_LANDING)
    out = seen["out"]
    body = out["html"]
    assert "<title>__BRAND__ · __TAGLINE__</title>" in HTML
    # 09294e4 (8 Oct 2026) gave STRIVE its own public copy: the borrowed Strava joke is gone, and
    # d716f23 leads the signed-out home with real public work instead of a pitch.
    assert "Strava is for people who ran" not in HTML
    # Browsing: public runs lead, then people, then the week. Source order is the phone order.
    assert out["headings"] == [["h-popular", "Public runs"], ["h-builders", "People building"], ["h-week", "This week"]]
    assert seen["member"]["headings"][0] == ["h-popular", "Your feed"]
    assert out["slots"] == ['landing-feature', 'landing-feature-body', 'public-run-count', 'home-builders', 'home-week']
    assert out["links"] == [["/?people", "Find people"]]
    # /?explore was a menu link; a321b1b removed it from the menu and the address still opens the home.
    route = HTML[HTML.index('async function route(){'):]
    assert "if(q.get('explore')!==null){history.replaceState(null,'','/');return viewLanding();}" in route
    # The first post: Add run is in the shared header for everybody, one per screen size, not sign-in gated.
    assert seen["adds"] == [
        {"cls": "product-nav-link product-nav-add", "text": "Add run", "gated": False},
        {"cls": "global-add", "text": "+ Add run", "gated": False},
    ]
    assert seen["signin"] == {"text": "Sign in", "hidden": False}
    post = HTML[HTML.index('async function viewPost(){'):HTML.index('async function viewExplore(){')]
    assert "${ME?'':'<div class=\"panel pad auth-empty\"><h3>Sign in to save</h3>" in post
    assert 'Sign in to browse' not in body
    # Phone used to pull the feature card above the pitch via order:-1. Keep source order.
    assert '.launch-grid>.landing-feature{order:-1}' not in HTML


# Renders the real Connect/Add run body: connectBodyHtml() from the page, setupHtml() from post-flow.js.
RENDER_CONNECT = r"""
const fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom');
const s=fs.readFileSync('site/index.html','utf8');
const cut=(a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const ctx={ME:null,signInLabel:()=>'Sign in',location:{origin:'https://strive.test'},
  esc:v=>String(v??'').replace(/[<>&"']/g,c=>'&#'+c.charCodeAt(0)+';')};
ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('site/post-flow.js','utf8'),ctx);
vm.runInContext(cut('const ONE_LINE=','function wireAutoSync(')+cut('function connectBodyHtml(){','function wireConnectCopies(')+
  cut('function dropZoneHtml(){','// The newest public runs')+';globalThis.out=connectBodyHtml();',ctx);
const w=new JSDOM('<main id="app">'+ctx.out+'</main>').window,d=w.document;
const file=d.getElementById('drop-file'),entry=file&&file.closest('details');
const text=el=>el?el.textContent.replace(/\s+/g,' ').trim():null;
const order=['.post-start','.post-file-entry','.post-setup'].map(q=>ctx.out.indexOf(d.querySelector(q).outerHTML.slice(0,40)));
const fixture=ctx.StrivePostFlow.setupHtml({agentPrompt:'TEST DATA prompt',capture:'TEST DATA capture',syncHtml:'<i id="fx-sync"></i>',
  dropHtml:'<i id="fx-drop"></i>',agentFiles:[],agentCommands:{cursor:'TEST DATA cursor'}});
const f=new JSDOM(fixture).window.document;
const initial=text(d.getElementById('post-plugin-command'));
ctx.StrivePostFlow.mountSetup(d.getElementById('app'));
const editor=d.getElementById('post-editor');editor.value='claude';editor.dispatchEvent(new w.Event('change'));
process.stdout.write(JSON.stringify({
  drop:{count:d.querySelectorAll('#drop-file').length,entry:entry&&entry.className,open:entry&&entry.open,summary:text(entry&&entry.querySelector('summary'))},
  folders:[...d.querySelectorAll('.post-file-entry [data-agent-folder] code')].map(text),
  sources:[...d.querySelectorAll('.post-start [data-post-source]')].map(b=>[b.dataset.postSource,b.dataset.command||null]),
  order,setupOpen:d.getElementById('post-setup').open,setupSummary:text(d.querySelector('#post-setup > summary span')),
  tabs:[...d.querySelectorAll('[data-setup-tab]')].map(t=>[t.dataset.setupTab,t.getAttribute('aria-selected')]),
  terminal:text(d.querySelector('#setup-terminal code')),h2:d.querySelectorAll('h2').length,
  sample:d.querySelector('.post-sample a').getAttribute('href'),
  source:d.querySelector('#setup-editor a[href^="https://github.com/"]').getAttribute('href'),
  plugin:{initial,copy:d.getElementById('post-plugin-copy').dataset.copy,claude:text(d.getElementById('post-plugin-command'))},
  fixture:{drop:f.getElementById('fx-drop').closest('details').className,sync:f.getElementById('fx-sync').parentElement.id,
    capture:text(f.querySelector('#setup-terminal code')),cursor:f.querySelector('[data-post-source="cursor"]').dataset.command,
    claude:f.querySelector('[data-post-source="claude"]').dataset.command,prompt:f.querySelector('.post-agent-entry button').dataset.copy}}));
"""


def test_the_drop_zone_left_the_home_for_add_a_run():
    out = node(RENDER_LANDING)["out"]
    body = out["html"]
    assert out["inputs"] == 0 and 'dropZoneHtml()' not in landing() and 'id="drop-file"' not in body
    assert 'stay private until' not in body and 'Nothing is shared until' not in body
    post = HTML[HTML.index('async function viewPost(){'):HTML.index('async function viewExplore(){')]
    assert '${connectBodyHtml()}' in post and "location.hash==='#drop-zone'" in post
    # The drop zone is handed to the shared Add run markup, which keeps it in one closed disclosure.
    connect = HTML[HTML.index('function connectBodyHtml(){'):HTML.index('function wireConnectCopies(')]
    assert 'dropHtml:dropZoneHtml()' in connect
    page = node(RENDER_CONNECT)
    assert page["drop"] == {"count": 1, "entry": "post-file-entry", "open": False, "summary": "Or drop a session file"}
    assert page["fixture"]["drop"] == "post-file-entry"
    assert page["folders"] == ['~/.claude/projects/', '~/.cursor/projects/', '~/.codex/sessions/']
    route = HTML[HTML.index('async function route(){'):]
    assert "if(location.hash==='#drop-zone') return viewPost();" in route
    # d716f23 (8 Oct 2026): home starts with real public work for everybody; Following is a filter.
    assert "social.following({home:true})" not in route
    assert route.index("if(location.hash==='#drop-zone') return viewPost();") < route.index("return viewLanding(); }")


def test_landing_points_to_a_real_run_not_the_bundled_sample():
    # 25 Sep 2026: every /?example link became the real public run. A stranger meets a real card.
    # d716f23 (8 Oct 2026) then removed the single "A real run" link: the home itself is real runs.
    out = node(RENDER_LANDING)["out"]
    body = out["html"]
    assert "const REAL_RUN='/r/3afa89e7-aff5-488d-bec3-da36196b8c5e';" in HTML
    assert '/?example' not in HTML
    assert out["skeletons"] == 2 and out["busy"] == "true" and out["labelledby"] == "h-popular"
    assert out["intro"] == ""
    view = view_landing()
    assert "let runs=data.runs||[], runsFailed=data.runs===null;" in view
    # 58b3174 (12 Oct 2026): the same sorted real runs, drawn one page of 20 at a time.
    assert "\nconst FEED_PAGE=20;\n" in HTML
    assert "const sorted=StriveActivity.sort(runs);let shown=0;" in view
    assert "const page=sorted.slice(shown,shown+FEED_PAGE);shown+=page.length;" in view
    assert re.search(r"await feedCards\(page,await ackData\(page\),\{current,onCard:", view)
    assert "if(current()){body.querySelector('.feed-skeleton')?.remove();" in view
    assert "body.prepend(deck)" in view
    assert "deck.insertAdjacentHTML('beforeend',html)" in view
    assert "wireKudos();return true;" in view
    # The one sample a newcomer is offered, on Add a run, is a real public run address.
    assert re.fullmatch(r"/r/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}", node(RENDER_CONNECT)["sample"])
    assert 'aria-label="Sample run card"' not in body
    assert 'WHAT A RUN LOOKS LIKE' not in body
    assert 'HOME_SAMPLE' not in body
    assert 'data-home-sample="1"' not in body
    assert 'aria-labelledby="h-popular"' in body
    assert 'id="landing-feature"' in body
    for retired in ('howItWorks()', 'verified per turn', 'coach verdict', 'DEGRADED'):
        assert retired not in body


# Runs the real home read (site/home.js) and the real fallback read against a recording client.
PUBLIC_READS = r"""
const fs=require('fs'),vm=require('vm');
const H=require('./site/home.js');
const client=(log,fail)=>({from(table){const q={table,calls:[]};log.push(q);
  const chain=new Proxy({},{get:(_,name)=>name==='then'
    ?(ok,bad)=>Promise.resolve(fail?{data:null,error:{code:'TEST'}}:{data:[],error:null}).then(ok,bad)
    :(...args)=>{q.calls.push([name,...args]);return chain}});return chain}});
const s=fs.readFileSync('site/index.html','utf8');
const fallback=s.slice(s.indexOf('async function fetchLatestPublicRuns('),s.indexOf('async function loadLatestCardPreview('));
const run=async(sb)=>{const ctx={sb};vm.createContext(ctx);vm.runInContext(fallback,ctx);return ctx.fetchLatestPublicRuns(5)};
const rows=[{id:'a',profile_id:'p1',visibility:'public',created_at:'2026-10-01T10:00:00Z'},
  {id:'b',profile_id:'p2',visibility:'link',created_at:'2026-10-02T10:00:00Z'},
  {id:'c',profile_id:'p3',visibility:'private',created_at:'2026-10-03T10:00:00Z'},
  {id:'d',profile_id:'p4',visibility:'close_friends',created_at:'2026-10-04T10:00:00Z'}];
(async()=>{
  const home=[],older=[],full=[];
  const data=await H.readRuns(client(home));
  const fullData=await H.read(client(full),Date.parse('2026-10-05T12:00:00Z'));
  const empty=await run(client(older));
  process.stdout.write(JSON.stringify({home,older,data,empty,full,fullData,
    failedFull:await H.read(client([],true),Date.now()),
    failedHome:await H.readRuns(client([],true)),failedOlder:await run(client([],true)),noClient:await run(null),
    builders:H.builders(rows,6).map(b=>b.run.id),days:H.popularDays(rows,{},5).map(r=>r.id)}));
})().catch(e=>{console.error(e);process.exitCode=1});
"""


def test_landing_loads_latest_public_run_only():
    view = view_landing()
    # Real run cards above the fold: the newest Public runs, drawn with the feed card. d716f23 replaced
    # the "popular five" strip with the whole public read, newest activity first.
    # 58b3174 (12 Oct 2026): with Clubs and Events hidden the landing reads runs only (readRuns), and
    # draws the sorted runs a page at a time, reading XUDOS for the cards on that page.
    assert "await H.readRuns(sb)" in view and "H.read(sb" not in view
    assert "const sorted=StriveActivity.sort(runs);" in view and "feedCards(page,await ackData(page)," in view
    assert "if(!runs.length){const older=await fetchLatestPublicRuns(5);" in view
    seen = node(PUBLIC_READS)
    filters = lambda q: [c[1:] for c in q["calls"] if c[0] not in ("select", "order", "limit")]
    # The landing's read touches the runs table once and nothing else.
    assert [q["table"] for q in seen["home"]] == ["runs"]
    home = {q["table"]: q for q in seen["home"]}
    assert filters(home["runs"]) == [["visibility", "public"]]
    assert ["limit", 300] in home["runs"]["calls"]
    # The full read (still used where Clubs are shown) asks for the same Public runs and Public clubs.
    full = {q["table"]: q for q in seen["full"]}
    assert full["runs"]["calls"] == home["runs"]["calls"]
    assert filters(full["grinder_crews"]) == [["visibility", "public"]]
    assert [q["table"] for q in seen["older"]] == ["runs"]
    assert filters(seen["older"][0]) == [["visibility", "public"]]
    assert ["limit", 5] in seen["older"][0]["calls"]
    assert "link" not in json.dumps(seen["home"]) and "link" not in json.dumps(seen["older"])
    assert "link" not in json.dumps(seen["full"])
    # A read that worked and found nothing is empty; a read that failed is unknown, never "none".
    assert seen["data"] == {"runs": []} and seen["empty"] == []
    assert seen["fullData"] == {"runs": [], "clubs": [], "events": []}
    assert seen["failedHome"] == {"runs": None} and seen["failedFull"]["runs"] is None
    assert seen["failedOlder"] is None and seen["noClient"] is None
    # The helpers that pick what is shown keep only Public rows even if another row arrives.
    assert seen["builders"] == ["a"] and seen["days"] == ["a"]
    fetch = HTML[HTML.index('async function fetchLatestPublicRuns('):HTML.index('async function viewLanding()')]
    assert ".eq('visibility','public')" in fetch
    assert "visibility','link'" not in fetch
    assert "HOME_SAMPLE" not in view
    assert "No public run yet" in view


def test_landing_reads_the_public_count_without_using_it_as_sample_content():
    view = view_landing()
    assert "fetchPublicRunCount()" in view
    assert "No public runs yet. Yours would be the first." in view
    count = HTML[HTML.index('async function fetchPublicRunCount()'):HTML.index("const $=id=>")]
    assert "count:'exact'" in count and ".eq('visibility','public')" in count


def test_sign_in_explains_github_and_private_runs():
    assert 'id="signin-explanation"' in HTML
    assert "return to this preview or social action" in HTML
    assert "Closing or cancelling sign-in posts nothing" in HTML
    assert "Runs stay private until" not in HTML and "Nothing is shared until" not in HTML
    assert '<button id="auth" class="ghost">Sign in</button>' in HTML
    panel = HTML[HTML.index('id="signin-explanation"') : HTML.index('id="signin-explanation"') + 800]
    assert "Continue with X" not in panel
    assert "Sign in with GitHub" not in panel


def test_capture_command_points_to_the_public_product():
    # 0255f90 moved the install line out of the page into the Add run setup (site/post-flow.js).
    clone = 'git clone --depth 1 https://github.com/Morkeeth/strive.git strive-plugin-source'
    install = 'python3 strive-plugin-source/scripts/strive-plugin.py install cursor'
    page = node(RENDER_CONNECT)
    assert page["plugin"]["initial"] == clone + install  # two lines joined by <br>
    assert page["plugin"]["claude"] == 'claude plugin marketplace add Morkeeth/striveclaude plugin install strive@strive'
    assert page["plugin"]["copy"] == 'claude plugin marketplace add Morkeeth/strive\nclaude plugin install strive@strive'
    assert f'data-copy="{clone}&#10;{install}"' in POSTFLOW
    assert page["source"] == 'https://github.com/Morkeeth/strive'
    assert 'git clone &lt;repo&gt;' not in HTML and 'git clone &lt;repo&gt;' not in POSTFLOW
    assert '<repo>' not in page["plugin"]["initial"]


def test_landing_has_one_action_and_no_numbered_steps():
    seen = node(RENDER_LANDING)
    out = seen["out"]
    body = out["html"]
    # The home carries no button of its own. The one action is Add run in the shared header:
    # the header pill on a wide screen, the nav item on a phone, never both.
    assert body.count('class="act primary"') == 0 and out["primary"] == 0 and out["buttons"] == 0
    assert [a["cls"] for a in seen["adds"]] == ["product-nav-link product-nav-add", "global-add"]
    wide, phone = NAV_CSS.split('@media(max-width:800px){', 1)
    assert '.product-nav-add{display:none}' in wide and '.global-add{display:inline-flex;' in wide
    assert ' .product-nav-add{display:flex}.global-add{display:none!important}' in phone
    assert 'Explore runs</a>' not in body
    assert out["lists"] == 0
    assert '01 ·' not in body and 'launch-steps' not in body
    assert 'if you want the path' not in body
