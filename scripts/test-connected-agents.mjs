// Exercise the shipped header and connection page, with server effects replaced, never the grant rule.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const html=fs.readFileSync('site/index.html','utf8');
const anchor=html.match(/<a class="global-connect"[^>]*>[\s\S]*?<\/a>/)[0];assert.match(anchor,/data-auth="1"/,'real header carries auth visibility contract');
const dom=new JSDOM(anchor+'<section id="connect-connections"></section>',{url:'https://striverun.app/'});
const now=Date.now(),date=offset=>new Date(now+offset).toISOString(),day=86400000;
let rows=[{id:'live',label:'Claude Code laptop',token_prefix:'test1234',created_at:date(-day),expires_at:date(day)},
 {id:'expired',label:'Cursor old',expires_at:date(-1)}, {id:'revoked',label:'Codex old',revoked:true,expires_at:date(day)}];
let pending=null,fail=false;
const db={rpc:async()=>{if(pending)return pending;return {data:rows,error:fail?Error('TEST DATA read failed'):null}},from:()=>({select:()=>({eq:()=>({not:()=>({order:()=>({limit:async()=>({data:[]})})})})})})};
const ctx={document:dom.window.document,console,ME:{id:'owner-a'},AUTH_GENERATION:0,sb:db,$:id=>dom.window.document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),menuLinks:()=>''};
let clock=now,scheduled;ctx.Date=class extends Date{static now(){return clock}};ctx.setTimeout=(fn,ms)=>{scheduled={fn,ms};return 1};ctx.clearTimeout=()=>{};
ctx.window=ctx;vm.createContext(ctx);
for(const f of ['agent-names','connections'])if(fs.existsSync('site/'+f+'.js'))vm.runInContext(fs.readFileSync('site/'+f+'.js','utf8'),ctx);
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
vm.runInContext(slice(html.includes('let CONNECTION_NAV_REQUEST=')?'let CONNECTION_NAV_REQUEST=':'function syncAuthNav(){','function feedTabs(')+slice('async function loadConnections(){','async function viewConnect(){'),ctx);
vm.runInContext(slice('function invalidatePrivateView(){','function handleAuthStateChange('),ctx);ctx.RUN_VIEW_GENERATION=0;ctx.StriveRunPhotos={disposeAll(){}};
ctx.syncAuthNav();await new Promise(r=>setImmediate(r));
const nav=dom.window.document.querySelector('.global-connect');
assert.equal(nav.querySelectorAll('[data-connected-agent]').length,1,'active Claude key replaces Connect agent with a logo; expired/revoked keys never count');
assert.match(nav.getAttribute('aria-label'),/Claude Code/);
assert.match(nav.getAttribute('title'),/active upload key/i);
await ctx.loadConnections();
const box=ctx.$('connect-connections');
assert.equal(box.querySelectorAll('.connection-card[data-active="true"]').length,1);
assert.equal(box.querySelectorAll('details.connection-ended .connection-card').length,2);
assert.equal(box.querySelector('details.connection-ended').open,false,'ended grants collapse by default');
assert.match(box.textContent,/Last upload.*not recorded per key/i,'do not assign an unrelated account upload to this key');
assert.equal(box.querySelector('progress')?.max,100);
assert.match(box.textContent,/test1234/,'same-name keys remain distinguishable');
const management=ctx.StriveConnections.cards(rows,{revoke:true});assert.match(management,/aria-label="Revoke Claude Code laptop/);
// The header loses its check at expiry without needing a navigation.
clock=now+day+1;await scheduled.fn();await new Promise(r=>setImmediate(r));assert.equal(nav.querySelectorAll('[data-connected-agent]').length,0,'expiry timer clears a live badge');clock=now;
// A failed read cannot retain a verified badge or say no keys exist.
fail=true;ctx.refreshConnectedNav(true);await new Promise(r=>setImmediate(r));
assert.equal(nav.querySelectorAll('[data-connected-agent]').length,0);await ctx.loadConnections();assert.match(box.textContent,/could not load/);assert.doesNotMatch(box.textContent,/No active upload key/);fail=false;
// Switching account while a private read is pending must discard its response.
ctx.refreshConnectedNav(true);await new Promise(r=>setImmediate(r));
let finish;pending=new Promise(r=>finish=r);ctx.refreshConnectedNav(true);assert.equal(nav.querySelectorAll('[data-connected-agent]').length,1,'same owner retains valid badges during a pending refresh');ctx.invalidatePrivateView();ctx.ME={id:'owner-b'};finish({data:rows});await new Promise(r=>setImmediate(r));assert.equal(nav.querySelectorAll('[data-connected-agent]').length,0);pending=null;
rows=[{id:'bad',label:'Codex',expires_at:'not-a-date'},{id:'edge',label:'Cursor',expires_at:new Date(now).toISOString()}];ctx.refreshConnectedNav(true);await new Promise(r=>setImmediate(r));assert.equal(nav.querySelectorAll('[data-connected-agent]').length,0,'bad dates and expiry boundary never grant badges');
rows=[{id:'grok',label:'Grok Bot',expires_at:date(day)}];ctx.refreshConnectedNav(true);await new Promise(r=>setImmediate(r));assert.equal(nav.querySelectorAll('[data-connected-agent="Grok"] svg path').length,1);
rows=[{id:'unknown',label:'<img src=x onerror=alert(1)>',expires_at:date(day)}];ctx.refreshConnectedNav(true);await new Promise(r=>setImmediate(r));await ctx.loadConnections();assert.equal(nav.querySelectorAll('[data-connected-agent]').length,1);assert.equal(box.querySelectorAll('img[src="x"]').length,0,'owner labels stay escaped');assert.doesNotMatch(nav.getAttribute('aria-label'),/Claude|Codex|Cursor|Grok/,'an unknown label never fabricates a known agent');
vm.runInContext(slice('function invalidatePrivateView(){','function handleAuthStateChange('),ctx);
ctx.RUN_VIEW_GENERATION=0;ctx.StriveRunPhotos={disposeAll(){}};
nav.classList.add('connection-unavailable');ctx.invalidatePrivateView();assert.equal(nav.classList.contains('connection-unavailable'),false);assert.equal(nav.hidden,true,'auth invalidation hides badges synchronously, before refresh');assert.equal(nav.querySelectorAll('[data-connected-agent]').length,0);
ctx.syncAuthNav();assert.equal(nav.hidden,true);assert.equal(nav.querySelectorAll('[data-connected-agent]').length,0,'sign-out clears private identity');
console.log('connected header/page: active, expired, revoked, failed, unknown, malicious, auth race PASS');
