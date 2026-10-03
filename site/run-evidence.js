/* Client-reported captures are not provider attestations. No client flag upgrades this basis. */
(function(root){
 'use strict';
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const date=v=>typeof v==='string'&&v.trim()?Date.parse(v):NaN;
 const start=r=>date(r.started_at||r.started);
 const seconds=r=>finite(r.wall_time_s)?r.wall_time_s:finite(r.duration_s)?r.duration_s:null;
 const observed=r=>r.trace_basis==='observed native events; timestamps unavailable';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function basis(r){
  const declared=r.trace_basis==='typed-by-author',history=r.trace_basis==='historical-reconstruction';
  return {label:history?'Historical reconstruction · client-reported':declared?'Author’s account':observed(r)?'Imported · client-reported · observed subset':'Imported · client-reported',
   explanation:history?'Recovered from history and repository references, not a complete session transcript.':declared?'No captured measurements.':observed(r)?'Only visible requests are counted. Missing records may be omitted; counts are a lower bound. STRIVE has not independently verified the source or outcome.':'The capture supplied these numbers. STRIVE has not independently verified the source or outcome.',
   time:seconds(r)===null?'Duration unknown':'Recorded session span; may include idle time. Not human effort.',
   date:Number.isFinite(start(r))?'Session date supplied by the capture.':'Session date unknown. Upload date is not a session date.',
   source:r.measurement_revision?'The measurement reference identifies this submitted capture. A hash is not proof the counters are true.':'No measurement reference supplied.'};
 }
 function summary(r){return `<p class="run-evidence-basis">${esc(basis(r).label)}</p>`;}
 function detail(r){const b=basis(r);return `<details class="run-evidence"><summary>Source and limits</summary><p>${esc(b.label)}. ${esc(b.explanation)}</p><p>${esc(b.time)} ${esc(b.date)}</p><p>${esc(b.source)}</p><p>Photos and descriptions are chosen by the author. They do not attest to when a session happened or what succeeded.</p></details>`;}
 // Rows here are a public query's bounded sample, never proof that the full history was inspected.
 function ranking(runs,{since=0,now=Date.now()}={}){
  const ordered=[...runs].filter(r=>r.visibility==='public').sort((a,b)=>(date(a.created_at)||0)-(date(b.created_at)||0)||String(a.id).localeCompare(String(b.id)));
  const seenId=new Set(),seenRevision=new Set(),eligible=[],excluded=[],durationEligible=[],toolsEligible=[];
  for(const r of ordered){
   const owner=r.profile_id,s=start(r),sec=seconds(r),basis=String(r.trace_basis||'');
   const clockBased=['elapsed','elapsed-agent-tool-calls','timestamped native events'].includes(basis);
   const unknownDate=/timestamps unavailable|no top-level event timestamps/.test(basis);
   let reason=null;
   if(!owner)reason='Account identity missing';
   else if(basis==='historical-reconstruction')reason='Historical reconstruction, not a measured session';
   else if(!r.measurement_revision||basis==='typed-by-author')reason='No capture reference';
   else if(observed(r))reason='Observed minimum, not a comparable full count';
   else if(!Number.isFinite(s)||unknownDate)reason='Session date unknown';
   else if(s>now||(clockBased&&sec!==null&&s+sec*1000>now))reason='Session window ends in the future';
   else if(s<since)reason='Outside this period';
   if(reason){excluded.push({run:r,reason});continue;}
   // Only exact identity is a hard duplicate. Parallel windows and matching counters
   // can describe different sessions. Neither authenticates nor disproves a capture.
   const rev=owner+':'+r.measurement_revision;
   if((r.id&&seenId.has(r.id))||seenRevision.has(rev)){excluded.push({run:r,reason:'Repeated run or exact capture reference'});continue;}
   const hasTime=clockBased&&sec!==null&&sec>0;
   const tools=(r.tool_calls==null||r.tool_calls===0)&&finite(r.ridge_tool_calls)&&r.ridge_tool_calls>0?r.ridge_tool_calls:r.tool_calls;
   const hasTools=finite(tools)&&tools>0;
   if(!hasTime&&!hasTools){excluded.push({run:r,reason:'No comparable duration or complete tool count'});continue;}
   if(r.id)seenId.add(r.id);seenRevision.add(rev);eligible.push(r);
   if(hasTime)durationEligible.push(r);
   if(hasTools)toolsEligible.push(r);
  }
  return {eligible,excluded,durationEligible,toolsEligible};
 }
 const api={basis,summary,detail,ranking,start,seconds};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.StriveEvidence=api;
})(typeof window!=='undefined'?window:globalThis);
