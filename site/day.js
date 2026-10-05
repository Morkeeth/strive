// One day of one builder's runs as a single page: photo, where the commits landed, each run on a
// shared clock, and the lead run's own comment thread. It is a VIEW over existing run rows. It adds
// no table and no column, so a day has no text of its own: the headline is counted, and the
// question and the comments belong to one run, named here the lead run.
(function(root){
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  const pad=n=>String(n).padStart(2,'0');
  const localDay=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  // A run recovered from git history ("Recover an older build") carries no session clock. The
  // database refuses started_at and commits on it, so its day is the end of its own repository
  // window and its commit count is the one inside history_evidence.
  const evidenceOf=r=>{const e=r&&r.trace_basis==='historical-reconstruction'&&r.history_evidence;return e&&Number.isSafeInteger(e.repo_commits)&&e.repo_commits>=0&&Number.isFinite(Date.parse(e.repo_window_end))?e:null};
  const startOf=r=>{const e=evidenceOf(r),d=e?new Date(Date.parse(e.repo_window_end)-1):new Date(r.started_at||r.created_at);return Number.isFinite(d.getTime())?d:null};
  const secondsOf=r=>Math.max(0,Number(r.wall_time_s||r.duration_s||0)||0);
  const resultOf=r=>[r.story_result,r.caption,r.note].find(v=>typeof v==='string'&&v.trim())||'';
  const modelsOf=r=>{const m=r.capture_metadata&&Array.isArray(r.capture_metadata.models)?r.capture_metadata.models:(typeof r.model==='string'&&r.model?[r.model]:[]);return [...new Set(m.filter(v=>typeof v==='string'&&v))]};
  function shift(day,delta){const [y,m,d]=day.split('-').map(Number);return localDay(new Date(y,m-1,d+delta))}
  // Everything the page shows is computed here from run rows, so it can be tested without a browser.
  function compute(runs,day,projectLabel=v=>v){
    if(!DAY.test(day))throw new Error('A day is written YYYY-MM-DD');
    const items=[],recovered=[];
    for(const r of runs||[]){
      const start=startOf(r);if(!start||localDay(start)!==day)continue;
      const evidence=evidenceOf(r);
      if(evidence){recovered.push({run:r,start,label:projectLabel(r.project)||String(r.title||'Recovered build'),raw:projectLabel(r.project)?r.project:null,commits:evidence.repo_commits});continue;}
      const seconds=secondsOf(r),label=projectLabel(r.project)||'',result=resultOf(r).trim();
      items.push({run:r,start,end:new Date(start.getTime()+seconds*1000),seconds,label,raw:r.project,result,models:modelsOf(r),
        commits:Number.isFinite(r.commits)?Math.max(0,r.commits):null});
    }
    items.sort((a,b)=>a.start-b.start);
    // A run with neither a project nor a written result says nothing a reader can use on its own.
    // It is kept and counted, folded into one row, never dropped and never given a guessed name.
    const lines=items.filter(i=>i.label||i.result),plumbing=items.filter(i=>!i.label&&!i.result);
    const by=new Map();
    // The page links to a project by the stored value, as every other link in the app does. The
    // label is only what is shown. A recovered row with no project has nothing to link to.
    const slot=(name,raw)=>{const p=by.get(name)||{name,raw:null,commits:0,runs:0,unknown:0,fromGit:null};if(p.raw===null&&raw!=null)p.raw=raw;by.set(name,p);return p};
    for(const i of items){if(!i.label)continue;const p=slot(i.label,i.raw);p.runs++;if(i.commits===null)p.unknown++;else p.commits+=i.commits}
    // Git history and a session can count the same commits. They are never added: where a project
    // has a recovered count for the day, that count stands alone and says where it came from.
    for(const g of recovered){const p=slot(g.label,g.raw);p.fromGit=(p.fromGit||0)+g.commits}
    for(const p of by.values())if(p.fromGit!==null)p.commits=p.fromGit;
    const projects=[...by.values()].sort((a,b)=>b.commits-a.commits||b.runs-a.runs||a.name.localeCompare(b.name));
    const timed=items.filter(i=>i.seconds>0);
    const edges=timed.flatMap(i=>[[i.start.getTime(),1],[i.end.getTime(),-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    let now=0,peak=0,peakAt=null;for(const [t,d] of edges){now+=d;if(now>peak){peak=now;peakAt=new Date(t)}}
    const first=items.length?items[0].start:null,last=items.reduce((m,i)=>!m||i.end>m?i.end:m,null);
    const from=first?new Date(first.getFullYear(),first.getMonth(),first.getDate(),first.getHours()):null;
    const until=last?new Date(Math.ceil(last.getTime()/3600000)*3600000):null;
    const models=new Map();for(const i of items)for(const m of i.models)models.set(m,(models.get(m)||0)+1);
    const lead=(items.find(i=>typeof i.run.feedback_question==='string'&&i.run.feedback_question.trim())
      ||items.find(i=>i.run.pinned_at)||[...lines].sort((a,b)=>(b.commits||0)-(a.commits||0))[0]||items[0]||null);
    const unlabelled=items.filter(i=>!i.label).reduce((a,i)=>a+(i.commits||0),0);
    // One row per project on the page, however many sittings it took. Every run stays reachable:
    // the row opens the run that says what came out, and names how many runs are behind it.
    const grouped=new Map();
    for(const i of lines){const key=i.label||'run:'+i.run.id,g=grouped.get(key)||{label:i.label,raw:i.raw,runs:[],seconds:0,commits:0,models:new Set(),harnesses:new Set(),result:'',open:null};
      g.runs.push(i);g.seconds+=i.seconds;g.commits+=i.commits||0;i.models.forEach(m=>g.models.add(m));if(i.run.harness)g.harnesses.add(i.run.harness);
      if(i.result){g.result=i.result;g.open=i.run}grouped.set(key,g)}
    const groups=[...grouped.values()].map(g=>({...g,open:g.open||g.runs[g.runs.length-1].run,models:[...g.models],harnesses:[...g.harnesses],
      allPrivate:g.runs.every(i=>i.run.visibility==='private')})).sort((a,b)=>(b.result?1:0)-(a.result?1:0)||a.runs[0].start-b.runs[0].start);
    return {day,items,recovered,lines,groups,plumbing,projects,peak,peakAt,from,until,lead,
      commits:projects.reduce((a,p)=>a+p.commits,0)+unlabelled,commitsUnknown:items.filter(i=>i.commits===null&&!(i.label&&by.get(i.label).fromGit!==null)).length,
      hours:first&&last?Math.round((last-first)/360000)/10:0,
      lineSeconds:lines.reduce((a,i)=>a+i.seconds,0),plumbingSeconds:plumbing.reduce((a,i)=>a+i.seconds,0),
      models:[...models.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))};
  }
  const hm=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const span=s=>s>=3600?`${Math.floor(s/3600)} h ${pad(Math.round(s%3600/60))}`:s>=60?`${Math.round(s/60)} min`:s>0?'under a minute':'time not recorded';
  const plural=(n,one,many)=>`${n} ${n===1?one:(many||one+'s')}`;
  function render(model,{esc,mine,dayLabel,publicHref,editHref=id=>`/?run=${encodeURIComponent(id)}`}){
    const D=model,total=D.from&&D.until?Math.max(1,D.until-D.from):1;
    const at=d=>Math.max(0,Math.min(100,(d-D.from)/total*100));
    const shade=(i,n)=>`oklch(${(0.42+0.42*i/Math.max(1,n-1)).toFixed(3)} ${(0.22-0.12*i/Math.max(1,n-1)).toFixed(3)} 264)`;
    const withCommits=D.projects.filter(p=>p.commits>0);
    const headline=D.commits>0?(withCommits.length?`${plural(D.commits,'commit')} across ${plural(withCommits.length,'project')}.`:`${plural(D.commits,'commit')}.`)
      :D.projects.length&&D.items.length?`${plural(D.items.length,'run')} across ${plural(D.projects.length,'project')}.`:`${plural(D.items.length,'run')}.`;
    const hours=[];if(D.from&&D.until)for(let t=D.from.getTime();t<=D.until.getTime();t+=3600000)hours.push(new Date(t));
    const step=Math.max(1,Math.ceil(hours.length/6));
    const axis=hours.filter((_,i)=>i%step===0).map(h=>`<span style="left:${at(h).toFixed(2)}%">${hm(h)}</span>`).join('');
    const bar=i=>`<i class="day-bar" style="left:${at(i.start).toFixed(2)}%;width:${Math.max(0.8,at(i.end)-at(i.start)).toFixed(2)}%"></i>`;
    const line=g=>{const chips=[...g.harnesses.map(h=>`<span class="day-chip">${esc(h)}</span>`),...g.models.map(m=>`<span class="day-chip">${esc(m)}</span>`),
        g.commits?`<span class="day-chip day-chip-on">${plural(g.commits,'commit')}</span>`:'',g.allPrivate?'<span class="day-chip">Only you</span>':'',
        g.runs.length>1&&g.label?`<a class="day-chip day-more" href="/?project=${encodeURIComponent(g.raw)}&scope=${mine?'mine':'public'}">${g.runs.length} runs</a>`:''].join('');
      const first=g.runs[0].start,last=g.runs.reduce((m,i)=>i.end>m?i.end:m,g.runs[0].end);
      return `<div class="day-line"><a class="day-what day-open" href="/?run=${encodeURIComponent(g.open.id)}"><b>${esc(g.label||'No project named')}</b>`
        +(g.result?`<span>${esc(g.result)}</span>`:`<span class="day-missing">${mine?'No result written yet. Open the run to say what came out of it.':'No result written.'}</span>`)
        +`</a><span class="day-when"><span class="day-track">${g.runs.filter(i=>i.seconds>0).map(bar).join('')}</span><span class="day-facts">${chips}<span class="day-t">${hm(first)}${g.seconds>0?` to ${hm(last)}`:''} · ${span(g.seconds)}</span></span></span></div>`};
    const strip=withCommits.length?`<div class="head"><h2>Where the commits landed</h2><span class="meta">${plural(withCommits.length,'project')}</span></div><div class="card day-commits">
      <div class="day-strip" role="img" aria-label="One segment per project, width by commits">${withCommits.map((p,i)=>`<i style="flex:${p.commits};background:${shade(i,withCommits.length)}" title="${esc(p.name)}: ${p.commits}"></i>`).join('')}</div>
      <ul class="day-repos">${withCommits.map((p,i)=>`<li><i style="background:${shade(i,withCommits.length)}"></i>${p.raw!=null?`<a href="/?project=${encodeURIComponent(p.raw)}&scope=${mine?'mine':'public'}">${esc(p.name)}</a>`:`<span class="day-name">${esc(p.name)}</span>`}<span class="meta">${p.fromGit!==null?'from git history':plural(p.runs,'run')}</span><b>${p.commits}</b></li>`).join('')}</ul>
      ${D.commitsUnknown?`<p class="hint">${plural(D.commitsUnknown,'run')} recorded no commit count, so ${D.commitsUnknown===1?'it is':'they are'} not in this strip. Unknown is not zero.</p>`:''}${D.recovered.length?`<p class="hint">${plural(D.recovered.length,'project')} counted from git history, recovered by the owner. Git history says a commit exists on that day. It does not say which run made it.</p>`:''}</div>`:'';
    const sum=D.lineSeconds+D.plumbingSeconds,share=sum?D.lineSeconds/sum:0,C=2*Math.PI*42;
    const spent=sum&&D.plumbing.length?`<div class="day-spent"><svg viewBox="0 0 120 120" role="img" aria-label="Recorded time: named work against plumbing"><circle r="42" cx="60" cy="60" fill="none" stroke="var(--rule)" stroke-width="16"/><circle r="42" cx="60" cy="60" fill="none" stroke="var(--blue)" stroke-width="16" stroke-dasharray="${(share*C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 60 60)"/></svg>
      <ul><li><i style="background:var(--blue)"></i>Named work<b>${span(D.lineSeconds)}</b></li><li><i style="background:var(--rule)"></i>Plumbing<b>${span(D.plumbingSeconds)}</b></li></ul></div>`:'';
    const models=D.models.length?`<ul class="day-models">${D.models.map(([m,n])=>`<li><span>${esc(m)}</span><i style="width:${(n/D.models[0][1]*100).toFixed(0)}%"></i><b>${n}</b></li>`).join('')}</ul>`:'';
    const lead=D.lead&&D.lead.run,q=lead&&typeof lead.feedback_question==='string'?lead.feedback_question.trim():'';
    return `<section class="day-hero"><div class="day-photo card" data-run-id="${lead?esc(lead.id):''}" data-photo-layout="${lead&&lead.photo_layout?esc(lead.photo_layout):'cover'}"><div class="run-title-row"></div></div>
      <div class="day-head"><p class="meta">${esc(dayLabel)}</p><h1>${esc(headline)}</h1>
      ${D.peak>=3?`<p class="day-badge"><b>PARALLELISER</b><span>${D.peak} runs going at once at ${hm(D.peakAt)}</span></p>`:''}
      <div class="ptotals num day-nums"><div><div class="v">${D.commits>0?withCommits.length:D.projects.length}</div><div class="k">Projects</div></div><div><div class="v">${D.commits}</div><div class="k">Commits</div></div><div><div class="v">${D.items.length}</div><div class="k">Runs</div></div><div><div class="v">${D.hours}</div><div class="k">Hours, first to last</div></div></div>
      ${mine&&publicHref?`<p class="hint">You see every run of the day. <a href="${esc(publicHref)}">See what others see</a>: only the runs you made public.</p>`:''}</div></section>
      ${strip}
      <div class="head"><h2>What got done</h2><span class="meta">${plural(D.groups.length,'project')} · ${plural(D.lines.length,'run')}</span></div>
      <div class="card day-sheet">${D.lines.length?`<div class="day-axis">${axis}</div>${D.groups.map(line).join('')}`:'<div class="empty"><h3>No named work on this day</h3><p>A run appears here once it has a project or a written result.</p></div>'}
      ${D.plumbing.length?`<details class="day-plumbing"><summary><b>Plumbing</b> ${plural(D.plumbing.length,'run')} with no project and no written result · ${span(D.plumbingSeconds)}<span class="day-track">${D.plumbing.filter(i=>i.seconds>0).map(bar).join('')}</span></summary>
        <ul>${D.plumbing.map(i=>`<li><a href="${esc(editHref(i.run.id))}">${esc(i.run.harness||'Run')} · ${hm(i.start)} · ${span(i.seconds)}</a></li>`).join('')}</ul>
        <p class="hint">Lineage is not recorded: which run started which is unknown, so these stay side by side.</p></details>`:''}</div>
      ${spent||models?`<div class="head"><h2>How the day was spent</h2></div><div class="card day-how">${spent}${models?`<div><p class="meta">Models, by number of runs that recorded each</p>${models}</div>`:''}</div>`:''}
      <div class="head"><h2>Ask the room</h2><span class="meta">${lead?'on the lead run':''}</span></div>
      ${lead?`<div class="card day-ask">${q?`<div class="fc-question"><span>The maker asks</span>${esc(q)}</div>`:`<p class="hint">${mine?`No question yet. <a href="${esc(editHref(lead.id))}">Write one on the lead run</a> and it shows here.`:'The maker has not asked a question on this day.'}</p>`}
        <section id="day-thread"></section><p class="hint">Replies belong to <a href="/?run=${encodeURIComponent(lead.id)}">${esc(lead.title||'the lead run')}</a>. A day has no thread of its own.</p></div>`:''}`;
  }
  const api={compute,render,localDay,shift,isDay:v=>DAY.test(String(v||''))};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveDay=api;
})(typeof window==='object'?window:globalThis);
