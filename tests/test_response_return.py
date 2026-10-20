"""The Responses inbox marks only viewed items and opens exact conversations."""
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SOCIAL = (ROOT / "site" / "social.js").read_text()
SOCIAL_CSS = (ROOT / "site" / "social.css").read_text()
PEOPLE = (ROOT / "site" / "people.js").read_text()
PROGRESS = (ROOT / "site" / "progress.js").read_text()


def test_my_runs_does_not_repeat_response_notifications():
    """The account badge and Responses inbox are the one notification surface."""
    history = PROGRESS[PROGRESS.index("async function historyView()") : PROGRESS.index("function snapshot(")]
    assert "grinder_notifications" not in history
    assert "Responses to your work" not in history


def test_inbox_does_not_bulk_mark_all_unread_on_load():
    inbox = SOCIAL[SOCIAL.index("async function inbox()") : SOCIAL.index("async function shareControl(")]
    assert "IntersectionObserver" in inbox
    assert 'data-read="0"' in inbox
    assert ".is(\"read_at\", null)" in SOCIAL or '.is("read_at", null)' in SOCIAL
    # Must not mark every unread row immediately after rendering the list.
    assert "rows.filter((r) => !r.read_at).map((r) => r.id)" not in inbox
    assert "Open exact reply" in inbox
    assert 'filterParam === "all"' in inbox
    assert "This run was deleted or is no longer available." in inbox
    assert "That reply was removed" in inbox


def test_inbox_defaults_to_unread_so_seen_items_do_not_return():
    inbox = SOCIAL[SOCIAL.index("async function inbox()") : SOCIAL.index("async function shareControl(")]
    assert 'const filterParam = new URLSearchParams(location.search).get("filter")' in inbox
    assert 'const filter = filterParam === "all" ? "all" : "unread"' in inbox
    assert 'href="/?inbox&filter=all"' in inbox


def test_exact_reply_navigation_and_return_context():
    # The exact target moved from a ?reply= query to a #reply-<id> hash on the canonical run link
    # (b401e46, clean public run links). Run the real inbox, follow its link, render the real thread.
    assert 'new URLSearchParams(location.search).get("reply")' in SOCIAL  # old links still resolve
    subprocess.run(["node", "-e", r"""
const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const w=new JSDOM('<main id="app"></main>',{url:'https://strive.test/?inbox',runScripts:'outside-only',pretendToBeVisual:true}).window;
for(const f of ['run-links','feed-card','people','social'])w.eval(fs.readFileSync('site/'+f+'.js','utf8'));
w.GrinderContract={message:e=>String(e?.message||e)};
const scrolled=[];w.HTMLElement.prototype.scrollIntoView=function(){scrolled.push(this.id)};
const doc=w.document;doc.addEventListener('click',e=>e.preventDefault());
const ME={id:'00000000-0000-4000-8000-0000000000a1',handle:'ada'};
const RUN='11111111-1111-4111-8111-000000000001',REPLY='22222222-2222-4222-8222-000000000002',OTHER='22222222-2222-4222-8222-000000000009';
const N=n=>'33333333-3333-4333-8333-00000000000'+n;
const actor={handle:'bea',display_name:'TEST DATA Bea'};
const run={id:RUN,visibility:'public',title:'TEST DATA run',profiles:{handle:'ada'}};
const notes=[
 {id:N(1),kind:'reply',run_id:RUN,source_id:REPLY,read_at:null,created_at:'2026-10-10T10:00:00Z',actor},
 {id:N(2),kind:'ack',run_id:RUN,source_id:null,read_at:null,created_at:'2026-10-10T09:00:00Z',actor},
 {id:N(3),kind:'follow',run_id:null,source_id:null,read_at:null,created_at:'2026-10-10T08:00:00Z',actor},
];
const replies=[
 {id:OTHER,run_id:RUN,author_id:'x',body:'TEST DATA other reply',created_at:'2026-10-10T11:00:00Z',author:actor},
 {id:REPLY,run_id:RUN,author_id:'x',body:'TEST DATA exact reply',created_at:'2026-10-10T10:00:00Z',author:actor},
];
const calls=[],read=new Set();
const client={from(table){const c={table,ops:[]};calls.push(c);const q=new Proxy({},{get(_,m){
 if(m==='then')return(res,rej)=>{
  const op=name=>c.ops.find(o=>o[0]===name),eq=col=>c.ops.find(o=>o[0]==='eq'&&o[1]===col);
  let data=[];
  if(table==='grinder_notifications'){
   if(op('update')){data=op('in')[2].map(id=>({id}));data.forEach(r=>read.add(r.id))}
   else data=op('is')?notes.filter(n=>!read.has(n.id)).map(n=>({id:n.id})):notes.map(n=>read.has(n.id)?{...n,read_at:'2026-10-10T10:01:00Z'}:n);
  }
  if(table==='runs')data=op('in')?[run]:[];
  if(table==='grinder_replies')data=op('in')?[{id:REPLY,run_id:RUN}]:eq('id')?replies.filter(r=>r.id===eq('id')[2]):replies;
  return Promise.resolve({data,error:null,count:data.length}).then(res,rej)};
 return(...a)=>{c.ops.push([m,...a]);return q}}});return q}};
doc.body.insertAdjacentHTML('beforeend','<details id="account-menu"><summary></summary></details><a data-responses-link></a>');
const social=w.GrinderSocial({client,me:()=>ME,app:()=>doc.getElementById('app'),frame(){},status(){},renderRuns:async()=>''});
const tick=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
 await social.inbox();
 const actions=[...doc.querySelectorAll('.response-item')].map(a=>[...a.querySelectorAll('.response-item-actions a')].map(x=>[x.textContent,x.getAttribute('href')]));
 const exactHref='/ada/11111111-test-data-run#reply-'+REPLY;
 assert.equal(exactHref,w.StriveLinks.runHref(run)+'#reply-'+REPLY);
 // A reply opens that exact reply; XUDOS and a follow name the person and never guess a reply.
 assert.deepEqual(actions,[
  [['Open profile','/bea'],['Open exact reply',exactHref]],
  [['Open profile','/bea']],
  [['Open profile','/bea'],['Open Following','/?following']],
 ]);
 assert.equal(doc.querySelector('[data-responses-link]').textContent,'Responses · 3 unread');
 // Leaving through the link stores the way back and marks only that one notification read.
 assert.equal(w.sessionStorage.getItem('ag_response_return'),null);
 const before=calls.length;
 [...doc.querySelectorAll('a[data-notification-id]')].find(a=>a.textContent==='Open exact reply').click();await tick();
 assert.equal(w.sessionStorage.getItem('ag_response_return'),'?inbox');
 const writes=calls.slice(before).filter(c=>c.ops.some(o=>o[0]==='update'));
 assert.equal(writes.length,1);
 assert.equal(JSON.stringify(writes[0].ops.slice(1)),JSON.stringify([['in','id',[N(1)]],['eq','recipient_id',ME.id],['is','read_at',null],['select','id']]));
 assert.equal(doc.querySelector('[data-responses-link]').textContent,'Responses · 2 unread');  // refreshUnread ran
 assert.equal(doc.querySelector('#account-menu > summary').dataset.unread,'true');
 // The default inbox is unread-only. Once the write is confirmed, the seen item does not return.
 w.history.replaceState(null,'','/?inbox');await social.inbox();
 assert.deepEqual([...doc.querySelectorAll('.response-item')].map(a=>a.dataset.notificationId),[N(2),N(3)]);
 w.sessionStorage.setItem('ag_response_return','?inbox');
 // Arriving on the run: the named reply, and only it, is the target, with the way back above it.
 const arrive=async url=>{w.history.replaceState(null,'',url);const slot=doc.createElement('section');doc.body.append(slot);await social.thread(RUN,slot,{});await tick();return slot};
 let slot=await arrive(exactHref);
 assert.deepEqual([...slot.querySelectorAll('article.reply')].map(a=>[a.id,a.classList.contains('reply-target')]),[['reply-'+OTHER,false],['reply-'+REPLY,true]]);
 assert.equal(scrolled.at(-1),'reply-'+REPLY);
 const back=slot.querySelector('.response-return a');
 assert.equal(back.textContent,'Back to Notifications');assert.equal(back.getAttribute('href'),'/?inbox');
 assert.equal(slot.querySelector('.reply-missing'),null);
 // A legacy ?reply= link resolves to the same reply; a malformed hash targets nothing.
 slot=await arrive('/?run='+RUN+'&reply='+REPLY);
 assert.deepEqual([...slot.querySelectorAll('.reply-target')].map(a=>a.id),['reply-'+REPLY]);
 slot=await arrive('/?run='+RUN+'#reply-not-a-reply-id');
 assert.equal(slot.querySelectorAll('.reply-target').length,0);assert.equal(slot.querySelector('.reply-missing'),null);
 // A reply that no longer exists says so and still offers the way back.
 slot=await arrive('/?run='+RUN+'#reply-22222222-2222-4222-8222-0000000000ff');
 assert.equal(slot.querySelectorAll('.reply-target').length,0);
 assert.match(slot.querySelector('.reply-missing').textContent,/That reply was removed or is not visible to you/);
 assert.equal(slot.querySelector('.reply-missing .response-return a').getAttribute('href'),'/?inbox');
 // Opening the inbox again clears the stored return, so later run pages show no stale link back.
 w.history.replaceState(null,'','/?inbox');await social.inbox();
 assert.equal(w.sessionStorage.getItem('ag_response_return'),null);
 slot=await arrive('/?run='+RUN);
 assert.equal(slot.querySelector('.response-return'),null);
})().catch(e=>{console.error(e);process.exitCode=1});
"""], cwd=ROOT, check=True)
    # The builder's profile keeps the same way back for a reader who arrived from Notifications.
    assert '<p class="response-return"><a class="act" href="/?inbox">Back to Notifications</a></p>' in PEOPLE


def test_response_inbox_phone_styles_use_blue_unread_trace():
    assert ".response-item.unread" in SOCIAL_CSS
    assert "border-left:3px solid var(--blue)" in SOCIAL_CSS
    assert ".response-filters" in SOCIAL_CSS
    assert "min-height:44px" in SOCIAL_CSS


def test_r2_01_deep_link_resolves_reply_by_id_before_missing_copy():
    """R2-01: page-1 miss is not deletion; lookup by id, then page until focused."""
    thread = SOCIAL[SOCIAL.index("async function thread(") : SOCIAL.index("async function inbox(")]
    assert '.eq("id", focusReply)' in thread or ".eq('id', focusReply)" in thread
    assert "focusKnownMissing" in thread
    assert "while (focusReply && !focusKnownMissing && !sawFocus && pages < 12)" in thread


def test_r2_02_unread_mark_requires_confirmed_rows_and_resets_owner():
    """R2-02: 0-row updates must not poison unreadMarked; owner change clears the set."""
    mark = SOCIAL[SOCIAL.index("async function markNotificationsRead(") : SOCIAL.index("async function refreshUnread(")]
    assert '.select("id")' in mark or ".select('id')" in mark
    assert "confirmed" in mark
    assert "unreadMarked.delete" in mark
    assert "resetUnreadMarks" in SOCIAL
    assert "inboxObserver.disconnect" in SOCIAL
