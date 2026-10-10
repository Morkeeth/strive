import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';
import {html} from '../server/public-run.mjs';import {full} from '../tests/fixtures/estimate-capture.mjs';
const runId='11111111-1111-4111-a111-111111111111';
const photo=(n,role,is_cover=false)=>({id:`22222222-2222-4222-a222-${String(n).padStart(12,'0')}`,run_id:runId,role,is_cover,width:390,height:800,url:`/api/run-photos?run_id=${runId}&id=22222222-2222-4222-a222-${String(n).padStart(12,'0')}`});
const personal=photo(1,'personal',true),hidden=photo(2,'personal'),result=photo(3,'result'),support=photo(4,'photo');
for(const hasProject of [true,false]){
 const photos=hasProject?[personal,hidden,result,support]:[personal,hidden];
 const dom=new JSDOM(`<article class="fc" data-run-id="${runId}" data-run-visibility="public" data-photo-layout="result" data-project-gallery data-gallery-supporting data-media-story="TEST DATA authored project description"><a class="fc-body"></a></article>`,{url:'https://striverun.app'});
 const scope={document:dom.window.document,location:dom.window.location,URL,AbortController,fetch:async()=>({ok:true,json:async()=>({photos})})};vm.createContext(scope);
 for(const name of ['run-placeholders.js','run-photos.js'])vm.runInContext(fs.readFileSync('site/'+name,'utf8'),scope);
 await scope.StriveRunPhotos.mountCovers({client:null,root:scope.document});
 const figures=[...dom.window.document.querySelectorAll('.run-media-gallery > figure')];
 assert.equal(figures.length,hasProject?3:2);assert.equal(figures.at(-1).querySelector('img').alt,'Personal photo');
 if(hasProject)assert.equal(figures[0].querySelector('img').alt,'Result');else assert.match(figures[0].textContent,/TEST DATA authored project description/);
 assert.ok(!dom.window.document.body.innerHTML.includes(hidden.id));
 const page=new JSDOM(html({id:runId,title:'TEST DATA gallery',visibility:'public',photo_layout:'result',capture_metadata:full},{photos}));
 const publicFigures=[...page.window.document.querySelectorAll('.public-run-photo-grid>figure')];
 assert.equal(publicFigures.length,hasProject?3:2);assert.equal(publicFigures.at(-1).querySelector('img').alt,'Personal photo');
 if(hasProject)assert.equal(publicFigures[0].querySelector('img').alt,'Result');else assert.match(publicFigures[0].textContent,/TEST DATA\s*gallery/);
 assert.ok(!page.window.document.body.innerHTML.includes(hidden.id));
 // Existing saved cover/result behavior remains unchanged unless explicitly opting in with estimates.
 assert.equal(scope.StriveRunPhotos.cardPhotos(photos,'cover')[0].id,personal.id);
 const legacy=new JSDOM(html({id:runId,title:'TEST DATA old choice',visibility:'public',photo_layout:'cover'},{photos}));
 assert.equal(legacy.window.document.querySelector('.public-run-photo-grid img').alt,'Personal photo');
}
console.log('PASS result-first estimate gallery includes only selected personal cover last; missing project is first; old cover behavior preserved; feed and public page agree.');

const w=new JSDOM('',{runScripts:'outside-only'}).window;
for(const name of ['run-contract.js','run-placeholders.js','run-estimates.js','run-context.js','run-story.js','feed-card.js','day.js','day-card.js','activity-order.js','activity-post.js'])w.eval(fs.readFileSync('site/'+name,'utf8'));
const selected={v:2,visual:'photo',photo:{run:runId,id:personal.id}};
const current={id:runId,visibility:'public',title:'TEST DATA actual post',photo_layout:'result',capture_metadata:full};
const newPost=w.StrivePost.render(current,{choices:selected});
assert.match(newPost,/data-project-gallery/);assert.doesNotMatch(newPost,/data-visual-photo|data-gallery-supporting/,'result mode uses one gallery rather than a duplicate selected visual');
const oldPost=w.StrivePost.render({...current,capture_metadata:null},{choices:selected});
assert.match(oldPost,/data-visual-photo/);assert.doesNotMatch(oldPost,/data-project-gallery/);
const coverPost=w.StrivePost.render({...current,photo_layout:'cover'},{choices:selected});
assert.match(coverPost,/data-visual-photo/);assert.doesNotMatch(coverPost,/data-project-gallery/,'estimates alone never opt into project-first rendering');
console.log('PASS actual activity post with saved personal visual: explicit Result plus estimates opts in; old and cover choices preserved.');
