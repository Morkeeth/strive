/* Consented Git checkpoints. Coordinates encode project and observation order only. */
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
    const W=320,top=25,row=36,H=top+(m.projects.length-1)*row+17,left=29,right=303;
    const projectIndex=new Map(m.projects.map((p,i)=>[p.id,i]));
    const points=m.stops.map((s,i)=>({...s,x:m.stops.length===1?(left+right)/2:left+i*(right-left)/(m.stops.length-1),y:top+projectIndex.get(s.project)*row}));
    const byId=new Map(points.map(p=>[p.id,p]));
    const paths=m.connectors.map(c=>{const a=byId.get(c.from),b=byId.get(c.to);return `<path class="crv-path" d="M${a.x} ${a.y} L${b.x} ${b.y}"/>`;}).join('');
    const lanes=m.projects.map((p,i)=>`<path class="crv-lane" d="M${left} ${top+i*row} H${right}"/><text class="crv-lane-number" x="3" y="${top+i*row+4}">${String.fromCharCode(65+i)}</text>`).join('');
    const dots=points.map((p,i)=>`<g data-checkpoint="${esc(p.id)}"><title>${esc('Checkpoint '+p.order+' · '+p.label)}</title>${p.kind==='commit'?`<path class="crv-commit" d="M${p.x} ${p.y-6} l6 6 -6 6 -6 -6Z"/>`:`<circle class="crv-edit" cx="${p.x}" cy="${p.y}" r="4.5"/>`}${points.length<=8||i===0||i===points.length-1?`<text class="crv-order" x="${p.x}" y="${p.y-12}" text-anchor="middle">${p.order}</text>`:''}</g>`).join('');
    const projects=m.projects.map((p,i)=>`<li><span>${String.fromCharCode(65+i)}</span>${esc(p.label)}</li>`).join('');
    const sources=m.stops.map(s=>{const project=m.projects.find(p=>p.id===s.project);return `<li data-source-stop="${esc(s.id)}"><div class="crv-source-title"><span class="crv-source-order">${s.order}</span><strong>${esc(s.label)}</strong></div><dl><div><dt>Kind</dt><dd>${s.kind==='edit'?'Edit observed':'Commit recorded'} · measured checkpoint</dd></div><div><dt>Project</dt><dd>${esc(project.label)} · ${project.basis==='measured'?'measured project binding':'author-chosen label'}</dd></div><div><dt>Observed at</dt><dd><time datetime="${esc(s.observedAt)}">${esc(s.observedAt.replace('T',' ').replace(/(?:Z|\+00:00)$/,' UTC'))}</time></dd></div><div><dt>Order</dt><dd>Checkpoint ${s.order} · source record ${s.record}</dd></div><div><dt>Evidence</dt><dd>${esc(s.fact)}</dd></div><div><dt>Source SHA256</dt><dd><code>${esc(s.sourceSha)}</code></dd></div></dl></li>`;}).join('');
    return `<section class="checkpoint-route" data-route-collector="git-checkpoints-v1" aria-label="Code Route"><header><strong>Code Route</strong><span>${m.stops.length} ${m.stops.length===1?'checkpoint':'checkpoints'} · observation order</span></header><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.stops.length+' recorded checkpoints across '+m.projects.length+' projects. Position shows observation order, not time or geography.')}" >${lanes}${paths}${dots}</svg><ol class="crv-projects" aria-label="Projects">${projects}</ol><div class="crv-legend"><span><i class="crv-edit-key" aria-hidden="true"></i>Edit observed</span><span><i class="crv-commit-key" aria-hidden="true"></i>Commit recorded</span></div><details class="crv-sources"><summary>Inspect checkpoints and sources</summary><p>Measured by an explicitly enabled local Git collector. Project labels are author-chosen. Checkpoints show when changes were observed, not when each action happened. Connections show successive observations, not cause or completion.</p><ol>${sources}</ol><p class="crv-capture-end">End of captured observations. Task completion is not established.</p></details></section>`;
  }
  const api={model,render,claimed};root.StriveCodeRoute=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
