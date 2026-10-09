/* Direct primary destinations. Secondary choices live on their own pages. */
window.StriveNavigation = (() => {
  function sync() {
    const nav=document.getElementById('product-nav');if(!nav)return;
    const q=new URLSearchParams(location.search);
    const feed=![...q.keys()].length||q.has('following')||q.has('explore')||['feedday','feedowner','feedpage','sort'].some(key=>q.has(key));
    const post=q.has('post');
    nav.querySelectorAll('[data-nav-page]').forEach(link=>{
      const active=({feed,post})[link.dataset.navPage]||false;
      if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('pageshow',sync);window.addEventListener('popstate',sync);return{sync};
})();
