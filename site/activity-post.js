/* A public feed post is one selected run. Day/project totals live in their own views. */
(function(root){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function trail(r){
    const valid=a=>Array.isArray(a)&&a.length>1&&a.every(v=>Number.isFinite(v)&&v>=0)&&a.some(v=>v>0);
    let bins,basis,timed=false,seconds;
    if(valid(r.ridge)&&['wall-time','call-index','turn-order'].includes(r.ridge_basis)){bins=r.ridge;timed=r.ridge_basis==='wall-time'&&r.ridge_wall_seconds>0;seconds=r.ridge_wall_seconds;basis=timed?'Captured requests · elapsed time':'Captured requests · '+(r.ridge_basis==='turn-order'?'turn order':'request order');}
    else if(valid(r.rhythm)){bins=r.rhythm;timed=r.trace_basis==='elapsed-agent-tool-calls'&&(r.wall_time_s??r.duration_s)>0;seconds=r.wall_time_s??r.duration_s;basis=timed?'Captured tool activity · elapsed time':'Recorded activity · capture order';}
    else return '<p class="post-no-trace">No captured event route</p>';
    const W=560,H=64,L=8,R=552,max=Math.max(...bins),x=i=>L+(R-L)*i/(bins.length-1),y=v=>H-9-v/max*(H-20);
    const points=bins.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');
    const marks=bins.map((v,i)=>v>0?`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${v===max?3:2}"/>`:'').join('');
    const duration=timed?root.GrinderFeed.durationLabel(seconds):null;
    return `<div class="post-trail"><div class="post-trail-label">Activity trail <span>${esc(basis)}</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(basis)}; each point comes from a recorded activity bin"><path d="M${L} ${H-9}H${R}" class="trail-base"/><polyline points="${points}" fill="none" class="trail-line"/>${marks}</svg><div class="post-trail-axis"><span>Start</span><span>${duration?esc(duration)+' elapsed':'End of recorded sequence'}</span></div></div>`;
  }
  function render(r,{choices=null,token='',owner=false,cardId='post-'+r.id,actions='',dateLabel='' }={}){
    const C=root.GrinderContract,F=root.GrinderFeed,clean=root.StriveDayCard.clean(choices),id=String(r.id),href='/?run='+encodeURIComponent(id),p=r.profiles||{},handle=p.handle||p.github_handle,name=p.display_name||p.name||handle||'Builder';
    const project=root.StriveActivity.project(r.project),title=F.titleOf({...r,created_at:null});
    const caption=String(r.story_result||F.cardSummary(r)||r.caption||'').trim();
    const work=C.heroStats(r).filter(([label])=>label!=='Elapsed');
    const files=r.files_touched??(r.code_route?.v===1&&!r.code_route.unavailable?r.code_route.stats?.files_changed:null);
    if(Number.isSafeInteger(files)&&files>0&&!work.some(([label])=>/^Files /.test(label)))work.push([r.files_touched!=null?'Files touched':'Files changed',String(files)]);
    const pick=clean.projectVisuals[token],legacy=clean.photo?.run===id?{visual:clean.visual,photo:clean.photo,focus:clean.focus}:null;
    const choice=pick?.visual==='data'?pick:pick?.photo?.run===id?pick:legacy;
    const dataOnly=choice?.visual==='data'||(!pick&&clean.photo&&clean.visual==='data');
    const photo=choice?.photo?.run===id&&choice.visual!=='data'?choice.photo:null;
    const trace=root.StriveCodeRoute?.render(r,{compact:true})||trail(r);
    const gallery=!dataOnly;
    const kind=photo?choice.visual:'data';
    const visual=(dataOnly||!photo)?'':`<figure class="dc-visual post-visual" data-kind="${esc(kind)}"${dataOnly?'':` data-visual-run="${esc(id)}"${photo?` data-visual-photo="${esc(photo.id)}" data-focus="${esc(choice.focus||'center')}"`:' data-visual-cover'}`}><div class="dc-fallback"${photo?' hidden':''}></div>${dataOnly?'':`<div class="dc-picture"${photo?'':' hidden'}></div>`}</figure>`;
    const audience=owner?({public:'Public',private:'Only me',link:'Followers',close_friends:'Close friends',anonymous:'Only me'}[r.visibility]||'Only me'):r.visibility!=='public'?'Shared with you':'';
    const day=root.StriveActivity.time(r)!==null?root.StriveDay.localDay(new Date(r.started_at)):null;
    return `<article class="card dc dc-compact activity-post" id="${esc(cardId)}" data-run-id="${esc(id)}" data-run-visibility="${esc(r.visibility||'')}" data-photo-layout="${esc(r.photo_layout||'cover')}"${gallery?' data-photo-gallery':''}${photo?' data-gallery-supporting':''} data-at="0" data-count="1">
      <header class="dc-head">${F.face(r,36)}<div class="dc-identity">${handle?`<a class="dc-author" href="/?u=${encodeURIComponent(handle)}">${esc(name)}</a>`:`<strong class="dc-author">${esc(name)}</strong>`}<p class="meta">${esc(dateLabel)}${r.harness?' · '+esc(F.harnessName(r)):''}</p></div><details class="post-options"><summary aria-label="Run options">•••</summary><div><a href="${href}">Open run</a>${owner?`<a href="${href}#run-edit">Edit this run</a>`:''}${day?`<a href="/?day=${day}${owner?'':'&p='+encodeURIComponent(r.profile_id)}">Day summary</a>`:''}</div></details></header>
      ${audience?`<p class="dc-audience">${esc(audience)}</p>`:''}
      <div class="post-story">${project?`<a class="post-project" href="/?project=${encodeURIComponent(r.project)}&scope=${owner?'mine':'public'}">${esc(project)}</a>`:''}<h2><a href="${href}">${esc(title)}</a></h2>${caption&&caption!==title?`<p class="post-caption">${esc(caption)}</p>`:!caption?(root.StrivePlaceholders?.render('description',{compact:true})||''):''}</div>
      ${root.StriveContext?.headlineHtml?.(r)||''}
      ${root.StriveContext?.cardSecondary?.(r)||''}
      ${work.length?`<p class="post-work">Recorded work · ${work.map(([label,value])=>esc(value)+' '+esc(value==='1'?({'Commits':'commit','Files touched':'file touched','Files changed':'file changed','Projects':'project'}[label]||label.toLowerCase()):label.toLowerCase())).join(' · ')}</p>`:''}
      ${root.StriveContext?.measurementDetails?.(r)||''}
      ${trace}${visual}${gallery&&!photo?`<div class="post-media-empty" data-photo-placeholder hidden>${root.StrivePlaceholders?.render('screenshot')||'<strong>No screenshot added</strong><p>The recorded work is here. A project image can show what changed.</p>'}${owner?`<a href="${href}#run-photos">Add a project screenshot →</a>`:''}</div>`:''}${r.feedback_question?`<p class="post-question">${esc(r.feedback_question)}</p>`:''}
      <p class="post-open"><a href="${href}">View full run <span aria-hidden="true">→</span></a></p><footer class="fc-foot">${actions}</footer><section class="dc-comments" hidden aria-label="Comments on this run"></section>
    </article>`;
  }
  root.StrivePost={render,trail};if(typeof module!=='undefined'&&module.exports)module.exports=root.StrivePost;
})(typeof window!=='undefined'?window:globalThis);
