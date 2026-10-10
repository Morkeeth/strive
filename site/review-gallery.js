/* A visible carousel: slow advance, paused by any inspection or reduced-motion choice. */
(function(){for(const gallery of document.querySelectorAll('.hero-gallery')){
 const card=gallery.closest('.achievement'),dots=[...card.querySelectorAll('[data-gallery-dot]')],prev=card.querySelector('[data-gallery-prev]'),next=card.querySelector('[data-gallery-next]'),reduced=matchMedia('(prefers-reduced-motion: reduce)');let hovered=false,focused=false,touched=false;
 const step=()=>gallery.querySelector('.shot')?.getBoundingClientRect().width+parseFloat(getComputedStyle(gallery).gap||0)||gallery.clientWidth;
 const index=()=>Math.round(gallery.scrollLeft/step());
 const update=()=>{const i=index();dots.forEach((d,n)=>d.setAttribute('aria-pressed',String(i===n)));if(prev)prev.disabled=gallery.scrollLeft<2;if(next)next.disabled=gallery.scrollLeft+gallery.clientWidth>=gallery.scrollWidth-2;};
 const move=i=>gallery.scrollTo({left:i*step(),behavior:reduced.matches?'instant':'smooth'});
 dots.forEach((dot,i)=>dot.addEventListener('click',()=>move(i)));prev?.addEventListener('click',()=>move(index()-1));next?.addEventListener('click',()=>move(index()+1));gallery.addEventListener('scroll',update,{passive:true});
 card.addEventListener('mouseenter',()=>hovered=true);card.addEventListener('mouseleave',()=>hovered=false);card.addEventListener('focusin',()=>focused=true);card.addEventListener('focusout',e=>focused=card.contains(e.relatedTarget));card.addEventListener('touchstart',()=>touched=true,{passive:true});
 setInterval(()=>{const box=gallery.getBoundingClientRect();if(reduced.matches||hovered||focused||touched||document.hidden||box.bottom<0||box.top>innerHeight||gallery.scrollWidth<=gallery.clientWidth+2)return;move(next?.disabled?0:index()+1)},5000);addEventListener('resize',update);update();
}})();
