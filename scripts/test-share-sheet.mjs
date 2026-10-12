import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const run={id:'7b44e8ca-1111-4111-8111-111111111111',profile_id:'author',visibility:'public',title:'TEST DATA Moon Garden',profiles:{handle:'odawwgg'}};
const app=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const handler=app.slice(app.indexOf("    const publicShare=e.target.closest('a[data-share-public]');"),app.indexOf('    // Public hrefs stay canonical'));
for(const viewer of ['author','reader']){
 const w=new JSDOM('<button id="before">Before</button><main id="app"></main>',{url:'https://striverun.app/',runScripts:'outside-only'}).window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.matchMedia=()=>({matches:false});let clipboard='',native=0;
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{clipboard=text}},configurable:true});
 w.navigator.share=async()=>{native++};
 for(const f of ['run-links.js','sharing.js'])w.eval(readFileSync(new URL('../site/'+f,import.meta.url),'utf8'));
 w.testRun=run;w.eval(`let AUTH_GENERATION=0;const status=()=>{};const sb={from:()=>({select:()=>({eq:()=>({single:async()=>({data:testRun})})})})};document.addEventListener('click',e=>{${handler}});`);
 const path=w.StriveLinks.runPath(run);
 for(const [entry,href,attrs] of [['feed',path,'data-share-public="1"'],['detail','/?share=1&run='+run.id,'']]){
  w.document.getElementById('app').innerHTML=`<a id="entry" href="${href}" ${attrs}>Share</a>`;
  w.document.getElementById('entry').focus();w.document.getElementById('entry').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  const dialog=w.document.querySelector('dialog');assert.ok(dialog?.open,`${viewer} ${entry} opens dialog`);
  assert.equal(dialog.querySelector('h2').textContent,'Share this run');assert.doesNotMatch(dialog.textContent,/your run/i);
  assert.equal(dialog.querySelector('.share-more'),null);assert.equal(native,0);
  await dialog.querySelector('.share-copy-link').onclick();assert.equal(clipboard,'https://striverun.app'+path);
  assert.equal(dialog.querySelector('.share-copy-link').textContent,'Copied');
  assert.match(dialog.querySelector('img').src,/v=4$/);
  for(const link of dialog.querySelectorAll('nav a'))assert.ok(decodeURIComponent(link.href).includes(clipboard));
  dialog.close();assert.equal(w.document.activeElement.id,'entry');assert.equal(w.document.querySelector('dialog'),null);
 }
 w.GrinderSharing.openPublic(run);w.navigator.clipboard.writeText=async()=>{throw Error('denied')};
 await w.document.querySelector('.share-copy-link').onclick();assert.equal(w.document.querySelector('.share-link-fallback').hidden,false);assert.equal(w.document.querySelector('.share-copy-link').textContent,'Copy link');
 w.document.querySelector('dialog').close();
 assert.equal(w.GrinderSharing.openPublic({...run,visibility:'private'}),false);
 w.matchMedia=()=>({matches:true});w.GrinderSharing.openPublic(run);assert.equal(native,0);await w.document.querySelector('.share-more').onclick();assert.equal(native,1);
 w.close();
}
console.log('PASS shared Feed/detail handlers: author/reader fixtures, canonical clipboard, neutral copy, desktop/mobile menu, denied clipboard fallback, private exclusion, focus return');
