/* Optional, once-per-card motion. Final recorded values remain the accessible text. */
(function(root){
 const seen=new WeakSet(),pending=new Set(),reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)');
 function enter(card){
  if(reduced?.matches)return;
  card.classList.add('card-arrive');
  card.querySelectorAll('.trail-line').forEach(line=>line.setAttribute('pathLength','1'));
  for(const cell of card.querySelectorAll('.post-facts dd,.fc-activity-stats dd')){
   const final=cell.textContent,match=final.match(/^(\$?)(\d+(?:\.\d+)?)([KM]| min|s)?$/);
   if(!match)continue;
   const value=Number(match[2]),digits=match[2].includes('.')?match[2].split('.')[1].length:0;
   const span=document.createElement('span');span.setAttribute('aria-hidden','true');cell.setAttribute('aria-label',final);cell.replaceChildren(span);
   const started=performance.now();
   function frame(now){
    if(!cell.isConnected)return;
    const progress=reduced?.matches?1:Math.min(1,(now-started)/600);
    if(progress===1){cell.textContent=final;return;}
    span.textContent=match[1]+(value*(1-Math.pow(1-progress,3))).toFixed(digits)+(match[3]||'');root.requestAnimationFrame(frame);
   }
   root.requestAnimationFrame(frame);
  }
 }
 const observer=root.IntersectionObserver?new root.IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);pending.delete(e.target);enter(e.target)}},{threshold:.12}):null;
 function mount(scope=document){
  for(const card of pending)if(!card.isConnected){observer?.unobserve(card);pending.delete(card)}
  for(const card of scope.querySelectorAll('.activity-post,.fc')){
   if(seen.has(card))continue;seen.add(card);
   if(reduced?.matches)continue;
   if(observer){pending.add(card);observer.observe(card)}else enter(card);
  }
 }
 root.StriveCardMotion={mount};
})(typeof window!=='undefined'?window:globalThis);
