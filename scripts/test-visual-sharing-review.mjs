import fs from 'node:fs';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="review"></div><div id="import-card-preview"></div><select id="audience"><option value="private">Only me</option><option value="public">Public</option><option value="link">Followers</option></select><button id="save">Save</button>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
w.eval(fs.readFileSync('site/sharing-review.js','utf8'));
const seen=[];const panel=w.StriveSharingReview.mount({slot:d.getElementById('review'),run:{tool_calls:385},card:d.getElementById('import-card-preview'),buildRow:choices=>({title:'Real run',...(choices.tool_calls===false?{}:{tool_calls:385})}),audience:d.getElementById('audience'),save:d.getElementById('save'),onChange(){},renderCard(row,{owner}){seen.push({row,owner});return '<article data-owner="'+owner+'">'+(row.tool_calls??'No tool count')+'</article>'}});
assert.ok(d.querySelector('[data-share-card] article'),'real card leads review');
assert.equal(d.querySelector('[data-share-card] article').dataset.owner,'true');
assert.match(d.querySelector('[data-share-frame]').textContent,/nobody else sees this/i);
const exact=d.querySelector('details.sharing-review-exact');assert.ok(exact);assert.equal(exact.open,false);assert.equal(exact.querySelector('summary').textContent,'Exactly what is saved');
assert.ok(d.querySelector('[data-share-card]').compareDocumentPosition(exact)&w.Node.DOCUMENT_POSITION_FOLLOWING);
d.querySelector('[data-share-metric="tool_calls"]').click();assert.match(d.querySelector('[data-share-card]').textContent,/No tool count/);assert.ok(!Object.hasOwn(seen.at(-1).row,'tool_calls'));
const audience=d.getElementById('audience');audience.value='public';audience.dispatchEvent(new w.Event('change'));
assert.equal(d.querySelector('[data-share-card] article').dataset.owner,'false');assert.equal(d.getElementById('save').textContent,'Post to feed');assert.equal(d.querySelector('[data-share-link-preview]').hidden,false);
audience.value='link';audience.dispatchEvent(new w.Event('change'));assert.equal(d.querySelector('[data-share-card] article').dataset.owner,'false');assert.equal(d.getElementById('save').textContent,'Save for followers');assert.equal(d.querySelector('[data-share-link-preview]').hidden,true);
assert.equal(panel.choices().tool_calls,false);
console.log('PASS visual review: real card, instant choices, audience owner/reader, exact fields folded, public link image');
// The card face comes from the saved selected-run renderer, not a second mock layout.
for(const file of ['run-contract','story-tile','run-placeholders','run-estimates','run-context','run-story','run-evidence','feed-card','day','day-card','activity-order','activity-post'])w.eval(fs.readFileSync('site/'+file+'.js','utf8'));
const row={id:'preview',title:'Actual selected run',started_at:'2026-10-12T13:50:00Z',prompts:16,tool_calls:385,files_touched:15,harness:'Cursor',capture_metadata:{models:[]},profiles:{display_name:'TEST owner'},_readablePhotoCount:0};
for(const visibility of ['private','public','link']){
 const owner=visibility==='private',options={owner,dateLabel:w.StriveActivity.label(row),actions:w.GrinderFeed.actions({mode:'preview'})};
 const normal=w.StrivePost.render({...row,visibility},options),review=w.StrivePost.render({...row,visibility},{...options,review:true});
 assert.equal(review.replace(' data-review-card="true"','').replaceAll('data-review-href=','href=').replaceAll(' role="link" aria-disabled="true" tabindex="-1"','').replace('<footer class="fc-foot" aria-disabled="true">','<footer class="fc-foot">').replace('<p class="post-review-reactions">Readers can react here</p>',''),normal,'review is exactly the saved card markup with disabled unsaved destinations');
 const doc=new JSDOM(review).window.document;assert.equal(doc.querySelectorAll('a[data-review-href$="#run-edit"]').length,owner?1:0);assert.ok(!doc.querySelector('article').hasAttribute('inert'));assert.equal(doc.querySelectorAll('a[href]').length,0);assert.ok(doc.body.textContent.includes('385'));
}
console.log('PASS actual saved post renderer parity, readable preview and private-only owner controls');
const modelRun={...row,capture_metadata:{basis:'claude-message-usage',models:['claude-opus-5-5']}};
const modelDoc=new JSDOM(w.StrivePost.render(modelRun,{review:true})).window.document;
assert.match(modelDoc.body.textContent,/Claude Opus 5.5|claude-opus-5-5/,'recorded model remains on the real card even without an image');
const absentDoc=new JSDOM(w.StrivePost.render({...modelRun,capture_metadata:{models:[]}},{review:true})).window.document;
assert.ok(!absentDoc.body.textContent.includes('Claude Opus 5.5'),'unticked model leaves the face immediately');
// Fable review: omitted measurements are not falsely described as source failures.
const sparse=new JSDOM(w.StrivePost.render({...row,tool_calls:undefined,files_touched:undefined,capture_metadata:{models:[]}},{review:true})).window.document;
assert.ok(!sparse.querySelector('.post-facts').textContent.includes('Not captured'),'reader leaves omitted stats out');
assert.match(w.StriveActivity.label(row),/^12 Oct 2026, /,'same local 24-hour date on preview and reader card');
audience.value='private';audience.dispatchEvent(new w.Event('change'));
assert.match(d.querySelector('[data-share-frame]').textContent,/Not shared: Tool calls/,'owner frame explains deselected captured metrics');
import {photoCard} from '../server/public-run.mjs';
const selected=ctxRow=>w.StriveImportRow?.build?.(ctxRow,{profileId:'owner',title:'Selected row only',project:'test',metricChoices:{tool_calls:false,files_touched:false,commits:false,model:false,duration:false}});
w.eval(fs.readFileSync('site/import-row.js','utf8'));
const imageRow=selected({schema_version:1,tool_calls:385,files_touched:15,commits:7,turns_typed:16,duration_s:69,model:'PRIVATE-MODEL',rhythm:[385],capture_metadata:{basis:'cursor-model-info',models:['PRIVATE-MODEL']}});
const imageTree=JSON.stringify(photoCard({...imageRow,visibility:'public',profiles:{display_name:'TEST owner'}},[],{}));
assert.ok(!imageTree.includes('385')&&!imageTree.includes('PRIVATE-MODEL'));assert.match(imageTree,/Selected row only/);
// PRODUCT.md: turn and tool-call totals are not hero facts, so a row with only those selected
// carries its title and no fact row; nothing deselected reaches the image.
assert.doesNotMatch(imageTree,/Typed turns|Tool calls|"16"/);
console.log('PASS unfurl tree receives only the selected row; omitted tool count and model cannot reach it');
