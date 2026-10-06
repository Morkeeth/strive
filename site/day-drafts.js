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
    const history=payload&&payload.history==null?[]:payload&&payload.history;
    if(!payload||payload.schema!=='strive-day-drafts-v1'||!DAY.test(String(payload.day||''))||!Array.isArray(payload.runs)||payload.runs.length>100
      ||!Array.isArray(history)||history.length>400||!(payload.runs.length+history.length))
      throw new Error('This is not a day review link from agentgrinder capture day.');
    return {day:payload.day,project:typeof payload.project==='string'?payload.project:null,runs:payload.runs,history};
  }
  // A git-history row carries counts, times and hashes only. Its shape is checked here so a bad row
  // is refused on the page with a reason; the database guard remains the authority at save.
  const EVIDENCE=['first_observed_at','history_entries','last_observed_at','repo_commits','repo_revision','repo_window_end','repo_window_start','source_ref'];
  function historyRow(item,{profileId,projectLabel,rejectPaths}){
    const e=item&&item.history_evidence;
    if(!e||typeof e!=='object'||Object.keys(e).sort().join()!==EVIDENCE.join())throw new Error('This git-history row has an unexpected shape.');
    if(!/^[a-f0-9]{64}$/.test(String(item.measurement_revision))||!/^[a-f0-9]{40}$/.test(String(e.repo_revision))||!/^[a-f0-9]{64}$/.test(String(e.source_ref)))throw new Error('This git-history row has no source reference.');
    if(!Number.isSafeInteger(e.repo_commits)||e.repo_commits<1||!Number.isSafeInteger(e.history_entries)||e.history_entries<1)throw new Error('This git-history row has no counted commits.');
    if(!(Date.parse(e.repo_window_start)<Date.parse(e.repo_window_end)))throw new Error('This git-history row has no dated window.');
    const name=typeof item.project==='string'&&item.project.trim()?projectLabel(rejectPaths(item.project.trim())):null;
    const title=typeof item.title==='string'&&item.title.trim()&&!/[\\/]|file:/.test(item.title)?item.title.trim().slice(0,160):'Recovered build';
    return {profile_id:profileId,title,caption:'Recovered prompt history and repository changes. Complete session measurements are unavailable.',project:name||null,
      schema_version:1,trace_basis:'historical-reconstruction',measurement_revision:item.measurement_revision,history_evidence:e,visibility:'private'};
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
    // Git history: one tick per project, however many windows it has. A window already saved is found
    // by its measurement reference, which is computed from the evidence itself.
    const hist=day.history.map((item,i)=>{try{return {i,row:historyRow(item,{...deps,profileId:owner}),state:'ready',note:''}}catch(error){return {i,row:null,state:'unreadable',note:String(error.message||error)}}});
    const revs=hist.filter(h=>h.row).map(h=>h.row.measurement_revision);
    for(let k=0;k<revs.length&&!lookupFailed;k+=80){
      const {data,error}=await client.from('runs').select('id,measurement_revision').eq('profile_id',owner).in('measurement_revision',revs.slice(k,k+80));
      if(error){lookupFailed=true;break}
      for(const r of data||[]){const h=hist.find(x=>x.row&&x.row.measurement_revision===r.measurement_revision);if(h){h.state='saved';h.id=r.id}}
    }
    if(me()?.id!==owner)return open(deps);
    for(const d of drafts){if(d.state!=='ready')continue;const hit=match(d.run,existing);if(hit){d.state='saved';d.id=hit.id;d.note='Already in My runs'}}
    const groups=new Map();for(const h of hist){const key=h.row?(h.row.project||'No project named'):'Unreadable rows';const g=groups.get(key)||{name:key,items:[]};g.items.push(h);groups.set(key,g)}
    const gitGroups=[...groups.values()],gitTicked=new Set(gitGroups.filter(g=>g.items.some(h=>h.state==='ready')).map(g=>g.name));
    slot.innerHTML=`<div class="head"><h1>Review ${drafts.length} drafts${hist.length?` and ${hist.length} windows of git history`:''} for ${esc(day.day)}</h1></div>
      <p class="hint">Nothing is saved yet. Tick the drafts you want. Each one is saved as <b>Only me</b>; sharing is a separate choice you make later on each run.</p>
      ${lookupFailed?'<p class="hint" role="alert">Could not check which drafts are already saved. Saving is still safe to try: a draft saved before is refused or shown as a second run you can delete.</p>':''}
      <div class="card dd-bar"><label>Project for the ticked drafts<input id="dd-project" maxlength="120" value="${esc(day.project||'')}" placeholder="Leave empty to keep each draft's own project"></label>
        <span class="dd-tools"><button type="button" class="act" id="dd-all">Tick all</button><button type="button" class="act" id="dd-none">Untick all</button></span></div>
      <div class="card dd-list" id="dd-list"></div>
      ${hist.length?`<div class="head"><h2>Git history</h2><span class="meta">${hist.length} windows in ${gitGroups.length} projects</span></div><p class="hint">When commits landed, per project. It says a commit exists in a window, never which run made it. Saved as Only me.</p><div class="card dd-list" id="dd-hist"></div>`:''}
      <div class="dd-foot"><button type="button" class="act blue" id="dd-save"></button><span id="dd-summary" role="status"></span></div>`;
    const histList=slot.querySelector('#dd-hist'),list=slot.querySelector('#dd-list'),project=slot.querySelector('#dd-project'),save=slot.querySelector('#dd-save'),summary=slot.querySelector('#dd-summary');
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
      const open=h=>h.state==='ready'||h.state==='failed',clock2=v=>{const d=new Date(v);return `${d.toLocaleDateString(undefined,{day:'numeric',month:'short'})} ${clock(v)}`};
      if(histList)histList.innerHTML=gitGroups.map(g=>{const good=g.items.filter(h=>h.row),left=g.items.filter(open).length,done=g.items.filter(h=>h.state==='saved').length,bad=g.items.filter(h=>h.state==='failed'||h.state==='unreadable');
        const commits=good.reduce((a,h)=>a+h.row.history_evidence.repo_commits,0),from=good.map(h=>h.row.history_evidence.repo_window_start).sort()[0],to=good.map(h=>h.row.history_evidence.repo_window_end).sort().pop();
        return `<div class="dd-row" data-g="${esc(g.name)}"><label class="dd-pick"><input type="checkbox" ${gitTicked.has(g.name)&&left?'checked':''} ${left?'':'disabled'} aria-label="Save this project's git history"></label>
          <div class="dd-body"><b>${esc(g.name)}</b><span class="dd-facts">${good.length} window${good.length===1?'':'s'} · ${commits} commit${commits===1?'':'s'}${from?` · ${esc(clock2(from))} to ${esc(clock2(to))}`:''}</span>
          ${done?`<span class="dd-state dd-ok">${done} of ${g.items.length} saved for Only me</span>`:''}${bad.map(h=>`<span class="dd-state" role="alert">Not saved: ${esc(h.note)}</span>`).join('')}
          ${good.length?`<details><summary>Exactly what will be saved</summary><pre>${esc(JSON.stringify(good.map(h=>{const r={...h.row};delete r.profile_id;return r}),null,1))}</pre></details>`:''}</div></div>`}).join('');
      const gitN=gitGroups.filter(g=>gitTicked.has(g.name)).reduce((a,g)=>a+g.items.filter(open).length,0);
      const n=drafts.filter(d=>ticked.has(d.i)&&(d.state==='ready'||d.state==='failed')).length+gitN;
      save.textContent=n?`Save ${n} ticked as Only me`:'Nothing ticked';save.disabled=!n;
    }
    list.addEventListener('change',e=>{const row=e.target.closest('.dd-row');if(!row||e.target.type!=='checkbox')return;const i=+row.dataset.i;e.target.checked?ticked.add(i):ticked.delete(i);paint()});
    project.addEventListener('input',paint);
    if(histList)histList.addEventListener('change',e=>{const row=e.target.closest('.dd-row');if(!row||e.target.type!=='checkbox')return;e.target.checked?gitTicked.add(row.dataset.g):gitTicked.delete(row.dataset.g);paint()});
    slot.querySelector('#dd-all').onclick=()=>{drafts.forEach(d=>{if(d.state==='ready'||d.state==='failed')ticked.add(d.i)});gitGroups.forEach(g=>gitTicked.add(g.name));paint()};
    slot.querySelector('#dd-none').onclick=()=>{ticked.clear();gitTicked.clear();paint()};
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
        else if(result.error){const text=String(result.error.message||result.error||'');d.state='failed';
          d.note=/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(text)?'The service could not be reached. Nothing was saved for this draft.':(deps.explain(result.error)||'The save did not complete.');failed++}
        else{d.state='saved';d.id=result.data.id;d.note='Saved for Only me';ticked.delete(d.i);saved++}
      }
      for(const h of gitGroups.filter(g=>gitTicked.has(g.name)).flatMap(g=>g.items).filter(h=>h.state==='ready'||h.state==='failed')){
        if(me()?.id!==owner){status('The signed-in account changed. Nothing more was saved.',true);break}
        let result;try{result=await client.from('runs').insert(h.row).select('id').single()}catch(error){result={error}}
        if(result.error&&result.error.code==='23505'){h.state='saved';h.note='Already in My runs'}
        else if(result.error){const text=String(result.error.message||result.error||'');h.state='failed';
          h.note=/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(text)?'The service could not be reached.':(deps.explain(result.error)||'The save did not complete.');failed++}
        else{h.state='saved';h.id=result.data.id;saved++}
      }
      for(const g of gitGroups)if(!g.items.some(h=>h.state==='ready'||h.state==='failed'))gitTicked.delete(g.name);
      busy=false;paint();
      summary.innerHTML=`${saved} saved for Only me${failed?`, ${failed} not saved. Their reasons are on the rows; press Save again to retry only those.`:'.'} <a href="/?day=${encodeURIComponent(day.day)}">Open the day</a>`;
      status(failed?`${saved} saved, ${failed} not saved.`:`${saved} saved for Only me.`,!!failed);
    };
    paint();return true;
  }
  const api={open,match,parse,rowFor,historyRow};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveDayDrafts=api;
})(typeof window==='object'?window:globalThis);
