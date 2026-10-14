/* Agent submissions reuse private runs. Public reads stay behind existing RLS. */
(function(root){
  function pending(run,owner){return !!owner&&run?.profile_id===owner&&run.visibility==='private'}
  async function read(client,owner){
    if(!owner)return [];
    const {data,error}=await client.from('runs').select('id,title,profile_id,source_actor_id,visibility,started_at').eq('profile_id',owner).eq('visibility','private').order('started_at',{ascending:false,nullsFirst:false});
    if(error)throw error;return (data||[]).filter(run=>pending(run,owner));
  }
  async function discard(client,run,owner){
    if(!pending(run,owner))throw Error('Only the owner can discard a pending run.');
    const {data,error}=await client.from('runs').delete().eq('id',run.id).eq('profile_id',owner).eq('visibility','private').select('id');
    if(error)throw error;if(data?.length!==1)throw Error('This run changed. Refresh before deciding.');
  }
  async function mount({client,owner,slot,esc,current,open}){
    if(!owner)return;
    let rows;try{rows=await read(client,owner)}catch(_){if(current())slot.insertAdjacentHTML('afterbegin','<p role="alert">Your review queue could not load. <a href="/?queue">Try again</a></p>');return}
    if(!current())return;if(!rows.length){if(!open)slot.insertAdjacentHTML('beforeend','<p>No private runs are waiting for review.</p>');return;}
    const box=document.createElement('section');box.className='card pad';box.setAttribute('aria-label','Runs waiting for your review');
    box.innerHTML='<h2>Ready for your review</h2><p><strong>Only me. Not public.</strong> Only you can see these runs. Review the card before you approve and post, or discard it.</p>'+rows.map(run=>'<p><a class="act" href="/?run='+encodeURIComponent(run.id)+'&review=1">Review '+esc(run.title||'Untitled run')+'</a></p>').join('')+'<button type="button">Review now</button>';
    slot[open?'prepend':'append'](box);
    const dialog=document.createElement('dialog');dialog.className='run-share-dialog';dialog.setAttribute('aria-label','Runs waiting for your review');dialog.innerHTML=box.innerHTML+'<button type="button" data-close>Later</button>';
    dialog.querySelector('button:not([data-close])').remove();box.querySelector('button').onclick=()=>dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();box.append(dialog);
    if(open)dialog.showModal();
  }
  const api={pending,read,discard,mount};root.StriveRunQueue=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
