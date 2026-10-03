import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const src=readFileSync('site/roadmap-feedback.js','utf8');
function boot(saved){const d=new JSDOM('<body></body>',{url:'https://example.test',runScripts:'outside-only'}),w=d.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};if(saved)w.sessionStorage.setItem('strive_feedback_login_draft',saved);w.eval(src);return w}
let person=null,signin=0;const w=boot(),ui=w.StriveFeedback({client:{},me:()=>person,signIn:()=>signin++});ui.open();w.document.querySelector('textarea').value='Keep my draft across login';await w.document.querySelector('form').onsubmit({preventDefault(){}});assert.equal(signin,1);const staged=w.sessionStorage.getItem('strive_feedback_login_draft');assert.ok(staged);ui.destroy();w.close();
const restored=boot(staged),next=restored.StriveFeedback({client:{},me:()=>person,signIn(){}});next.open();assert.equal(restored.document.querySelector('textarea').value,'Keep my draft across login');person={id:'A'};next.open();assert.equal(restored.document.querySelector('textarea').value,'Keep my draft across login');assert.equal(restored.sessionStorage.getItem('strive_feedback_login_draft'),null);person={id:'B'};next.open();assert.equal(restored.document.querySelector('textarea').value,'');next.destroy();restored.close();console.log('PASS explicit signed-out draft survives login reload, needs manual send, clears on account switch');
for(const elapsed of [29,30,31]){
 const clock=boot();let now=1_800_000_000_000,account=null,tick;clock.Date.now=()=>now;clock.setInterval=fn=>{tick=fn;return 1};clock.clearInterval=()=>{};
 const panel=clock.StriveFeedback({client:{},me:()=>account,signIn(){}});
 try{
  panel.open();const text=clock.document.querySelector('textarea');text.value='Staged text';await clock.document.querySelector('form').onsubmit({preventDefault(){}});
  text.value='Ordinary current in-memory text';now+=elapsed*60*1000;account={id:'signed-in'};tick();
  assert.equal(clock.sessionStorage.getItem('strive_feedback_login_draft'),null,'claimed or expired staging must be removed');
  if(elapsed<30){assert.equal(text.value,'Staged text');assert.match(clock.document.querySelector('[role=status]').textContent,/Your draft is ready/)}
  else{assert.equal(text.value,'Ordinary current in-memory text','expired handoff must not overwrite current text');assert.doesNotMatch(clock.document.querySelector('[role=status]').textContent,/Your draft is ready/);assert.equal(clock.document.querySelector('dialog').open,false,'expired staging does not reopen dialog')}
 }finally{panel.destroy();clock.close()}
}
console.log('PASS deferred claim clock: fresh at 29 minutes, expired at 30 and 31; current text retained');
