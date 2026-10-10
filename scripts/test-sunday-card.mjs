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
let html=P.render(run);assert.match(html,/Recorded work · 1 commit · 1 file touched/);assert.match(html,/Author description/);assert.match(html,/data-photo-gallery/);assert.doesNotMatch(html,/<dd[^>]*>6m<\/dd>/);
html=P.render(run,{token:'a'.repeat(12),choices:{projectVisuals:{['a'.repeat(12)]:{visual:'data'}}}});assert.doesNotMatch(html,/data-photo-gallery|data-visual-run/,'explicit Data suppresses images');
const publicPhoto={run:run.id,id:'22222222-2222-4222-a222-222222222222'};
html=P.render(run,{choices:{v:2,visual:'photo',photo:publicPhoto}});assert.match(html,/data-visual-photo/);assert.match(html,/data-gallery-supporting/,'a chosen photo remains separate from supporting project images');
html=P.render({...run,files_touched:17,code_route:{v:1,projects:[{id:'a'},{id:'b'}]}});assert.match(html,/17 files touched/,'three headline facts must not drop recorded files from work details');
const fullCaption='Author '.repeat(40);assert.ok(P.render({...run,caption:fullCaption}).includes(fullCaption.trim()),'full authored caption is retained');
const summary=C.profileFacts([run,run,{id:'missing',prompts:null,duration_s:400}]);assert.match(summary,/1,025/);assert.match(summary,/1 of 2 loaded runs have usage/);assert.match(summary,/1 of 2 loaded runs have human message counts/);assert.doesNotMatch(summary,/1,925|14m/);
console.log('PASS Sunday card: no double-counted cache, recorded zero retained, missing bill and active time unknown, authored model kept separate, public profile coverage and saved visual choices preserved.');

const missing=P.render({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:null,caption:'',story_result:''});assert.match(missing,/Only recorded measurements are shown/);assert.doesNotMatch(missing,/<dl class="post-facts"[^>]*><\/dl>/);console.log('PASS missing usage gets an honest card state without an empty facts row.');

const inconsistent=P.render({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:{...run.capture_metadata,cached_input_tokens:1001}});assert.match(inconsistent,/Usage needs review/);assert.doesNotMatch(inconsistent,/Usage not captured/);
const cursor=P.render({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:{basis:'cursor-model-info',models:[]}});assert.match(cursor,/Only recorded measurements are shown/);assert.doesNotMatch(cursor,/Usage needs review/);
const zero=P.render({...run,capture_metadata:{basis:'codex-records',models:[],input_tokens:0,output_tokens:0}});assert.doesNotMatch(zero,/Usage needs review|Usage not captured/);assert.match(zero,/<dd[^>]*>0<\/dd>/);
console.log('PASS captured inconsistent usage differs from missing usage; real zero remains a count.');

const missingPreview=w.GrinderFeed.card({...run,duration_s:null,commits:null,files_touched:null,capture_metadata:{basis:'cursor-model-info',models:[]}},{preview:true});
assert.doesNotMatch(missingPreview,/<dl class="fc-activity-stats"/,'an import without usage must omit the empty face metric');
assert.match(missingPreview,/You typed 0/,'known human-message zero remains visible');
assert.match(w.GrinderFeed.card({...run,capture_metadata:{basis:'codex-records',models:[],input_tokens:0,output_tokens:0}},{preview:true}),/<dd[^>]*>0<\/dd>/);
console.log('PASS import preview omits missing usage without hiding recorded zero.');

assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts(run))).map(r=>r[0]),['Recorded tokens','Elapsed','Commits']);
assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts({...run,duration_s:null,files_touched:7}))).map(r=>r[0]),['Recorded tokens','Commits','Files touched']);
assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts({...run,duration_s:null,commits:null,files_touched:null}))).map(r=>r[0]),['Recorded tokens','You typed']);
assert.match(P.render({...run,duration_s:null,commits:null,files_touched:null}),/Only recorded measurements are shown/);
assert.doesNotMatch(P.render({...run,duration_s:null,commits:null,files_touched:null}),/<dl class="post-facts"/);
assert.equal(C.headlineFacts({...run,commits:0})[2][1],'0');
console.log('PASS three-stat fallback order, labelled elapsed, zero commits and partial-data template.');

assert.deepEqual(JSON.parse(JSON.stringify(C.headlineFacts({...run,capture_metadata:estimateCapture}))).map(r=>r[0]),['Recorded tokens','Est. dollars','Tool-active time · proxy']);
