/* Agent submissions reuse private runs. Public reads stay behind existing RLS. */
(function(root){
  function pending(run,owner){return !!owner&&run?.profile_id===owner&&run.visibility==='private'}
  // Queue launch cutoff and the six parent runs Oscar explicitly asked to review.
  // This selects work to review, never changes the audience of an older saved run.
  const launched='2026-10-14T11:11:08Z', night=new Set(['78bfe244-4894-4ea3-84f9-5ffeff20b092','2ceceeb1-65bf-4ff9-bfd1-8ee179823e05','dc088f53-85dd-4853-ad91-42dfe4298934','13c70b6b-f56a-4c38-9b14-75a5f54defc6','38f14877-fbf0-4f44-ad2b-fce200d162a6','febf50ef-0cfc-4d4f-8f6a-21239a8c7f15']);
  function waiting(run,owner){return pending(run,owner)&&(night.has(run.id)||Date.parse(run.created_at)>=Date.parse(launched))}
  async function read(client,owner){
    if(!owner)return [];
    const {data,error}=await client.from('runs').select('id,title,profile_id,source_actor_id,visibility,started_at,created_at,capture_metadata').eq('profile_id',owner).eq('visibility','private').or('created_at.gte.'+launched+','+[...night].map(id=>'id.eq.'+id).join(',')).order('started_at',{ascending:false,nullsFirst:false});
    if(error)throw error;return (data||[]).filter(run=>waiting(run,owner));
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
    box.innerHTML='<h2>Ready for your review</h2><p><strong>Only me. Not public.</strong> Only you can see these runs. Review the card before you approve and post, or discard it.</p>'+rows.map(run=>{const m=run.capture_metadata,tokens=Number.isFinite(m?.input_tokens)&&Number.isFinite(m?.output_tokens)?(m.input_tokens+m.output_tokens).toLocaleString()+' recorded tokens':'Token count not recorded',date=run.started_at||run.created_at;return '<article class="queue-preview"><h3>'+esc(run.title||'Untitled run')+'</h3><p class="meta">'+esc(date?new Date(date).toLocaleString():'Date not recorded')+' · '+esc(tokens)+'</p><a class="act" href="/?run='+encodeURIComponent(run.id)+'&review=1">Review '+esc(run.title||'Untitled run')+'</a><button type="button" class="ghost" data-discard-id="'+esc(run.id)+'">Discard</button></article>'}).join('');
    slot[open?'prepend':'append'](box);
    box.querySelectorAll('[data-discard-id]').forEach(button=>{button.onclick=async()=>{
      if(!current()||!confirm('Discard this private run? It will be deleted and never posted.'))return;
      button.disabled=true;try{await discard(client,rows.find(r=>r.id===button.dataset.discardId),owner);if(current()){box.remove();await mount({client,owner,slot,esc,current,open:false})}}catch(_){if(current()){button.disabled=false;button.insertAdjacentHTML('afterend','<p role="alert">This run could not be discarded. Refresh before trying again.</p>')}}
    }});

  }
  const api={pending,waiting,read,discard,mount};root.StriveRunQueue=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
