// One card that explains a run at a glance: a measured graph, two or three measured facts, short
// highlights. The whole run first, then the author's lead project, then the other included projects.
// The reader moves with arrows, a labelled selector, the keyboard or a swipe; nothing moves by itself.
// Display choices are the author's and are saved on the profile. They change what is shown, never a
// measurement and never who can see a run. A project is known here by a token, not by its name, so
// a saved choice cannot reveal the name of work that is not shared.
(function(root){
  const pad=n=>String(n).padStart(2,'0'),hm=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const span=s=>s>=3600?`${Math.floor(s/3600)} h ${pad(Math.round(s%3600/60))}`:s>=60?`${Math.round(s/60)} min`:s>0?'under a minute':'not recorded';
  const plural=(n,one)=>`${n} ${n===1?one:one+'s'}`;
  const FACTS={
    projects:{label:'Projects',whole:true},
    commits:{label:'Commits'},
    session:{label:'Session time'},
    elapsed:{label:'First to last'},
    runs:{label:'Runs'},
    tools:{label:'Tool calls'},
    peak:{label:'Runs at once, peak',whole:true}};
  const DEFAULTS={whole:['projects','commits','elapsed'],project:['commits','session','runs']};
  const VISUALS=['trace','photo'];
  async function token(profileId,key,name){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${profileId}|${key}|${name}`));
    return Array.from(new Uint8Array(bytes).slice(0,6),x=>x.toString(16).padStart(2,'0')).join('');
  }
  // Saved choices are untrusted input: anything not in the expected shape is dropped.
  function clean(raw){
    const o=raw&&typeof raw==='object'?raw:{},tok=v=>typeof v==='string'&&/^[a-f0-9]{12}$/.test(v);
    const list=v=>Array.isArray(v)?[...new Set(v.filter(tok))].slice(0,60):[];
    const facts=k=>{const l=Array.isArray(o.facts&&o.facts[k])?[...new Set(o.facts[k].filter(f=>FACTS[f]&&(k==='whole'||!FACTS[f].whole)))].slice(0,3):[];return l.length?l:null};
    return {lead:tok(o.lead)?o.lead:null,order:list(o.order),hidden:list(o.hidden),visual:VISUALS.includes(o.visual)?o.visual:'trace',
      facts:{whole:facts('whole')||DEFAULTS.whole,project:facts('project')||DEFAULTS.project},highlights:o.highlights!==false};
  }
  // The slides, in order. Pure: the same model and choices always give the same card.
  function slides(model,tokens,raw){
    const c=clean(raw),tk=g=>tokens.get(g.label)||'';
    let groups=model.groups.filter(g=>g.label&&!c.hidden.includes(tk(g)));
    const rank=g=>{const i=c.order.indexOf(tk(g));return i<0?1e6:i};
    const leadTok=c.lead&&groups.some(g=>tk(g)===c.lead)?c.lead:(model.lead&&groups.find(g=>g.runs.some(i=>i.run.id===model.lead.run.id))?tk(groups.find(g=>g.runs.some(i=>i.run.id===model.lead.run.id))):null);
    groups=groups.map((g,i)=>({g,i})).sort((a,b)=>(tk(b.g)===leadTok)-(tk(a.g)===leadTok)||rank(a.g)-rank(b.g)||(b.g.result?1:0)-(a.g.result?1:0)||a.i-b.i).map(x=>x.g);
    const commitsOf=g=>g.gitCommits!==null?{n:g.gitCommits,from:'git'}:g.runs.some(i=>i.commits!==null)?{n:g.commits,from:'runs'}:null;
    const ends=g=>{const a=[...g.runs.map(i=>i.start),...g.marks.map(m=>m.from)].sort((x,y)=>x-y)[0],b=[...g.runs.map(i=>i.end),...g.marks.map(m=>m.until)].sort((x,y)=>y-x)[0];return [a,b]};
    const project=g=>{const [a,b]=ends(g),cm=commitsOf(g);
      const said=[...g.runs].filter(i=>i.result).map(i=>({text:i.result,run:i.run,at:i.start})).concat(g.marks.filter(m=>m.result).map(m=>({text:m.result,run:m.run,at:m.until}))).sort((x,y)=>y.at-x.at);
      return {kind:'project',key:tk(g),name:g.label,group:g,open:g.open,from:a,until:b,result:g.result||'',highlights:c.highlights?said.slice(0,3):[],
        facts:{commits:cm?{value:cm.n,note:cm.from==='git'?'from git history':'recorded by the runs'}:{value:null},session:{value:g.seconds>0?span(g.seconds):null,note:'summed across runs'},
          elapsed:{value:a&&b?span((b-a)/1000):null},runs:{value:g.runs.length,note:g.marks.length?`plus ${plural(g.marks.length,'git window')}`:''},
          tools:{value:g.runs.reduce((s,i)=>s+(i.run.tool_calls||i.run.ridge_tool_calls||0),0)||null}}}};
    // A project gets its own view when it has a captured session or a written result. A project known
    // only from git history stays in the totals and the ring, without a view of its own.
    const featured=groups.filter(g=>g.runs.length||g.result),quiet=groups.length-featured.length;
    const per=featured.map(project);
    // The pie: how the run divides between its projects. Commits where any project has a count,
    // otherwise summed session time. The unit is always named beside it.
    const byCommits=groups.some(g=>commitsOf(g)&&commitsOf(g).n>0),weight=g=>byCommits?(commitsOf(g)?commitsOf(g).n:0):g.seconds;
    const sum=groups.reduce((a,g)=>a+weight(g),0),pie={unit:byCommits?'commits':'session time',parts:groups.map(g=>({key:tk(g),name:g.label,value:weight(g),share:sum?weight(g)/sum:0}))};
    per.forEach(p=>{p.pie=pie});
    // Turning points, as one view: every run in the card where the author wrote what came out, newest last.
    const turning=groups.flatMap(g=>g.runs.filter(i=>i.result).map(i=>({text:i.result,run:i.run,at:i.end,name:g.label}))).sort((a,b)=>a.at-b.at);
    const points=turning.length>1?[{kind:'points',key:'',name:'Turning points',points:turning.slice(-6),total:turning.length,facts:{},highlights:[],open:null,pie}]:[];
    if(groups.length<=1)return {choices:c,slides:[...per,...points],lead:leadTok};     // one project: no project carousel
    const all=groups.reduce((s,g)=>{const cm=commitsOf(g);return cm?s+cm.n:s},0),known=groups.some(g=>commitsOf(g));
    const runs=groups.flatMap(g=>g.runs),first=[...groups.map(g=>ends(g)[0])].sort((x,y)=>x-y)[0],last=[...groups.map(g=>ends(g)[1])].sort((x,y)=>y-x)[0];
    const edges=runs.filter(i=>i.seconds>0).flatMap(i=>[[i.start.getTime(),1],[i.end.getTime(),-1]]).sort((x,y)=>x[0]-y[0]||x[1]-y[1]);let now=0,peak=0;for(const [,d] of edges){now+=d;peak=Math.max(peak,now)}
    const lead=per[0],seconds=runs.reduce((s,i)=>s+i.seconds,0);
    const fromGit=groups.filter(g=>commitsOf(g)&&commitsOf(g).from==='git').length,counted=groups.filter(g=>commitsOf(g)).length;
    const whole={kind:'whole',key:'',name:'The run',pie,groups:[...featured,...groups.filter(g=>!featured.includes(g))],quiet,from:first,until:last,result:(leadTok&&lead.result)||'',open:lead.open,
      highlights:c.highlights?per.filter(p=>p.result).slice(0,3).map(p=>({text:p.result,run:p.open,name:p.name})):[],
      facts:{projects:{value:groups.length},commits:{value:known?all:null,note:fromGit===counted?'from git history':fromGit?'git history and runs':'recorded by the runs'},session:{value:seconds>0?span(seconds):null,note:"summed across runs, not one person's hours"},
        elapsed:{value:first&&last?span((last-first)/1000):null},runs:{value:runs.length},tools:{value:runs.reduce((s,i)=>s+(i.run.tool_calls||i.run.ridge_tool_calls||0),0)||null},peak:{value:peak||null}}};
    return {choices:c,slides:[whole,...per,...points],lead:leadTok};
  }
  // Graphs. Time runs left to right on the clock the slide covers. Blue is a captured session; a dark
  // tick is a window in which commits landed. Neither says who did the work.
  function axis(a,b,W,L,R,y){const out=[],total=Math.max(1,b-a),n=3;for(let i=0;i<=n;i++){const t=new Date(a.getTime()+total*i/n),x=L+(W-L-R)*i/n;
      out.push(`<text x="${x.toFixed(1)}" y="${y}" text-anchor="${i===0?'start':i===n?'end':'middle'}" class="dc-axis">${(b-a)>36e5*30||i===0?t.toLocaleDateString(undefined,{weekday:'short'})+' ':''}${hm(t)}</text>`)}return out.join('')}
  function shade(i,n){return `oklch(${(0.42+0.42*i/Math.max(1,n-1)).toFixed(3)} ${(0.22-0.12*i/Math.max(1,n-1)).toFixed(3)} 264)`}
  // One ring. On the run's view every project is a segment; on a project's view its own segment is
  // blue and the rest is grey, so the reader sees its share of the whole.
  function donut(s,esc){
    const P=s.pie;if(!P||P.parts.length<2||!P.parts.some(p=>p.value>0))return '';
    const C=2*Math.PI*40;let acc=0;
    const seg=P.parts.map((p,i)=>{const len=p.share*C,own=s.kind!=='project'||p.key===s.key,d=`<circle r="40" cx="50" cy="50" fill="none" stroke="${s.kind==='project'?(own?'var(--blue)':'var(--rule)'):shade(i,P.parts.length)}" stroke-width="14" stroke-dasharray="${Math.max(0,len-1).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 50 50)"/>`;acc+=len;return d}).join('');
    const mine=s.kind==='project'?P.parts.find(p=>p.key===s.key):null,mid=mine?`${Math.round(mine.share*100)}%`:String(P.parts.length),sub=mine?'of the run':'projects';
    return `<svg class="dc-pie" viewBox="0 0 100 100" role="img" aria-label="${mine?`${esc(s.name)}: ${mid} of the run's ${P.unit}`:`${P.parts.length} projects by ${P.unit}`}">${seg}<text x="50" y="50" text-anchor="middle" class="dc-pie-n">${mid}</text><text x="50" y="63" text-anchor="middle" class="dc-pie-k">${sub}</text></svg>`;
  }
  function wholeGraph(s,esc){
    const lanes=s.groups.slice(0,8),more=s.groups.length-lanes.length,W=360,L=4,R=4,row=27,top=4,H=top+lanes.length*row+18,total=Math.max(1,s.until-s.from);
    const x=t=>L+(t-s.from)/total*(W-L-R);
    const body=lanes.map((g,i)=>{const y=top+i*row;
      return `<text x="${L}" y="${y+10}" class="dc-lane">${esc(g.label)}</text><line x1="${L}" x2="${W-R}" y1="${y+19}" y2="${y+19}" class="dc-base"/>`
        +g.runs.filter(r=>r.seconds>0).map(r=>`<rect x="${x(r.start).toFixed(1)}" y="${y+16}" width="${Math.max(2.5,x(r.end)-x(r.start)).toFixed(1)}" height="5" rx="2.5" class="dc-run"/>`).join('')
        +g.marks.map(m=>`<rect x="${x(m.from).toFixed(1)}" y="${y+22}" width="${Math.max(2,x(m.until)-x(m.from)).toFixed(1)}" height="3" class="dc-mark"/>`).join('')}).join('');
    return `<svg class="dc-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${plural(lanes.length,'project')} on one clock: captured sessions and windows in which commits landed">${body}${axis(s.from,s.until,W,L,R,H-4)}</svg>${more>0?`<p class="dc-more">and ${plural(more,'more project')}${s.quiet?`, ${s.quiet} of them known from commits only`:''}.</p>`:''}`;
  }
  function projectGraph(s){
    const g=s.group,W=360,H=132,L=4,R=4,T=13,B=34,total=Math.max(1,s.until-s.from),x=t=>L+(t-s.from)/total*(W-L-R);
    const marks=g.marks,top=marks.reduce((a,m)=>a+m.commits,0),calls=g.runs.reduce((a,i)=>a+(i.run.tool_calls||i.run.ridge_tool_calls||0),0);
    let line='',label='';
    if(top>0){let d=`M${L} ${H-B}`,acc=0;const y=v=>H-B-(v/top)*(H-T-B);for(const m of marks){d+=` L${x(m.until).toFixed(1)} ${y(acc).toFixed(1)}`;acc+=m.commits;d+=` L${x(m.until).toFixed(1)} ${y(acc).toFixed(1)}`}d+=` L${W-R} ${y(acc).toFixed(1)}`;
      line=`<path d="${d}" class="dc-line"/>`;label=`${plural(top,'commit')} landed, from git history`}
    else if(calls>0&&g.runs.length>1){let d=`M${L} ${H-B}`,acc=0;const y=v=>H-B-(v/calls)*(H-T-B);for(const r of g.runs){d+=` L${x(r.end).toFixed(1)} ${y(acc).toFixed(1)}`;acc+=(r.run.tool_calls||r.run.ridge_tool_calls||0);d+=` L${x(r.end).toFixed(1)} ${y(acc).toFixed(1)}`}
      line=`<path d="${d}" class="dc-line"/>`;label=`${plural(calls,'tool call')} recorded`}
    const runs=g.runs.filter(r=>r.seconds>0).map(r=>`<rect x="${x(r.start).toFixed(1)}" y="${H-B+8}" width="${Math.max(3,x(r.end)-x(r.start)).toFixed(1)}" height="6" rx="3" class="dc-run"/>`).join('');
    const said=g.runs.filter(r=>r.result).map((r,i)=>`<circle cx="${x(r.end).toFixed(1)}" cy="${H-B+11}" r="5.5" class="dc-point"/>`).join('');
    return `<svg class="dc-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label||'Captured sessions over time'}"><line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" class="dc-base"/>${line}${runs}${said}
      ${marks.map(m=>`<rect x="${x(m.from).toFixed(1)}" y="${H-B-3}" width="${Math.max(2.5,x(m.until)-x(m.from)).toFixed(1)}" height="3" class="dc-mark"/>`).join('')}
      ${label?`<text x="${W-R}" y="${T-3}" text-anchor="end" class="dc-axis">${label}</text>`:''}${axis(s.from,s.until,W,L,R,H-4)}</svg>`;
  }
  function render(deck,{esc,mine,author,windowLabel,start=0,setupHref,runHref=(id)=>`/?run=${encodeURIComponent(id)}`}){
    const S=deck.slides;if(!S.length)return '';
    const c=deck.choices,at=Math.max(0,Math.min(S.length-1,start|0)),many=S.length>1;
    const fact=(s,id)=>{const f=s.facts[id];if(!f)return '';return `<div><div class="v">${f.value===null||f.value===undefined?'unknown':esc(String(f.value))}</div><div class="k">${esc(FACTS[id].label)}${f.note&&f.value!==null?`<span>${esc(f.note)}</span>`:''}</div></div>`};
    const slide=(s,i)=>{
      if(s.kind==='points')return `<section class="dc-slide" data-slide="${i}" ${i===at?'':'hidden'} aria-label="Turning points">
        <ol class="dc-points">${s.points.map(p=>`<li><a href="${esc(runHref(p.run.id))}"><span class="dc-when">${esc(p.at.toLocaleDateString(undefined,{weekday:'short'}))} ${hm(p.at)} · ${esc(p.name)}</span>${esc(p.text)}</a></li>`).join('')}</ol>
        ${s.total>s.points.length?`<p class="dc-more">The latest ${s.points.length} of ${s.total}.</p>`:''}</section>`;
      const ids=(s.kind==='whole'?c.facts.whole:c.facts.project).filter(id=>s.facts[id]),ring=donut(s,esc);
      return `<section class="dc-slide" data-slide="${i}" ${i===at?'':'hidden'} aria-label="${esc(s.name)}">
        <div class="dc-top${ring?'':' dc-noring'}">${ring}<div class="dc-facts">${ids.map(id=>fact(s,id)).join('')}</div></div>
        ${ring?`<p class="dc-unit">The ring divides the run by ${esc(s.pie.unit)}.</p>`:''}
        <div class="dc-visual">${s.kind==='whole'?wholeGraph(s,esc):projectGraph(s)}</div>
        <p class="dc-key"><i class="dc-k-run"></i>captured session <i class="dc-k-mark"></i>commits landed${s.kind==='project'&&s.group.runs.some(r=>r.result)?' <i class="dc-k-point"></i>result written':''}<span>Marks show when, never who.</span></p>
        <div class="dc-story">${c.visual==='photo'&&s.open?`<a class="dc-photo" href="${esc(runHref(s.open.id))}" data-thumb-run="${esc(s.open.id)}"></a>`:''}<div>
          ${many&&s.kind==='project'?`<h3 class="dc-name">${esc(s.name)}</h3>`:''}${s.result?`<p class="dc-said">${esc(s.result)}</p>`:`<p class="dc-said dc-none">${mine?'No result written yet. Open the run and say what came out of it.':'No result written.'}</p>`}
          ${s.highlights.length?`<ul class="dc-high">${s.highlights.filter(h=>h.text!==s.result).map(h=>`<li><a href="${esc(runHref(h.run.id))}">${h.name?`<b>${esc(h.name)}</b> `:''}${esc(h.text)}</a></li>`).join('')}</ul>`:''}
          ${s.open?`<p class="dc-open"><a href="${esc(runHref(s.open.id))}">Open ${s.kind==='whole'?'the lead run':'this run'}: timeline, evidence, photos →</a></p>`:''}</div></div></section>`};
    const lead=S.find(x=>x.open);
    return `<article class="card dc" id="day-card" tabindex="0" data-at="${at}" data-count="${S.length}" aria-roledescription="${many?'carousel':'card'}">
      <header class="dc-head"><p class="meta">${esc(author||'')}${author?' · ':''}${esc(windowLabel)}</p></header>
      ${many?`<nav class="dc-nav" aria-label="Views of this run"><button type="button" class="dc-arrow" data-step="-1" aria-label="Previous view">‹</button>
        <div class="dc-tabs" role="tablist">${S.map((s,i)=>`<button type="button" role="tab" data-go="${i}" aria-selected="${i===at}">${esc(s.name)}</button>`).join('')}</div>
        <button type="button" class="dc-arrow" data-step="1" aria-label="Next view">›</button></nav><p class="dc-pos" aria-live="polite"><b>${esc(S[at].name)}</b> · ${at+1} of ${S.length}</p>`:''}
      ${S.map(slide).join('')}
      ${lead?`<footer class="dc-actions"><a class="act blue" href="${esc(runHref(lead.open.id))}&ack=1">Kudos</a><a class="act" href="#day-thread" data-comment>Comment</a></footer>`:''}
      ${mine&&setupHref?`<p class="dc-setup"><a href="${esc(setupHref)}">Set up this card</a><span class="meta">What it shows and in which order. It changes no measurement and no audience.</span></p>`:''}</article>`;
  }
  // Arrows, the selector, the keyboard and a swipe all go through one function. Nothing moves on its own.
  function wire(card,{onChange}={}){
    if(!card)return;const count=+card.dataset.count;if(count<2)return;
    const go=n=>{const at=Math.max(0,Math.min(count-1,n));if(at===+card.dataset.at)return;card.dataset.at=at;
      card.querySelectorAll('.dc-slide').forEach(s=>{s.hidden=+s.dataset.slide!==at});
      card.querySelectorAll('[role=tab]').forEach(t=>{const on=+t.dataset.go===at;t.setAttribute('aria-selected',on);if(on)t.scrollIntoView({block:'nearest',inline:'center'})});
      const name=card.querySelector(`[data-go="${at}"]`).textContent;card.querySelector('.dc-pos').innerHTML=`<b></b> · ${at+1} of ${count}`;card.querySelector('.dc-pos b').textContent=name;
      card.querySelector('[data-step="-1"]').disabled=at===0;card.querySelector('[data-step="1"]').disabled=at===count-1;if(onChange)onChange(at)};
    card.addEventListener('click',e=>{const say=e.target.closest('[data-comment]');if(say){const box=document.querySelector('#day-thread textarea');if(box){e.preventDefault();box.scrollIntoView({block:'center'});box.focus()}return}
      const t=e.target.closest('[data-go],[data-step]');if(!t)return;go(t.dataset.go!==undefined?+t.dataset.go:+card.dataset.at+ +t.dataset.step)});
    card.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select'))return;if(e.key==='ArrowRight'){e.preventDefault();go(+card.dataset.at+1)}else if(e.key==='ArrowLeft'){e.preventDefault();go(+card.dataset.at-1)}});
    let x0=null,y0=null;card.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
    card.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5)go(+card.dataset.at+(dx<0?1:-1))},{passive:true});
    card.querySelector('[data-step="-1"]').disabled=+card.dataset.at===0;card.querySelector('[data-step="1"]').disabled=+card.dataset.at===count-1;
  }
  // Setup: the author's display choices for this card. The preview under the form is the real card,
  // drawn from the same function a reader gets. Saving writes the choices; it never touches a run.
  function mountSetup({slot,model,tokens,saved,esc,save,renderOpts,readerHref,onPreview}){
    const all=model.groups.filter(g=>g.label),tk=g=>tokens.get(g.label)||'',c=clean(saved);
    const first=slides(model,tokens,saved);let order=all.slice().sort((a,b)=>{const i=x=>{const n=c.order.indexOf(tk(x));return n<0?1e6:n};return i(a)-i(b)}).map(tk);
    const hidden=new Set(c.hidden.filter(t=>order.includes(t)));let lead=first.lead,visual=c.visual,highlights=c.highlights,facts={whole:[...c.facts.whole],project:[...c.facts.project]};
    const name=t=>all.find(g=>tk(g)===t).label;
    const current=()=>({lead:lead&&!hidden.has(lead)?lead:null,order:[...order],hidden:[...hidden],visual,highlights,facts:{whole:[...facts.whole],project:[...facts.project]}});
    slot.innerHTML=`<div class="head"><h1>Set up this card</h1></div>
      <p class="hint">This changes what the card shows and in which order. It changes no measurement and it shares nothing: who can see a run is still set under "Choose what readers see".</p>
      <div class="card ds-form"><h2>Projects</h2><ol class="cs-list" id="cs-list"></ol>
        <h2>Picture</h2><label class="cs-opt"><input type="radio" name="cs-visual" value="trace"> Graph only</label><label class="cs-opt"><input type="radio" name="cs-visual" value="photo"> Graph and one small picture from the run</label>
        <h2>Numbers on the run's view <span class="meta">up to three</span></h2><div class="cs-facts" data-k="whole"></div>
        <h2>Numbers on a project's view <span class="meta">up to three</span></h2><div class="cs-facts" data-k="project"></div>
        <label class="cs-opt"><input type="checkbox" id="cs-high"> Show short highlights under the result</label>
        <div class="dd-foot"><button type="button" class="act blue" id="cs-save">Save</button><span id="cs-state" role="status"></span>${readerHref?`<a href="${esc(readerHref)}">See what a reader sees</a>`:''}</div></div>
      <div class="head"><h2>Preview</h2><span class="meta">the card as it will show</span></div><div id="cs-preview"></div>`;
    const list=slot.querySelector('#cs-list'),state=slot.querySelector('#cs-state');let dirty=false;
    function paint(){
      list.innerHTML=order.map((t,i)=>`<li data-t="${t}"><label><input type="checkbox" data-inc ${hidden.has(t)?'':'checked'} aria-label="Include ${esc(name(t))}"> <b>${esc(name(t))}</b></label>
        <label class="cs-lead"><input type="radio" name="cs-lead" value="${t}" ${lead===t&&!hidden.has(t)?'checked':''} ${hidden.has(t)?'disabled':''}> main project</label>
        <span class="cs-move"><button type="button" data-move="-1" ${i===0?'disabled':''} aria-label="Move ${esc(name(t))} up">↑</button><button type="button" data-move="1" ${i===order.length-1?'disabled':''} aria-label="Move ${esc(name(t))} down">↓</button></span></li>`).join('');
      slot.querySelectorAll('[name=cs-visual]').forEach(r=>{r.checked=r.value===visual});slot.querySelector('#cs-high').checked=highlights;
      slot.querySelectorAll('.cs-facts').forEach(box=>{const k=box.dataset.k;box.innerHTML=Object.entries(FACTS).filter(([,f])=>k==='whole'||!f.whole).map(([id,f])=>`<label class="cs-opt"><input type="checkbox" data-fact="${id}" ${facts[k].includes(id)?'checked':''} ${!facts[k].includes(id)&&facts[k].length>=3?'disabled':''}> ${esc(f.label)}</label>`).join('')});
      const deck=slides(model,tokens,current());slot.querySelector('#cs-preview').innerHTML=render(deck,{...renderOpts,mine:false,setupHref:null});wire(slot.querySelector('#cs-preview #day-card'));if(onPreview)onPreview(slot.querySelector('#cs-preview'));
      state.textContent=dirty?'Not saved yet.':'';
    }
    slot.addEventListener('change',e=>{const t=e.target,li=t.closest('li[data-t]');
      if(t.dataset.inc!==undefined){t.checked?hidden.delete(li.dataset.t):hidden.add(li.dataset.t)}
      else if(t.name==='cs-lead'){lead=t.value}else if(t.name==='cs-visual'){visual=t.value}else if(t.id==='cs-high'){highlights=t.checked}
      else if(t.dataset.fact){const k=t.closest('.cs-facts').dataset.k;facts[k]=t.checked?[...facts[k],t.dataset.fact].slice(0,3):facts[k].filter(f=>f!==t.dataset.fact)}
      else return;dirty=true;paint()});
    slot.addEventListener('click',async e=>{const m=e.target.closest('[data-move]');
      if(m){const li=m.closest('li'),i=order.indexOf(li.dataset.t),j=i+ +m.dataset.move;if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];dirty=true;paint();slot.querySelector(`li[data-t="${order[j]}"] [data-move="${m.dataset.move}"]`)?.focus();return}
      if(e.target.id==='cs-save'){e.target.disabled=true;state.textContent='Saving…';const error=await save(current());e.target.disabled=false;dirty=!!error;state.textContent=error?`Not saved: ${error}`:'Saved. Readers get this card.'}});
    paint();
  }
  const api={slides,render,wire,clean,token,mountSetup,FACTS,DEFAULTS,VISUALS};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveDayCard=api;
})(typeof window==='object'?window:globalThis);
