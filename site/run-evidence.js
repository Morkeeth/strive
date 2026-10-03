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
  const declared=r.trace_basis==='typed-by-author';
  return {label:declared?'Author’s account':observed(r)?'Observed bot activity':'Imported · client-reported',
   explanation:declared?'No captured measurements.':observed(r)?'Only visible requests are counted. Missing records may be omitted; counts are a lower bound.':'The capture supplied these numbers. STRIVE has not independently verified the source or outcome.',
   time:seconds(r)===null?'Duration unknown':'Recorded session span; may include idle time. Not human effort.',
   date:Number.isFinite(start(r))?'Session date supplied by the capture.':'Session date unknown. Upload date is not a session date.',
   source:r.measurement_revision?'The measurement reference identifies this submitted capture. A hash is not proof the counters are true.':'No measurement reference supplied.'};
 }
 function summary(r){return `<p class="run-evidence-basis">${esc(basis(r).label)}</p>`;}
 function detail(r){const b=basis(r);return `<details class="run-evidence"><summary>Source and limits</summary><p>${esc(b.label)}. ${esc(b.explanation)}</p><p>${esc(b.time)} ${esc(b.date)}</p><p>${esc(b.source)}</p><p>Photos and descriptions are chosen by the author. They do not attest to when a session happened or what succeeded.</p></details>`;}
 // Rows here are a public query's bounded sample, never proof that the full history was inspected.
 function ranking(runs,{since=0,now=Date.now()}={}){
  const ordered=[...runs].filter(r=>r.visibility==='public').sort((a,b)=>(date(a.created_at)||0)-(date(b.created_at)||0)||String(a.id).localeCompare(String(b.id)));
  const seenId=new Set(),seenRevision=new Set(),seenShape=new Set(),unique=[],excluded=[];
  for(const r of ordered){
   const owner=r.profile_id;if(!owner){excluded.push({run:r,reason:'Account identity missing'});continue;}
   const rev=r.measurement_revision?owner+':'+r.measurement_revision:null;
   // Cosmetic edits and a new claimed revision do not make identical metrics a new performance.
   const shape=JSON.stringify([owner,r.harness,r.started_at||r.started||null,r.duration_s??null,r.wall_time_s??null,r.trace_basis,r.tool_calls??null,r.ridge_tool_calls??null,r.rhythm??null,r.ridge_tools??null,r.commits??null,r.files_touched??null]);
   if(seenId.has(r.id)||rev&&seenRevision.has(rev)||seenShape.has(shape)){excluded.push({run:r,reason:'Repeated capture reference or identical measurement signature'});continue;}
   seenId.add(r.id);if(rev)seenRevision.add(rev);seenShape.add(shape);unique.push(r);
  }
  const eligible=[];
  for(const r of unique){
   const s=start(r),sec=seconds(r),end=s+sec*1000;
   let reason=null;
   if(!r.measurement_revision||r.trace_basis==='typed-by-author')reason='No capture reference';
   else if(observed(r))reason='Observed minimum, not a comparable full count';
   else if(!Number.isFinite(s))reason='Session date unknown';
   else if(sec===null||sec<=0)reason='Session window unknown';
   else if(s>now||end>now)reason='Session window ends in the future';
   else if(s<since)reason='Outside this period';
   else if(unique.some(other=>{if(other===r||other.profile_id!==r.profile_id)return false;const os=start(other),duration=seconds(other);return Number.isFinite(os)&&duration!==null&&duration>0&&s<os+duration*1000&&os<end;}))reason='Overlapping windows for this account; not ranked separately';
   if(reason)excluded.push({run:r,reason});else eligible.push(r);
  }
  return {eligible,excluded};
 }
 const api={basis,summary,detail,ranking,start,seconds};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.StriveEvidence=api;
})(typeof window!=='undefined'?window:globalThis);
