import {full as estimateCapture} from '../tests/fixtures/estimate-capture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const w=new JSDOM('',{runScripts:'outside-only'}).window;
for(const file of ['run-contract.js','run-placeholders.js','run-estimates.js','run-context.js','run-story.js','feed-card.js','day.js','day-card.js','activity-order.js','activity-post.js'])w.eval(readFileSync('site/'+file,'utf8'));
const C=w.StriveContext,P=w.StrivePost;
// Input and cached usage are deliberately very different: adding cache twice must fail.
const run={id:'11111111-1111-4111-a111-111111111111',profile_id:'owner',visibility:'public',title:'Real captured work',caption:'Author description',started_at:'2026-10-08T13:03:11Z',duration_s:355,prompts:0,commits:1,files_touched:1,capture_metadata:{basis:'claude-message-usage',models:['model-a'],input_tokens:1000,output_tokens:25,cached_input_tokens:900}};
const facts=JSON.parse(JSON.stringify(C.cardFacts(run)));
assert.equal(facts[0][1],'1K');assert.equal(facts.length,3);assert.equal(facts[2][1],'0');assert.ok(!facts.some(row=>row[0]==='Est. dollars'||row[0]==='Tool-active time · proxy'));
assert.equal(C.cardFacts({...run,capture_metadata:null,model:'Author label'})[1][1],'Not recorded');
assert.equal(C.cardFacts({...run,capture_metadata:{...run.capture_metadata,cached_input_tokens:1001}})[0][1],'Not recorded');
let html=P.render(run);assert.match(html,/Recorded work · 1 commit · 1 file touched/);assert.match(html,/Author description/);assert.match(html,/data-photo-gallery/);assert.match(html,/<dt>Elapsed<\/dt><dd[^>]*>5 min<\/dd>/);
html=P.render(run,{token:'a'.repeat(12),choices:{projectVisuals:{['a'.repeat(12)]:{visual:'data'}}}});assert.doesNotMatch(html,/data-photo-gallery|data-visual-run/,'explicit Data suppresses images');
const publicPhoto={run:run.id,id:'22222222-2222-4222-a222-222222222222'};
html=P.render(run,{choices:{v:2,visual:'photo',photo:publicPhoto}});assert.match(html,/data-selected-photo="22222222-2222-4222-a222-222222222222"/);assert.match(html,/data-photo-gallery/,'a chosen photo joins the reserved gallery after the image fetch');assert.doesNotMatch(html,/post-visual/,'the chosen photo does not create a second image region');
html=P.render({...run,files_touched:17,code_route:{v:1,projects:[{id:'a'},{id:'b'}]}});assert.match(html,/17 files touched/,'three headline facts must not drop recorded files from work details');
const fullCaption='Author '.repeat(40);assert.ok(P.render({...run,caption:fullCaption}).includes(fullCaption.trim()),'full authored caption is retained');
const summary=C.profileFacts([run,run,{id:'missing',prompts:null,duration_s:400}]);assert.match(summary,/1,025/);assert.match(summary,/1 of 2 loaded runs have usage/);assert.match(summary,/1 of 2 loaded runs have human message counts/);assert.doesNotMatch(summary,/1,925|14m/);
console.log('PASS Sunday card: no double-counted cache, recorded zero retained, missing bill and active time unknown, authored model kept separate, public profile coverage and saved visual choices preserved.');

const missing=P.render({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:null,caption:'',story_result:''});assert.doesNotMatch(missing,/Not captured/);assert.match(missing,/0 messages you wrote/);assert.equal(new JSDOM(missing).window.document.querySelectorAll('.post-fact-missing').length,0);assert.doesNotMatch(missing,/Not recorded<\/dd>/);assert.doesNotMatch(missing,/<dl class="post-facts"[^>]*><\/dl>/);console.log('PASS missing usage gets an honest card state without an empty facts row.');

const inconsistent=P.render({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:{...run.capture_metadata,cached_input_tokens:1001}});assert.match(inconsistent,/could not be interpreted consistently/);assert.doesNotMatch(inconsistent,/Usage not captured/);
const cursor=P.render({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:{basis:'cursor-model-info',models:[]}});assert.doesNotMatch(cursor,/Not recorded<\/dd>/);assert.doesNotMatch(cursor,/Usage needs review/);
const zero=P.render({...run,capture_metadata:{basis:'codex-records',models:[],input_tokens:0,output_tokens:0}});assert.doesNotMatch(zero,/Usage needs review|Usage not captured/);assert.match(zero,/<dd[^>]*>0<\/dd>/);
console.log('PASS captured inconsistent usage differs from missing usage; real zero remains a count.');

const missingPreview=w.GrinderFeed.card({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:{basis:'cursor-model-info',models:[]}},{preview:true});
assert.match(missingPreview,/<dl class="fc-activity-stats"/,'Cursor keeps a three-position count row');
assert.match(missingPreview,/<dd[^>]*>0<\/dd>/,'known human-message zero remains visible');
assert.match(w.GrinderFeed.card({...run,capture_metadata:{basis:'codex-records',models:[],input_tokens:0,output_tokens:0}},{preview:true}),/<dd[^>]*>0<\/dd>/);
console.log('PASS import preview omits missing usage without hiding recorded zero.');

assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts(run))).map(r=>r[0]),['Recorded tokens','Tool calls','Elapsed']);
assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts({...run,duration_s:null,files_touched:7}))).map(r=>r[0]),['Recorded tokens','Tool calls','Files touched']);
assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts({...run,duration_s:null,commits:null,files_touched:null}))).map(r=>r[0]),['Recorded tokens','Tool calls','Files touched']);
assert.doesNotMatch(P.render({...run,duration_s:null,commits:null,files_touched:null}),/Not captured/);
assert.match(P.render({...run,duration_s:null,commits:null,files_touched:null}),/<dl class="post-facts post-share-facts"/);
assert.equal(C.headlineFacts({...run,duration_s:null,files_touched:null,commits:0})[2][1],'0');
console.log('PASS three-stat fallback order, labelled elapsed, zero commits and partial-data template.');

assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts({...run,capture_metadata:estimateCapture}))).map(r=>r[0]),['Recorded tokens','Est. dollars','Elapsed']);

const feedDom=new JSDOM(P.render({...run,rhythm:[1,2,1]}));assert.equal(feedDom.window.document.querySelectorAll('.post-trail').length,0,'feed removes trail; detail owns it');assert.ok(feedDom.window.document.querySelector('.post-options .post-measurement-note'),'measurements stay available inside the options menu');assert.match(P.trail({...run,rhythm:[1,2,1]}),/post-no-trace/,'sparse detail uses a compact summary');

const costOnly=structuredClone(estimateCapture);delete costOnly.estimates.tool_activity;const costFacts=C.headlineFacts({...run,capture_metadata:costOnly});assert.equal(costFacts[1][0],'Est. dollars');assert.equal(costFacts[1][1],'$1.89');assert.equal(costFacts[2][0],'Elapsed');assert.equal(costFacts[2][1],'11m');const costCard=new JSDOM(P.render({...run,capture_metadata:costOnly}));assert.equal(costCard.window.document.querySelectorAll('.post-fact-placeholder').length,0);assert.ok(costCard.window.document.querySelector('.post-facts').textContent.includes('Elapsed'));

const nativeCursor={...run,harness:"cursor",duration_s:null,turns_typed:3,prompts:null,tool_calls:15,files_touched:2,capture_metadata:{basis:"cursor-model-info",models:["auto"]}};
const cursorCard=new JSDOM(P.render(nativeCursor));
assert.deepEqual([...cursorCard.window.document.querySelectorAll(".post-share-facts dt")].map(e=>e.textContent),["You typed","Model","Files changed"]);
assert.deepEqual([...cursorCard.window.document.querySelectorAll(".post-share-facts dd")].map(e=>e.textContent),["3","auto","2"]);
assert.match(cursorCard.window.document.querySelector('.post-no-trace').textContent,/3 messages you wrote · 15 agent tool calls/,'known recorded activity remains visible when tokens and elapsed are absent');
assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts({...nativeCursor,capture_metadata:null,harness:"future"}))).map(x=>x[1]),["3","15","2"],'detail fallback contract remains intact');
// Oscar's preliminary-card contract: the shared posted renderer carries the same four facts and measured chart.
const timed={...run,prompts:9,tool_calls:30,ridge:[0,2,0,3,4,5,6,10,0,0],ridge_basis:'wall-time',ridge_wall_seconds:1200,capture_metadata:estimateCapture};
const posted=new JSDOM(P.render(timed)).window.document,previewed=new JSDOM(P.render(timed,{review:true})).window.document;
assert.equal(posted.querySelectorAll('.post-share-facts>div').length,3);
assert.equal(posted.querySelectorAll('.activity-bar').length,6,'actual timed windows appear on the posted card');
assert.equal(posted.querySelector('.post-share-facts').textContent,previewed.querySelector('.post-share-facts').textContent);
assert.equal(posted.querySelector('.post-trail').textContent,previewed.querySelector('.post-trail').textContent);
assert.equal(posted.querySelector('.post-share-facts>div:nth-child(2) dd').textContent,'$1.89','cache-aware stored price inputs survive shared rendering');


assert.doesNotMatch(P.render(run),/Project image not added|project image not added/);
assert.match(w.StrivePlaceholders.render("image",{story:"Actual author story",owner:true}),/Project image not added/i);
assert.doesNotMatch(w.StrivePlaceholders.render("image",{story:"Actual author story",owner:false}),/Project image not added/i);
console.log("PASS missing project image request is owner-only; public card keeps the author story.");
