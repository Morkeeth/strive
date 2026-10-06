// Choose what readers see of one day. Every item starts as it is; nothing changes until the owner
// presses the button, and the page says first exactly what will become public and what will not.
// It changes one run at a time, so a failure leaves the rest as they were, and pressing again
// applies only what is still different. There is no "everything public" shortcut.
(function(root){
  const pub=v=>v==='public';
  // Pure: the difference between how things are and what the owner ticked.
  function plan(items,wanted){
    const toPublic=[],toPrivate=[];
    for(const i of items){const want=wanted.has(i.id);if(want&&!pub(i.visibility))toPublic.push(i);else if(!want&&pub(i.visibility))toPrivate.push(i)}
    return {toPublic,toPrivate};
  }
  // What a reader would then find, counted the way the day page counts it.
  function preview(items,wanted){
    const seen=items.filter(i=>wanted.has(i.id)),projects=new Set(seen.map(i=>i.project).filter(Boolean));
    return {runs:seen.filter(i=>!i.git).length,git:seen.filter(i=>i.git).length,projects:projects.size,hidden:items.length-seen.length,
      results:seen.filter(i=>i.result).length};
  }
  function collect(model){
    const items=[];
    for(const i of model.items)items.push({id:i.run.id,project:i.label||'',git:false,visibility:i.run.visibility,result:i.result,title:i.run.title||'',at:i.start,seconds:i.seconds,harness:i.run.harness||''});
    for(const g of model.recovered)items.push({id:g.run.id,project:g.label||'',git:true,visibility:g.run.visibility,result:g.result,title:g.run.title||'',at:g.from,until:g.until,commits:g.commits});
    return items;
  }
  function mount({slot,model,client,ownerId,esc,status,dayHref}){
    const items=collect(model),wanted=new Set(items.filter(i=>pub(i.visibility)).map(i=>i.id)),failed=new Map();
    const groups=new Map();for(const i of items){const k=i.project||'No project named';const g=groups.get(k)||{name:k,items:[]};g.items.push(i);groups.set(k,g)}
    const list=[...groups.values()].sort((a,b)=>(b.items.some(i=>i.result)?1:0)-(a.items.some(i=>i.result)?1:0)||a.name.localeCompare(b.name));
    const pad=n=>String(n).padStart(2,'0'),hm=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
    let lead=(model.lead&&pub(model.lead.run.visibility)&&model.lead.run.id)||null,busy=false;
    slot.innerHTML=`<div class="head"><h1>Choose what readers see</h1></div>
      <p class="hint">Everything stays as it is until you press the button. An unticked item is <b>Only you</b>. Tick a project to share all of it, or open it and tick single items.</p>
      <div class="card ds-preview" id="ds-preview" role="status"></div><div class="card dd-list" id="ds-list"></div>
      <div class="dd-foot"><button type="button" class="act blue" id="ds-apply"></button><span id="ds-summary" role="status"></span></div>`;
    const box=slot.querySelector('#ds-list'),pv=slot.querySelector('#ds-preview'),apply=slot.querySelector('#ds-apply'),summary=slot.querySelector('#ds-summary');
    function paint(){
      box.innerHTML=list.map(g=>{const on=g.items.filter(i=>wanted.has(i.id)).length,runs=g.items.filter(i=>!i.git),git=g.items.filter(i=>i.git),said=g.items.find(i=>i.result);
        return `<div class="dd-row" data-g="${esc(g.name)}"><label class="dd-pick"><input type="checkbox" data-all ${on===g.items.length?'checked':''} aria-label="Share all of ${esc(g.name)}"></label>
          <div class="dd-body"><b>${esc(g.name)}</b>${said?`<span class="ds-said">${esc(said.result)}</span>`:''}
          <span class="dd-facts">${runs.length?`${runs.length} run${runs.length===1?'':'s'}`:''}${runs.length&&git.length?' · ':''}${git.length?`${git.length} window${git.length===1?'':'s'} of git history, ${git.reduce((a,i)=>a+i.commits,0)} commits`:''} · <b class="${on?'ds-on':''}">${on?`${on} of ${g.items.length} shared`:'Only you'}</b></span>
          <details ${on&&on<g.items.length?'open':''}><summary>Choose single items</summary>${g.items.map(i=>`<label class="ds-item"><input type="checkbox" data-id="${esc(i.id)}" ${wanted.has(i.id)?'checked':''}> <span>${i.git?`Git history, ${hm(i.at)} to ${hm(i.until)}, ${i.commits} commit${i.commits===1?'':'s'}`:`${esc(i.harness||'Run')}, ${hm(i.at)}${i.result?`. ${esc(i.result)}`:', no result written'}`}${failed.has(i.id)?` <em role="alert">Not changed: ${esc(failed.get(i.id))}</em>`:''}</span>
            ${!i.git&&i.result&&wanted.has(i.id)?`<label class="ds-lead"><input type="radio" name="ds-lead" value="${esc(i.id)}" ${lead===i.id?'checked':''}> leads the day</label>`:''}</label>`).join('')}</details></div></div>`}).join('');
      const p=preview(items,wanted),d=plan(items,wanted);
      if(lead&&!wanted.has(lead))lead=null;
      pv.innerHTML=`<p class="meta">What a reader will find</p><p class="ds-count">${p.runs+p.git?`${p.projects} project${p.projects===1?'':'s'}, ${p.runs} run${p.runs===1?'':'s'}${p.git?`, ${p.git} window${p.git===1?'':'s'} of git history`:''}`:'Nothing. The whole day is Only you.'}</p>
        <p class="hint">${p.results} of the shared runs carry a written result. ${p.hidden} item${p.hidden===1?' stays':'s stay'} Only you.${lead?'':p.results?' Pick which run leads the day: its own sentence becomes the headline.':''}</p>`;
      const n=d.toPublic.length+d.toPrivate.length;
      apply.textContent=n?`Make ${d.toPublic.length} public${d.toPrivate.length?` and ${d.toPrivate.length} Only you`:''}`:'No change to make';apply.disabled=!n||busy;
      const href=dayHref(lead);summary.innerHTML=n?'':`<a href="${esc(href)}">See what others see</a>`;
    }
    box.addEventListener('change',e=>{const t=e.target;
      if(t.dataset.all!==undefined){const g=groups.get(t.closest('.dd-row').dataset.g);g.items.forEach(i=>t.checked?wanted.add(i.id):wanted.delete(i.id))}
      else if(t.dataset.id){t.checked?wanted.add(t.dataset.id):wanted.delete(t.dataset.id)}
      else if(t.name==='ds-lead'){lead=t.value}
      paint()});
    apply.onclick=async()=>{
      if(busy)return;busy=true;apply.disabled=true;failed.clear();let done=0;
      const d=plan(items,wanted);
      for(const [batch,to] of [[d.toPrivate,'private'],[d.toPublic,'public']])for(const i of batch){
        let result;try{result=await client.from('runs').update({visibility:to}).eq('id',i.id).eq('profile_id',ownerId).select('id,visibility').single()}catch(error){result={error}}
        if(result.error||!result.data||result.data.visibility!==to)failed.set(i.id,/failed to fetch|networkerror|load failed/i.test(String(result.error?.message||''))?'the service could not be reached':String(result.error?.message||'the service did not confirm the change'));
        else{i.visibility=to;done++}
      }
      busy=false;paint();
      status(failed.size?`${done} changed, ${failed.size} not changed. Press again to retry only those.`:`${done} changed.`,!!failed.size);
    };
    paint();
  }
  const api={plan,preview,collect,mount};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveDayShare=api;
})(typeof window==='object'?window:globalThis);
