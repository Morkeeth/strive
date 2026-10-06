// One card that explains a run at a glance: a measured graph, two or three measured facts, short
// highlights. The whole run first, then the author's lead project, then the other included projects.
// The reader moves with arrows, a labelled selector, the keyboard or a swipe; nothing moves by itself.
// Display choices are the author's and are saved on the profile. They change what is shown, never a
// measurement and never who can see a run. A project is known here by a token, not by its name, so
// a saved choice cannot reveal the name of work that is not shared.
// The rules this file implements are written down in docs/design/CARD-SYSTEM.md. Read it before changing a card.
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
  // The one main visual of a card page. Data is the measured trace. Photo and Screenshot are a picture the
  // author chose from their own runs; the author says which it is, nothing here guesses it.
  const VISUALS=['data','photo','screenshot'],FOCUS={center:'50% 50%',top:'50% 0%',bottom:'50% 100%',left:'0% 50%',right:'100% 50%'},UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function token(profileId,key,name){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${profileId}|${key}|${name}`));
    return Array.from(new Uint8Array(bytes).slice(0,6),x=>x.toString(16).padStart(2,'0')).join('');
  }
  // Saved choices are untrusted input: anything not in the expected shape is dropped.
  function clean(raw){
    const o=raw&&typeof raw==='object'?raw:{},tok=v=>typeof v==='string'&&/^[a-f0-9]{12}$/.test(v);
    const list=v=>Array.isArray(v)?[...new Set(v.filter(tok))].slice(0,60):[];
    const facts=k=>{const l=Array.isArray(o.facts&&o.facts[k])?[...new Set(o.facts[k].filter(f=>FACTS[f]&&(k==='whole'||!FACTS[f].whole)))].slice(0,3):[];return l.length?l:null};
    const photo=o.photo&&UUID.test(o.photo.run)&&UUID.test(o.photo.id)?{run:o.photo.run,id:o.photo.id}:null;
    // Choices saved before version 2 had one picture under the heading "Screenshot" and no way to say photo.
    // They keep their picture, shown whole as a screenshot, and the overview goes back to the measured trace.
    const v2=o.v===2,visual=!photo?'data':v2?(VISUALS.includes(o.visual)?o.visual:'data'):'screenshot';
    return {v:2,lead:tok(o.lead)?o.lead:null,order:list(o.order),hidden:list(o.hidden),visual,hero:v2&&o.hero===true&&visual!=='data',focus:v2&&FOCUS[o.focus]?o.focus:'center',
      facts:{whole:facts('whole')||DEFAULTS.whole,project:facts('project')||DEFAULTS.project},highlights:o.highlights!==false,photo,title:typeof o.title==='string'?o.title.replace(/\s+/g,' ').trim().slice(0,140):''};
  }
  // The slides, in order. Pure: the same model and choices always give the same card.
  function slides(model,tokens,raw){
    const c=clean(raw),tk=g=>tokens.get(g.label)||'';
    // The headline is only ever a sentence the author wrote in a run's result field. A note, a title or a
    // project description is never promoted to a result.
    // A highlight is one or two plain sentences. A sentence that carries a commit hash is release
    // bookkeeping: it stays on the run's own page and is left off the card.
    const brief=t=>(String(t).match(/[^.!?]+[.!?]*\s*/g)||[]).filter(x=>!/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/.test(x)).join('').trim();
    const wrote=r=>r&&typeof r.story_result==='string'?r.story_result.trim():'';
    let groups=model.groups.filter(g=>g.label&&!c.hidden.includes(tk(g)));
    // Older imports may have no project field. Keep their real sessions visible without
    // inventing a project count. Do not use this path when named projects were hidden.
    if(!model.groups.some(g=>g.label)&&model.items.length){
      const runs=model.items,open=model.lead?.run||runs[0].run;
      groups=[{label:'Runs without a project',raw:null,runs,marks:[],gitCommits:null,
        seconds:runs.reduce((n,i)=>n+i.seconds,0),commits:runs.reduce((n,i)=>n+(i.commits||0),0),
        result:wrote(open),open}];
    }
    const rank=g=>{const i=c.order.indexOf(tk(g));return i<0?1e6:i};
    const leadTok=c.lead&&groups.some(g=>tk(g)===c.lead)?c.lead:(model.lead&&groups.find(g=>g.runs.some(i=>i.run.id===model.lead.run.id))?tk(groups.find(g=>g.runs.some(i=>i.run.id===model.lead.run.id))):null);
    groups=groups.map((g,i)=>({g,i})).sort((a,b)=>(tk(b.g)===leadTok)-(tk(a.g)===leadTok)||rank(a.g)-rank(b.g)||(b.g.result?1:0)-(a.g.result?1:0)||a.i-b.i).map(x=>x.g);
    const commitsOf=g=>g.gitCommits!==null?{n:g.gitCommits,from:'git'}:g.runs.some(i=>i.commits!==null)?{n:g.commits,from:'runs'}:null;
    const ends=g=>{const a=[...g.runs.map(i=>i.start),...g.marks.map(m=>m.from)].sort((x,y)=>x-y)[0],b=[...g.runs.map(i=>i.end),...g.marks.map(m=>m.until)].sort((x,y)=>y-x)[0];return [a,b]};
    const told=g=>{if(g.result&&g.open&&wrote(g.open)===g.result)return {result:g.result,open:g.open};
      const last=[...g.runs].filter(i=>wrote(i.run)).sort((x,y)=>y.end-x.end)[0];if(last)return {result:wrote(last.run),open:last.run};
      const mark=[...g.marks].filter(m=>m.result&&wrote(m.run)===m.result).sort((x,y)=>y.until-x.until)[0];return mark?{result:mark.result,open:mark.run}:{result:'',open:g.open}};
    // The chosen picture shows only where its run is in view: a reader who cannot see that run gets no trace of it.
    const holds=g=>!!c.photo&&c.visual!=='data'&&(g.runs.some(i=>i.run.id===c.photo.run)||g.marks.some(m=>m.run.id===c.photo.run));
    // lone says the picture's run is not public, so only its owner is looking at it here.
    const picture=g=>{if(!holds(g))return null;const r=[...g.runs.map(i=>i.run),...g.marks.map(m=>m.run)].find(x=>x.id===c.photo.run);
      return {kind:c.visual,run:c.photo.run,id:c.photo.id,focus:c.focus,lone:!!r.visibility&&r.visibility!=='public',of:g.label}};
    const project=g=>{const [a,b]=ends(g),cm=commitsOf(g);
      const said=[...g.runs].filter(i=>wrote(i.run)).map(i=>({text:wrote(i.run),run:i.run,at:i.start})).concat(g.marks.filter(m=>m.result).map(m=>({text:m.result,run:m.run,at:m.until}))).sort((x,y)=>y.at-x.at);
      return {kind:'project',key:tk(g),name:g.label,group:g,visual:picture(g),open:told(g).open,from:a,until:b,result:told(g).result,highlights:c.highlights?said.slice(0,3):[],
        facts:{commits:cm?{value:cm.n,note:cm.from==='git'?'from git history':'recorded by the runs'}:{value:null},session:{value:g.seconds>0?span(g.seconds):null,note:'summed across runs'},
          elapsed:{value:a&&b?span((b-a)/1000):null},runs:{value:g.runs.length,note:g.marks.length?`plus ${plural(g.marks.length,'git window')}`:''},
          tools:{value:g.runs.reduce((s,i)=>s+(i.run.tool_calls||i.run.ridge_tool_calls||0),0)||null}}}};
    // A project gets its own view when it has a captured session or a written result. A project known
    // only from git history stays in the totals and the ring, without a view of its own.
    const featured=groups.filter(g=>g.runs.length||told(g).result),quiet=groups.length-featured.length;
    const per=featured.map(project);
    // The pie: how the run divides between its projects. Commits where any project has a count,
    // otherwise summed session time. The unit is always named beside it.
    const byCommits=groups.some(g=>commitsOf(g)&&commitsOf(g).n>0),weight=g=>byCommits?(commitsOf(g)?commitsOf(g).n:0):g.seconds;
    const sum=groups.reduce((a,g)=>a+weight(g),0),pie={unit:byCommits?'commits':'session time',parts:groups.map(g=>({key:tk(g),name:g.label,value:weight(g),share:sum?weight(g)/sum:0}))};
    per.forEach(p=>{p.pie=pie});
    // Turning points, as one view: every run in the card where the author wrote what came out, newest last.
    const turning=groups.flatMap(g=>g.runs.filter(i=>wrote(i.run)).map(i=>({text:wrote(i.run),run:i.run,at:i.end,name:g.label}))).sort((a,b)=>a.at-b.at);
    const points=turning.length>1?[{kind:'points',key:'points',name:'Turning points',points:turning.slice(-5),total:turning.length,facts:{},highlights:[],open:null,pie}]:[];
    if(groups.length<=1)return {choices:c,slides:[...per,...points],lead:leadTok};     // one project: no project carousel
    const all=groups.reduce((s,g)=>{const cm=commitsOf(g);return cm?s+cm.n:s},0),known=groups.some(g=>commitsOf(g));
    const runs=groups.flatMap(g=>g.runs),first=[...groups.map(g=>ends(g)[0])].sort((x,y)=>x-y)[0],last=[...groups.map(g=>ends(g)[1])].sort((x,y)=>y-x)[0];
    const edges=runs.filter(i=>i.seconds>0).flatMap(i=>[[i.start.getTime(),1],[i.end.getTime(),-1]]).sort((x,y)=>x[0]-y[0]||x[1]-y[1]);let now=0,peak=0;for(const [,d] of edges){now+=d;peak=Math.max(peak,now)}
    const lead=per[0],seconds=runs.reduce((s,i)=>s+i.seconds,0);
    const fromGit=groups.filter(g=>commitsOf(g)&&commitsOf(g).from==='git').length,counted=groups.filter(g=>commitsOf(g)).length;
    const whole={kind:'whole',key:'',name:'Overview',pie,visual:c.hero&&groups.some(holds)?picture(groups.find(holds)):null,groups:[...featured,...groups.filter(g=>!featured.includes(g))],quiet,from:first,until:last,result:c.title||`One run across ${plural(groups.length,'project')}`,draft:!c.title,open:lead.open,
      highlights:c.highlights?per.filter(p=>p.result).map(p=>({text:brief(p.result),run:p.open,name:p.name})).filter(h=>h.text).slice(0,3):[],
      facts:{projects:{value:groups.length},commits:{value:known?all:null,note:fromGit===counted?'from git history':fromGit?'git history and runs':'recorded by the runs'},session:{value:seconds>0?span(seconds):null,note:"summed across runs, not one person's hours"},
        elapsed:{value:first&&last?span((last-first)/1000):null},runs:{value:runs.length},tools:{value:runs.reduce((s,i)=>s+(i.run.tool_calls||i.run.ridge_tool_calls||0),0)||null},peak:{value:peak||null}}};
    return {choices:c,slides:[whole,...per,...points],lead:leadTok};
  }
  // Graphs. Time runs left to right on the clock the slide covers. Blue is a captured session; a dark
  // tick is a window in which commits landed. Neither says who did the work.
  function axis(a,b,W,L,R,y){const out=[],total=Math.max(1,b-a),n=3;for(let i=0;i<=n;i++){const t=new Date(a.getTime()+total*i/n),x=L+(W-L-R)*i/n;
      out.push(`<text x="${x.toFixed(1)}" y="${y}" text-anchor="${i===0?'start':i===n?'end':'middle'}" class="dc-axis">${(b-a)>36e5*30||i===0?t.toLocaleDateString(undefined,{weekday:'short'})+' ':''}${hm(t)}</text>`)}return out.join('')}
  function shade(i,n){return `oklch(${(0.42+0.42*i/Math.max(1,n-1)).toFixed(3)} ${(0.22-0.12*i/Math.max(1,n-1)).toFixed(3)} 264)`}
  function wholeGraph(s,esc,max=8){
    const lanes=s.groups.slice(0,max),more=s.groups.length-lanes.length,W=360,L=4,R=4,row=24,top=2,H=top+lanes.length*row+18,total=Math.max(1,s.until-s.from);
    const x=t=>L+(t-s.from)/total*(W-L-R);
    const body=lanes.map((g,i)=>{const y=top+i*row;
      return `<text x="${L}" y="${y+9}" class="dc-lane">${esc(g.label)}</text><line x1="${L}" x2="${W-R}" y1="${y+17}" y2="${y+17}" class="dc-base"/>`
        +g.runs.filter(r=>r.seconds>0).map(r=>`<rect x="${x(r.start).toFixed(1)}" y="${y+14}" width="${Math.max(2.5,x(r.end)-x(r.start)).toFixed(1)}" height="5" rx="2.5" class="dc-run"/>`).join('')
        +g.marks.map(m=>`<rect x="${x(m.from).toFixed(1)}" y="${y+20}" width="${Math.max(2,x(m.until)-x(m.from)).toFixed(1)}" height="3" class="dc-mark"/>`).join('')}).join('');
    return `<svg class="dc-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${plural(lanes.length,'project')} on one clock: captured sessions and windows in which commits landed">${body}${axis(s.from,s.until,W,L,R,H-4)}</svg>${more>0?`<p class="dc-more">and ${plural(more,'more project')}${s.quiet?`, ${s.quiet} of them known from commits only`:''}.</p>`:''}`;
  }
  // The measured trace: one graph on the clock the view covers, tall enough to be the main visual. The blue step is how many captured
  // sessions were running at once. The grey row is when commits landed. Two kinds of evidence, two
  // rows: a commit is never drawn as a session, and neither says who did the work or for how long.
  function overview(s){
    const groups=s.kind==='whole'?s.groups:[s.group],runs=groups.flatMap(g=>g.runs).filter(r=>r.seconds>0),marks=groups.flatMap(g=>g.marks);
    if(!s.from||!s.until||(!runs.length&&!marks.length))return '';
    const W=320,L=2,R=2,T=6,base=68,total=Math.max(1,s.until-s.from),x=t=>L+(t-s.from)/total*(W-L-R);
    const edges=runs.flatMap(r=>[[r.start.getTime(),1],[r.end.getTime(),-1]]).sort((p,q)=>p[0]-q[0]||p[1]-q[1]);let now=0,peak=0;for(const [,d] of edges){now+=d;peak=Math.max(peak,now)}
    let area='';
    if(peak>0){const y=n=>base-(n/peak)*(base-T);let d=`M${L} ${base}`;now=0;for(const [t,k] of edges){d+=` L${x(t).toFixed(1)} ${y(now).toFixed(1)}`;now+=k;d+=` L${x(t).toFixed(1)} ${y(now).toFixed(1)}`}d+=` L${W-R} ${base}`;
      area=`<path d="${d} Z" class="dc-area"/><path d="${d}" class="dc-step"/>`}
    // Commits hang under the line in equal slices of the clock, taller where more landed. A window's
    // commits are counted in the slice where the window ends.
    const N=48,bins=new Array(N).fill(0);for(const m of marks)bins[Math.min(N-1,Math.max(0,Math.floor((m.until-s.from)/total*N)))]+=m.commits||0;
    const most=Math.max(...bins,0),bw=(W-L-R)/N,ticks=most?bins.map((n,i)=>n?`<rect x="${(L+i*bw+0.6).toFixed(1)}" y="${base+2}" width="${(bw-1.2).toFixed(1)}" height="${(2+n/most*10).toFixed(1)}" class="dc-mark"/>`:'').join(''):'';
    const day=t=>(s.until-s.from)>36e5*20?t.toLocaleDateString(undefined,{weekday:'short'})+' ':'';
    const label=`${runs.length?`${plural(runs.length,'captured session')}, at most ${peak} at once`:'No captured session'}${marks.length?`; ${plural(marks.reduce((a,m)=>a+(m.commits||0),0),'commit')} landed, from git history`:''}`;
    return `<svg class="dc-graph" viewBox="0 0 ${W} 94" role="img" aria-label="${label}"><line x1="${L}" x2="${W-R}" y1="${base}" y2="${base}" class="dc-base"/>${area}${ticks}
      <text x="${L}" y="92" class="dc-axis">${day(s.from)}${hm(s.from)}</text><text x="${W-R}" y="92" text-anchor="end" class="dc-axis">${day(s.until)}${hm(s.until)}</text></svg>
      <p class="dc-key">${runs.length?`<span><i class="dc-k-run"></i>captured sessions${peak>1?`, up to ${peak} at once`:''}</span>`:''}${marks.length?`<span><i class="dc-k-mark"></i>commits landed</span>`:''}</p>`;
  }
  // Under the card, for the reader who asks: every project on its own line of the same clock.
  function detail(deck,esc){
    const s=deck.slides.find(x=>x.kind==='whole');if(!s)return '';
    return `<div class="head"><h2>Every project on one clock</h2><span class="meta">${plural(s.groups.length,'project')}${s.quiet?`, ${s.quiet} known from commits only`:''}</span></div>
      <div class="card dc-detail">${wholeGraph(s,esc,60)}<p class="dc-key"><span><i class="dc-k-run"></i>captured session</span><span><i class="dc-k-mark"></i>commits landed, from git history</span></p>
      <p class="dc-more">Marks show when, never who. Session time is first message to last and is summed across runs, so it is not one person's hours.</p></div>`;
  }
  const SHORT={'from git history':'git history','git history and runs':'git and runs','recorded by the runs':'from runs','summed across runs':'summed',"summed across runs, not one person's hours":'summed'};
  // PAGES. One state, one function that changes it. The numbered links, the arrows, the keyboard, a swipe
  // and the browser's back and forward all send an action here; nothing else moves the card.
  function reduce(state,action){
    const count=Math.max(1,state.count|0),clamp=n=>Math.max(0,Math.min(count-1,n|0)),a=action||{};let at=clamp(state.at);
    if(a.type==='next')at=clamp(at+1);else if(a.type==='prev')at=clamp(at-1);else if(a.type==='goto')at=clamp(a.at);
    // An arrow key typed in a field, a menu or a media control belongs to that control. So does one held with a
    // modifier: Alt and the left arrow is the browser's own Back.
    else if(a.type==='key'){if(!a.guarded&&!a.modified){if(a.key==='ArrowRight')at=clamp(at+1);else if(a.key==='ArrowLeft')at=clamp(at-1)}}
    else if(a.type==='swipe'){if(Math.abs(a.dx)>48&&Math.abs(a.dx)>Math.abs(a.dy)*1.5)at=clamp(at+(a.dx<0?1:-1))}
    return at===state.at&&count===state.count?state:{at,count};
  }
  const GUARDED='input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role=menu],[role=menuitem],[role=radiogroup],[role=slider],video,audio,dialog';
  // Which page an address names. A page is named by its project token, so the same link opens the same
  // project for the owner and for a reader, whose pages are numbered over fewer projects. An unknown
  // name is page 1. The older address form, a bare position, is still read.
  function pageIndex(deck,page,legacy){
    const S=deck.slides;if(typeof page==='string'&&page){const i=S.findIndex(s=>s.key===page);return i<0?0:i}
    const n=parseInt(legacy||'0',10)||0;return Math.max(0,Math.min(S.length-1,n));
  }
  // THE OWNER MENU. The same four entries wherever the owner meets their card. A reader is never given it.
  const MENU=[['edit','Edit card'],['visual','Choose visual'],['reader','Preview as reader'],['sharing','Sharing']];
  function ownerMenu(hrefs,esc,current=''){
    if(!hrefs)return '';
    return `<div class="dc-menu"><button type="button" class="dc-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="dc-menu-list" aria-label="Card options">⋯</button>
      <div class="dc-menu-list" id="dc-menu-list" role="menu" aria-label="Card options" hidden>${MENU.filter(([k])=>hrefs[k]).map(([k,label])=>`<a role="menuitem" href="${esc(hrefs[k])}" ${k===current?'aria-current="page"':''}>${label}</a>`).join('')}</div></div>`;
  }
  function wireMenu(host){
    const box=host&&host.querySelector('.dc-menu');if(!box||box.dataset.wired)return;box.dataset.wired='1';
    const btn=box.querySelector('.dc-menu-btn'),list=box.querySelector('[role=menu]'),items=()=>[...list.querySelectorAll('[role=menuitem]')];
    const set=open=>{list.hidden=!open;btn.setAttribute('aria-expanded',open?'true':'false')};
    btn.addEventListener('click',()=>{const open=list.hidden;set(open);if(open)items()[0]?.focus()});
    box.addEventListener('keydown',e=>{const all=items(),i=all.indexOf(document.activeElement);
      if(e.key==='Escape'&&!list.hidden){e.stopPropagation();set(false);btn.focus()}
      else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)set(true);all[(i+(e.key==='ArrowDown'?1:-1)+all.length)%all.length]?.focus()}});
    document.addEventListener('click',e=>{if(!list.hidden&&box.isConnected&&!box.contains(e.target))set(false)});
  }
  // THE MAIN VISUAL. One region per page, the same box in every mode. A picture is drawn only when its run
  // is in the reader's own view; otherwise the page falls back to the measured trace, and to a plain
  // sentence when there is neither. The trace is always in the markup behind a picture, so a picture that
  // cannot be fetched leaves the trace and never an empty frame.
  const CAPTION={photo:'Photo chosen by the author. Atmosphere, not a measurement.',screenshot:'Screenshot chosen by the author, shown whole.'};
  function visual(s,{esc,mine,visualHref,runHref}){
    const trace=overview(s),v=s.visual;
    if(v){const noun=v.kind==='photo'?'Photo':'Screenshot';
      return `<figure class="dc-visual" data-kind="${v.kind}" data-state="loading" data-visual-run="${esc(v.run)}" data-visual-photo="${esc(v.id)}" data-focus="${esc(v.focus)}" data-alt="${noun} chosen by the author${v.of?` for ${esc(v.of)}`:''}">
        <a class="dc-picture" href="${esc(runHref(v.run))}" aria-label="Open the run this ${noun.toLowerCase()} is from"></a>
        <div class="dc-fallback" hidden>${trace||'<p class="dc-empty">This picture could not be shown and this page has no measured trace.</p>'}</div>
        <figcaption>${CAPTION[v.kind]}${mine&&v.lone?' <span class="dc-lone">Its run is Only you, so readers get the measured trace instead.</span>':''}</figcaption></figure>`}
    if(trace)return `<div class="dc-visual" data-kind="data">${trace}${mine&&visualHref&&s.kind!=='whole'?`<p class="dc-prompt"><a href="${esc(visualHref)}">Add a photo or a screenshot to this page</a></p>`:''}</div>`;
    return `<div class="dc-visual" data-kind="none"><p class="dc-empty">No measured trace and no picture on this page yet.${mine&&visualHref?` <a href="${esc(visualHref)}">Choose a visual</a>`:''}</p></div>`;
  }
  // CARD ANATOMY, the same on every page of every card: identity and date, the page selector, one short
  // headline, two or three numbers, ONE main visual, short highlights, and the shared action row.
  function render(deck,{esc,mine,author,windowLabel,start=0,setupHref,visualHref,menu=null,menuAt='',actions='',runHref=(id)=>`/?run=${encodeURIComponent(id)}`,pageHref=(key,i)=>`?card=${i}`}){
    const S=deck.slides;if(!S.length)return '';
    const c=deck.choices,at=Math.max(0,Math.min(S.length-1,start|0)),many=S.length>1;
    const fact=(s,id)=>{const f=s.facts[id],none=f.value===null||f.value===undefined,note=!none&&SHORT[f.note];
      return `<div role="group" aria-label="${esc(FACTS[id].label)}${note?`, ${esc(note)}`:''}: ${none?'not recorded':esc(String(f.value))}"><div class="k">${esc(FACTS[id].label)}${note?`<span> · ${esc(note)}</span>`:''}</div><div class="v${none?' dc-unk':''}">${none?'not recorded':esc(String(f.value))}</div></div>`};
    // A project's headline is the first sentence the author wrote. The rest of the same result sits under
    // it, smaller and two lines at most; the whole text is on the run the card opens. Nothing is reworded.
    const lede=s=>{const m=s.kind==='project'&&String(s.result).match(/^([\s\S]*?[.!?])\s+(\S[\s\S]*)$/);return m?[m[1],m[2]]:[s.result,'']};
    const slide=(s,i)=>{
      if(s.kind==='points')return `<section class="dc-slide" data-slide="${i}" data-key="${esc(s.key)}" data-name="${esc(s.name)}" ${i===at?'':'hidden'} aria-label="Turning points">
        <ol class="dc-points">${s.points.map(p=>`<li><a href="${esc(runHref(p.run.id))}"><span class="dc-when">${esc(p.at.toLocaleDateString(undefined,{weekday:'short'}))} ${hm(p.at)} · ${esc(p.name)}</span>${esc(p.text)}</a></li>`).join('')}</ol>
        ${s.total>s.points.length?`<p class="dc-more">The latest ${s.points.length} of ${s.total}.</p>`:''}</section>`;
      const ids=(s.kind==='whole'?c.facts.whole:c.facts.project).filter(id=>s.facts[id]),high=s.kind==='whole'?s.highlights.filter(h=>h.text!==s.result).slice(0,2):[];
      return `<section class="dc-slide" data-slide="${i}" data-key="${esc(s.key)}" data-name="${esc(s.name)}" ${s.open?`data-open="${esc(runHref(s.open.id))}"`:''} ${i===at?'':'hidden'} aria-label="${esc(s.name)}">
        <div class="dc-story">${s.result?`<h2 class="dc-said">${esc(lede(s)[0])}</h2>${s.draft&&mine&&setupHref?`<p class="dc-draft-row"><a class="dc-draft" href="${esc(setupHref)}">Draft headline. Write your own</a></p>`:''}${lede(s)[1]?`<p class="dc-rest">${esc(lede(s)[1])}</p>`:''}`:`<p class="dc-said dc-none">${mine?'No result written yet. Open the run and say what came out of it.':'No result written.'}</p>`}</div>
        <div class="dc-facts">${ids.map(id=>fact(s,id)).join('')}</div>
        ${visual(s,{esc,mine,visualHref,runHref})}
        ${high.length?`<ul class="dc-high">${high.map(h=>`<li><a href="${esc(runHref(h.run.id))}">${h.name?`<b>${esc(h.name)}</b> `:''}${esc(h.text)}</a></li>`).join('')}</ul>`:''}</section>`};
    const lead=S.find(x=>x.open),open=S[at].open||(lead&&lead.open);
    // The selector is a list of real links. Each has an address of its own and a name a screen reader or an
    // agent can ask for: its number and the page it opens. The names come from this deck only, so a
    // reader's selector can never carry the name of a project they cannot see.
    const pages=many?`<nav class="dc-pages" aria-label="Pages of this card"><p class="dc-pos" aria-live="polite"><b>${esc(S[at].name)}</b> · ${at+1} of ${S.length}</p>
        <div class="dc-steps"><button type="button" class="dc-arrow" data-step="-1" aria-label="Previous page" ${at===0?'disabled':''}>‹</button><button type="button" class="dc-arrow" data-step="1" aria-label="Next page" ${at===S.length-1?'disabled':''}>›</button></div>
        <ol class="dc-dots">${S.map((s,i)=>`<li><a class="dc-page" href="${esc(pageHref(s.key,i))}" data-goto="${i}" aria-label="${i+1} ${esc(s.name)}" ${i===at?'aria-current="page"':''}>${i+1}</a></li>`).join('')}</ol></nav>`:'';
    return `<article class="card dc" id="day-card" tabindex="0" data-at="${at}" data-count="${S.length}" aria-roledescription="${many?'carousel':'card'}">
      <header class="dc-head"><p class="meta">${esc(author||'')}${author?' · ':''}${esc(windowLabel)}</p>${mine?ownerMenu(menu,esc,menuAt):''}</header>
      ${pages}
      ${S.map(slide).join('')}
      ${lead?`<p class="dc-more-link"><a class="dc-open" href="${esc(runHref(open.id))}" data-fallback="${esc(runHref(lead.open.id))}">Open the run: timeline, evidence, pictures →</a></p>`:''}
      ${actions?`<footer class="fc-foot">${actions}</footer>`:''}</article>`;
  }
  // Wires one card. Returns {go, at}: go(n,{push}) is what the page calls when the browser goes back or forward.
  function wire(card,{onChange}={}){
    if(!card)return null;wireMenu(card);
    card.addEventListener('click',e=>{const say=e.target.closest('[data-comment]');if(say){const box=document.querySelector('#day-thread textarea');if(box){e.preventDefault();box.scrollIntoView({block:'center'});box.focus()}}});
    let state={at:+card.dataset.at||0,count:+card.dataset.count||1};const api={go:()=>{},at:()=>state.at};if(state.count<2)return api;
    const paint=()=>{const at=state.at;card.dataset.at=at;
      card.querySelectorAll('.dc-slide').forEach(s=>{s.hidden=+s.dataset.slide!==at});
      const now=card.querySelector(`.dc-slide[data-slide="${at}"]`),pos=card.querySelector('.dc-pos');pos.innerHTML=`<b></b> · ${at+1} of ${state.count}`;pos.querySelector('b').textContent=now.dataset.name;
      card.querySelectorAll('.dc-page').forEach(a=>{+a.dataset.goto===at?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')});
      const more=card.querySelector('.dc-open');if(more)more.href=now.dataset.open||more.dataset.fallback;
      card.querySelector('[data-step="-1"]').disabled=at===0;card.querySelector('[data-step="1"]').disabled=at===state.count-1;return now};
    const send=(action,{push=true}={})=>{const next=reduce(state,action);if(next===state)return false;state=next;const now=paint();if(onChange)onChange(state.at,now.dataset.key||'',{push});return true};
    api.go=(n,opts)=>send({type:'goto',at:n},opts);
    card.addEventListener('click',e=>{const page=e.target.closest('.dc-page');
      // A plain press changes the page in place. A press that asks for a new tab or window is left to the browser.
      if(page){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button)return;e.preventDefault();send({type:'goto',at:+page.dataset.goto});return}
      const t=e.target.closest('[data-step]');if(t)send({type:+t.dataset.step>0?'next':'prev'})});
    card.addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
      if(send({type:'key',key:e.key,guarded:!!e.target.closest(GUARDED),modified:e.altKey||e.ctrlKey||e.metaKey||e.shiftKey}))e.preventDefault()});
    let x0=null,y0=null,held=false;card.addEventListener('touchstart',e=>{held=!!e.target.closest(GUARDED+',.dc-dots');x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
    card.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;if(!held)send({type:'swipe',dx,dy})},{passive:true});
    return api;
  }
  // SETUP: the author's display choices for this card. The preview under the form is the real card, drawn
  // by the same function a reader gets. Nothing is written until Save is pressed, and Save writes display
  // choices only: it never touches a run and never changes who can see one.
  // The state is one of four words, shown beside the buttons: saved, unsaved, saving, error.
  let pending=null;
  function mountSetup({slot,model,tokens,saved,esc,save,renderOpts,readerHref,onPreview,photos,menu=null,focusOn=''}){
    const all=model.groups.filter(g=>g.label),tk=g=>tokens.get(g.label)||'',name=t=>all.find(g=>tk(g)===t).label;
    let order,hidden,title,lead,photo,highlights,facts,visualKind,hero,focus,base,state='saved',failure='',repaintPhotos=null;
    // load puts the form back to a set of saved choices. It runs once at the start and again on Cancel.
    const load=raw=>{const c=clean(raw),first=slides(model,tokens,raw);
      order=all.slice().sort((a,b)=>{const i=x=>{const n=c.order.indexOf(tk(x));return n<0?1e6:n};return i(a)-i(b)}).map(tk);hidden=new Set(c.hidden.filter(t=>order.includes(t)));
      title=c.title;lead=first.lead;photo=c.photo;highlights=c.highlights;facts={whole:[...c.facts.whole],project:[...c.facts.project]};visualKind=c.visual;hero=c.hero;focus=c.focus};
    const current=()=>({v:2,lead:lead&&!hidden.has(lead)?lead:null,order:[...order],hidden:[...hidden],title,photo,visual:photo?visualKind:'data',hero:!!photo&&visualKind!=='data'&&hero,focus,highlights,facts:{whole:[...facts.whole],project:[...facts.project]}});
    load(saved);base=JSON.stringify(current());let kept=saved;
    slot.innerHTML=`<div class="head cs-head"><h1>Edit card</h1>${ownerMenu(menu,esc,focusOn==='visual'?'visual':'edit')}</div>
      <p class="hint">This changes what the card shows and in which order. It changes no measurement and it shares nothing: who can see a run is set under Sharing.</p>
      <div class="card ds-form"><h2>Headline of the overview</h2><input id="cs-title" class="cs-title" maxlength="140" placeholder="Left empty: One run across the number of projects" aria-label="Headline of the overview"><h2>Projects</h2><ol class="cs-list" id="cs-list"></ol>
        <h2 id="visual" tabindex="-1">Main visual <span class="meta">one per page</span></h2>
        <div class="cs-modes" role="radiogroup" aria-label="Main visual">
          <label class="cs-mode"><input type="radio" name="cs-visual" value="data"> <b>Data</b><span>The measured trace of the sessions and commits. Nothing to add.</span></label>
          <label class="cs-mode"><input type="radio" name="cs-visual" value="photo"> <b>Photo</b><span>A photograph you took. It fills the frame, cropped where you say. It is atmosphere, not proof.</span></label>
          <label class="cs-mode"><input type="radio" name="cs-visual" value="screenshot"> <b>Screenshot</b><span>A capture of a screen. It is shown whole, never cropped.</span></label></div>
        <p class="hint" id="cs-visual-note" role="status" aria-label="What the card will show"></p>
        <div id="cs-photos"></div>
        <div class="cs-frame" id="cs-frame" role="radiogroup" aria-label="Part of the photo to keep in the frame"><span class="meta">Keep in the frame</span>${Object.keys(FOCUS).map(k=>`<label><input type="radio" name="cs-focus" value="${k}"> ${k==='center'?'Centre':k[0].toUpperCase()+k.slice(1)}</label>`).join('')}</div>
        <label class="cs-opt" id="cs-hero-row"><input type="checkbox" id="cs-hero"> Lead the overview with this picture too. Left off, the overview keeps the measured trace.</label>
        <h2>Numbers on the run's view <span class="meta">up to three</span></h2><div class="cs-facts" data-k="whole"></div>
        <h2>Numbers on a project's view <span class="meta">up to three</span></h2><div class="cs-facts" data-k="project"></div>
        <label class="cs-opt"><input type="checkbox" id="cs-high"> Show short highlights under the result</label>
        <div class="dd-foot cs-foot"><button type="button" class="act blue" id="cs-save">Save</button><button type="button" class="act" id="cs-cancel">Cancel</button><span id="cs-state" class="cs-state" role="status" aria-label="Save state" data-state="saved"></span>${readerHref?`<a href="${esc(readerHref)}">Preview as reader</a>`:''}</div></div>
      <div class="head"><h2>Preview</h2><span class="meta">the card as it will show, not saved until you press Save</span></div><div id="cs-preview" role="region" aria-label="Preview of the card"></div>`;
    wireMenu(slot);
    const list=slot.querySelector('#cs-list'),status=slot.querySelector('#cs-state'),saveBtn=slot.querySelector('#cs-save'),cancelBtn=slot.querySelector('#cs-cancel');let at=0;
    const dirty=()=>JSON.stringify(current())!==base;
    // The preview draws the picture from the owner's own view. When the picture's run is not public, the note says so here, before a save.
    const lone=()=>!!photo&&all.some(g=>[...g.runs.map(i=>i.run),...g.marks.map(m=>m.run)].some(r=>r.id===photo.run&&!!r.visibility&&r.visibility!=='public'));
    const SAY={saved:'All changes saved.',unsaved:'Unsaved changes.',saving:'Saving…'};
    function mark(){
      if(state!=='saving')state=dirty()?(state==='error'?'error':'unsaved'):'saved';
      status.dataset.state=state;status.textContent=state==='error'?`Not saved: ${failure}. Your choices are still here. Press Save to try again.`:SAY[state];
      saveBtn.disabled=state==='saving'||state==='saved';cancelBtn.disabled=state==='saving'||state==='saved';
    }
    function preview(){
      const deck=slides(model,tokens,current()),host=slot.querySelector('#cs-preview');at=Math.max(0,Math.min(deck.slides.length-1,at));
      host.innerHTML=render(deck,{...renderOpts,mine:false,start:at,pageHref:(k,i)=>`#page-${i+1}`});wire(host.querySelector('#day-card'),{onChange:n=>{at=n}});if(onPreview)onPreview(host);
    }
    function paint(){
      slot.querySelector('#cs-title').value=title;
      list.innerHTML=order.map((t,i)=>`<li data-t="${t}"><label><input type="checkbox" data-inc ${hidden.has(t)?'':'checked'} aria-label="Include ${esc(name(t))}"> <b>${esc(name(t))}</b></label>
        <label class="cs-lead"><input type="radio" name="cs-lead" value="${t}" ${lead===t&&!hidden.has(t)?'checked':''} ${hidden.has(t)?'disabled':''}> main project</label>
        <span class="cs-move"><button type="button" data-move="-1" ${i===0?'disabled':''} aria-label="Move ${esc(name(t))} up">↑</button><button type="button" data-move="1" ${i===order.length-1?'disabled':''} aria-label="Move ${esc(name(t))} down">↓</button></span></li>`).join('');
      slot.querySelector('#cs-high').checked=highlights;
      slot.querySelectorAll('.cs-facts').forEach(box=>{const k=box.dataset.k;box.innerHTML=Object.entries(FACTS).filter(([,f])=>k==='whole'||!f.whole).map(([id,f])=>`<label class="cs-opt"><input type="checkbox" data-fact="${id}" ${facts[k].includes(id)?'checked':''} ${!facts[k].includes(id)&&facts[k].length>=3?'disabled':''}> ${esc(f.label)}</label>`).join('')});
      // The visual: the mode the author asked for, and what the card can honestly show with it.
      const shown=photo?visualKind:'data';slot.querySelectorAll('[name=cs-visual]').forEach(r=>{r.checked=r.value===visualKind});
      slot.querySelectorAll('[name=cs-focus]').forEach(r=>{r.checked=r.value===focus});slot.querySelector('#cs-frame').hidden=shown!=='photo';
      slot.querySelector('#cs-hero').checked=hero;slot.querySelector('#cs-hero-row').hidden=shown==='data';
      slot.querySelector('#cs-visual-note').textContent=visualKind==='data'?(photo?'The card shows the measured trace. Your picture stays chosen in case you switch back.':'The card shows the measured trace.')
        :photo?(visualKind==='photo'?'The photo leads the page of its own project. Check the crop in the preview below.':'The screenshot leads the page of its own project, shown whole.')+(lone()?' Its run is Only you, so readers get the measured trace instead. The preview below shows it to you alone.':'')
        :'Pick a picture below. Until then the card keeps the measured trace, and nothing stops you saving.';
      preview();mark();
    }
    slot.querySelector('#cs-title').addEventListener('input',e=>{title=e.target.value.replace(/\s+/g,' ').trim().slice(0,140);preview();mark()});
    slot.addEventListener('change',e=>{if(e.target.id==='cs-title')return;const t=e.target,li=t.closest('li[data-t]');
      if(t.dataset.inc!==undefined){t.checked?hidden.delete(li.dataset.t):hidden.add(li.dataset.t)}
      else if(t.name==='cs-lead'){lead=t.value}else if(t.id==='cs-high'){highlights=t.checked}else if(t.id==='cs-hero'){hero=t.checked}
      else if(t.name==='cs-visual'){visualKind=t.value}else if(t.name==='cs-focus'){focus=t.value}
      else if(t.dataset.fact){const k=t.closest('.cs-facts').dataset.k;facts[k]=t.checked?[...facts[k],t.dataset.fact].slice(0,3):facts[k].filter(f=>f!==t.dataset.fact)}
      else return;paint()});
    slot.addEventListener('click',async e=>{const m=e.target.closest('[data-move]');
      if(m){const li=m.closest('li'),i=order.indexOf(li.dataset.t),j=i+ +m.dataset.move;if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];paint();slot.querySelector(`li[data-t="${order[j]}"] [data-move="${m.dataset.move}"]`)?.focus();return}
      if(e.target===cancelBtn){load(kept);state='saved';failure='';paint();if(repaintPhotos)repaintPhotos(photo);return}
      if(e.target===saveBtn){const sending=current();state='saving';mark();let error;try{error=await save(sending)}catch(err){error=String(err&&err.message||err||'the service could not be reached')}
        if(error){state='error';failure=String(error).replace(/[.\s]+$/,'')}else{state='saved';kept=sending;base=JSON.stringify(sending)}mark()}});
    // Leaving with unsaved choices asks first. Links in this app are full page loads, so this one question covers them all.
    pending=()=>slot.isConnected&&state!=='saved';
    if(typeof window==='object'&&!window.__striveCardGuard){window.__striveCardGuard=true;window.addEventListener('beforeunload',e=>{if(pending&&pending()){e.preventDefault();e.returnValue=''}})}
    paint();
    // A picture is picked from the pictures already on these runs. One the author marked as a personal photo starts
    // as a photo, any other starts as a screenshot, shown whole. Both are the author's own earlier words and both can be changed above.
    if(photos)repaintPhotos=photos(slot.querySelector('#cs-photos'),all.flatMap(g=>[...g.runs.map(i=>i.run),...g.marks.map(m=>m.run)].map(r=>({id:r.id,label:g.label}))),photo,(pick,meta)=>{photo=pick;if(pick&&visualKind==='data')visualKind=meta&&meta.role==='personal'?'photo':'screenshot';paint()});
    if(focusOn==='visual'){const h=slot.querySelector('#visual');h.scrollIntoView({block:'start'});h.focus({preventScroll:true})}
    return {state:()=>state,current};
  }
  const api={slides,render,detail,wire,wireMenu,ownerMenu,reduce,pageIndex,clean,token,mountSetup,FACTS,DEFAULTS,VISUALS,FOCUS,MENU,GUARDED};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveDayCard=api;
})(typeof window==='object'?window:globalThis);
