import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {checkBrowserCompat} from './check-browser-compat.mjs';
const source=await readFile('site/browser-compat.js','utf8');
const context=vm.createContext({crypto:{getRandomValues:a=>webcrypto.getRandomValues(a)}});
vm.runInContext('delete Array.prototype.at;delete String.prototype.at;delete String.prototype.replaceAll;delete Object.hasOwn',context);
vm.runInContext(source,context);
assert.equal(vm.runInContext('[1,2,3].at(-1)',context),3);
assert.equal(vm.runInContext('const a=[1];a[-1]=9;a.at(-2)',context),undefined);
assert.equal(vm.runInContext('"abc".at(-1)',context),'c');
assert.equal(vm.runInContext('"a.a".replaceAll(".","$&x")',context),'a.xa');
assert.equal(vm.runInContext('"abc".replaceAll("", "-")',context),'-a-b-c-');
assert.throws(()=>vm.runInContext('"a".replaceAll(/a/, "b")',context),/global/);
assert.equal(vm.runInContext('Object.hasOwn({x:undefined},"x")',context),true);
const ids=Array.from({length:100},()=>vm.runInContext('crypto.randomUUID()',context));
assert.equal(new Set(ids).size,100);for(const id of ids)assert.match(id,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
const dom=new JSDOM('<!doctype html><section id="load-failure" hidden>Something failed to load. Update your browser or open in Chrome</section><main id="app"></main>',{runScripts:'outside-only',url:'https://example.test/?private=NEVER'});
const w=dom.window;delete w.Element.prototype.replaceChildren;w.eval(source);const el=w.document.createElement('div');el.append('old');el.replaceChildren('new',w.document.createElement('b'));assert.equal(el.textContent,'new');assert.equal(el.children.length,1);
w.eval(await readFile('site/load-guard.js','utf8'));assert.equal(w.document.querySelector('#load-failure').hidden,true);
const optional=w.document.createElement('script');optional.src='/_vercel/insights/script.js';optional.setAttribute('data-optional','');w.document.head.append(optional);optional.dispatchEvent(new w.Event('error'));assert.equal(w.document.querySelector('#load-failure').hidden,true,'blocked optional analytics must not claim app load failed');
const img=w.document.createElement('img');w.document.body.append(img);img.dispatchEvent(new w.Event('error'));assert.equal(w.document.querySelector('#load-failure').hidden,true,'a failed optional image does not claim app boot failed');
w.dispatchEvent(new w.ErrorEvent('error',{message:'private prompt NEVER',filename:'https://example.test/?token=NEVER'}));assert.equal(w.document.querySelector('#load-failure').hidden,false);assert.doesNotMatch(w.document.body.textContent,/private prompt|token=NEVER/);
w.document.querySelector('#load-failure').hidden=true;w.dispatchEvent(new w.Event('unhandledrejection'));assert.equal(w.document.querySelector('#load-failure').hidden,false);
w.document.querySelector('#load-failure').hidden=true;const core=w.document.createElement('script');core.src='/vendor/supabase-2.117.3.js';w.document.head.append(core);core.dispatchEvent(new w.Event('error'));assert.equal(w.document.querySelector('#load-failure').hidden,false,'failed core SDK still shows recovery');
dom.window.close();
// Execute the real profile-copy binding under denied clipboard permission.
const pageSource=await readFile('site/index.html','utf8');
const start=pageSource.indexOf("  const copy=$('share-copy');"),end=pageSource.indexOf('\n}\nfunction viewClaim',start);
assert.ok(start>=0&&end>start);const binding=pageSource.slice(start,end);
for(const navigator of [{clipboard:{writeText:()=>Promise.reject(Error('permission denied'))}},{}]){
 let listener;const notices=[],unhandled=[];const onRejection=e=>unhandled.push(e);process.on('unhandledRejection',onRejection);
 try{new Function('navigator','location','GrinderSharing','handle','status','$',binding)(navigator,{origin:'https://example.test'},{cleanProfilePath:()=>'/test'},'test',text=>notices.push(text),()=>({addEventListener:(_,fn)=>listener=fn}));await listener();await new Promise(ok=>setImmediate(ok));assert.ok(notices.some(n=>n.includes('Copy this page address')),'permission denial gives a useful local fallback');assert.equal(unhandled.length,0,'clipboard denial never becomes a global load error');}finally{process.removeListener('unhandledRejection',onRejection);}
}
const result=await checkBrowserCompat();assert.deepEqual(result.failures,[]);
const html=await readFile('dist/index.html','utf8');assert.ok(html.indexOf('/load-guard.js')<html.indexOf('/startup.js'));assert.ok(html.indexOf('/browser-compat.js')<html.indexOf('/vendor/supabase-'));assert.match(html,/<main[^>]*>[\s\S]*?data-first-paint/);assert.match(html,/Something failed to load/);assert.match(html,/script src="\/vendor\/supabase-2\.117\.3\.js" integrity="sha384-/);
const sdk=await readFile('dist/vendor/supabase-2.117.3.js');assert.ok(html.includes('integrity=\"sha384-'+createHash('sha384').update(sdk).digest('base64')+'\"'),'compiled SDK integrity matches served bytes');
console.log(`PASS: ${result.count} deployment scripts ES2019, secure UUID, missing API semantics, failure fallback without personal data.`);
