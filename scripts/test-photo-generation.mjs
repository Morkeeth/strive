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
let reviewReads=0;const review={document:reviewDom.window.document,location:reviewDom.window.location,AbortController,URL,fetch:async()=>{reviewReads++;return {ok:false,status:404}}};
vm.createContext(review);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),review);
await review.StriveRunPhotos.mountCovers({client:null,root:review.document});
const [publicCard,privateCard]=review.document.querySelectorAll('.fc');
assert.deepEqual([...publicCard.querySelectorAll('.run-project-gallery img')].map(img=>img.getAttribute('src')),['/media/favour-public-page-20261010.webp','/media/favour-campaign-builder-20261010.webp']);
assert.equal(privateCard.querySelector('.run-project-gallery'),null,'private run cannot inherit public project imagery');
assert.equal(reviewReads,1,'only private card asks photo access');
assert.equal(publicCard.querySelector('.run-gallery-story-link').getAttribute('href'),'/?run='+favour);
review.StriveRunPhotos.disposeAll();
assert.equal(publicCard.querySelector('.run-project-gallery'),null);
console.log('PASS public FAVOUR context stays on one public run; private record is not decorated');
// A successful empty photo read and an access failure must not look the same.
for(const ok of [true,false]){
 const emptyDom=new JSDOM('<article class="activity-post" data-photo-gallery data-run-id="empty"><div data-photo-placeholder hidden>No screenshot added</div></article>',{url:'https://striverun.app'});
 const scope={document:emptyDom.window.document,location:emptyDom.window.location,AbortController,URL,fetch:async()=>({ok,status:ok?200:404,json:async()=>({photos:[]})})};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),scope);await scope.StriveRunPhotos.mountCovers({client:null,root:scope.document});
 assert.equal(scope.document.querySelector('[data-photo-placeholder]').hidden,!ok,'only a successful empty read can state that there is no screenshot');scope.StriveRunPhotos.disposeAll();
}
console.log('PASS absent image placeholder is withheld on failed or denied photo reads');
