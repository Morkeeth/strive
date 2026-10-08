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
  function render(run){
    const m=model(run);if(!m)return '';
    const legs=[];
    for(const stop of m.stops){let leg=legs[legs.length-1];if(!leg||leg.project!==stop.project){leg={project:stop.project,stops:[]};legs.push(leg);}leg.stops.push(stop);}
    const receipt=legs.map(leg=>{const project=m.projects.find(p=>p.id===leg.project);return `<li class="crv-receipt-leg"><strong class="crv-receipt-project">${esc(project.label)}</strong><ul>${leg.stops.map(s=>`<li data-receipt-stop="${esc(s.id)}"><span>${esc(s.label)}</span>${s.kind==='commit'?`<code title="${esc(s.fact.slice(12))}">${esc(s.fact.slice(12,19))}</code>`:''}</li>`).join('')}</ul></li>`;}).join('');
    const sources=m.stops.map(s=>{const project=m.projects.find(p=>p.id===s.project);return `<li data-source-stop="${esc(s.id)}"><div class="crv-source-title"><span class="crv-source-order">${s.order}</span><strong>${esc(s.label)}</strong></div><dl><div><dt>Kind</dt><dd>${s.kind==='edit'?'Edit observed':'Commit recorded'} · measured checkpoint</dd></div><div><dt>Project</dt><dd>${esc(project.label)} · ${project.basis==='measured'?'measured project binding':'author-chosen label'}</dd></div><div><dt>Observed at</dt><dd><time datetime="${esc(s.observedAt)}">${esc(s.observedAt.replace('T',' ').replace(/(?:Z|\+00:00)$/,' UTC'))}</time></dd></div><div><dt>Order</dt><dd>Checkpoint ${s.order} · source record ${s.record}</dd></div><div><dt>Evidence</dt><dd>${esc(s.fact)}</dd></div><div><dt>Source SHA256</dt><dd><code>${esc(s.sourceSha)}</code></dd></div></dl></li>`;}).join('');
    return `<section class="checkpoint-route checkpoint-receipt" data-route-collector="git-checkpoints-v1" aria-label="Activity receipt"><header><strong>Activity receipt</strong><span>In observation order</span></header><ol class="crv-receipt">${receipt}</ol><details class="crv-sources"><summary>Inspect capture sources</summary><p>Measured by an explicitly enabled local Git collector. Project labels are author-chosen. Checkpoints show when changes were observed, not when each action happened. The capture does not establish what shipped or whether the task is complete.</p><ol>${sources}</ol><p class="crv-capture-end">End of captured observations. Task completion is not established.</p></details></section>`;
  }
  const api={model,render,claimed};root.StriveCodeRoute=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
