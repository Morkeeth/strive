"""The October STRIVE shell: one home for each feature and capture before manual import."""
from pathlib import Path
import json
import subprocess


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site/index.html").read_text()
SOCIAL = (ROOT / "site/social.js").read_text()


def node(script):
    """Run a script against the real site modules and return its JSON result."""
    done = subprocess.run(["node", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(done.stdout)


def test_global_shell_has_no_privacy_slogan_or_more_drawer():
    # The old slice ended at the first "<script src=", which is in <head>, so it was empty and the
    # two "not in" checks could not fail. The shell is everything from <body> to its first script.
    start = INDEX.index("<body>")
    body = INDEX[start : INDEX.index("<script src=", start)]
    # a72ddde (12 Oct 2026): a Skip to content link is the first thing in the shell, and the main
    # region takes focus from it (tabindex="-1"). The shell is otherwise the same.
    assert body.startswith('<body>\n<a class="skip-link" href="#app">Skip to content</a>\n')
    assert '<nav id="product-nav"' in body and '<main class="main" id="app" tabindex="-1">' in body
    assert "Private by default" not in body
    assert ">More<" not in body
    assert "<details" not in body[body.index('<nav id="product-nav"') : body.index("</nav>")]
    assert body.count("<footer") == 1
    assert 'href="/privacy">Privacy</a>' in body.split("<footer", 1)[1]


# Renders the real Add run body: connectBodyHtml() from the page and setupHtml()/mountSetup()
# from site/post-flow.js, then presses the real source buttons.
ADD_RUN = r"""
const fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom');
const s=fs.readFileSync('site/index.html','utf8');
const cut=(a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const ctx={ME:null,signInLabel:()=>'Sign in',location:{origin:'https://strive.test'},
  esc:v=>String(v??'').replace(/[<>&"']/g,c=>'&#'+c.charCodeAt(0)+';')};
ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('site/post-flow.js','utf8'),ctx);
vm.runInContext(cut('const ONE_LINE=','function wireAutoSync(')+cut('function connectBodyHtml(){','function wireConnectCopies(')+
  cut('function dropZoneHtml(){','// The newest public runs')+';globalThis.out=connectBodyHtml();',ctx);
const w=new JSDOM('<main id="app">'+ctx.out+'</main>').window,d=w.document,app=d.getElementById('app');
w.Element.prototype.scrollIntoView=()=>{};
const text=el=>el?el.textContent.replace(/\s+/g,' ').trim():null;
const out={blocks:[...app.children].map(el=>el.tagName.toLowerCase()+'.'+el.className),
  intro:text(d.querySelector('.post-start-intro')),
  sources:[...d.querySelectorAll('.post-start [data-post-source]')].map(b=>[b.dataset.postSource,text(b.querySelector('strong')),b.dataset.command||null]),
  file:{open:d.querySelector('.post-file-entry').open,summary:text(d.querySelector('.post-file-entry > summary')),drop:!!d.querySelector('.post-file-entry #drop-file')},
  setup:{open:d.getElementById('post-setup').open,summary:text(d.querySelector('#post-setup > summary span')),
    tabs:[...d.querySelectorAll('[data-setup-tab]')].map(t=>[text(t),t.getAttribute('aria-selected')]),
    terminal:text(d.querySelector('#setup-terminal code')),automatic:!!d.querySelector('#setup-automatic #auto-sync'),
    guides:[...d.querySelectorAll('#post-setup a[href="/agents.md"]')].map(text)},
  h2:[...d.querySelectorAll('h2')].map(text),
  agent:{hidden:d.querySelector('.post-agent-entry').hidden,label:text(d.querySelector('.post-agent-entry button')),copy:d.querySelector('.post-agent-entry button').dataset.copy},
  quickHidden:d.getElementById('post-quick-start').hidden};
ctx.StrivePostFlow.mountSetup(app);
d.querySelector('[data-post-source="cursor"]').click();
out.cursor={quickHidden:d.getElementById('post-quick-start').hidden,title:text(d.getElementById('post-quick-title')),
  command:text(d.getElementById('post-quick-command')),copy:d.getElementById('post-quick-copy').dataset.copy,agentHidden:d.querySelector('.post-agent-entry').hidden};
d.querySelector('[data-post-source="grok"]').click();
out.grok={quickHidden:d.getElementById('post-quick-start').hidden,agentHidden:d.querySelector('.post-agent-entry').hidden};
process.stdout.write(JSON.stringify(out));
"""


def test_capture_is_primary_and_manual_import_is_advanced():
    connect = INDEX[INDEX.index("function connectBodyHtml()") : INDEX.index("function wireConnectCopies")]
    # b803b86 (8 Oct 2026) moved this page's markup to site/post-flow.js and replaced "Preview your
    # latest session" with a deliberate per-agent session picker. Capture still leads; choosing a
    # file by hand and the other import methods stay behind closed disclosures below it.
    assert "return StrivePostFlow.setupHtml({agentPrompt,capture,syncHtml:autoSyncHtml(),dropHtml:dropZoneHtml()," in connect
    page = node(ADD_RUN)
    assert page["blocks"] == ["section.post-start", "details.post-file-entry", "p.post-sample", "details.post-setup"]
    assert page["intro"] == "Open a local session picker, then check your private preview. Nothing is saved online yet."
    picker = "uvx --from __CAPTURE_PACKAGE__ strive sessions --harness {} --open --site __ORIGIN__"
    assert page["sources"] == [
        ["cursor", "Cursor", picker.format("cursor")],
        ["claude", "Claude Code", picker.format("claude")],
        ["codex", "Codex", picker.format("codex")],
        ["grok", "Grok Bot", None],
        ["bb", "bb", "bb thread log --self --all --json > bb-session.json"],
    ]
    # Pressing an agent shows its own picker command; nothing is shown or copied before that.
    assert page["quickHidden"] is True
    assert page["cursor"] == {
        "quickHidden": False,
        "title": "Copy to Terminal to open your Cursor session picker",
        "command": picker.format("cursor"),
        "copy": picker.format("cursor"),
        "agentHidden": True,
    }
    # The agent hand-off (was "Copy link for your agent") is the copyable request that names the guide.
    assert page["agent"] == {
        "hidden": True,
        "label": "Copy request",
        "copy": "Open https://strive.test/agents.md and help me preview this session on STRIVE. Keep it local until I choose to save it.",
    }
    assert page["grok"] == {"quickHidden": True, "agentHidden": False}
    # Manual import is advanced: both disclosures start closed and follow the capture block.
    assert page["file"] == {"open": False, "summary": "Or drop a session file", "drop": True}
    assert page["setup"]["open"] is False and page["setup"]["summary"] == "Import setup"
    assert page["setup"]["tabs"] == [["Editor plugin", "true"], ["Terminal", "false"], ["Automatic imports", "false"], ["Find a session", "false"]]
    assert page["setup"]["terminal"] == "uvx --from __CAPTURE_PACKAGE__ agentgrinder grind --harness auto --push --open --no-rank --no-series --push-url __ORIGIN__"
    assert page["setup"]["automatic"] is True
    # The agent setup guide (was "Read the agent setup guide") is linked from the advanced setup.
    assert page["setup"]["guides"] == ["Choose an exact session", "MCP, Grok and other agent instructions"]
    assert page["h2"] == [] and "<h2>Then</h2>" not in connect
    assert "Post a run without a Cursor export" not in INDEX


# Runs the real notificationsPanel() against a recording client, then presses "Mark read".
NOTIFICATIONS = r"""
const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM('<main id="app"></main><div id="slot"></div>',{url:'https://strive.test/',runScripts:'outside-only'}).window,d=w.document;
w.eval(fs.readFileSync('site/run-links.js','utf8'));w.eval(fs.readFileSync('site/social.js','utf8'));
const log=[],actor={handle:'fixture-actor',display_name:'TEST DATA actor'},run='11111111-1111-4111-8111-111111111111',reply='22222222-2222-4222-8222-222222222222';
const rows=[{id:'n1',kind:'reply',run_id:run,source_id:reply,read_at:null,created_at:'2026-10-10T10:00:00Z',actor},
  {id:'n2',kind:'follow',read_at:'2026-10-10T11:00:00Z',created_at:'2026-10-10T09:00:00Z',actor},
  {id:'n3',kind:'ack',run_id:run,read_at:'2026-10-10T11:00:00Z',created_at:'2026-10-10T08:00:00Z',actor:null}];
const db={from(table){const q={table,calls:[]};log.push(q);const chain=new Proxy({},{get:(_,name)=>name==='then'
  ?(ok,bad)=>Promise.resolve({data:table!=='grinder_notifications'?[]:q.calls.some(c=>c[0]==='update')?[{id:'n1'}]:rows,error:null}).then(ok,bad)
  :(...a)=>{q.calls.push([name,...a]);return chain}});return chain}};
let viewer=null;
const social=w.GrinderSocial({client:db,me:()=>viewer,app:()=>d.getElementById('app'),frame(){},railHtml:()=>'',feedTabs:()=>'',setPrimarySection(){},status(){},signInGitHub(){}});
const slot=d.getElementById('slot'),text=el=>el.textContent.replace(/\s+/g,' ').trim();
(async()=>{
  await social.notificationsPanel(slot);
  const out={signedOut:text(slot),signedOutReads:log.length};
  viewer={id:'fixture-viewer'};await social.notificationsPanel(slot);
  out.items=[...slot.querySelectorAll('[data-notification-id]')].map(a=>({id:a.dataset.notificationId,state:a.className,copy:text(a.querySelector('.notice-copy')),
    links:[...a.querySelectorAll('.notice-links a')].map(l=>[text(l),l.getAttribute('href')]),canMark:!!a.querySelector('[data-notification-read]')}));
  out.reads=log.map(q=>({table:q.table,calls:q.calls}));
  const before=log.length;slot.querySelector('[data-notification-read]').click();await new Promise(r=>setTimeout(r,20));
  out.mark=log.slice(before).map(q=>({table:q.table,calls:q.calls.map(c=>c[0]==='update'?['update',Object.keys(c[1])]:c)}));
  out.after={state:slot.querySelector('[data-notification-id="n1"]').className,canMark:!!slot.querySelector('[data-notification-id="n1"] [data-notification-read]')};
  process.stdout.write(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1});
"""


# Runs the real Responses page, social.inbox(), the view /?inbox opens, against a recording client.
INBOX = r"""
const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM('<main id="app"></main>',{url:'https://strive.test/?inbox',runScripts:'outside-only'}).window,d=w.document;
w.eval(fs.readFileSync('site/run-links.js','utf8'));w.eval(fs.readFileSync('site/social.js','utf8'));
const log=[],actor={handle:'fixture-actor',display_name:'TEST DATA actor'},run='11111111-1111-4111-8111-111111111111',reply='22222222-2222-4222-8222-222222222222';
const data={grinder_notifications:[{id:'n1',kind:'reply',run_id:run,source_id:reply,read_at:null,created_at:'2026-10-10T10:00:00Z',actor},
    {id:'n2',kind:'follow',read_at:'2026-10-10T11:00:00Z',created_at:'2026-10-10T09:00:00Z',actor}],
  runs:[{id:run,visibility:'private',title:'TEST DATA run',profiles:{handle:'fixture-viewer'}}],grinder_replies:[{id:reply,run_id:run}]};
const db={from(table){const q={table,calls:[]};log.push(q);const chain=new Proxy({},{get:(_,name)=>name==='then'
  ?(ok,bad)=>{let rows=data[table]||[];if(table==='grinder_notifications'&&q.calls.some(c=>c[0]==='is'&&c[1]==='read_at'&&c[2]===null))rows=rows.filter(r=>!r.read_at);return Promise.resolve({data:rows,error:null}).then(ok,bad)}:(...a)=>{q.calls.push([name,...a]);return chain}});return chain}};
let viewer=null;
const social=w.GrinderSocial({client:db,me:()=>viewer,app:()=>d.getElementById('app'),frame(){},railHtml:()=>'',feedTabs:()=>'',setPrimarySection(){},status(){},signInGitHub(){}});
const text=el=>el.textContent.replace(/\s+/g,' ').trim(),settle=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
  await social.inbox();await settle();
  const out={signedOutReads:log.length,signedOutItems:d.querySelectorAll('[data-notification-id]').length};
  viewer={id:'fixture-viewer'};await social.inbox();await settle();
  out.title=text(d.querySelector('.head h2'));out.summary=text(d.querySelector('.response-summary'));
  out.items=[...d.querySelectorAll('article[data-notification-id]')].map(a=>({id:a.dataset.notificationId,state:a.className,
    links:[...a.querySelectorAll('.response-item-actions a')].map(l=>[text(l),l.getAttribute('href')])}));
  out.reads=log.map(q=>({table:q.table,calls:q.calls}));
  process.stdout.write(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1});
"""


def test_notifications_reuse_the_existing_rls_backed_store():
    panel = SOCIAL[SOCIAL.index("async function notificationsPanel") : SOCIAL.index("async function resolveNotificationTargets")]
    assert '.from("grinder_notifications")' in panel
    assert '.eq("recipient_id", me().id)' in panel
    # The row is joined to its run before the link is built, so a public run opens at its clean address.
    assert "notificationHref(withRun)" in panel and "notificationPrimary(withRun)" in panel
    assert "markNotificationsRead" in panel
    # The page that owns notifications today is the Responses inbox at /?inbox (eb4023e removed the
    # header drawer that used to call notificationsPanel). Signed out it reads nothing; signed in,
    # every read of the store is scoped to the viewer's own rows.
    inbox_src = SOCIAL[SOCIAL.index("  async function inbox() {") : SOCIAL.index("\n  async function ", SOCIAL.index("  async function inbox() {") + 10)]
    assert '.from("grinder_notifications")' in inbox_src and '.eq("recipient_id", me().id)' in inbox_src
    assert "if(q.has('inbox')){setPrimarySection('inbox');return social.inbox();}" in INDEX
    inbox = node(INBOX)
    assert inbox["signedOutReads"] == 0 and inbox["signedOutItems"] == 0
    assert inbox["title"] == "Notifications" and inbox["summary"] == "1 unread · 1 recent"
    own = [["eq", "recipient_id", "fixture-viewer"]]
    assert [(q["table"], [c for c in q["calls"] if c[0] in ("eq", "in")]) for q in inbox["reads"]] == [
        ("grinder_notifications", own),
        ("runs", [["in", "id", ["11111111-1111-4111-8111-111111111111"]]]),
        ("grinder_replies", [["in", "id", ["22222222-2222-4222-8222-222222222222"]]]),
        ("grinder_notifications", own),
    ]
    assert inbox["reads"][0]["calls"][2:] == [["is", "read_at", None], ["order", "created_at", {"ascending": False}], ["limit", 50]]
    # The default inbox is the one-time view: already-read rows stay available only
    # through the explicit All history filter.
    assert inbox["items"] == [
        {"id": "n1", "state": "card response-item unread", "links": [
            ["Open profile", "/fixture-actor"],
            ["Open exact reply", "/?run=11111111-1111-4111-8111-111111111111#reply-22222222-2222-4222-8222-222222222222"]]},
    ]
    # The compact panel is still exported by the module and keeps the same rules.
    seen = node(NOTIFICATIONS)
    # Signed out, the store is never read.
    assert seen["signedOut"] == "Sign in to see replies, XUDOS and new followers." and seen["signedOutReads"] == 0
    # Signed in, every read and write of the store is scoped to the viewer's own rows.
    assert seen["reads"][0] == {"table": "grinder_notifications", "calls": [
        ["select", "*,actor:profiles!grinder_notifications_actor_id_fkey(github_handle,name,handle,display_name,avatar_url)"],
        ["eq", "recipient_id", "fixture-viewer"], ["order", "created_at", {"ascending": False}], ["limit", 20]]}
    assert [q["table"] for q in seen["reads"]] == ["grinder_notifications", "runs", "grinder_replies"]
    run, reply = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
    assert seen["items"] == [
        {"id": "n1", "state": "notice-item unread", "copy": "TEST DATA actor replied to your run",
         "links": [["Open exact reply", f"/?run={run}#reply-{reply}"]], "canMark": True},
        {"id": "n2", "state": "notice-item read", "copy": "TEST DATA actor followed you",
         "links": [["Open profile", "/fixture-actor"]], "canMark": False},
        # A XUDOS notice from a profile that cannot be shown names nobody and opens nothing.
        {"id": "n3", "state": "notice-item read", "copy": seen["items"][2]["copy"], "links": [], "canMark": False},
    ]
    assert seen["items"][2]["copy"].endswith("sent XUDOS on your run")
    # Marking one read updates only that row for this viewer, then recounts this viewer's unread rows.
    assert seen["mark"] == [
        {"table": "grinder_notifications", "calls": [
            ["update", ["read_at"]], ["in", "id", ["n1"]], ["eq", "recipient_id", "fixture-viewer"], ["is", "read_at", None], ["select", "id"]]},
        {"table": "grinder_notifications", "calls": [
            ["select", "id"], ["eq", "recipient_id", "fixture-viewer"], ["is", "read_at", None], ["limit", 50]]},
    ]
    assert seen["after"] == {"state": "notice-item read", "canMark": False}


def test_profile_projects_precede_tools_and_runs_and_edit_is_modal():
    profile = INDEX[INDEX.index("async function viewProfile(handle)") : INDEX.index("function signInWithGitHub")]
    # The first app.innerHTML is now the loading skeleton; the page itself is the profileHtml template.
    assert "const projects=profileProjectsHtml(R,mine);" in profile
    assert profile.index("const projects=profileProjectsHtml(R,mine);") < profile.index("const profileHtml=`")
    rendered = profile[profile.index("const profileHtml=`") : profile.index("app.innerHTML=profileHtml;")]
    assert rendered.index("${projects}") < rendered.index('class="profile-tools"')
    assert rendered.index('class="profile-tools"') < rendered.index("${pinnedHtml}")
    assert rendered.index("${pinnedHtml}") < rendered.index("<h2>Activities</h2>") < rendered.index("feedCards(RECENT,ad,{ownerView:!!mine})")
    assert 'id="profile-edit-dialog"' in profile
    assert 'id="edit-profile-open"' in profile
    assert '<dialog id="profile-edit-dialog" class="profile-edit-dialog">' in rendered
    assert "$('edit-profile-open').onclick=()=>editDialog.showModal();" in profile
    assert "Photo link" not in profile


def test_no_fake_feedback_submission_surface_ships():
    assert 'id="feedback-trigger"' not in INDEX
    assert "strive-feedback-draft" not in INDEX


# Runs the real feed card (site/feed-card.js) on a run that has evidence for all three visuals.
HERO = r"""
const F=require('./site/feed-card.js');
const base={id:'33333333-3333-4333-8333-333333333333',title:'TEST DATA run',visibility:'public',created_at:'2026-10-10T10:00:00Z',
  profiles:{handle:'fixture-owner',display_name:'TEST DATA owner'},shipped:['TEST DATA shipped page'],
  code_route:{v:1,stops:[{id:'a',kind:'check',label:'TEST DATA problem',basis:'measured',project:'p'},{id:'b',kind:'change',label:'TEST DATA change',project:'p'}],
    projects:[{id:'p',label:'TEST DATA project'}],finish:{label:'TEST DATA finish'}}};
const choices=F.heroChoices(base),html=Object.fromEntries(choices);
const marks={proof_route:'class="fc-proof"',change_atlas:'class="fc-atlas"',result:'class="fc-result"'};
const shown=r=>{const card=F.card(r,{});const slot=card.slice(card.indexOf('<div class="fc-route-secondary">'));
  return Object.keys(marks).filter(k=>slot.includes(marks[k]))};
process.stdout.write(JSON.stringify({keys:choices.map(c=>c[0]),distinct:new Set(Object.values(html)).size,
  picks:Object.fromEntries(['proof_route','change_atlas','result','activity_terrain','photo',null].map(k=>[String(k),
    Object.keys(html).find(key=>html[key]===F.heroVisual({...base,hero_visual:k}))])),
  cards:Object.fromEntries(['proof_route','change_atlas','result',null].map(k=>[String(k),shown({...base,hero_visual:k})])),
  onlyResult:F.heroChoices({...base,code_route:null}).map(c=>c[0]),
  typed:F.heroChoices({...base,trace_basis:'typed-by-author'}).length,typedVisual:F.heroVisual({...base,trace_basis:'typed-by-author',hero_visual:'result'}),
  none:F.heroVisual({id:base.id,hero_visual:'result'})}));
"""


def test_one_supported_visual_is_selected_and_persisted():
    feed = (ROOT / "site/feed-card.js").read_text()
    migration = (ROOT / "supabase/strava/016_hero_visual.sql").read_text()
    assert "function heroChoices(r)" in feed
    # 6681e56 (4 Oct 2026) put the author's story first; the one chosen visual now follows it.
    assert '<div class="fc-route-secondary">${checkpoints?"":(page?' in feed and ':heroVisual(r))}</div>' in feed
    seen = node(HERO)
    assert seen["keys"] == ["proof_route", "change_atlas", "result"] and seen["distinct"] == 3
    # The saved preference wins. A preference with no evidence, or none, falls back to the first.
    assert seen["picks"] == {"proof_route": "proof_route", "change_atlas": "change_atlas", "result": "result",
                             "activity_terrain": "proof_route", "photo": "proof_route", "null": "proof_route"}
    # Exactly one visual reaches the card.
    assert seen["cards"] == {"proof_route": ["proof_route"], "change_atlas": ["change_atlas"], "result": ["result"], "null": ["proof_route"]}
    # A choice is offered only when its backing fields exist; a typed-only run offers none.
    assert seen["onlyResult"] == ["result"]
    assert seen["typed"] == 0 and seen["typedVisual"] == "" and seen["none"] == ""
    assert "hero_visual:heroVisual" in INDEX
    save = INDEX[INDEX.index("$('run-save').onclick=async()=>{") :]
    save = save[: save.index("\n")]
    # Oscar, 25 Oct: automatic framing, no options shown. A saved visual is kept; otherwise the suggestion.
    assert "heroVisual=r.hero_visual||suggestedVisual||null" in save
    assert 'name="run-hero-visual"' not in INDEX and "visualPicker" not in INDEX
    assert "sb.from('runs').update({...StriveStory.read(controls),title,project:project||null,hero_visual:heroVisual," in save
    assert "proof_route" in migration and "activity_terrain" in migration
    assert "change_atlas" in migration and "result" in migration
    assert "'photo'" not in migration


def test_typed_only_runs_do_not_pose_as_captured_or_ranked_runs():
    feed = (ROOT / "site/feed-card.js").read_text()
    boards = INDEX[INDEX.index("async function viewBoards()") : INDEX.index("function heatmapSvg")]
    assert 'trace_basis === "typed-by-author"' in feed
    assert "Typed by the author. No capture." in feed
    assert "filter(r=>!typedOnlyRun(r))" in boards
