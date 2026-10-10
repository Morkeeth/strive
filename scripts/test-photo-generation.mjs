import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';
const dom=new JSDOM('<article class="fc" data-run-id="r" data-photo-layout="result"><a class="fc-body"><h3 class="fc-title">Result</h3></a><section class="checkpoint-route">Recorded work</section></article>',{url:'https://striverun.app'});
let release,entered;const waiting=new Promise(r=>release=r),started=new Promise(r=>entered=r);let lists=0,blobs=0;
const ctx={document:dom.window.document,location:dom.window.location,AbortController,URL:Object.assign(class extends URL {},{createObjectURL:()=>`blob:${++blobs}`,revokeObjectURL(){}}),fetch:async path=>{
 if(path.includes('?run_id=')){lists++;return {ok:true,json:async()=>({photos:[{url:'/api/run-photos?id='+lists+'&run_id=r',role:'result'}]})}}
 if(path.includes('id=1&')){entered();await waiting;}return {ok:true,blob:async()=>({})};
}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),ctx);
const card=ctx.document.querySelector('.fc');const old=ctx.StriveRunPhotos.mountCovers({client:null,root:ctx.document});await started;delete card.dataset.photoChecked;await ctx.StriveRunPhotos.mountCovers({client:null,root:ctx.document});const current=card.querySelector('img').src;release();await old;assert.equal(card.querySelector('img').src,current);assert.equal(card.querySelectorAll('.run-media').length,1);assert.equal(card.querySelector('.checkpoint-route').nextElementSibling.className,'run-media run-media-gallery','recorded work leads the image gallery');ctx.StriveRunPhotos.disposeAll();assert.equal(card.querySelectorAll('.run-media').length,0);console.log('PASS delayed previous photo request cannot replace current selection; recorded work leads gallery; group disposal clears images');
const favour='599095f1-3b49-4c0e-b50c-13afd4ae369e';
const reviewDom=new JSDOM(`<article class="fc" data-run-id="${favour}" data-run-visibility="public"><a class="fc-body"><p class="fc-open">Open</p></a></article><article class="fc" data-run-id="${favour}" data-run-visibility="private"><a class="fc-body"></a></article>`,{url:'https://striverun.app'});
let reviewReads=0;const imageReads=[];const review={document:reviewDom.window.document,location:reviewDom.window.location,AbortController,URL:Object.assign(class extends URL{},{createObjectURL:()=> 'blob:chosen-cover',revokeObjectURL(){}}),fetch:async path=>{
 if(path.includes('?run_id=')){reviewReads++;return {ok:reviewReads===1,status:reviewReads===1?200:404,json:async()=>({photos:[{id:'chosen',url:'/api/run-photos?id=chosen&run_id='+favour,role:'personal',is_cover:true},{id:'not-chosen',url:'/api/run-photos?id=not-chosen&run_id='+favour,role:'personal',is_cover:false}]})}}
 imageReads.push(path);return {ok:true,blob:async()=>({})};
}};
vm.createContext(review);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),review);
await review.StriveRunPhotos.mountCovers({client:null,root:review.document});
const [publicCard,privateCard]=review.document.querySelectorAll('.fc');
assert.deepEqual([...publicCard.querySelectorAll('.run-project-gallery .run-photo-cover')].map(img=>img.getAttribute('src')),['/api/run-photos?id=chosen&run_id='+favour+'&w=320','/media/favour-public-page-20261010.webp','/media/favour-campaign-builder-20261010.webp'],'saved author cover leads, with project screenshots beside it');
assert.equal(publicCard.querySelector('.run-photo-preview').getAttribute('src'),'/api/run-photos?id=chosen&run_id='+favour+'&w=64');
assert.ok(!publicCard.innerHTML.includes('not-chosen'));
assert.equal(privateCard.querySelector('.run-project-gallery'),null,'denied private run cannot inherit public project imagery');
assert.equal(reviewReads,1,'showcase asks photo access; concurrent cards share the same in-flight read');
assert.equal(imageReads.length,1,'public cover defers bytes to native lazy image; concurrent private card retains authenticated blob path');
assert.equal(publicCard.querySelector('img').loading,'eager');
assert.ok(!imageReads.some(path=>path.includes('not-chosen')));
assert.equal(publicCard.querySelector('.fc-open').style.display,'','existing open link is not hidden by the gallery');
review.StriveRunPhotos.disposeAll();assert.equal(publicCard.querySelector('.run-project-gallery'),null);assert.equal(publicCard.querySelector('.fc-open').style.display,'');
console.log('PASS showcase reads access, preserves chosen cover beside project screenshots, protects unchosen photos and keeps navigation');
// A successful empty photo read and an access failure must not look the same.
for(const ok of [true,false]){
 const emptyDom=new JSDOM('<article class="activity-post" data-photo-gallery data-run-id="empty"><div data-photo-placeholder hidden>No screenshot added</div></article>',{url:'https://striverun.app'});
 const scope={document:emptyDom.window.document,location:emptyDom.window.location,AbortController,URL,fetch:async()=>({ok,status:ok?200:404,json:async()=>({photos:[]})})};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),scope);await scope.StriveRunPhotos.mountCovers({client:null,root:scope.document});
 assert.equal(scope.document.querySelector('[data-photo-placeholder]').hidden,!ok,'only a successful empty read can state that there is no screenshot');scope.StriveRunPhotos.disposeAll();
}
console.log('PASS absent image placeholder is withheld on failed or denied photo reads');
// Browser-managed public image URLs and authenticated image bytes remain distinct.
for(const signedIn of [false,true]){
 const d=new JSDOM('<article class="activity-post" data-photo-gallery data-run-id="r" data-run-visibility="public"></article>',{url:'https://striverun.app'}),calls=[];
 d.window.document.querySelector('article').getBoundingClientRect=()=>({width:680});
 const scope={document:d.window.document,location:d.window.location,devicePixelRatio:1,AbortController,URL:Object.assign(class extends URL{},{createObjectURL:()=> 'blob:private-reader',revokeObjectURL(){}}),fetch:async(path,opts)=>{calls.push({path,authorization:opts.headers.Authorization});return path.includes('?run_id=')?{ok:true,json:async()=>({photos:[{id:'cover',role:'personal',is_cover:true,width:1600,height:900,url:'/api/run-photos?id=cover&run_id=r'}]})}:{ok:true,blob:async()=>({})}}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),scope);
 await scope.StriveRunPhotos.mountCovers({client:signedIn?{auth:{getSession:async()=>({data:{session:{access_token:'test-account-token'}}})}}:null,root:scope.document});
 const img=scope.document.querySelector('img');assert.equal(img.getAttribute('src'),signedIn?'blob:private-reader':'/api/run-photos?id=cover&run_id=r&w=320');assert.equal(img.width,1600);assert.equal(img.height,900);assert.equal(img.loading,'eager');
 assert.equal(calls.length,signedIn?2:1,'anonymous image bytes are deferred to the browser; bearer bytes remain authenticated');if(signedIn)assert.ok(calls.every(c=>c.authorization==='Bearer test-account-token'));scope.StriveRunPhotos.disposeAll();
}
console.log('PASS stable sized/lazy public image URL; authenticated image uses account bearer; no private bearer URL exposure.');
