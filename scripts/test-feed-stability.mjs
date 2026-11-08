import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const Startup=require('../site/startup.js');
assert.equal(Startup.cachedMember({getItem:()=>JSON.stringify({user:{id:'cached-user'},expires_at:200})},100000),true);
assert.equal(Startup.cachedMember({getItem:()=>JSON.stringify({user:{id:'expired-user'},expires_at:50})},100000),false);
assert.equal(Startup.cachedMember({getItem(){throw Error('storage unavailable')}}),false);
let generation=0,refreshes=0,routes=0,release;const refresh=Startup.coordinator({generation:()=>generation,refresh:async()=>{refreshes++;if(refreshes===1)await new Promise(r=>release=r)},route:async()=>{routes++}});
const first=refresh();generation++;const second=refresh();assert.equal(first,second);release();await first;assert.equal(refreshes,2);assert.equal(routes,1,'first SIGNED_IN while restoring must settle once, not repaint two feeds');
// Real count-up module: insertion preserves a number before its first animation frame.
const dom=new JSDOM('<article class="activity-post"><dd class="unused"></dd><dl class="post-facts"><dd>82.4M</dd></dl></article>',{runScripts:'outside-only'}),w=dom.window;w.matchMedia=()=>({matches:false});w.requestAnimationFrame=()=>{};w.eval(fs.readFileSync('site/card-motion.js','utf8'));w.StriveCardMotion.mount(w.document);assert.equal(w.document.querySelector('.post-facts dd').textContent,'82.4M');
// The actual social control must never create self Follow/Block, even if the parent did not filter.
const socialDom=new JSDOM('<div class="fc-builder"><div class="card-follow"></div></div>',{runScripts:'outside-only'}),s=socialDom.window;let reads=0;s.GrinderContract={};s.GrinderAuth={present:p=>p};s.eval(fs.readFileSync('site/social.js','utf8'));const ui=s.GrinderSocial({client:{from(){reads++;throw Error('self must not query')}},me:()=>({id:'viewer'}),app:()=>s.document.body,status(){}});await ui.followControl({id:'viewer'},s.document.querySelector('.card-follow'));assert.equal(s.document.querySelector('.fc-builder'),null);assert.equal(reads,0);
// Actual card path: no-image identity belongs inside the tile, image cards keep the work-line identity.
const c=new JSDOM('',{runScripts:'outside-only'}).window;for(const file of ['run-contract.js','run-estimates.js','run-context.js','story-tile.js','run-placeholders.js','run-story.js','feed-card.js','day.js','day-card.js','activity-order.js','activity-post.js'])c.eval(fs.readFileSync('site/'+file,'utf8'));
const run={id:'fixture',title:'TEST DATA source-bound card',caption:'An author description.',harness:'Codex',visibility:'public',capture_metadata:{basis:'codex-records',models:['test-model']}};
const empty=new JSDOM(c.StrivePost.render({...run,_readablePhotoCount:0})).window.document;assert.equal(empty.querySelectorAll('.dc-head .fc-face').length,1);const withImage=new JSDOM(c.StrivePost.render({...run,_readablePhotoCount:1})).window.document;assert.ok(withImage.querySelector('.media-loading'));assert.equal(withImage.querySelector('.story-tile'),null);
const selectedRun='20000000-0000-0000-0000-000000000001',selectedPhoto='30000000-0000-0000-0000-000000000001';
const selected=new JSDOM(c.StrivePost.render({...run,id:selectedRun,_readablePhotoCount:1},{choices:{v:2,visual:'photo',photo:{run:selectedRun,id:selectedPhoto}}})).window.document;
assert.equal(selected.querySelectorAll('.run-media-slot').length,1,'selected photo keeps one reserved image region');
assert.equal(selected.querySelectorAll('.post-visual').length,0,'no second image is removed after an async photo fetch');
console.log('PASS startup coalescing, count-up, self control, and one stable feed media slot even with a selected photo.');

// Actual authorized metadata + renderer + media mount: a known-empty frame never enters the DOM.
let photoReads=0;c.fetch=async()=>{photoReads++;return {ok:true,json:async()=>({photos:[]})}};
c.eval(fs.readFileSync('site/run-photos.js','utf8'));const client={auth:{getSession:async()=>({data:{session:null}})}};
await c.StriveRunPhotos.prefetch({client,runIds:[run.id]});
const prepared=(await c.StriveRunPhotos.prepareCards([run],client))[0];
c.document.body.innerHTML=c.StrivePost.render(prepared);
assert.equal(c.document.querySelector('.media-loading'),null,'confirmed image-free cards must not paint a frame that collapses later');
await c.StriveRunPhotos.mountCovers({client,root:c.document});
assert.equal(photoReads,1,'the render preparation and image mount reuse one authorized prefetched manifest');
assert.equal(c.document.querySelector('.media-loading'),null);
console.log('PASS actual authorized prefetch/prepare/render/mount keeps an image-free card frame out of first paint without another list request.');

// A prefetched answer under another account cannot supply the card's image metadata.
let account='A';const scopedClient={auth:{getSession:async()=>({data:{session:{access_token:account}}})}};
const authReads=[];c.fetch=async(_url,options)=>{authReads.push(options.headers.Authorization);return {ok:true,json:async()=>({photos:options.headers.Authorization==='Bearer B'?[{id:'selected',is_selected:true,is_private:false,is_cover:true,role:'result'}]:[]})}};
await c.StriveRunPhotos.prefetch({client:scopedClient,runIds:['scoped-run']});account='B';
const scoped=(await c.StriveRunPhotos.prepareCards([{...run,id:'scoped-run'}],scopedClient))[0];
assert.equal(scoped._readablePhotoCount,1);assert.deepEqual(authReads,['Bearer A','Bearer B']);
console.log('PASS metadata prefetch remains scoped to the current reader authorization.');
