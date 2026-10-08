/* Four generous menu targets; route-derived exact selection is shared on every screen. */
window.StriveNavigation = (() => {
  function sync({handle}={}) {
    const nav=document.getElementById('product-nav');if(!nav)return;
    if(handle!==undefined)nav.dataset.handle=handle||'';
    const own=nav.dataset.handle,q=new URLSearchParams(location.search),now=new Date();
    const date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    nav.querySelector('[data-nav-page="day"]').href='/?day='+date;
    nav.querySelector('[data-nav-page="profile"]').href=own?'/?u='+encodeURIComponent(own):'/?account';
    const routes=[['mine','mine'],['following','following'],['explore','discover'],['people','people'],['friends','friends'],['boards','boards'],['crews','crews'],['crew','crews'],['history-import','history-import'],['connect','connect'],['projects',q.get('scope')==='public'?'public-projects':'projects'],['day','day']];
    let page=routes.find(([key])=>q.has(key))?.[1]||null;
    if(q.get('u')===own&&own)page='profile';
    if(page==='day'&&q.has('p'))page=null;
    if(!page&&[...q.keys()].every(k=>['feedday','feedowner','feedpage','sort'].includes(k))&&!location.hash.startsWith('#import='))page='feed';
    nav.querySelectorAll('[aria-current]').forEach(e=>e.removeAttribute('aria-current'));
    nav.querySelectorAll('[data-nav-group]').forEach(group=>{
      const link=[...group.querySelectorAll('[data-nav-page]')].find(e=>e.dataset.navPage===page),summary=group.querySelector('summary'),context=group.querySelector('[data-nav-context]');
      group.classList.toggle('on',!!link);context.hidden=!link||['feed','mine','discover','people'].includes(page);context.textContent=context.hidden?'':link.textContent;
      if(link){link.setAttribute('aria-current','page');summary.setAttribute('aria-current','location')}
    });
  }
  window.addEventListener('pageshow',()=>sync());window.addEventListener('popstate',()=>sync());return{sync};
})();
