import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('site/index.html','utf8'),start=source.indexOf("  window.addEventListener('popstate',event=>{"),end=source.indexOf("  $('auth').addEventListener",start);
assert(start>=0&&end>start);
const route='/?run=11111111-1111-4111-8111-111111111111';
const dom=new JSDOM('<main id="app"><article class="run-detail-card"></article><section id="grind-thread"></section></main>',{url:'https://strive.example'+route,runScripts:'outside-only'}),w=dom.window;
const card=w.document.querySelector('.run-detail-card'),thread=w.document.getElementById('grind-thread');card.dataset.routeKey=route;
let scrolls=0,routes=0,runOpens=[];thread.scrollIntoView=()=>scrolls++;
w.app=w.document.getElementById('app');w.$=id=>w.document.getElementById(id);w.route=()=>routes++;w.viewRun=id=>runOpens.push(id);
w.eval(source.slice(start,end));
w.history.pushState(null,'',route+'#grind-thread');w.dispatchEvent(new w.PopStateEvent('popstate'));
assert.equal(scrolls,1);assert.equal(routes,0);assert.deepEqual(runOpens,[],'same-run feedback fragment never remounts the card');
w.history.pushState(null,'',route+'#grind-thread');w.dispatchEvent(new w.PopStateEvent('popstate',{state:{striveRunId:'11111111-1111-4111-8111-111111111111'}}));assert.equal(scrolls,2);assert.equal(runOpens.length,0,'short-run history state also preserves the existing thread');
w.history.pushState(null,'','/?run=22222222-2222-4222-8222-222222222222#grind-thread');w.dispatchEvent(new w.PopStateEvent('popstate'));assert.equal(routes,1,'a different run still follows actual routing');
w.history.pushState(null,'','/?run=22222222-2222-4222-8222-222222222222');w.dispatchEvent(new w.PopStateEvent('popstate',{state:{striveRunId:'22222222-2222-4222-8222-222222222222'}}));assert.deepEqual(runOpens,['22222222-2222-4222-8222-222222222222']);
w.history.pushState(null,'',route+'#grind-thread');thread.remove();w.dispatchEvent(new w.PopStateEvent('popstate'));assert.equal(routes,2,'missing target does not swallow navigation');
assert.match(source,/data-route-key="\$\{esc\(location.pathname\+location.search\)\}"/,'route witness belongs to the actual rendered card');
console.log('PASS real popstate handler: same-run feedback fragment scrolls without remount; other run/state navigation and absent target still route normally.');

// Exercise the real run-link click interceptor against registered short run paths.
w.eval(readFileSync('site/run-links.js','utf8'));
const first={id:'11111111-1111-4111-8111-111111111111',title:'TEST DATA first',visibility:'public',profiles:{handle:'test-builder'}},second={id:'22222222-2222-4222-8222-222222222222',title:'TEST DATA second',visibility:'public',profiles:{handle:'test-builder'}};
const firstPath=w.StriveLinks.runPath(first),secondPath=w.StriveLinks.runPath(second);w.history.replaceState(null,'',firstPath);
const clickStart=source.indexOf("    const runLink=e.target.closest('a[href]');"),clickEnd=source.indexOf("    if(e.target.closest('[data-signin]'))",clickStart);assert(clickStart>=0&&clickEnd>clickStart);
w.eval('window.actualRunClick=function(e){'+source.slice(clickStart,clickEnd)+'}');
const anchor=w.document.createElement('a');w.document.body.append(anchor);
function click(href){anchor.href=href;const e=new w.MouseEvent('click',{button:0,bubbles:true,cancelable:true});Object.defineProperty(e,'target',{value:anchor});w.actualRunClick(e);return e;}
let beforeCount=runOpens.length;assert.equal(click('#grind-thread').defaultPrevented,false);assert.equal(runOpens.length,beforeCount,'same-document feedback anchor does not enter run navigation');
assert.equal(click(secondPath+'#grind-thread').defaultPrevented,true);assert.equal(runOpens.at(-1),second.id,'a different real run still opens through the SPA');
console.log('PASS actual short-run link interceptor: same-document fragment uses native anchor behavior; another registered run still intercepts and opens.');
