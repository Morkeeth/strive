/* Agent submissions reuse private runs. Public reads stay behind existing RLS. */
(function(root){
  function pending(run,owner){return !!owner&&run?.profile_id===owner&&run.visibility==='private'}
  // Oscar's review window starts 13 October at 18:00 Paris (16:00 UTC).
  // This selects work to review; it never changes older saved runs' audiences.
  const launched='2026-10-13T16:00:00Z';
  function waiting(run,owner){return pending(run,owner)&&Date.parse(run.created_at)>=Date.parse(launched)}
  const context=()=>root.StriveContext||(typeof require==='function'?require('./run-context.js'):null);
  const stamp=r=>Date.parse(r.created_at)||Date.parse(r.started_at)||0;
  function newest(rows){return [...rows].sort((a,b)=>stamp(b)-stamp(a)||String(a.id).localeCompare(String(b.id)))}
  function facts(run){return context()?.shareFacts(run)||[];}
  function identity(run){
    // Authored result first; an author note is labelled as such, never inferred output.
    const result=String(run.story_result||'').trim(),note=String(run.caption||run.note||'').trim();
    let repo='';try{const u=new URL(run.repo_url);if(u.protocol==='https:'&&!u.username&&!u.password&&['github.com','gitlab.com','bitbucket.org'].includes(u.hostname))repo=u.hostname+'/'+u.pathname.replace(/^\/|\/$/g,'').replace(/\.git$/,'');}catch(_){}
    return {project:root.GrinderContract?.projectLabel?.(run.project)||String(run.project||'').trim()||'Project not recorded',repo,result:result||note||'Result not recorded. Activity alone does not say what was achieved.',label:result?'What changed':note?'Author note':'What changed'};
  }
  async function read(client,owner){
    if(!owner)return [];
    const {data,error}=await client.from('runs').select('*, profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)').eq('profile_id',owner).eq('visibility','private').gte('created_at',launched).order('created_at',{ascending:false,nullsFirst:false});
    if(error)throw error;return newest((data||[]).filter(run=>waiting(run,owner)));
  }
  async function discard(client,run,owner){
    if(!pending(run,owner))throw Error('Only the owner can discard a pending run.');
    const {data,error}=await client.from('runs').delete().eq('id',run.id).eq('profile_id',owner).eq('visibility','private').select('id');
    if(error)throw error;if(data?.length!==1)throw Error('This run changed. Refresh before deciding.');
  }
  async function approve(client,run,owner){
    if(!pending(run,owner))throw Error('Only the owner can post a private run.');
    if(run.source_actor_id){
      const actor=await client.from('grinder_agents').select('visibility').eq('id',run.source_actor_id).eq('owner_id',owner).single();
      if(actor.error||actor.data?.visibility!=='public')throw Error('Make this agent profile public in Connect before posting. This run is still private.');
    }
    const {data,error}=await client.from('runs').update({visibility:'public'}).eq('id',run.id).eq('profile_id',owner).eq('visibility','private').select('id');
    if(error)throw Error('This run could not be posted. Refresh and try again.');
    if(data?.length!==1)throw Error('This run changed. Refresh before posting.');
  }
  async function mount({client,owner,slot,esc,current,open,renderCard}){
    if(!owner)return;
    let rows;try{rows=await read(client,owner)}catch(_){if(current())slot.insertAdjacentHTML('afterbegin','<p role="alert">Your review queue could not load. <a href="/?queue">Try again</a></p>');return}
    if(!current())return;if(!rows.length){if(!open)slot.insertAdjacentHTML('beforeend','<p>No private runs are waiting for review.</p>');return;}
    const box=document.createElement('section');box.className='card pad';box.setAttribute('aria-label','Runs waiting for your review');
    box.classList.add('queue-list');
    box.innerHTML='<header class="queue-heading"><div><h2>'+rows.length+' private run'+(rows.length===1?'':'s')+'</h2><p class="meta">Only me. Not public. Newest uploads first.</p></div><button type="button" class="ghost" data-collapse>Collapse all</button></header>'+rows.map((run,index)=>{
      const date=new Date(run.started_at||run.created_at),when=Number.isFinite(date.getTime())?date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Date not recorded';
      const metrics=facts(run),title=run.title||'Untitled run',info=identity(run);
      return '<details class="queue-preview"'+(index===0?' open':'')+'><summary><span class="queue-number">'+(index+1)+'</span><span class="queue-overview"><span class="queue-title">'+esc(title)+'</span><span class="queue-source">'+esc((run.started_at?'Run: ':'Saved: ')+when+(run.started_at?'':' · start not recorded'))+' · '+esc(run.harness||'Agent not recorded')+'</span><span class="queue-project">Project: '+esc(info.project)+(info.repo?' · '+esc(info.repo):' · Repository not recorded')+'</span><span class="queue-result"><strong>'+esc(info.label)+'</strong> '+esc(info.result)+'</span><span class="queue-facts">'+metrics.map(([label,value,why])=>'<span title="'+esc(why)+'"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></span>').join('')+'</span></span><span class="queue-chevron" aria-hidden="true">⌄</span></summary><div class="queue-expanded"><p class="meta">Preliminary share card · not posted</p><div data-queue-card="'+esc(run.id)+'"><p role="status">Open to load your share card.</p></div><div class="queue-actions"><button type="button" class="act blue" data-approve-id="'+esc(run.id)+'" disabled>Approve and post</button><a class="act" href="/?run='+encodeURIComponent(run.id)+'&review=1#run-edit">Edit</a>'+(index<rows.length-1?'<button type="button" class="ghost" data-next="'+index+'">Next run ↓</button>':'')+'<button type="button" class="ghost" data-discard-id="'+esc(run.id)+'">Discard</button></div></div></details>';
    }).join('');
    box.querySelector('[data-collapse]').onclick=()=>box.querySelectorAll('details').forEach(d=>d.open=false);
    box.querySelectorAll('[data-next]').forEach(button=>button.onclick=()=>{
      const cards=box.querySelectorAll('.queue-preview'),next=cards[Number(button.dataset.next)+1];
      if(!next||!current())return;cards.forEach(d=>d.open=false);next.open=true;next.querySelector('summary').focus();next.scrollIntoView?.({block:'nearest',behavior:'smooth'});
    });
    slot[open?'prepend':'append'](box);
    const loaded=new Set();
    async function loadCard(details){
      const host=details.querySelector('[data-queue-card]'),id=host.dataset.queueCard;
      if(!details.open||loaded.has(id)||!renderCard)return;loaded.add(id);
      try{const html=await renderCard(rows.find(r=>r.id===id));if(!current()||!box.isConnected)return;host.innerHTML=html;details.querySelector('[data-approve-id]').disabled=false;}
      catch(_){loaded.delete(id);if(current()&&box.isConnected)host.innerHTML='<p role="alert">Share card could not load. Close and reopen this item to retry. It has not been posted.</p>';}
    }
    box.querySelectorAll('.queue-preview').forEach(details=>{details.addEventListener('toggle',()=>void loadCard(details));void loadCard(details)});
    box.querySelectorAll('[data-approve-id]').forEach(button=>button.onclick=async()=>{
      if(!current()||!confirm('Post this run publicly on your profile and Feed?'))return;button.disabled=true;
      try{await approve(client,rows.find(r=>r.id===button.dataset.approveId),owner);if(current()){box.remove();await mount({client,owner,slot,esc,current,open:false,renderCard})}}
      catch(error){if(current()&&box.isConnected){button.disabled=false;button.insertAdjacentHTML('afterend','<p role="alert">'+esc(error.message)+'</p>')}}
    });
    box.querySelectorAll('[data-discard-id]').forEach(button=>{button.onclick=async()=>{
      if(!current()||!confirm('Discard this private run? It will be deleted and never posted.'))return;
      button.disabled=true;try{await discard(client,rows.find(r=>r.id===button.dataset.discardId),owner);if(current()){box.remove();await mount({client,owner,slot,esc,current,open:false,renderCard})}}catch(_){if(current()){button.disabled=false;button.insertAdjacentHTML('afterend','<p role="alert">This run could not be discarded. Refresh before trying again.</p>')}}
    }});

  }
  const api={pending,waiting,newest,facts,identity,read,discard,approve,mount};root.StriveRunQueue=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
