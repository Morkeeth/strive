import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {bootDisposable,seedJourneyActors,startDisposableServer,RILEY} from './disposable-supabase.mjs';

// The real home page against a disposable database: the feed renders 20 cards, reads XUDOS for
// those cards only, loads the rest on request, and never queries the hidden Clubs or Events.
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)('jsdom');
const ROOT=fileURLToPath(new URL('..',import.meta.url)),SITE=join(ROOT,'site');
const {db}=await bootDisposable();
await seedJourneyActors(db);
await db.exec('reset role');
for(let i=0;i<25;i++){
 const {rows}=await db.query(`insert into runs(profile_id,title,project,harness,visibility,schema_version,measurement_revision,trace_basis,rhythm,started_at,tool_calls)
  values($1,$2,'test-project','Codex','private',1,$3,'elapsed','[1,2,1]'::jsonb,now()-($4||' hours')::interval,7) returning id`,[RILEY,'TEST DATA run '+(i+1),String(i).padStart(64,'d'),String(i+1)]);
 await db.query(`update runs set visibility='public' where id=$1`,[rows[0].id]);
}
const {server:api,url:apiUrl}=await startDisposableServer(db);
const requests=[];api.prependListener('request',req=>requests.push(decodeURIComponent(req.url)));
const index=(await readFile(join(SITE,'index.html'),'utf8')).replace('const SB_URL="http://127.0.0.1:54321";',`const SB_URL="${apiUrl}";`)
 .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"[^>]*><\/script>/,'<script src="/supabase.js"></script>');
assert.ok(index.includes(apiUrl)&&index.includes('<script src="/supabase.js">'));
const site=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://x').pathname;
 const file=path==='/'?null:path==='/supabase.js'?join(ROOT,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'):join(SITE,path);
 if(file&&!existsSync(file)){res.statusCode=404;return res.end('')}
 res.setHeader('Content-Type',file?({'.js':'text/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'):'text/html');
 res.end(file?await readFile(file):index);
});
await new Promise(ok=>site.listen(0,'127.0.0.1',ok));
const virtualConsole=new VirtualConsole();
const dom=await JSDOM.fromURL(`http://127.0.0.1:${site.address().port}/`,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole,
 beforeParse(w){
  w.fetch=(input,init)=>fetch(typeof input==='string'?input:input.url,init);w.Headers=Headers;w.Request=Request;w.Response=Response;
  Object.defineProperty(w,'crypto',{value:globalThis.crypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.ResizeObserver=w.IntersectionObserver;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});w.scrollTo=()=>{};
 }});
const {window}=dom,cards=()=>window.document.querySelectorAll('#landing-feature-body article.activity-post').length;
const until=async(test,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(test())return true;await new Promise(r=>setTimeout(r,100))}return false};
assert.ok(await until(()=>cards()>=20),'the first page renders');
await new Promise(r=>setTimeout(r,500));
assert.equal(cards(),20,'one page of 20 cards');
const button=window.document.getElementById('feed-more');
assert.equal(button?.textContent,'Show more runs');
const ackReads=()=>requests.filter(u=>u.startsWith('/rest/v1/acks?'));
assert.equal(ackReads().length,1,'XUDOS are read once for the first page');
assert.equal((ackReads()[0].match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)||[]).length,20,'only for the cards on screen');
button.click();
assert.ok(await until(()=>cards()===25),'the next page appends the remaining runs');
assert.ok(await until(()=>!window.document.getElementById('feed-more')),'the button leaves when every run is shown');
assert.equal(new Set([...window.document.querySelectorAll('article.activity-post')].map(a=>a.dataset.runId)).size,25,'no run appears twice');
assert.ok(!requests.some(u=>/grinder_crews|grinder_events/.test(u)),'hidden Clubs and Events are never queried');
window.close();site.close();api.close();await db.close();
console.log('PASS home feed: 20 cards, XUDOS read per page, Show more appends 5, no Clubs/Events reads');
