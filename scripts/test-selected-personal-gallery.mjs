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

// More than three authorized images remain in the full viewer; only three fill the card.
{
 const photos=[personal,hidden,result,support,photo(5,'before'),photo(6,'after')];
 const d=new JSDOM(`<article class="activity-post" data-photo-gallery data-project-gallery data-run-id="${runId}" data-run-visibility="public" data-photo-layout="result"><div class="run-media-slot"></div></article>`,{url:'https://striverun.app'});
 d.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};d.window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new d.window.Event('close'))};
 const reads=[];const scope={document:d.window.document,location:d.window.location,AbortController,URL:Object.assign(class extends URL{},{createObjectURL:()=> 'blob:test',revokeObjectURL(){}}),fetch:async path=>{reads.push(path);return path.includes('?run_id=')&&!path.includes('&id=')?{ok:true,json:async()=>({photos})}:{ok:true,blob:async()=>({})}}};vm.createContext(scope);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),scope);
 await scope.StriveRunPhotos.mountCovers({client:null,root:scope.document});
 const group=d.window.document.querySelector('.run-media-gallery'),figures=[...group.children];assert.equal(figures.length,3);assert.equal(group.dataset.totalMedia,'5');assert.deepEqual(figures.map(f=>f.dataset.photoRole),['result','photo','personal']);assert.equal(figures[2].querySelector('.media-more-count').textContent,'+2');assert.ok(!d.window.document.body.innerHTML.includes(hidden.id));
 figures[2].querySelector('a').click();await new Promise(r=>setTimeout(r,0));assert.equal(d.window.document.querySelector('[data-image-count]').textContent,'5 / 5');d.window.document.querySelector('[data-image-prev]').click();await new Promise(r=>setTimeout(r,0));assert.equal(d.window.document.querySelector('[data-image-count]').textContent,'4 / 5');assert.ok(reads.some(p=>p.includes(photo(6,'after').id)),'hidden-by-mosaic authorized image is still available');assert.ok(!reads.some(p=>p.includes(hidden.id)),'unchosen personal is never requested');scope.StriveRunPhotos.disposeAll();
 const page=new JSDOM(html({...current,capture_metadata:full},{photos}));assert.equal(page.window.document.querySelectorAll('.public-run-photo-grid>figure').length,3);assert.equal(page.window.document.querySelectorAll('.public-image-lightbox').length,5);assert.equal(page.window.document.querySelector('.media-more-count').textContent,'+2');assert.ok(!page.window.document.body.innerHTML.includes(hidden.id));
}
console.log('PASS five authorized images become three visible project-first tiles, selected personal last, +2; full viewer retains five and never reads unchosen personal.');

// The native detail path offers the full source and never widens reader access.
{
 const d=new JSDOM('<div id="detail"></div>',{url:'https://striverun.app',runScripts:'outside-only'}),w=d.window,reads=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new w.Event('close'))};w.URL.createObjectURL=()=> 'blob:detail';w.URL.revokeObjectURL=()=>{};
 w.fetch=async path=>{reads.push(path);return path.includes('&id=')?{ok:true,blob:async()=>new w.Blob(['TEST'])}:{ok:true,json:async()=>({photos:[personal,hidden,result,support]})}};
 w.eval(fs.readFileSync('site/run-photos.js','utf8'));
 await w.StriveRunPhotos.mount({client:null,run:current,slot:w.document.querySelector('#detail'),owner:false,status(){}});
 assert.equal(w.document.querySelectorAll('.run-photo-grid--reader .photo-open').length,3);
 w.document.querySelector('.photo-open').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(w.document.querySelector('.run-image-lightbox img').alt,'Result');assert.equal(w.document.querySelector('[data-image-count]').textContent,'1 / 3');
 assert.ok(reads.some(p=>p.includes(result.id)&&!p.includes('&w=')),'detail viewer requests the full authorized source');assert.ok(!reads.some(p=>p.includes(hidden.id)),'detail viewer never requests unselected personal');
 w.StriveRunPhotos.disposeAll();
}
console.log('PASS native detail: full-image control opens authorized source; unselected personal stays private.');
