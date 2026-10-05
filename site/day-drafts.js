// Review a day of local drafts and save the chosen ones in one action. The link is made on the
// owner's machine by `agentgrinder capture day`. Opening it saves nothing. Every save is Only me.
// A draft that fails does not stop the others, and a second press retries only what is not saved.
(function(root){
  const STASH='strive_day_drafts',HASH=/^#day-drafts=(.+)$/,DAY=/^\d{4}-\d{2}-\d{2}$/;
  const pad=n=>String(n).padStart(2,'0');
  const clock=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?`${pad(d.getHours())}:${pad(d.getMinutes())}`:'time unknown'};
  const instant=v=>{const t=Date.parse(v);return Number.isFinite(t)?t:null};
  // Pure, so it can be tested without a browser: which drafts are already saved, and the row for each.
  function match(run,existing){
    if(run.measurement_revision){const hit=existing.find(r=>r.measurement_revision===run.measurement_revision);if(hit)return hit;}
    const at=instant(run.started);if(at===null)return null;
    return existing.find(r=>instant(r.started_at)===at&&(r.harness||null)===(run.harness||null))||null;
  }
  function parse(payload){
    if(!payload||payload.schema!=='strive-day-drafts-v1'||!DAY.test(String(payload.day||''))||!Array.isArray(payload.runs)||!payload.runs.length||payload.runs.length>100)
      throw new Error('This is not a day review link from agentgrinder capture day.');
    return {day:payload.day,project:typeof payload.project==='string'?payload.project:null,runs:payload.runs};
  }
  function label(run,project,projectLabel){return (project&&project.trim())||projectLabel(run.project)||''}
  function rowFor(run,{profileId,project,projectLabel,rejectPaths,safeRepoUrl}){
    const typed=project&&project.trim()?projectLabel(rejectPaths(project.trim())):null,name=typed||projectLabel(run.project)||null;
    return root.StriveImportRow.build(run,{profileId,title:`${name||run.harness||'Work'} session`,project:name,caption:null,output:null,repo:safeRepoUrl(run.repo_url)});
  }
  async function open(deps){
    const {client,me,app,frame,railHtml,esc,status,signIn,decode,validate,projectLabel}=deps;
    let m=location.hash.match(HASH);
    if(!m){let kept=null;try{kept=sessionStorage.getItem(STASH)}catch(_){}
      if(!kept||!me())return false;
      try{sessionStorage.removeItem(STASH)}catch(_){}
      history.replaceState(null,'','/#day-drafts='+kept);m=location.hash.match(HASH);if(!m)return false;}
    const token=m[1],slot=app();frame(railHtml('mine'),null);
    let day;try{day=parse(await decode(token))}catch(error){slot.innerHTML='<div class="card"><h2>This review link could not be read</h2><p>'+esc(error.message)+'</p></div>';return true;}
    const drafts=day.runs.map((run,i)=>{try{validate(run);return {i,run,state:'ready',note:''}}catch(error){return {i,run,state:'unreadable',note:String(error.message||error)}}});
    if(!me()){
      slot.innerHTML=`<div class="card"><div class="empty"><h3>Sign in to review ${drafts.length} drafts</h3><p>Signing in saves nothing. You choose the drafts on the next screen.</p><div class="cta"><button type="button" class="act blue" id="dd-signin">Sign in</button></div></div></div>`;
      slot.querySelector('#dd-signin').onclick=()=>{try{sessionStorage.setItem(STASH,token)}catch(_){status('This browser could not keep the review link. Open it again after signing in.',true);return}signIn()};
      return true;
    }
    const owner=me().id,times=drafts.map(d=>instant(d.run.started)).filter(t=>t!==null);
    let existing=[],lookupFailed=false;
    if(times.length){
      const {data,error}=await client.from('runs').select('id,started_at,harness,measurement_revision').eq('profile_id',owner)
        .gte('started_at',new Date(Math.min(...times)-1000).toISOString()).lte('started_at',new Date(Math.max(...times)+1000).toISOString()).limit(500);
      if(error)lookupFailed=true;else existing=data||[];
    }
    if(me()?.id!==owner)return open(deps);
    for(const d of drafts){if(d.state!=='ready')continue;const hit=match(d.run,existing);if(hit){d.state='saved';d.id=hit.id;d.note='Already in My runs'}}
    slot.innerHTML=`<div class="head"><h1>Review ${drafts.length} drafts for ${esc(day.day)}</h1></div>
      <p class="hint">Nothing is saved yet. Tick the drafts you want. Each one is saved as <b>Only me</b>; sharing is a separate choice you make later on each run.</p>
      ${lookupFailed?'<p class="hint" role="alert">Could not check which drafts are already saved. Saving is still safe to try: a draft saved before is refused or shown as a second run you can delete.</p>':''}
      <div class="card dd-bar"><label>Project for the ticked drafts<input id="dd-project" maxlength="120" value="${esc(day.project||'')}" placeholder="Leave empty to keep each draft's own project"></label>
        <span class="dd-tools"><button type="button" class="act" id="dd-all">Tick all</button><button type="button" class="act" id="dd-none">Untick all</button></span></div>
      <div class="card dd-list" id="dd-list"></div>
      <div class="dd-foot"><button type="button" class="act blue" id="dd-save"></button><span id="dd-summary" role="status"></span></div>`;
    const list=slot.querySelector('#dd-list'),project=slot.querySelector('#dd-project'),save=slot.querySelector('#dd-save'),summary=slot.querySelector('#dd-summary');
    const ticked=new Set(drafts.filter(d=>d.state==='ready').map(d=>d.i));
    const facts=run=>[run.harness||'Harness unknown',clock(run.started),run.duration_s==null?'duration unknown':`${Math.round(run.duration_s/60)} min`,
      run.turns_typed==null?'typed turns unknown':`${run.turns_typed} typed turns`,run.tool_calls==null?'tool calls unknown':`${run.tool_calls} tool calls`,
      run.commits==null?'commits unknown':`${run.commits} commits`,((run.capture_metadata&&run.capture_metadata.models)||[]).join(', ')||'model unknown'].join(' · ');
    const exact=d=>{const row=rowFor(d.run,{...deps,profileId:owner,project:project.value});delete row.profile_id;return JSON.stringify(row,null,1)};
    function paint(){
      list.innerHTML=drafts.map(d=>{const can=d.state==='ready'||d.state==='failed',name=label(d.run,project.value,projectLabel)||'No project named';
        return `<div class="dd-row dd-${d.state}" data-i="${d.i}"><label class="dd-pick"><input type="checkbox" ${ticked.has(d.i)&&can?'checked':''} ${can?'':'disabled'} aria-label="Save this draft"></label>
          <div class="dd-body"><b>${esc(name)}</b><span class="dd-facts">${esc(facts(d.run))}</span>
          ${d.state==='saved'?`<span class="dd-state"><a href="/?run=${encodeURIComponent(d.id)}">${esc(d.note||'Saved for Only me')}</a></span>`:d.state==='failed'?`<span class="dd-state" role="alert">Not saved: ${esc(d.note)}</span>`:d.state==='unreadable'?`<span class="dd-state" role="alert">Cannot be saved: ${esc(d.note)}</span>`:d.state==='saving'?'<span class="dd-state">Saving…</span>':''}
          ${can?`<details><summary>Exactly what will be saved</summary><pre>${esc(exact(d))}</pre></details>`:''}</div></div>`}).join('');
      const n=drafts.filter(d=>ticked.has(d.i)&&(d.state==='ready'||d.state==='failed')).length;
      save.textContent=n?`Save ${n} ticked as Only me`:'Nothing ticked';save.disabled=!n;
    }
    list.addEventListener('change',e=>{const row=e.target.closest('.dd-row');if(!row||e.target.type!=='checkbox')return;const i=+row.dataset.i;e.target.checked?ticked.add(i):ticked.delete(i);paint()});
    project.addEventListener('input',paint);
    slot.querySelector('#dd-all').onclick=()=>{drafts.forEach(d=>{if(d.state==='ready'||d.state==='failed')ticked.add(d.i)});paint()};
    slot.querySelector('#dd-none').onclick=()=>{ticked.clear();paint()};
    let busy=false;
    save.onclick=async()=>{
      if(busy)return;busy=true;save.disabled=true;let saved=0,failed=0;
      const queue=drafts.filter(d=>ticked.has(d.i)&&(d.state==='ready'||d.state==='failed'));
      for(const d of queue){
        if(me()?.id!==owner){status('The signed-in account changed. Nothing more was saved.',true);break}
        d.state='saving';paint();save.disabled=true;
        let result;try{result=await client.from('runs').insert(rowFor(d.run,{...deps,profileId:owner,project:project.value})).select('id').single()}catch(error){result={error}}
        if(result.error&&result.error.code==='23505'){d.state='saved';d.note='Already in My runs';d.id=null;
          if(d.run.measurement_revision){const {data}=await client.from('runs').select('id').eq('profile_id',owner).eq('measurement_revision',d.run.measurement_revision).limit(1);d.id=data&&data[0]&&data[0].id}
          if(!d.id){d.state='failed';d.note='The service says this session is already saved, but it could not be found. Look in My runs.';failed++}else{ticked.delete(d.i)}}
        else if(result.error){d.state='failed';d.note=deps.explain(result.error)||'The save did not complete.';failed++}
        else{d.state='saved';d.id=result.data.id;d.note='Saved for Only me';ticked.delete(d.i);saved++}
      }
      busy=false;paint();
      summary.innerHTML=`${saved} saved for Only me${failed?`, ${failed} not saved. Their reasons are on the rows; press Save again to retry only those.`:'.'} <a href="/?day=${encodeURIComponent(day.day)}">Open the day</a>`;
      status(failed?`${saved} saved, ${failed} not saved.`:`${saved} saved for Only me.`,!!failed);
    };
    paint();return true;
  }
  const api={open,match,parse,rowFor};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveDayDrafts=api;
})(typeof window==='object'?window:globalThis);
