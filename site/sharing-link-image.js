/* The public unfurl engine runs locally; only its static code/font/WASM are fetched. */
(function(root){
 const jobs=new WeakMap();let engine,fonts;async function avatarFor(run){
  // Reuse a profile photo the app already loaded. Never request it from the review.
  const source=root.GrinderFeed.profileOf(run).avatar;
  const cached=[...document.images].find(img=>img.currentSrc===source&&img.complete&&img.naturalWidth>0&&!img.closest('[data-share-card]'));
  if(!cached)return null;
  try{const canvas=document.createElement('canvas');canvas.width=cached.naturalWidth;canvas.height=cached.naturalHeight;canvas.getContext('2d').drawImage(cached,0,0);return canvas.toDataURL('image/png')}catch(_){return null}
 }
 async function render(run,slot){
  const key=JSON.stringify(run);const old=jobs.get(slot);if(old?.key===key)return;if(old?.url)URL.revokeObjectURL(old.url);
  const job={key};jobs.set(slot,job);slot.replaceChildren();if(!run)return;
  const note=document.createElement('p');note.setAttribute('role','status');note.textContent='Building link preview on this computer…';slot.append(note);
  try{
   engine ||= import('/review-image-engine/index.js');
   // The hosted image's own typeface, from this site; without it the engine's bundled font draws.
   fonts ||= root.StriveLinkPreviewCard.fonts(file=>fetch('/fonts/'+file).then(response=>{if(!response.ok)throw new Error('font');return response.arrayBuffer()}));
   const {ImageResponse}=await engine;
   const avatar=await avatarFor(run);
   const image=new ImageResponse(root.StriveLinkPreviewCard.photoCard(run,[],{avatar}),{width:1200,height:630,fonts:await fonts});
   const blob=await image.blob();if(jobs.get(slot)!==job||!slot.isConnected)return;
   const img=document.createElement('img');job.url=URL.createObjectURL(blob);img.src=job.url;img.alt='Link preview for '+root.GrinderFeed.titleOf(run);img.width=1200;img.height=630;slot.replaceChildren(img);
  }catch(_){if(jobs.get(slot)===job)note.textContent='The link image could not be built. Your draft is still on this computer. Change audience and try again.';}
 }
 root.StriveSharingLinkImage={render};
})(typeof window==='object'?window:globalThis);
