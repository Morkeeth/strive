/* One menu, one route-derived selection. View modules cannot leave another page selected. */
window.StriveNavigation = (() => {
  function sync() {
    const nav = document.getElementById('product-nav');
    if (!nav) return;
    const q = new URLSearchParams(location.search);
    const today = new Date();
    const date = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-');
    const dayLink = nav.querySelector('[data-nav-page="day"]');
    dayLink.href = '/?day=' + date;
    dayLink.textContent = q.has('day') && q.get('day') !== date ? 'Day view' : 'Today';
    const routes = [
      ['mine','mine'], ['following','following'], ['explore','discover'],
      ['people','people'], ['boards','boards'], ['projects','projects'], ['day','day']
    ];
    let page = routes.find(([query]) => q.has(query))?.[1] || null;
    // A public day belongs to its author, not to the viewer's My runs.
    if (page === 'day' && q.has('p')) page = null;
    // Feed card selection and sorting parameters do not create a different destination.
    if (!page && [...q.keys()].every(key => ['feedday','feedowner','feedpage','sort'].includes(key)) && !location.hash.startsWith('#import=')) page = 'feed';
    nav.querySelectorAll('[aria-current]').forEach(el => el.removeAttribute('aria-current'));
    nav.querySelectorAll('[data-nav-group]').forEach(group => {
      const selected = [...group.querySelectorAll('[data-nav-page]')].find(link => link.dataset.navPage === page);
      const primary = group.querySelector('.product-nav-link');
      const context = group.querySelector('[data-nav-context]');
      group.classList.toggle('on', Boolean(selected));
      context.hidden = !selected || selected === primary;
      context.textContent = context.hidden ? '' : selected.textContent;
      if (selected) {
        selected.setAttribute('aria-current', 'page');
        if (selected !== primary) primary.setAttribute('aria-current', 'location');
      }
    });
  }
  window.addEventListener('pageshow', sync);
  window.addEventListener('popstate', sync);
  return { sync };
})();
