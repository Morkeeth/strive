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
  function facts(run){
    const recorded=context()?.cardFacts(run)||[],find=label=>recorded.find(r=>r[0]===label);
    let m;try{m=context()?.validate(run.capture_metadata)}catch{}
    const source=m?.estimates?.source;
    const span=source?(Date.parse(source.ended_at)-Date.parse(source.started_at))/1000:null;
    const seconds=[span,run.ridge_basis==='wall-time'?run.ridge_wall_seconds:null,run.wall_time_s,run.duration_s].find(v=>Number.isFinite(v)&&v>=0);
    const duration=seconds==null?'Not recorded':seconds<60?Math.floor(seconds)+' sec':seconds<3600?Math.floor(seconds/60)+' min':Math.floor(seconds/3600)+' hr '+Math.floor(seconds%3600/60)+' min';
    return [find('Recorded tokens')||['Recorded tokens','Not recorded','Complete usage is absent.'],find('Est. dollars')||['Est. dollars','Not recorded','No complete stored model usage and prices. This is not your subscription bill.'],['Elapsed',duration,'Captured elapsed span, including waiting.'],find('Model')||['Model','Not recorded','No captured model names.']];
  }
  async function read(client,owner){
    if(!owner)return [];
    const {data,error}=await client.from('runs').select('id,title,profile_id,source_actor_id,visibility,started_at,created_at,capture_metadata,project,harness,agent_name,caption,model,tool_calls,files_touched,commits,duration_s,wall_time_s,ridge_basis,ridge_wall_seconds').eq('profile_id',owner).eq('visibility','private').gte('created_at',launched).order('created_at',{ascending:false,nullsFirst:false});
    if(error)throw error;return newest((data||[]).filter(run=>waiting(run,owner)));
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
    box.classList.add('queue-list');
    box.innerHTML='<header class="queue-heading"><div><h2>'+rows.length+' private run'+(rows.length===1?'':'s')+'</h2><p class="meta">Only me. Not public. Newest uploads first.</p></div><button type="button" class="ghost" data-collapse>Collapse all</button></header>'+rows.map((run,index)=>{
      const date=new Date(run.started_at||run.created_at),when=Number.isFinite(date.getTime())?date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Date not recorded';
      const source=[run.project,run.harness,run.agent_name].filter(Boolean).join(' · ')||'Source not recorded';
      const metrics=facts(run),title=run.title||'Untitled run';
      const activity=[['Tool calls',run.tool_calls],['Files touched',run.files_touched],['Commits',run.commits]].map(([label,v])=>'<span>'+label+': <strong>'+esc(Number.isSafeInteger(v)&&v>=0?v.toLocaleString():'Not recorded')+'</strong></span>').join('');
      return '<details class="queue-preview"><summary><span class="queue-number">'+(index+1)+'</span><span class="queue-overview"><span class="queue-title">'+esc(title)+'</span><span class="queue-source">'+esc(source)+' · '+esc(when)+'</span><span class="queue-facts">'+metrics.map(([label,value,why])=>'<span title="'+esc(why)+'"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></span>').join('')+'</span></span><span class="queue-chevron" aria-hidden="true">⌄</span></summary><div class="queue-expanded">'+(run.caption?'<p class="queue-note">'+esc(run.caption)+'</p>':'<p class="meta">No note recorded.</p>')+'<p class="queue-activity">'+activity+'</p><details class="queue-measurements"><summary>About these numbers</summary>'+metrics.map(([label,value,why])=>'<p><strong>'+esc(label)+': '+esc(value)+'</strong> — '+esc(why)+'</p>').join('')+'</details><div class="queue-actions"><a class="act" href="/?run='+encodeURIComponent(run.id)+'&review=1">Review run</a>'+(index<rows.length-1?'<button type="button" class="ghost" data-next="'+index+'">Next run ↓</button>':'')+'<button type="button" class="ghost" data-discard-id="'+esc(run.id)+'">Discard</button></div></div></details>';
    }).join('');
    box.querySelector('[data-collapse]').onclick=()=>box.querySelectorAll('details').forEach(d=>d.open=false);
    box.querySelectorAll('[data-next]').forEach(button=>button.onclick=()=>{
      const cards=box.querySelectorAll('.queue-preview'),next=cards[Number(button.dataset.next)+1];
      if(!next||!current())return;cards.forEach(d=>d.open=false);next.open=true;next.querySelector('summary').focus();next.scrollIntoView?.({block:'nearest',behavior:'smooth'});
    });
    slot[open?'prepend':'append'](box);
    box.querySelectorAll('[data-discard-id]').forEach(button=>{button.onclick=async()=>{
      if(!current()||!confirm('Discard this private run? It will be deleted and never posted.'))return;
      button.disabled=true;try{await discard(client,rows.find(r=>r.id===button.dataset.discardId),owner);if(current()){box.remove();await mount({client,owner,slot,esc,current,open:false})}}catch(_){if(current()){button.disabled=false;button.insertAdjacentHTML('afterend','<p role="alert">This run could not be discarded. Refresh before trying again.</p>')}}
    }});

  }
  const api={pending,waiting,newest,facts,read,discard,mount};root.StriveRunQueue=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
