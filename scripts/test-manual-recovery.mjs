import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const source=readFileSync('site/index.html','utf8'),dom=new JSDOM('<main id="app"></main>',{url:'https://strive.example.com',runScripts:'outside-only'}),w=dom.window;
for(const file of ['project-update.js','run-story.js'])w.eval(readFileSync('site/'+file,'utf8'));
w.eval(`var ME={id:'synthetic-owner'},sb,confirmed=[],opened=[],notices=[];var StrivePhotoDraft={mount(){},hasDraft:async()=>false,saveIfDraft:async()=>false};var $=id=>document.getElementById(id);var status=(text,error)=>notices.push({text,error});var showSignIn=()=>{};var viewRun=async id=>opened.push(id);var fairConfirmRun=id=>confirmed.push(id);var esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));`);
w.eval(source.slice(source.indexOf('function postComposerHtml('),source.indexOf('\nasync function viewPost()')));w.eval(source.slice(source.indexOf('function wireComposer()'),source.indexOf('// GitHub is provider-backed')));
const rows=new Map(),inserts=[];let loseResponse=true,pauseLookup=null;
w.sb={from(){let queryId;return {select(){return this},eq(k,v){if(k==='id')queryId=v;return this},async maybeSingle(){if(pauseLookup)await pauseLookup;return {data:rows.get(queryId)||null}},insert(row){inserts.push(row);rows.set(row.id,row);return this},async single(){if(loseResponse)throw Error('Synthetic lost response');return {data:{id:inserts.at(-1).id}}}}}};
const render=()=>{w.document.getElementById('app').innerHTML=w.postComposerHtml();w.wireComposer()};render();
for(const [id,value] of Object.entries({f_project:'Synthetic project',f_title:'Synthetic update',f_caption:'Changed',f_output_url:'https://example.com'}))w.document.getElementById(id).value=value;
await w.document.getElementById('publish').onclick();assert.equal(inserts.length,1);assert.equal(w.opened.length,0);assert.equal(w.confirmed.length,0,'uncertain save does not confirm');assert(w.document.getElementById('manual-retry'));const first=inserts[0].id;
// A route refresh restores the exact original save ID from browser storage.
render();assert.equal(w.document.getElementById('f_title').value,'Synthetic update');await w.document.getElementById('publish').onclick();assert.equal(inserts.length,1,'retry never duplicates a received insert');assert.deepEqual([...w.opened],[first]);assert.equal(w.confirmed.length,0,'existing save is not a new visit action');assert(w.notices.at(-1).text.includes('no duplicate'));
// A delayed old-account lookup cannot insert after the account changes.
rows.clear();inserts.length=0;render();for(const [id,value] of Object.entries({f_project:'Synthetic project',f_title:'Synthetic update',f_caption:'Changed',f_output_url:'https://example.com'}))w.document.getElementById(id).value=value;let resume;pauseLookup=new Promise(r=>resume=r);const pending=w.document.getElementById('publish').onclick();await new Promise(r=>setTimeout(r,0));w.ME={id:'different-owner'};resume();await pending;assert.equal(inserts.length,0,'account switch cancels save');
// The real auth invalidation clears visible private text synchronously. Storage does not
// restore one account's draft into another account or a signed-out composer.
w.eval(`var AUTH_GENERATION=0,RUN_VIEW_GENERATION=0,AUTH_USER={id:'synthetic-auth'},IDENTITY_SETUP=null;var skeletonCard=()=>'<div class="skeleton"></div>';`);
w.document.documentElement.dataset.authBoot='ready';
w.eval(source.slice(source.indexOf('function invalidatePrivateView()'),source.indexOf('// The social feeds')));
w.handleAuthStateChange('SIGNED_OUT',null,()=>{});assert.equal(w.document.getElementById('f_project'),null,'sign-out immediately removes visible draft');
render();assert.equal(w.document.getElementById('f_project').value,'','signed-out composer cannot restore owned draft');
w.ME={id:'different-owner'};render();assert.equal(w.document.getElementById('f_project').value,'','other account cannot restore owned draft');
// Returning to the owner deliberately restores their own draft, including its stable ID.
w.ME={id:'synthetic-owner'};render();assert.equal(w.document.getElementById('f_project').value,'Synthetic project');
w.handleAuthStateChange('SIGNED_IN',{user:{id:'different-auth'}},()=>{});assert.equal(w.document.getElementById('f_project'),null,'account switch immediately removes visible draft');
console.log('PASS real manual composer: uncertain save, stable ID after refresh, duplicate refusal, no false fair confirmation, delayed-save cancellation, synchronous sign-out/account-switch hiding and owner-only draft restore');
