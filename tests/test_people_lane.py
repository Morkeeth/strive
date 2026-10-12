"""Friends / people lane contracts — presentation, empty states, no invented ownership."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PEOPLE = (ROOT / "site" / "people.js").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
CSS = (ROOT / "site" / "people.css").read_text()
MIGRATION = (ROOT / "supabase" / "migrations" / "2026-09-14-people.sql").read_text()
ORDER = (ROOT / "scripts" / "migration-order.txt").read_text()


def test_presentation_adapter_exposes_future_and_legacy_fields():
    assert "display_name" in PEOPLE
    assert "avatar_url" in PEOPLE
    assert "github_handle" in PEOPLE
    assert "profile.handle" in PEOPLE or "profile.handle ===" in PEOPLE
    assert "GrinderPeople.present" in PEOPLE
    assert "never invents ownership" in PEOPLE.lower() or "does not create" in PEOPLE


def test_people_module_owns_lookup_and_shareable_profile():
    assert "grinder_find_people" in PEOPLE
    assert "grinder_recent_builders" in PEOPLE
    assert "Find people" in PEOPLE
    assert "Search by STRIVE username" in PEOPLE
    assert "Find friends on GitHub" in PEOPLE
    assert 'fetch("/api/github-friends"' in PEOPLE
    assert "Authorization: `Bearer ${token}`" in PEOPLE
    # b803b86 dropped the "never follows anyone automatically. X friend matching is unavailable."
    # sentence for "You choose whom to follow." Run the real page and prove the boundary instead.
    subprocess.run(["node", "-e", r"""
const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const w=new JSDOM('<main id="app"></main>',{url:'https://strive.test/?people',runScripts:'outside-only'}).window;
for(const f of ['run-links','auth','people'])w.eval(fs.readFileSync('site/'+f+'.js','utf8'));
const doc=w.document,OWNER='00000000-0000-4000-8000-0000000000a1';
const friends=[{id:'00000000-0000-4000-8000-0000000000b2',handle:'bea',display_name:'TEST DATA Bea'},{id:'00000000-0000-4000-8000-0000000000c3',handle:'cy',display_name:'TEST DATA Cy'}];
const tick=()=>new Promise(r=>setTimeout(r,30));
async function page({me,token='TEST-DATA-token',payload={scope:'public_github_following',people:friends,scanned:7,truncated:false}}){
 doc.getElementById('app').innerHTML='';
 const db=[],fetches=[],offered=[];
 const client={auth:{getSession:async()=>({data:{session:token?{access_token:token}:null},error:null})},
  rpc(name,args){db.push(['rpc',name,JSON.stringify(args)]);return Promise.resolve({data:[],error:null})},
  from(table){let id=null;const q=new Proxy({},{get(_,m){
   if(m==='then')return(res,rej)=>Promise.resolve({data:table==='profiles'?friends.filter(f=>f.id===id):[],error:null}).then(res,rej);
   return(...a)=>{db.push([table,m]);if(m==='eq'&&a[0]==='id')id=a[1];return q}}});return q}};
 w.fetch=async(url,options)=>{fetches.push([url,JSON.stringify(options)]);return{ok:true,json:async()=>payload}};
 const people=w.GrinderPeople({client,me:()=>me,app:()=>doc.getElementById('app'),frame(){},status(){},
  social:{followControl:async(person,slot)=>{offered.push(person.handle);slot.innerHTML='<button class="probe-follow">Follow</button>'}}});
 await people.discover('');
 return{db,fetches,offered};
}
const writes=db=>db.filter(([table,method])=>['insert','upsert','update','delete'].includes(method)||table==='rpc'&&!/^grinder_(find_people|recent_builders)$/.test(method));
(async()=>{
 // Signed in with a linked GitHub account: nothing is looked up on GitHub until the button is pressed.
 let got=await page({me:{id:OWNER,handle:'ada',github_handle:'ada-gh'}});
 assert.equal(doc.querySelector('.head h2').textContent,'Find people');
 assert.equal(doc.querySelector('.people-search-panel summary').textContent,'Search by STRIVE username');
 assert.equal(doc.querySelector('.people-networks p').textContent,'Check for verified STRIVE accounts among your GitHub connections. You choose whom to follow.');
 assert.equal(got.fetches.length,0);
 assert.equal(got.db.filter(c=>c[0]==='rpc').map(c=>c[1]).join(),'grinder_recent_builders');
 const button=doc.getElementById('people-github-friends');
 assert.equal(button.textContent,'Find friends on GitHub');
 button.click();await tick();
 // The lookup is authenticated with this session's token and reads; it never writes a follow.
 assert.deepEqual(got.fetches,[['/api/github-friends',JSON.stringify({headers:{Authorization:'Bearer TEST-DATA-token'}})]]);
 const cards=[...doc.querySelectorAll('#people-network-result .people-card, #people-network-result article')];
 assert.equal(doc.querySelector('#people-network-result .head .meta').textContent,'2');
 assert.deepEqual(got.offered,['bea','cy']);  // each match gets a follow control to press
 assert.equal(doc.querySelectorAll('#people-network-result .probe-follow').length,2);
 assert.deepEqual(writes(got.db),[]);
 assert.equal(got.db.filter(c=>c[0]==='grinder_follows').every(c=>['select','eq','order','limit'].includes(c[1])),true);
 assert.ok(cards.length>=2);
 // X friend matching is not offered at all, so nothing needs to call it unavailable.
 assert.equal([...doc.querySelectorAll('button,a')].some(el=>/\bX\b|twitter/i.test(el.textContent)),false);
 // An unexpected scope from the endpoint is refused, not rendered as friends.
 got=await page({me:{id:OWNER,handle:'ada',github_handle:'ada-gh'},payload:{scope:'everyone',people:friends}});
 doc.getElementById('people-github-friends').click();await tick();
 assert.match(doc.getElementById('people-network-result').textContent,/GitHub friends could not load/);
 assert.deepEqual(got.offered,[]);assert.deepEqual(writes(got.db),[]);
 // No session token: no request leaves the page.
 got=await page({me:{id:OWNER,handle:'ada',github_handle:'ada-gh'},token:null});
 doc.getElementById('people-github-friends').click();await tick();
 assert.equal(got.fetches.length,0);
 assert.match(doc.getElementById('people-network-result').textContent,/Sign in again to check GitHub\./);
 // No linked GitHub account, and signed out: there is no lookup button to press.
 got=await page({me:{id:OWNER,handle:'ada'}});
 assert.equal(doc.getElementById('people-github-friends'),null);
 assert.equal(doc.querySelector('.people-networks .cta a').textContent,'Link GitHub to find friends');
 got=await page({me:null});
 assert.equal(doc.getElementById('people-github-friends'),null);
 assert.equal(doc.getElementById('people-network-signin').textContent,'Sign in to find friends');
 assert.equal(got.fetches.length,0);assert.deepEqual(writes(got.db),[]);
})().catch(e=>{console.error(e);process.exitCode=1});
"""], cwd=ROOT, check=True)
    assert "window.GrinderPeople" in PEOPLE
    assert "async function discover" in PEOPLE
    assert "async function profile" in PEOPLE
    exported = PEOPLE.rsplit("return {", 1)[1]
    assert "discover" in exported and "profile" in exported and "present" in exported


def test_recent_builder_failure_is_not_reported_as_no_public_runs():
    assert "recent = null" in PEOPLE
    assert "Suggested people could not load" in PEOPLE
    assert "No other builders with public runs yet" in PEOPLE


def test_github_friend_matching_has_distinct_states_and_never_auto_follows():
    assert "Checking GitHub" in PEOPLE
    assert "No matching public GitHub connections" in PEOPLE
    assert "GitHub friends could not load" in PEOPLE
    assert "payload?.truncated === true" in PEOPLE
    assert "payload?.scanned" in PEOPLE
    assert 'payload?.scope !== "public_github_following"' in PEOPLE
    github_block = PEOPLE[PEOPLE.index("async function loadGithubFriends"):PEOPLE.index("async function load(query)")]
    assert '.from("grinder_follows").insert' not in github_block


def test_following_empty_states_point_to_people():
    assert "/?people" in SOCIAL
    assert "Find people" in SOCIAL
    assert "nobody is imported or followed automatically" in SOCIAL
    assert "nobody is imported or followed automatically" in SOCIAL
    assert "none has a public run yet" in SOCIAL


def test_follow_control_blocks_self_and_supports_signed_out():
    assert "This is you" in SOCIAL
    assert "Sign in with GitHub" in SOCIAL
    assert "aria-pressed" in SOCIAL


def test_response_return_links_cover_profile_run_thread():
    assert "Open profile" in SOCIAL
    assert "#grind-thread" in SOCIAL
    assert "Open Following" in SOCIAL


def test_sql_is_strava_namespaced_via_order_and_search_only():
    assert "2026-09-14-people.sql" in ORDER
    assert "grinder_find_people" in MIGRATION
    assert "grinder_recent_builders" in MIGRATION
    assert "grinder_blocked_pair" in MIGRATION
    assert "create table" not in MIGRATION.lower() or "create table if not exists public.profiles" not in MIGRATION
    # Identity columns belong to Claude's lane — comment may name them; SQL must not add them.
    assert "add column" not in MIGRATION.lower()
    assert "alter table" not in MIGRATION.lower()
    assert MIGRATION.count("display_name") <= 1  # comment only
    assert "avatar_url" in MIGRATION  # named in comment
    assert "github_handle" in MIGRATION and "p.github_handle" in MIGRATION
    assert "p.display_name" not in MIGRATION
    assert "p.avatar_url" not in MIGRATION


def test_people_css_keeps_white_cards_and_touch_targets():
    assert "var(--box)" in CSS
    assert "min-height:44px" in CSS
    assert "@media(max-width:600px)" in CSS
