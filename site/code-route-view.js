/* Consented Git observations. Sparse captures are receipts, never a numbered map. */
(function(root){
  'use strict';
  const MARKER='Collector: git-checkpoints-v1; consent: explicit';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const contract=()=>root.GrinderContract||(typeof require==='function'?require('./run-contract.js'):null);
  function claimed(run){return Array.isArray(run?.code_route?.stops)&&run.code_route.stops.some(s=>Array.isArray(s?.evidence)&&s.evidence.some(line=>typeof line==='string'&&line.startsWith('Collector: git-checkpoints-v1')));}
  function model(run){
    const route=contract()?.readCodeRoute(run);
    if(!route||route.unavailable||!claimed(run))return null;
    const stops=[];let lastOrder=0,lastRecord=0;
    for(const stop of route.stops){
      const e=stop.evidence||[],sha=e.find(s=>/^Source SHA256: [a-f0-9]{64}$/.test(s)),record=e.find(s=>/^Record: [1-9]\d*; order: [1-9]\d*; basis: checkpoint order$/.test(s));
      const observed=e.find(s=>/^Observed at: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)$/.test(s));
      if(stop.basis!=='measured'||!['edit','commit'].includes(stop.kind)||!e.includes(MARKER)||!sha||!record||!observed)return null;
      const [,rec,ord]=record.match(/^Record: (\d+); order: (\d+);/),order=Number(ord),recordNumber=Number(rec),at=observed.slice(13);
      if(!Number.isSafeInteger(order)||!Number.isSafeInteger(recordNumber)||order<=lastOrder||recordNumber<=lastRecord||!Number.isFinite(Date.parse(at)))return null;
      const fact=e.find(s=>stop.kind==='edit'?/^Content fingerprints changed: [1-9]\d* files?$/.test(s):/^Git commit: [a-f0-9]{40}$/.test(s));
      if(!fact)return null;
      stops.push({...stop,order,record:recordNumber,observedAt:at,sourceSha:sha.slice(15),fact});lastOrder=order;lastRecord=recordNumber;
    }
    const indexes=new Map(stops.map((s,i)=>[s.id,i]));
    // Only explicitly recorded adjacent connections can be drawn as a path.
    if((route.connectors||[]).some(c=>indexes.get(c.to)!==indexes.get(c.from)+1))return null;
    return {projects:route.projects,stops,connectors:route.connectors||[],finish:route.finish};
  }
  function projectLegs(m){
    const legs=[];
    for(const stop of m.stops){
      let leg=legs[legs.length-1];
      if(!leg||leg.project!==stop.project){leg={project:stop.project,stops:[]};legs.push(leg);}
      leg.stops.push(stop);
    }
    return legs;
  }
  function commitUrl(commit){
    return typeof commit.url==='string'&&/^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/commit\/[a-f0-9]{40}$/.test(commit.url)&&commit.url.endsWith('/'+commit.sha)
      ?commit.url:'';
  }
  function commitLink(commit){
    const url=commitUrl(commit);
    return url?`<a class="crv-open-commit" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open commit <span aria-hidden="true">↗</span></a>`:'';
  }
  function fileContext(source,limit=20){
    if(!source||!source.files?.length)return '';
    const files=source.files.slice(0,limit);
    return `<p class="crv-file-context"><span>Observed changes${source.files_changed>files.length?` · ${files.length} of ${source.files_changed} observed files shown`:''}</span>${files.map(file=>`<code>${esc(file)}</code>`).join('')}</p>`;
  }
  function workStop(s,{compact=false}={}){
    const commits=s.source?.commits||[];
    const changes=commits.map(c=>compact&&c.subject&&commitUrl(c)?`<div class="crv-work-commit" data-commit="${esc(c.sha)}"><a class="crv-commit-link" href="${esc(commitUrl(c))}" target="_blank" rel="noopener noreferrer"><p class="crv-commit-subject">${esc(c.subject)}</p><span>Open commit ↗</span></a></div>`:`<div class="crv-work-commit" data-commit="${esc(c.sha)}">${c.subject?`<p class="crv-commit-subject">${esc(c.subject)}</p>`:''}<div class="crv-commit-meta">${compact?'':`<span>${c.subject?'Recorded commit message':'Commit recorded'}</span>`}${commitLink(c)||`<code title="${esc(c.sha)}">${esc(c.sha.slice(0,7))}</code>`}</div></div>`).join('');
    return `<li class="crv-work-stop" data-receipt-stop="${esc(s.id)}">${changes||`<p class="crv-observed-label">${esc(s.label)}</p>`}${compact?'':fileContext(s.source)}</li>`;
  }
  function workLegs(m,legs,{compact=false,runId=''}={}){
    const units=[];
    legs.forEach((leg,legIndex)=>{
      let edits=[];
      const flush=()=>{if(edits.length){units.push({project:leg.project,legIndex,edits});edits=[];}};
      for(const stop of leg.stops){
        if(stop.kind==='edit'){edits.push(stop);continue;}
        flush();
        if(stop.source?.commits?.length)stop.source.commits.forEach((commit,i)=>units.push({project:leg.project,legIndex,commit,stop:{...stop,source:{...stop.source,commits:[commit],files:i===0?stop.source.files:[]}}}));
        else units.push({project:leg.project,legIndex,stop});
      }
      flush();
    });
    const visible=compact?units.filter(u=>u.commit?.subject).slice(0,2):null;
    const shown=compact?[]:legs;
    if(compact)for(const unit of visible){let leg=shown[shown.length-1];if(!leg||leg.legIndex!==unit.legIndex){leg={project:unit.project,legIndex:unit.legIndex,units:[]};shown.push(leg);}leg.units.push(unit);}
    const editContext=stops=>{
      if(stops.length===1)return workStop(stops[0],{compact:true});
      const names=[...new Set(stops.flatMap(s=>s.source?.files||[]))];
      return `<li class="crv-work-stop"><p class="crv-observed-label">Edits observed at ${stops.length} checkpoints</p>${fileContext({files:names,files_changed:names.length},3)}</li>`;
    };
    const list=shown.map(leg=>`<li class="crv-work-leg" data-project-leg="${esc(leg.project)}"><h3>${esc(m.projects.find(p=>p.id===leg.project).label)}</h3><ul>${compact?leg.units.map(u=>u.edits?editContext(u.edits):workStop(u.stop,{compact:true})).join(''):leg.stops.map(s=>workStop(s)).join('')}</ul></li>`).join('');
    const remaining=compact?units.filter(u=>!visible.includes(u)):[],commits=remaining.filter(u=>u.commit).length,observations=remaining.reduce((n,u)=>n+(u.edits?.length||(!u.commit?1:0)),0);
    const rest=[commits?`${commits} more ${commits===1?'commit':'commits'}`:'',observations?`${observations} other ${observations===1?'observation':'observations'}`:''].filter(Boolean).join(' and ');
    const more=remaining.length?`<a class="crv-more-work" href="/?run=${encodeURIComponent(runId)}">Full run · ${rest} →</a>`:'';
    return `<ol class="crv-work-legs">${list}</ol>${more}`;
  }
  function render(run,{compact=false}={}){
    const m=model(run);if(!m)return '';
    const legs=projectLegs(m);
    const rich=m.stops.some(s=>s.source?.commits?.some(c=>c.subject));
    const receipt=legs.map(leg=>{const project=m.projects.find(p=>p.id===leg.project);return `<li class="crv-receipt-leg"><strong class="crv-receipt-project">${esc(project.label)}</strong><ul>${leg.stops.map(s=>`<li data-receipt-stop="${esc(s.id)}"><span>${esc(s.label)}</span>${s.source?.commits?.length?s.source.commits.map(c=>commitLink(c)||`<code title="${esc(c.sha)}">${esc(c.sha.slice(0,7))}</code>`).join(''):s.kind==='commit'?`<code title="${esc(s.fact.slice(12))}">${esc(s.fact.slice(12,19))}</code>`:''}${fileContext(s.source,compact?3:20)}</li>`).join('')}</ul></li>`;}).join('');
    const sources=m.stops.map(s=>{const project=m.projects.find(p=>p.id===s.project);return `<li data-source-stop="${esc(s.id)}"><div class="crv-source-title"><span class="crv-source-order">${s.order}</span><strong>${esc(s.label)}</strong></div><dl><div><dt>Kind</dt><dd>${s.kind==='edit'?'Edit observed':'Commit recorded'} · measured checkpoint</dd></div><div><dt>Project</dt><dd>${esc(project.label)} · ${project.basis==='measured'?'measured project binding':'author-chosen label'}</dd></div><div><dt>Observed at</dt><dd><time datetime="${esc(s.observedAt)}">${esc(s.observedAt.replace('T',' ').replace(/(?:Z|\+00:00)$/,' UTC'))}</time></dd></div><div><dt>Order</dt><dd>Checkpoint ${s.order} · source record ${s.record}</dd></div><div><dt>Evidence</dt><dd>${esc(s.fact)}</dd></div>${s.source?`<div><dt>Source details</dt><dd>${s.source.commits.map(c=>`<p>${c.subject?esc(c.subject)+' · ':''}<code>${esc(c.sha)}</code>${commitLink(c)}</p>`).join('')}${fileContext(s.source)}</dd></div>`:''}<div><dt>Source SHA256</dt><dd><code>${esc(s.sourceSha)}</code></dd></div></dl></li>`;}).join('');
    return `<section class="checkpoint-route ${rich?'checkpoint-work':'checkpoint-receipt'}" data-route-collector="git-checkpoints-v1" aria-label="${rich?'Recorded work':'Activity receipt'}"><header><strong>${rich?'Recorded work':'Activity receipt'}</strong><span>${rich&&compact?'Git commit messages · observation order':'In observation order'}</span></header>${rich?workLegs(m,legs,{compact,runId:run.id}):`<ol class="crv-receipt">${receipt}</ol>`}<details class="crv-sources"><summary>Inspect capture sources</summary><p>Measured by an explicitly enabled local Git collector. Project labels are author-chosen. Checkpoints show when changes were observed, not when each action happened. The capture does not establish what shipped or whether the task is complete.</p><ol>${sources}</ol><p class="crv-capture-end">End of captured observations. Task completion is not established.</p></details></section>`;
  }
  const api={model,render,claimed};root.StriveCodeRoute=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
