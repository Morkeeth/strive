/* Useful route copy is available before the account SDK or any data request.
   Never cache or paint an owner's private rows from browser storage. */
(function(root){
  const queue=()=>'<section data-first-paint><h1>Run review queue</h1><p><strong>Only me. Not public.</strong> Review your recorded work, edit the card, then choose whether to post it.</p></section>';
  const api={queue};root.StriveFirstPaint=api;
  if(typeof module!=='undefined')module.exports=api;
  // The feed paints in its final two-column frame before any script loads, so nothing jumps when it boots.
  if(root.document&&!root.location.search&&!root.location.hash.includes('import='))root.document.getElementById('shell')?.classList.add('home-shell');
  if(root.document&&new URLSearchParams(root.location.search).has('queue')){const app=root.document.getElementById('app');if(app)app.innerHTML=queue();}
})(typeof window==='undefined'?globalThis:window);
