// One project, start to now: the first picture, the latest picture, and the turning points between
// them on one blue trace. A turning point is a run where the author wrote what came out. Nothing
// is inferred: a run with no written result is counted as work, never as a turning point.
(function(root){
  const pad=n=>String(n).padStart(2,'0');
  const when=r=>{const e=r.trace_basis==='historical-reconstruction'&&r.history_evidence&&Date.parse(r.history_evidence.repo_window_end);
    const d=new Date(e?e-1:(r.started_at||r.created_at));return Number.isFinite(d.getTime())?d:null};
  const resultOf=r=>[r.story_result,r.caption,r.note].find(v=>typeof v==='string'&&v.trim())||'';
  const recovered=r=>r.trace_basis==='historical-reconstruction'&&r.history_evidence&&Number.isSafeInteger(r.history_evidence.repo_commits);
  const seconds=r=>Math.max(0,Number(r.wall_time_s||r.duration_s||0)||0);
  const LEADS=['result','journey','numbers'];
  const lead=v=>LEADS.includes(v)?v:'result';
  function compute(runs){
    const all=(runs||[]).map(r=>({run:r,at:when(r)})).filter(x=>x.at).sort((a,b)=>a.at-b.at);
    const sessions=all.filter(x=>!recovered(x.run)),git=all.filter(x=>recovered(x.run));
    let total=0,calls=0;
    const points=sessions.map(x=>{const commits=Number.isFinite(x.run.commits)?Math.max(0,x.run.commits):null;total+=commits||0;
      calls+=x.run.tool_calls||x.run.ridge_tool_calls||0;
      return {run:x.run,at:x.at,commits,after:total,callsAfter:calls,result:resultOf(x.run).trim(),next:typeof x.run.story_next==='string'?x.run.story_next.trim():''}});
    const turning=points.filter(p=>p.result),last=points[points.length-1]||null;
    const gitCommits=git.length?git.reduce((a,x)=>a+x.run.history_evidence.repo_commits,0):null;
    // The trace climbs with commits when the runs recorded any. A session that works in another
    // checkout records none, so the trace then climbs with recorded tool calls and says so.
    const metric=total>0?{key:'after',total,unit:'commit'}:calls>0?{key:'callsAfter',total:calls,unit:'tool call'}:null;
    return {points,turning,metric,first:points[0]||null,last,
      open:[...points].reverse().find(p=>p.next)?.next||'',
      question:[...points].reverse().find(p=>typeof p.run.feedback_question==='string'&&p.run.feedback_question.trim())?.run.feedback_question.trim()||'',
      commits:total,commitsUnknown:points.filter(p=>p.commits===null).length,gitCommits,
      seconds:sessions.reduce((a,x)=>a+seconds(x.run),0),toolCalls:sessions.reduce((a,x)=>a+(x.run.tool_calls||x.run.ridge_tool_calls||0),0),
      days:new Set(points.map(p=>`${p.at.getFullYear()}-${p.at.getMonth()}-${p.at.getDate()}`)).size};
  }
  const stamp=d=>`${d.toLocaleDateString(undefined,{day:'numeric',month:'short'})} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const span=s=>s>=3600?`${Math.floor(s/3600)} h ${pad(Math.round(s%3600/60))}`:s>=60?`${Math.round(s/60)} min`:'under a minute';
  const plural=(n,one)=>`${n} ${n===1?one:one+'s'}`;
  // The trace: time left to right, commits recorded so far bottom to top. Every run is a small dot,
  // a turning point is a numbered ring. With one run there is no line to draw, and none is drawn.
  function trace(J){
    const P=J.points,M=J.metric;if(P.length<2||!M)return '';
    const W=640,H=150,L=8,R=8,T=14,B=22,t0=P[0].at.getTime(),t1=P[P.length-1].at.getTime(),top=Math.max(1,M.total);
    const x=p=>L+(t1>t0?(p.at-t0)/(t1-t0):0.5)*(W-L-R),y=v=>H-B-(v/top)*(H-T-B);
    let d=`M${x(P[0]).toFixed(1)} ${y(0).toFixed(1)}`,prev=0;
    for(const p of P){d+=` L${x(p).toFixed(1)} ${y(prev).toFixed(1)} L${x(p).toFixed(1)} ${y(p[M.key]).toFixed(1)}`;prev=p[M.key]}
    let n=0;
    const marks=P.map(p=>p.result?`<g><circle cx="${x(p).toFixed(1)}" cy="${y(p[M.key]).toFixed(1)}" r="9" class="j-ring"/><text x="${x(p).toFixed(1)}" y="${(y(p[M.key])+3.5).toFixed(1)}" text-anchor="middle" class="j-num">${++n}</text></g>`
      :`<circle cx="${x(p).toFixed(1)}" cy="${y(p[M.key]).toFixed(1)}" r="2.5" class="j-dot"/>`).join('');
    return `<svg class="j-trace" viewBox="0 0 ${W} ${H}" role="img" aria-label="${M.unit}s recorded over time, ${J.turning.length} turning points marked"><line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" class="j-base"/><path d="${d}" class="j-line"/>${marks}
      <text x="${L}" y="${H-5}" class="j-axis">${stamp(P[0].at)}</text><text x="${W-R}" y="${H-5}" text-anchor="end" class="j-axis">${stamp(P[P.length-1].at)}</text><text x="${W-R}" y="${T-3}" text-anchor="end" class="j-axis">${plural(M.total,M.unit)} recorded</text></svg>`;
  }
  function render(J,{esc,mine,leadWith='result',shareHref}){
    if(!J.points.length)return '';
    const order=lead(leadWith);
    const pair=`<section class="j-pair" id="journey-pair" aria-label="Before and after"></section>`;
    const result=J.last&&(J.turning.length||J.open)?`<section class="j-result">${J.turning.length?`<p class="meta">Where it stands</p><p class="j-now">${esc(J.turning[J.turning.length-1].result)}</p>`:''}${J.open?`<p class="j-open"><span>Still open</span>${esc(J.open)}</p>`:''}</section>`:'';
    const steps=J.turning.length?`<ol class="j-steps">${J.turning.map((p,i)=>`<li><a href="/?run=${encodeURIComponent(p.run.id)}"><span class="j-n">${i+1}</span><span class="j-step"><b>${esc(p.result)}</b><span class="meta">${esc(stamp(p.at))}${p.commits?` · ${plural(p.commits,'commit')}`:''}${p.run.harness?` · ${esc(p.run.harness)}`:''}</span></span></a></li>`).join('')}</ol>`
      :`<p class="hint">${mine?'No turning point yet. Open a run and write what came out of it; it appears here.':'The author has not written a result on any run yet.'}</p>`;
    const journey=`<section class="j-journey"><div class="head"><h2>Turning points</h2><span class="meta">${J.turning.length} of ${plural(J.points.length,'run')}</span></div><div class="card j-card">${trace(J)}${steps}</div></section>`;
    const numbers=`<section class="j-numbers"><div class="ptotals num j-nums"><div><div class="v">${J.points.length}</div><div class="k">Runs</div></div>${J.gitCommits!==null?`<div><div class="v">${J.gitCommits}</div><div class="k">Commits, from git history</div></div>`:J.commitsUnknown===J.points.length||(J.commits===0&&J.toolCalls>0)?`<div><div class="v">${J.toolCalls}</div><div class="k">Tool calls recorded</div></div>`:`<div><div class="v">${J.commits}</div><div class="k">Commits recorded</div></div>`}<div><div class="v">${esc(span(J.seconds))}</div><div class="k">Recorded time</div></div><div><div class="v">${J.days}</div><div class="k">${J.days===1?'Day':'Days'}</div></div></div>
      ${J.commitsUnknown&&J.gitCommits===null&&J.commitsUnknown<J.points.length?`<p class="hint">${plural(J.commitsUnknown,'run')} recorded no commit count. Unknown is not zero.</p>`:''}</section>`;
    const blocks={result:pair+result,journey,numbers};
    const sequence=order==='journey'?['journey','result','numbers']:order==='numbers'?['numbers','result','journey']:['result','journey','numbers'];
    const chooser=mine&&shareHref?`<nav class="j-lead" aria-label="What a reader sees first"><span class="meta">Lead with</span>${LEADS.map(k=>`<a href="${esc(shareHref(k))}" ${k===order?'aria-current="true"':''}>${k==='result'?'Result':k==='journey'?'Journey':'Numbers'}</a>`).join('')}<span class="meta">The choice travels in the link you share.</span></nav>`:'';
    return chooser+sequence.map(k=>blocks[k]).join('');
  }
  const api={compute,render,lead,LEADS};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveJourney=api;
})(typeof window==='object'?window:globalThis);
