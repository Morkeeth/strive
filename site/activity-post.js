/* A public feed post is one selected run. Day/project totals live in their own views. */
(function(root){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const links=(typeof module!=='undefined'&&module.exports?require('./run-links.js'):root.StriveLinks)||{
    runHref:r=>'/?run='+encodeURIComponent(r?.id||''),
    profileHref:h=>'/?u='+encodeURIComponent(h||'')
  };
  function activitySeries(r){
    const valid=a=>Array.isArray(a)&&a.length>0&&a.every(v=>Number.isSafeInteger(v)&&v>=0);
    const typed=r.prompts??r.turns_typed,tools=r.tool_calls??r.ridge_tool_calls;
    if(Number.isSafeInteger(typed)&&typed<5)return {compact:true,typed,tools};
    // Existing timed captures retain counts in equal time windows, not individual timestamps.
    // Show the measured average rate per window; never interpolate individual calls.
    const timedRidge=valid(r.ridge)&&r.ridge_basis==='wall-time'&&r.ridge_wall_seconds>0;
    const timedTools=valid(r.rhythm)&&r.trace_basis==='elapsed-agent-tool-calls'&&(r.wall_time_s??r.duration_s)>0;
    if(timedRidge||timedTools){
      const counts=timedRidge?r.ridge:r.rhythm,minutes=(timedRidge?r.ridge_wall_seconds:(r.wall_time_s??r.duration_s))/60/counts.length;
      const points=counts.map((value,index)=>({value:value/minutes,count:value,index,commit:timedRidge&&(r.commit_basis==null||r.commit_basis==='wall-time')&&(r.commit_bins||[]).includes(index)})).filter(p=>p.count||p.commit);
      if(points.filter(p=>p.count).length<5)return {compact:true,typed,tools};
      return {points,label:'Tool calls / min',basis:'Average tool calls per recorded time window ('+Math.round(minutes*60)+' seconds each). Empty windows are omitted; heights are rates, not exact call times.',idle:counts.length-points.length};
    }
    if(valid(r.ridge)&&r.ridge_basis==='turn-order'&&Number.isSafeInteger(typed)&&typed>=5){
      const points=r.ridge.map((value,index)=>({value,count:value,index,commit:(r.commit_basis==null||r.commit_basis==='turn-order')&&(r.commit_bins||[]).includes(index)})).filter(p=>p.count||p.commit);
      if(points.length>=5)return {points,label:'Tool calls across your turns',basis:'Tool calls grouped into recorded turn-order bins. Empty bins are omitted. A bar may group several turns.',idle:r.ridge.length-points.length};
    }
    return {compact:true,typed,tools};
  }
  function trail(r){
    const data=activitySeries(r);
    if(data.compact){const bits=[];if(Number.isSafeInteger(data.typed)&&data.typed>=0)bits.push(data.typed+' messages you wrote');if(Number.isSafeInteger(data.tools)&&data.tools>=0)bits.push(data.tools+' agent tool calls');return `<p class="post-no-trace">${esc(bits.join(' · ')||'Activity timing was not captured.')}</p>`;}
    const {points,label,basis}=data,W=560,H=90,max=Math.max(...points.map(p=>p.value),1),step=544/points.length,bw=Math.max(1,step*.7);
    const bars=points.map((p,i)=>{const h=p.value/max*58,x=8+i*step;return `<rect class="activity-bar" x="${x.toFixed(1)}" y="${(70-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(p.count+' tool calls'+(label==='Tool calls / min'?'; '+p.value.toFixed(1)+' per minute':''))}</title></rect>${p.commit?`<path class="activity-commit" d="M${(x+bw/2).toFixed(1)} 73v9"><title>Recorded commit</title></path>`:''}`;}).join('');
    return `<div class="post-trail"><div class="post-trail-label">Activity <span>${esc(label)}</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}; idle gaps compressed">${bars}</svg><div class="post-trail-axis"><span>${data.idle?'Idle gaps compressed':'Recorded activity'}</span><span>${points.some(p=>p.commit)?'Ticks: commits':''}</span></div><details class="activity-basis"><summary>Receipts</summary><p>${esc(basis)}</p></details></div>`;
  }
  function render(r,{choices=null,token='',owner=false,cardId='post-'+r.id,actions='',dateLabel='' }={}){
    const C=root.GrinderContract,F=root.GrinderFeed,clean=root.StriveDayCard.clean(choices),id=String(r.id),href=links.runHref(r),p=r.profiles||{},handle=p.handle||p.github_handle,name=p.display_name||p.name||handle||'Builder';
    const project=root.StriveActivity.project(r.project),title=F.titleOf({...r,created_at:null});
    const caption=String(r.caption||F.cardSummary(r)||r.story_result||'').trim();
    const work=C.heroStats(r).filter(([label])=>label!=='Elapsed');
    const files=r.files_touched??(r.code_route?.v===1&&!r.code_route.unavailable?r.code_route.stats?.files_changed:null);
    if(Number.isSafeInteger(files)&&files>0&&!work.some(([label])=>/^Files /.test(label)))work.push([r.files_touched!=null?'Files touched':'Files changed',String(files)]);
    const pick=clean.projectVisuals[token],legacy=clean.photo?.run===id?{visual:clean.visual,photo:clean.photo,focus:clean.focus}:null;
    const choice=pick?.visual==='data'?pick:pick?.photo?.run===id?pick:legacy;
    const dataOnly=choice?.visual==='data'||(!pick&&clean.photo&&clean.visual==='data');
    const photo=choice?.photo?.run===id&&choice.visual!=='data'?choice.photo:null;
    const gallery=!dataOnly,noImage=gallery&&r._readablePhotoCount===0;
    const kind=photo?choice.visual:'data';
    const projectFirst=r.photo_layout==='result'&&r.capture_metadata?.estimates?.v===1;
    const visual=(dataOnly||!photo||projectFirst)?'':`<figure class="dc-visual post-visual" data-kind="${esc(kind)}"${dataOnly?'':` data-visual-run="${esc(id)}"${photo?` data-visual-photo="${esc(photo.id)}" data-focus="${esc(choice.focus||'center')}"`:' data-visual-cover'}`}><div class="dc-fallback"${photo?' hidden':''}></div>${dataOnly?'':`<div class="dc-picture"${photo?'':' hidden'}></div>`}</figure>`;
    const audience=owner?({public:'Public',private:'Only me',link:'Followers',close_friends:'Close friends',anonymous:'Only me'}[r.visibility]||'Only me'):r.visibility!=='public'?'Shared with you':'';
    const day=root.StriveActivity.time(r)!==null?root.StriveDay.localDay(new Date(r.started_at)):null;
    return `<article class="card dc dc-compact activity-post" id="${esc(cardId)}" data-run-id="${esc(id)}" data-run-visibility="${esc(r.visibility||'')}" data-run-owner="${owner}" data-media-seed="${esc(id)}" data-media-story="${esc(r.caption||title)}" data-media-harness="${esc(r.harness||'')}" data-media-model="${esc((Array.isArray(r.capture_metadata?.models)?r.capture_metadata.models:[]).join(', '))}" data-photo-layout="${esc(r.photo_layout||'cover')}"${r.photo_layout==='result'&&r.capture_metadata?.estimates?.v===1?' data-project-gallery':''}${gallery?' data-photo-gallery':''}${photo&&!projectFirst?' data-gallery-supporting':''} data-at="0" data-count="1">
      <header class="dc-head">${F.face(r,36)}<div class="dc-identity">${handle?`<a class="dc-author" href="${esc(links.profileHref(handle))}">${esc(name)}</a>`:`<strong class="dc-author">${esc(name)}</strong>`}<p class="meta">${esc(dateLabel)}${r.harness?' · '+esc(F.harnessName(r)):''}</p></div><details class="post-options"><summary aria-label="Run options">•••</summary><div><a href="${esc(href)}">Open run</a>${owner?`<a href="${esc(href)}#run-edit">Edit this run</a>`:''}${day?`<a href="/?day=${day}${owner?'':'&p='+encodeURIComponent(r.profile_id)}">Day summary</a>`:''}${root.StriveContext?.measurementDetails?.(r)||''}</div></details></header>
      ${audience?`<p class="dc-audience">${esc(audience)}</p>`:''}
      <div class="post-story">${project?`<a class="post-project" href="/?project=${encodeURIComponent(r.project)}&scope=${owner?'mine':'public'}">${esc(project)}</a>`:''}<h2><a href="${esc(href)}">${esc(title)}</a></h2>${caption&&caption!==title?`<p class="post-caption">${esc(caption)}</p>`:!caption?(root.StrivePlaceholders?.render('description',{compact:true})||''):''}</div>
      ${root.StriveContext?.headlineHtml?.(r)||''}
      <div class="post-workline">${!noImage?(root.StriveContext?.cardSecondary?.(r)||''):''}
      ${work.length?`<p class="post-work">Recorded work · ${work.map(([label,value])=>esc(value)+' '+esc(value==='1'?({'Commits':'commit','Files touched':'file touched','Files changed':'file changed','Projects':'project'}[label]||label.toLowerCase()):label.toLowerCase())).join(' · ')}</p>`:''}</div>
      ${visual}${gallery?`<div class="run-media-slot"><div class="post-media-empty" data-photo-placeholder>${noImage?(root.StrivePlaceholders?.render('screenshot',{story:r.caption||title,owner,seed:id,harness:r.harness,model:(Array.isArray(r.capture_metadata?.models)?r.capture_metadata.models:[]).join(', ')})||''):'<div class="media-loading" role="status" aria-label="Loading run images"></div>'}</div></div>`:''}${r.feedback_question?`<p class="post-question">${esc(r.feedback_question)}</p>`:''}
      <p class="post-open"><a href="${esc(href)}">View full run <span aria-hidden="true">→</span></a></p><footer class="fc-foot">${actions}</footer><section class="dc-comments" hidden aria-label="Comments on this run"></section>
    </article>`;
  }
  root.StrivePost={render,trail,activitySeries};if(typeof module!=='undefined'&&module.exports)module.exports=root.StrivePost;
})(typeof window!=='undefined'?window:globalThis);
