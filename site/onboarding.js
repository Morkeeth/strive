// First-visit onboarding (1 Nov pilot): three short steps, shown once per account on this browser (or once for a guest), skippable.
// Every privacy sentence repeats what the post flow already promises (site/post-flow.js and the
// composer's grant steps); nothing here adds a claim. The blue activity trace is the progress line.
(function(root){
'use strict';
const KEY='strive_intro_seen';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prompt=origin=>`Open ${origin}/agents.md and help me preview this session on STRIVE. Keep it local until I choose to save it.`;
function steps(origin){
 return [
  {title:'Share what you built',body:'Post a project update with a title and what changed. Screenshots and a project link are optional.'},
  {title:'Preview, then save',body:'Check your card before saving. Only me keeps it private; Public posts it to the feed and your profile.'},
  {title:'Start with a project',body:'No agent setup needed. To add a recorded session instead, choose Agent run when posting.'},
 ];
}
let userId=null,active=null;
const shown=new Set();
const identityKey=()=>userId?KEY+':user:'+encodeURIComponent(userId):KEY;
// Claim before displaying so reload/back cannot replay an interrupted introduction.
// Fall back to this tab's session storage; if neither store can remember, avoid a repeating modal.
function claim(key){
 if(shown.has(key))return false;
 const available=[];
 for(const name of ['localStorage','sessionStorage']){try{const storage=root[name];if(storage.getItem(key)==='1'){shown.add(key);return false;}available.push(storage);}catch(_){}}
 for(const storage of available){try{storage.setItem(key,'1');shown.add(key);return true;}catch(_){}}
 return false;
}
function setUser(id){
 const next=typeof id==='string'&&id?id:null;
 if(next!==userId){active?.();userId=next;}
}
// The trace: one blue line that draws further with each step.
const TRACE='M4 40 L40 34 L58 12 L84 30 L120 22 L146 8 L180 26 L216 16 L252 30 L296 6';
function html(list){
 return `<div class="ob-sheet" role="dialog" aria-modal="true" aria-labelledby="ob-title">
  <svg class="ob-trace" viewBox="0 0 300 46" aria-hidden="true"><path class="ob-trace-bg" d="${TRACE}"/><path class="ob-trace-line" d="${TRACE}" pathLength="100"/></svg>
  <div class="ob-steps">${list.map((s,i)=>`<section class="ob-step" data-step="${i}"${i?' hidden':''}>
   <p class="ob-count">${i+1} of ${list.length}</p><h2${i?'':' id="ob-title"'}>${esc(s.title)}</h2>
   ${s.body?`<p>${esc(s.body)}</p>`:''}
   ${s.prompt?`<div class="ob-prompt"><code>${esc(s.prompt)}</code><button type="button" class="act" data-ob-copy>Copy prompt</button></div>`:''}
   ${s.list?`<ol class="ob-list">${s.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}
  </section>`).join('')}</div>
  <div class="ob-actions"><button type="button" class="ghost" data-ob-skip>Skip</button><button type="button" class="act blue" data-ob-next>Next</button></div>
 </div>`;
}
function show({origin=location.origin,onDone}={}){
 if(document.documentElement.dataset.authBoot==='pending'||(!userId&&document.documentElement.dataset.authHint==='member'))return null;
 if(!claim(identityKey()))return null;
 const list=steps(origin);
 const wrap=document.createElement('div');wrap.className='ob-backdrop';wrap.innerHTML=html(list);
 document.body.append(wrap);
 const sheet=wrap.querySelector('.ob-sheet'),line=wrap.querySelector('.ob-trace-line'),next=wrap.querySelector('[data-ob-next]');
 let at=0;
 const paint=()=>{
  wrap.querySelectorAll('.ob-step').forEach((el,i)=>{el.hidden=i!==at;el.classList.toggle('is-in',i===at);});
  line.style.strokeDashoffset=String(100-100*(at+1)/list.length);
  next.textContent=at===list.length-1?'Post a project':'Next';
  const h=wrap.querySelector(`.ob-step[data-step="${at}"] h2`);if(h){h.id='ob-title';h.tabIndex=-1;h.focus({preventScroll:true});}
 };
 const discard=()=>{wrap.remove();document.removeEventListener('keydown',key);if(active===discard)active=null;};
 active=discard;
 const close=go=>{wrap.classList.remove('is-open');document.removeEventListener('keydown',key);
  setTimeout(()=>{if(active!==discard)return;discard();onDone?.(go);if(go)location.href='/?post';},reduced()?0:200);};
 const key=e=>{if(e.key==='Escape')close(false);};
 next.onclick=()=>{if(at<list.length-1){at++;paint();}else close(true);};
 wrap.querySelector('[data-ob-skip]').onclick=()=>close(false);
 document.addEventListener('keydown',key);
 paint();
 requestAnimationFrame(()=>requestAnimationFrame(()=>wrap.classList.add('is-open')));
 return wrap;
}
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
// First visit per resolved account/browser; guest state stays separate. Never mid-task.
function maybeShow(opts={}){
 const q=new URLSearchParams(location.search);
 if(active)return null;
 if(['post','connect','onboard','share','queue','account','inbox'].some(k=>q.has(k)))return null;
 return show(opts);
}
const api={steps,prompt,show,maybeShow,setUser,KEY};
root.StriveOnboarding=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document!=='undefined'&&typeof window!=='undefined'&&!window.STRIVE_ONBOARDING_MANUAL){
 // 1 Nov: wait for sign-in to resolve (html[data-auth-boot] leaves 'pending'), so a signed-in member
 // whose session is still restoring is never mistaken for a guest. Gives up after 6 s.
 const start=()=>{const t0=Date.now();const tick=()=>{const boot=document.documentElement.dataset.authBoot;
  if(boot==='pending'&&Date.now()-t0<6000)return setTimeout(tick,200);
  if(boot==='pending')return;if(!document.querySelector('.ob-backdrop'))maybeShow();};setTimeout(tick,700);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
}
})(typeof window!=='undefined'?window:globalThis);
