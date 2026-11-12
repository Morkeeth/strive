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
      const points=counts.map((value,index)=>({value:value/minutes,count:value,index,commit:timedRidge&&(r.commit_basis==null||r.commit_basis==='wall-time')&&(r.commit_bins||[]).includes(index)}));
      if(points.filter(p=>p.count).length<5)return {compact:true,typed,tools};
      return {points,label:'Tool calls / min',basis:'Average tool calls per recorded time window ('+Math.round(minutes*60)+' seconds each). Every recorded window is retained; heights are rates, not exact call times.',idle:counts.filter(value=>value===0).length};
    }
    if(valid(r.ridge)&&r.ridge_basis==='turn-order'&&Number.isSafeInteger(typed)&&typed>=5){
      const points=r.ridge.map((value,index)=>({value,count:value,index,commit:(r.commit_basis==null||r.commit_basis==='turn-order')&&(r.commit_bins||[]).includes(index)}));
      if(points.length>=5)return {points,label:'Tool calls across your turns',basis:'Tool calls grouped into recorded turn-order bins. Empty bins are retained. A bar may group several turns.',idle:r.ridge.filter(value=>value===0).length};
    }
    return {compact:true,typed,tools};
  }
  function trail(r){
    const data=activitySeries(r);
    if(data.compact){const bits=[];if(Number.isSafeInteger(data.typed)&&data.typed>=0)bits.push(data.typed+' messages you wrote');if(Number.isSafeInteger(data.tools)&&data.tools>=0)bits.push(data.tools+' agent tool calls');return `<p class="post-no-trace">${esc(bits.join(' · ')||'Activity timing was not captured.')}</p>`;}
    const {points,label}=data,W=560,H=120,max=Math.max(...points.map(p=>p.value),1),step=W/Math.max(1,points.length-1);
    const coordinates=points.map((p,i)=>({x:i*step,y:104-p.value/max*90,p}));
    const line=coordinates.map(({x,y})=>x.toFixed(1)+','+y.toFixed(1)).join(' ');
    const ticks=coordinates.filter(({p})=>p.commit).map(({x})=>`<path class="activity-commit" d="M${x.toFixed(1)} 108v8"><title>Recorded commit</title></path>`).join('');
    const timed=r.ridge_basis==='wall-time'||r.trace_basis==='elapsed-agent-tool-calls';const seconds=r.ridge_wall_seconds||r.wall_time_s||r.duration_s;
    const end=timed&&seconds>0?(seconds<3600?Math.round(seconds/60)+' min':Math.floor(seconds/3600)+' h '+Math.round(seconds%3600/60)+' min'):'Last turn';
    return `<div class="post-trail v2-activity-strip"><div class="post-trail-label">Activity</div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}. All recorded windows retained, including inactivity."><path class="activity-grid" d="M0 14H560M0 59H560M0 104H560"/><polygon class="activity-area" points="0,104 ${line} 560,104"/><polyline class="activity-line" points="${line}"/>${ticks}</svg><div class="post-trail-axis"><span>${timed?'Start':'First turn'}</span><span>${esc(end)}</span></div></div>`;
  }

  function render(r,{choices=null,token='',owner=false,cardId='post-'+r.id,actions='',dateLabel='',review=false }={}){
    const C=root.GrinderContract,F=root.GrinderFeed,clean=root.StriveDayCard.clean(choices),id=String(r.id),href=links.runHref(r),p=r.profiles||{},handle=p.handle||p.github_handle,name=p.display_name||p.name||handle||'Builder';
    const project=root.StriveActivity.project(r.project),title=F.titleOf({...r,created_at:null});
    const caption=String(r.caption||F.cardSummary(r)||r.story_result||'').trim();
    const story=root.StriveStory,manual=r.trace_basis==='typed-by-author',highlights=story?.highlights?.(r)||'';
    const fallback=highlights?'':caption&&caption!==title?`<p class="post-caption">${esc(caption)}</p>`:'';
    const work=(manual?[]:C.heroStats(r)).filter(([label])=>label!=='Elapsed');
    const files=r.files_touched??(r.code_route?.v===1&&!r.code_route.unavailable?r.code_route.stats?.files_changed:null);
    if(!manual&&Number.isSafeInteger(files)&&files>0&&!work.some(([label])=>/^Files /.test(label)))work.push([r.files_touched!=null?'Files touched':'Files changed',String(files)]);
    const pick=clean.projectVisuals[token],legacy=clean.photo?.run===id?{visual:clean.visual,photo:clean.photo,focus:clean.focus}:null;
    const choice=pick?.visual==='data'?pick:pick?.photo?.run===id?pick:legacy;
    const dataOnly=choice?.visual==='data'||(!pick&&clean.photo&&clean.visual==='data');
    const photo=choice?.photo?.run===id&&choice.visual!=='data'?choice.photo:null;
    const gallery=!dataOnly,noImage=gallery&&r._readablePhotoCount===0;
    const projectFirst=r.photo_layout==='result'&&r.capture_metadata?.estimates?.v===1;
    // Gallery images arrive after the card. Keep one reserved media slot instead of
    // painting a second photo above it and removing that photo after the fetch.
    const audience=owner?({public:'Public',private:'Only me',link:'Followers',close_friends:'Close friends',anonymous:'Only me'}[r.visibility]||'Only me'):r.visibility!=='public'?'Shared with you':'';
    const day=root.StriveActivity.time(r)!==null?root.StriveDay.localDay(new Date(r.started_at)):null;
    const html=`<article class="card dc dc-compact activity-post" id="${esc(cardId)}" data-run-id="${esc(id)}" data-run-visibility="${esc(r.visibility||'')}" data-run-owner="${owner}"${review?' data-review-card="true"':''} data-media-seed="${esc(id)}" data-media-story="${esc(r.caption||title)}" data-media-harness="${esc(r.harness||'')}" data-media-model="${esc((Array.isArray(r.capture_metadata?.models)?r.capture_metadata.models:[]).join(', '))}" data-photo-layout="${esc(r.photo_layout||'cover')}"${r.photo_layout==='result'&&r.capture_metadata?.estimates?.v===1?' data-project-gallery':''}${gallery?' data-photo-gallery':''}${photo&&!projectFirst?` data-selected-photo="${esc(photo.id)}"`:''} data-at="0" data-count="1">

      <header class="dc-head">${F.face(r,36)}<div class="dc-identity">${handle?`<a class="dc-author" href="${esc(links.profileHref(handle))}">${esc(name)}</a>`:`<strong class="dc-author">${esc(name)}</strong>`}<p class="meta">${esc(dateLabel)}${r.harness?' · '+esc(F.harnessName(r)):''}</p></div><details class="post-options"><summary aria-label="Run options">•••</summary><div><a href="${esc(href)}">Open run</a>${owner?`<a href="${esc(href)}#run-edit">Edit this run</a>`:''}${day?`<a href="/?day=${day}${owner?'':'&p='+encodeURIComponent(r.profile_id)}">Day summary</a>`:''}${root.StriveContext?.measurementDetails?.(r)||''}</div></details></header>
      ${owner&&root.StriveAudience?`<p class="dc-audience-pill">${root.StriveAudience.pill(r.visibility,{crew:r.crew_shared===true&&r.visibility!=='close_friends',owner:!review,href:review?null:'/?run='+encodeURIComponent(r.id)+'#run-audience'})}</p>`:audience?`<p class="dc-audience">${esc(audience)}</p>`:''}
      <div class="post-story">${project?`<span class="post-project-label">Project</span><a class="post-project" href="/?project=${encodeURIComponent(r.project)}&scope=${owner?'mine':'public'}">${esc(project)}</a>`:''}${manual?(root.StriveGitHubProject?.badge(r.repo_url,{preview:review})||''):''}<h2><a href="${esc(href)}">${esc(title)}</a></h2>${fallback}</div>
      ${highlights}
      <div class="post-workline">${!manual&&!noImage?(root.StriveContext?.cardSecondary?.(r,{omitUnknown:true})||''):''}
      ${work.length?`<p class="post-work">Recorded work · ${work.map(([label,value])=>esc(value)+' '+esc(value==='1'?({'Commits':'commit','Files touched':'file touched','Files changed':'file changed','Projects':'project'}[label]||label.toLowerCase()):label.toLowerCase())).join(' · ')}</p>`:''}</div>
      ${gallery?`<div class="run-media-slot">${noImage?'':'<div class="post-media-empty" data-photo-placeholder><div class="media-loading" role="status" aria-label="Loading run images"></div></div>'}</div>`:''}
      ${manual?'':root.StriveContext?.shareHtml?.(r)||''}
      ${manual?'':trail(r)}
      ${story?.linkAttribution?.(r)||''}<p class="post-open"><a href="${esc(href)}">${manual?'View project update':'View full run'} <span aria-hidden="true">→</span></a></p><footer class="fc-foot"${review?' aria-disabled="true"':''}>${actions}</footer>${review?'<p class="post-review-reactions">Readers can react here</p>':''}<section class="dc-comments"${review?' hidden':''} aria-label="Comments on this run"></section>
    </article>`;
    // Keep the post readable to assistive technology; only unsaved destinations are disabled.
    return review?html.replace(/<a\b([^>]*?)href="([^"]*)"([^>]*)>/g,'<a$1data-review-href="$2"$3 role="link" aria-disabled="true" tabindex="-1">'):html;
  }
  root.StrivePost={render,trail,activitySeries};if(typeof module!=='undefined'&&module.exports)module.exports=root.StrivePost;
})(typeof window!=='undefined'?window:globalThis);
