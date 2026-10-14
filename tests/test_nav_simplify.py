"""Primary navigation exposes only the complete social run loop."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
NAV_CSS = (ROOT / "site" / "navigation.css").read_text()


def node(script):
    """Run a script against the real page and modules and return its JSON result."""
    done = subprocess.run(["node", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(done.stdout)


# Loads the real page shell, the real navigation module and the page's own frame/menu functions.
SHELL = r"""
const fs=require('fs'),{JSDOM}=require('jsdom');
const s=fs.readFileSync('site/index.html','utf8');
const cut=(a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const w=new JSDOM(s,{url:'https://strive.test/',runScripts:'outside-only'}).window,d=w.document;
w.eval(fs.readFileSync('site/navigation.js','utf8'));w.eval(fs.readFileSync('site/run-links.js','utf8'));
w.eval('var ME=null,AUTH_USER=null;const esc=v=>String(v);const signInLabel=()=>"Sign in with GitHub or email";const profileHandle=p=>p.handle;'+
  cut('const $=id=>','function projectStats(')+cut('function railHtml(){','const REAL_RUN=')+cut('function menuLinks(kind){','function feedTabs()'));
const nav=d.getElementById('product-nav'),text=el=>el.textContent.replace(/\s+/g,' ').trim();
const links=()=>[...nav.querySelectorAll('a,button')].map(a=>({label:text(a),href:a.getAttribute('href'),page:a.dataset.navPage,
  current:a.getAttribute('aria-current'),gated:a.hidden||a.hasAttribute('data-auth')||a.hasAttribute('data-sheet')||!!a.closest('[hidden],[data-auth]')}));
const menu=()=>[...d.querySelectorAll('[data-you-links] [role=menuitem]')].map(a=>({tag:a.tagName,label:text(a),href:a.getAttribute('href'),
  signin:a.hasAttribute('data-signin'),signout:a.hasAttribute('data-signout'),responses:a.hasAttribute('data-responses-link')}));
const at=path=>{w.history.replaceState(null,'',path);w.StriveNavigation.sync();return links().filter(l=>l.current==='page').map(l=>l.page)};
const out={primaries:d.querySelectorAll('nav[aria-label="Primary"]').length,navs:d.querySelectorAll('.bar nav, body > nav').length,
  details:nav.querySelectorAll('details').length,navText:text(nav),rail:w.eval('railHtml("feed",[])'),
  oldMobile:!!d.getElementById('mobile-product-nav'),oldDrawer:d.querySelectorAll('#notifications-drawer,#notifications-toggle').length};
w.eval('frame(railHtml("feed"),null,true);syncAuthNav()');
out.signedOut={links:links(),shell:d.getElementById('shell').className,railBox:d.getElementById('rail').innerHTML,menu:menu(),
  add:[...d.querySelectorAll('.bar .right a.global-add')].map(a=>({href:a.getAttribute('href'),gated:a.hidden||a.hasAttribute('data-auth')||!!a.closest('[hidden],[data-auth]')}))};
out.current={'/':at('/'),'/?post':at('/?post'),'/?following':at('/?following'),'/?mine':at('/?mine'),'/?inbox':at('/?inbox'),'/?account':at('/?account')};
w.eval('ME={id:"fixture-owner",handle:"Fixture-Owner"};AUTH_USER={id:"fixture-auth"};syncAuthNav()');
out.signedIn={links:links(),menu:menu(),profile:w.StriveLinks.profileHref('Fixture-Owner')};
w.eval('ME=null;syncAuthNav()');out.identityPending={menu:menu()};
process.stdout.write(JSON.stringify(out));
"""


def test_primary_nav_has_the_product_loop():
    """One primary menu: the feed and Add run. Own runs and profile sit behind the avatar."""
    # a321b1b (9 Oct 2026) simplified the menu to direct destinations: My runs and the Discover
    # dropdown left it, and Add run joined it. d233531 had already replaced the rail with one menu.
    seen = node(SHELL)
    assert seen["primaries"] == 1 and seen["navs"] == 1
    assert [(l["label"], l["href"], l["page"]) for l in seen["signedOut"]["links"]] == [("Feed", "/", "feed"), ("Review queue", "/?queue", "queue"), ("Add run", "/?post", "post")]
    same = lambda who: [(l["label"], l["href"], l["gated"]) for l in seen[who]["links"]]
    assert same("signedIn") == same("signedOut") == [("Feed", "/", False), ("Review queue", "/?queue", False), ("Add run", "/?post", False)]
    assert seen["rail"] == "" and seen["signedOut"]["railBox"] == ""  # the rail is a compatibility hook only
    assert seen["details"] == 0
    for gone in ("Projects", "More", "Responses", "Privacy", "Discover", "My runs"):
        assert gone not in seen["navText"]
    assert 'class="rail-post"' not in INDEX
    # Each primary destination marks itself; a page outside the menu marks nothing.
    assert seen["current"] == {"/": ["feed"], "/?post": ["post"], "/?following": ["feed"], "/?mine": [], "/?inbox": [], "/?account": []}
    # My runs left the menu in a321b1b. The avatar menu opens the owner's profile.
    assert seen["signedIn"]["menu"][0] == {"tag": "A", "label": "Profile", "href": "/fixture-owner", "signin": False, "signout": False, "responses": False}
    retired = INDEX[INDEX.index("const RETIRED="):]
    retired = retired[: retired.index("\n")]
    for key in ("community", "forum", "challenges", "practices", "experiments", "rigs", "progress", "claim", "pitch"):
        assert f"'{key}'" in retired


def test_mobile_nav_is_four_or_fewer_destinations():
    """Phone uses the same menu as desktop; on a phone Add run moves into it from the header."""
    seen = node(SHELL)
    # d233531 (8 Oct 2026) removed the separate phone menu. The one menu becomes the bottom bar.
    assert seen["oldMobile"] is False and seen["primaries"] == 1
    labels = [l["label"] for l in seen["signedOut"]["links"]]
    assert labels == ["Feed", "Review queue", "Add run"]
    assert len(labels) <= 4
    assert all(not l["gated"] for l in seen["signedOut"]["links"])
    wide, phone = NAV_CSS.split("@media(max-width:800px){", 1)
    assert ".bar .product-nav{position:fixed;z-index:100;bottom:0;left:0;right:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));" in phone
    # One Add run per screen size: the header pill when wide, the menu item on a phone.
    assert ".product-nav-add{display:none}" in wide
    assert " .product-nav-add{display:flex}.global-add{display:none!important}" in phone
    assert "data-sheet" not in INDEX[INDEX.index('<nav id="product-nav"'):INDEX.index("</nav>", INDEX.index('<nav id="product-nav"'))]
    for gone in ("Progress", "Practices", "Challenges"):
        assert gone not in seen["navText"]


def test_account_links_are_reachable_from_the_avatar():
    """The avatar menu owns identity, settings and responses, never the product destinations."""
    seen = node(SHELL)
    # Rendered by the real menuLinks(). The profile address comes from StriveLinks.profileHref,
    # so the old literal "/?u=" is now the clean /handle path. Responses joined this menu in a321b1b.
    assert seen["signedIn"]["profile"] == "/fixture-owner"
    signed_in = seen["signedIn"]["menu"]
    assert [(m["label"], m["href"]) for m in signed_in] == [
        ("Profile", "/fixture-owner"),
        ("Responses", "/?inbox"),
        ("Settings", "/?account"),
        ("Connect your agent", "/?connect"),
        ("Recover older runs", "/?history-import"),
        ("Sign out", None),
    ]
    assert signed_in[-1]["tag"] == "BUTTON" and signed_in[-1]["signout"] is True
    hrefs = [m["href"] for m in signed_in]
    assert "/?mine" not in hrefs and "/" not in hrefs and "/?post" not in hrefs
    assert "Connections" not in [m["label"] for m in signed_in]
    signed_out = seen["signedOut"]["menu"]
    assert [(m["label"], m["href"], m["signin"]) for m in signed_out] == [
        ("Connect your agent", "/?connect", False),
        ("Sign in with GitHub or email", None, True),
    ]
    # Signed in to the provider but with no profile yet: no profile links, and a way out.
    assert [(m["label"], m["signout"]) for m in seen["identityPending"]["menu"]] == [
        ("Connect your agent", False), ("Recover older runs", False), ("Sign out", True)]


def test_signed_out_feed_keeps_the_desktop_and_phone_navigation():
    """Run the actual frame and menu with no profile; Feed never collapses to a landing-only shell."""
    seen = node(SHELL)
    out = seen["signedOut"]
    assert len(out["links"]) == 3
    assert [l["label"] for l in out["links"]] == ["Feed", "Review queue", "Add run"]
    assert all(not l["gated"] for l in out["links"])
    assert out["add"] == [{"href": "/?post", "gated": False}]
    # The home frame keeps the shared menu and marks Feed as the current page.
    assert out["shell"] == "shell norail noside wide"
    assert [l["current"] for l in out["links"]] == ["page", None]
    view = INDEX[INDEX.index("async function viewLanding()") : INDEX.index("async function mountCoachExperiment(")]
    assert "frame(null,null,true);" in view and "setPrimarySection('feed');" in view
    menu = INDEX[INDEX.index('<nav id="product-nav"'):INDEX.index("</nav>", INDEX.index('<nav id="product-nav"'))]
    assert "data-auth" not in menu and " hidden" not in menu


def test_posting_defaults_private_and_names_each_audience():
    preview = INDEX[INDEX.index("async function importRun(){"):INDEX.index("async function viewShareRun(")]
    assert '<option value="private" selected>Only me</option>' in preview
    assert '<option value="close_friends">Close friends</option>' in preview
    assert '<option value="public">Public feed and profile</option>' in preview
    assert "stays private unless you choose another audience and save" in preview


def test_account_menu_keyboard_dismiss_wired():
    assert "Escape" in INDEX
    assert "account-menu" in INDEX


# Runs the real social module against a recording client that only ever returns the viewer's rows.
RESPONSES = r"""
const fs=require('fs'),{JSDOM}=require('jsdom');
const s=fs.readFileSync('site/index.html','utf8');
const w=new JSDOM(s,{url:'https://strive.test/?inbox',runScripts:'outside-only'}).window,d=w.document;
w.eval(fs.readFileSync('site/run-links.js','utf8'));w.eval(fs.readFileSync('site/social.js','utf8'));
const log=[],actor={handle:'fixture-actor',display_name:'TEST DATA actor'};
const rows=[{id:'n1',kind:'reply',run_id:'11111111-1111-4111-8111-111111111111',source_id:'22222222-2222-4222-8222-222222222222',read_at:null,created_at:'2026-10-10T10:00:00Z',actor},
  {id:'n2',kind:'follow',read_at:'2026-10-10T11:00:00Z',created_at:'2026-10-10T09:00:00Z',actor}];
let unread=rows.filter(r=>!r.read_at);
const db={from(table){const q={table,calls:[]};log.push(q);const chain=new Proxy({},{get:(_,name)=>name==='then'
  ?(ok,bad)=>Promise.resolve({data:table!=='grinder_notifications'?[]:q.calls.some(c=>c[0]==='is')?unread:rows,error:null}).then(ok,bad)
  :(...a)=>{q.calls.push([name,...a]);return chain}});return chain}};
let viewer={id:'fixture-viewer'};
const social=w.GrinderSocial({client:db,me:()=>viewer,app:()=>d.getElementById('app'),frame(){},railHtml:()=>'',feedTabs:()=>'',setPrimarySection(){},status(){},signInGitHub(){}});
const trigger=d.querySelector('#account-menu > summary');
d.querySelector('[data-you-links]').innerHTML='<a href="/?inbox" role="menuitem" data-responses-link>Responses</a>';
const link=d.querySelector('[data-responses-link]'),badge=()=>({link:link.textContent,dot:trigger.dataset.unread,label:trigger.getAttribute('aria-label')});
(async()=>{
  const out={count:await social.refreshUnread()};out.unread=badge();
  unread=[];out.cleared=await social.refreshUnread();out.read=badge();
  viewer=null;const before=log.length;out.signedOutCount=await social.refreshUnread();out.signedOut=badge();out.signedOutReads=log.length-before;
  out.notificationReads=log.filter(q=>q.table==='grinder_notifications').map(q=>q.calls);
  out.tables=[...new Set(log.map(q=>q.table))];
  process.stdout.write(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1});
"""


def test_responses_are_a_profile_menu_item_not_primary_navigation():
    """Was test_responses_are_a_notification_drawer_not_navigation. eb4023e (11 Oct 2026, "Unify
    response access under the profile menu") removed the header bell and its drawer. Responses
    are still not a primary destination: they are one avatar-menu item that carries the unread count."""
    shell = node(SHELL)
    assert shell["oldDrawer"] == 0
    assert "Responses" not in shell["navText"]
    responses = [m for m in shell["signedIn"]["menu"] if m["responses"]]
    assert responses == [{"tag": "A", "label": "Responses", "href": "/?inbox", "signin": False, "signout": False, "responses": True}]
    assert not [m for m in shell["signedOut"]["menu"] if m["responses"] or m["href"] == "/?inbox"]
    assert "if(q.has('inbox')){setPrimarySection('inbox');return social.inbox();}" in INDEX
    assert "if(ME && social.refreshUnread) social.refreshUnread();" in INDEX
    # The real unread count, written onto the menu item and the avatar by site/social.js.
    seen = node(RESPONSES)
    assert seen["count"] == 1
    assert seen["unread"] == {"link": "Responses · 1 unread", "dot": "true", "label": "Profile and settings, 1 unread response"}
    assert seen["cleared"] == 0
    assert seen["read"] == {"link": "Responses", "dot": "false", "label": "Profile and settings"}
    # Signed out: nothing is read and nothing is claimed.
    assert seen["signedOutCount"] == 0 and seen["signedOutReads"] == 0
    assert seen["signedOut"] == {"link": "Responses", "dot": "false", "label": "Profile and settings"}
    assert seen["tables"] == ["grinder_notifications"]
    assert seen["notificationReads"] == [[["select", "id"], ["eq", "recipient_id", "fixture-viewer"], ["is", "read_at", None], ["limit", 50]]] * 2
    assert '.profile-trigger[data-unread="true"]::after{' in INDEX
