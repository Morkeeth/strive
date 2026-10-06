/* Private returning-user journey: source runs, frozen comparisons, next practice. */
window.GrinderProgress = function ({client: db, me, app, frame, status, signIn, signInGitHub}) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  const uuid = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value || '');
  const date = stamp => stamp && Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) : null;
  const value = number => number == null ? '—' : esc(number);
  function countBits(run){
    const bits=[];
    if(run.prompts!=null) bits.push(esc(run.prompts)+' typed turns');
    if(run.artifacts_produced!=null) bits.push(esc(run.artifacts_produced)+' artifacts');
    if(run.commits!=null) bits.push(esc(run.commits)+' commits');
    if(run.tool_calls!=null && !bits.length) bits.push(esc(run.tool_calls)+(GrinderContract.observedProjection(run)?' observed distinct tool requests (minimum)':' tool calls'));
    return bits;
  }
  const title = run => run.title || 'Untitled run';
  const audience = run => run.crew_shared ? 'Crew members' : ({private:'Only you',public:'Public',link:'Followers',anonymous:'Only you',close_friends:'Close friends'}[run.visibility] || 'Only you');
  async function rows(query) {const result = await query; if(result.error) throw Error(result.error.message); return result.data || [];}
  function start(heading, active) {
    // Keep the primary rail. This used to clear it, so My runs was the only signed-in page with no
    // Feed, Post a run, Responses, Privacy or Terms links beside it.
    frame(typeof railHtml === 'function' ? railHtml('me') : null, null);
    app().innerHTML = (typeof myRunsTabs === 'function' ? myRunsTabs(active === 'runs' ? 'runs' : active === 'progress' ? 'progress' : 'practices') : `<nav class="social-nav" aria-label="My runs"><a href="/?mine" ${active==='runs'?'aria-current="page"':''}>My runs</a><a href="/?progress" ${active==='progress'?'aria-current="page"':''}>Progress</a><a href="/?practices">Practices</a></nav>`) + `<div class="head"><h1>${esc(heading)}</h1><span class="meta">Private to your account</span></div><section id="progress-body" aria-live="polite">Loading…</section>`;
    if(typeof setPrimarySection==='function') setPrimarySection('mine');
    if(!me()) {$('progress-body').innerHTML='<div class="panel reply-form"><p>Sign in to see My runs. Private uploads stay here. Public runs appear on the feed.</p><button type="button" class="act blue" id="progress-sign-in">Sign in with GitHub</button></div>';$('progress-sign-in').onclick=()=>{if(typeof signInGitHub==='function')signInGitHub();else if(typeof signIn==='function')signIn();};return false;}
    return true;
  }
  function fail(error) {status(GrinderContract.message(error),true);}
  function bind(id, action) {
    const form=$(id); if(!form)return;
    form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;try{await action(form)}catch(error){fail(error)}finally{if(button)button.disabled=false}};
  }
  async function ownRuns(offset=0) {return rows(db.from('runs').select('*').eq('profile_id',me().id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+99));}
  function runTile(run) {
    const when=date(run.started_at);
    const bits=countBits(run);
    const wrapper=!String(run.agent_name||'').trim()||/^connect$/i.test(String(run.agent_name).trim());
    const via=run.source_actor_id&&wrapper?' · via Connect':'';
    const recovered=window.StriveHistory?.historical(run);
    const session=esc(recovered?'Historical reconstruction':run.harness || 'Coding agent');
    const visual=recovered?'':GrinderContract.trace(run);
    const historyFacts=recovered?StriveHistory.facts(run):'';
    return `<article class="history-run" data-run-id="${esc(run.id)}" data-photo-layout="${esc(run.photo_layout||'cover')}"><div class="history-trace history-visual">${visual}</div><div><small><span class="card-harness">${session}</span>${via} · ${esc(audience(run))}</small><h2><a href="/?run=${run.id}">${esc(title(run))}</a></h2>${window.StriveEvidence?StriveEvidence.summary(run):''}${historyFacts}${when?`<p>${esc(when)}</p>`:''}${GrinderContract.observedProjection(run)?'<p class="meta">Observed message order · lower bound</p>':''}${bits.length?`<div class="history-counts">${bits.map(b=>`<span>${b}</span>`).join('')}</div>`:''}${run.visibility==='private'?`<p class="history-share"><a href="/?run=${run.id}">Preview and choose who can see it</a></p>`:''}</div></article>`;
  }
  async function historyView() {
    window.StriveRunPhotos?.disposeAll?.();
    if(!start('My runs','runs'))return;
    const viewer=me().id,body=$('progress-body');
    const current=()=>me()?.id===viewer&&body.isConnected&&$('progress-body')===body;
    try {
      let loaded=await ownRuns(); if(!current())return;let offset=loaded.length, more=loaded.length===100;
      const noteResult=await Promise.allSettled([
        rows(db.from('grinder_notifications').select('id,kind,run_id,source_id,actor_id,created_at,actor:profiles!grinder_notifications_actor_id_fkey(github_handle,name,handle,display_name,avatar_url)').eq('recipient_id',me().id).is('read_at',null).order('created_at',{ascending:false}).limit(3))
      ]);
      if(!current())return;
      const notes=noteResult[0].status==='fulfilled'?noteResult[0].value:[];
      $('progress-body').innerHTML=`${notes.length?`<section class="panel reply-form"><h2>Responses to your work</h2>${notes.map(n=>{const who=window.GrinderPeople?.present?.(n.actor)||{},name=who.href?`<a href="${who.href}">${esc(who.label||'Someone')}</a>`:esc(who.label||'Someone');
        // XUDOS and a follow link the person. Only a comment links its discussion.
        return `<p>${name} ${n.kind==='ack'?'sent XUDOS on your run':n.kind==='reply'?`replied to your run. <a href="/?run=${encodeURIComponent(n.run_id)}${n.source_id?`&reply=${encodeURIComponent(n.source_id)}#reply-${encodeURIComponent(n.source_id)}`:'#grind-thread'}">Open exact reply</a>`:'followed you'}<br><small>${esc(date(n.created_at))}</small></p>`}).join('')}<a href="/?inbox">Open Responses</a></section>`:""}<div class="cta"><a class="act blue" href="/?post">Post a run</a></div><form id="history-filter" class="history-filters"><label>Find a run<input name="query" type="search" placeholder="Title or project"></label><label>Harness<select name="harness" aria-label="Harness"><option value="">All harnesses</option></select></label><label>Audience<select name="audience" aria-label="Audience"><option value="">All audiences</option><option value="private">Only me</option><option value="link">Followers</option><option value="public">Public</option><option value="crew">Crew members</option></select></label><button type="submit">Find runs</button></form><p id="history-count" class="meta"></p><div id="history-list"></div><button id="history-more" class="act" ${more?'':'hidden'}>Load older runs</button><p><a href="/?post">Post another run</a></p>`;
      function render() {
        if(!current())return;
        window.StriveRunPhotos?.disposeAll?.();
        const f=$('history-filter').elements;
        const filtered=loaded.filter(r=>(!f.query.value || [r.title,r.project].join(' ').toLowerCase().includes(f.query.value.toLowerCase()))&&(!f.harness.value||r.harness===f.harness.value)&&(!f.audience.value||(f.audience.value==='crew'?r.crew_shared:r.visibility===f.audience.value)));
        $('history-count').textContent=`${filtered.length} shown · ${loaded.length} loaded${more?' · older runs available':''}`;
        $('history-list').innerHTML=filtered.map(runTile).join('')||`<div class="panel reply-form"><h2>${loaded.length?'No matching runs':'Your first run starts private'}</h2><p>${loaded.length?'Change the filters or load older runs.':'Connect an agent for automatic Only-me upload, or capture a session and choose an audience. Private uploads appear here. Choose Public to add one to the feed.'}</p>${loaded.length?'':'<div class="cta"><a class="act blue" href="/?connect">Connect an agent</a><a class="act" href="/?post">Post a run</a><a class="act" href="https://github.com/Morkeeth/strive/blob/main/docs/GROK-PUSH.md">Grok Bot push guide</a></div>'}</div>`;
        window.StriveRunPhotos?.mountCovers({client:db,root:$('history-list')});
      }
      function harnessOptions(){const select=$('history-filter').elements.harness, selected=select.value;select.innerHTML='<option value="">All harnesses</option>'+[...new Set(loaded.map(r=>r.harness).filter(Boolean))].sort().map(h=>`<option>${esc(h)}</option>`).join('');select.value=selected;}
      harnessOptions();render();bind('history-filter',async()=>render());
      $('history-more').onclick=async()=>{const button=$('history-more');button.disabled=true;try{const next=await ownRuns(offset);if(!current())return;offset+=next.length;more=next.length===100;loaded=[...new Map([...loaded,...next].map(r=>[r.id,r])).values()];button.hidden=!more;harnessOptions();render()}catch(error){if(current())fail(error)}finally{if(current())button.disabled=false}};
    } catch(error) {if(!current())return;$('progress-body').innerHTML='<p>Your runs could not load. Refresh to try again.</p>';fail(error);}
  }
  function snapshot(run) {return {...run,turns_typed:run.turns_typed??run.prompts};}
  function comparisonHTML(before, after, limitations) {
    const metrics=[['turns_typed','Typed turns · cost'],['artifacts_produced','Artifacts produced'],['claims_verified','Claims with evidence'],['tool_calls','Tool calls'],['commits','Commits'],['duration_s','Elapsed seconds']];
    const beforeMetric=before.headline_metric_id||(before.claims_verified==null&&before.artifacts_produced!=null?'artifacts_per_turn':'verified_per_turn');
    const afterMetric=after.headline_metric_id||(after.claims_verified==null&&after.artifacts_produced!=null?'artifacts_per_turn':'verified_per_turn');
    if(beforeMetric!==afterMetric)limitations=[...limitations,'Headline metrics differ ('+beforeMetric+' vs '+afterMetric+'); do not read the number change as the same improvement claim.'];
    if(!before.harness||!after.harness||before.harness!==after.harness)limitations=[...limitations,'The harness is different or unknown'];
    if(!before.trace_basis||!after.trace_basis||before.trace_basis!==after.trace_basis)limitations=[...limitations,'The measurement time basis is different or unknown'];
    const comparison = !limitations.length;
    return `<div class="comparison-status"><h2>${comparison?'Comparable context declared':'Read these as two separate runs'}</h2>${limitations.length?'<ul>'+limitations.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':'<p>You confirmed similar tasks and constraints. The recorded harness, format and time basis match. This is an observation, not evidence that one setup caused a better result.</p>'}</div><div class="progress-pair"><article><small>Earlier run</small><h2>${esc(title(before))}</h2><p>${esc(date(before.started_at))}</p>${GrinderContract.trace(before)}<small>${esc(before.trace_basis || 'Trace time basis unknown')}</small></article><article><small>Later run</small><h2>${esc(title(after))}</h2><p>${esc(date(after.started_at))}</p>${GrinderContract.trace(after)}<small>${esc(after.trace_basis || 'Trace time basis unknown')}</small></article></div><div class="progress-metrics">${metrics.map(([key,label])=>{const a=before[key],b=after[key],delta=comparison&&a!=null&&b!=null?b-a:null;return `<div class="progress-metric"><strong>${label}</strong><span>${value(a)} → ${value(b)}</span><small>${delta==null?'Change not compared':(delta>0?'+':'')+esc(delta)+' · later minus earlier'}</small></div>`}).join('')}</div><details class="panel reply-form"><summary>Frozen measurement references</summary><p>These identify the captured measurements, not independently verified scores.</p><p>Earlier: <code>${esc(before.measurement_revision || 'No revision')}</code></p><p>Later: <code>${esc(after.measurement_revision || 'No revision')}</code></p></details>`;
  }
  async function index() {
    if(!start('Progress','progress'))return;
    try {
      const [runs,saved]=await Promise.all([ownRuns(),rows(db.from('grinder_comparisons').select('id,task_context,created_at,next_practice').eq('owner_id',me().id).order('created_at',{ascending:false}).limit(30))]);
      const query=new URLSearchParams(location.search), wanted=query.get('baseline');
      if(uuid(wanted)&&!runs.some(r=>r.id===wanted))runs.push(...await rows(db.from('runs').select('*').eq('profile_id',me().id).eq('id',wanted)));
      const eligible=runs.filter(r=>r.measurement_revision);
      const options=eligible.map(r=>`<option value="${r.id}">${esc(title(r))} · ${esc(date(r.started_at))}</option>`).join('');
      $('progress-body').innerHTML=`<p>Compare two of your runs. Save the exact measurements before choosing one change for your next session.</p><form id="save-comparison" class="panel reply-form"><label>Earlier run<select name="earlier" aria-label="Earlier run" required><option value="">Choose a baseline</option>${options}</select></label><label>Later run<select name="later" aria-label="Later run" required><option value="">Choose a later run</option>${options}</select></label><label>What tasks and constraints are you comparing?<textarea name="context" required maxlength="2000" placeholder="For example: small bug fixes in the same project, same test command."></textarea></label><label><input name="similar" type="checkbox"> These runs had similar tasks and constraints.</label><p>Saved privately to your account. No automatic quality score or causal claim.</p><button type="submit" ${eligible.length<2?'disabled':''}>Save private comparison</button>${eligible.length<2?'<p>You need two runs with measurement revisions. Older unmeasured runs stay visible in <a href="/?mine">My runs</a>.</p>':''}</form><h2>Saved comparisons</h2><div>${saved.map(c=>`<article class="panel reply-form"><a href="/?comparison=${c.id}">${esc(c.task_context)}</a><small>${esc(date(c.created_at))}${c.next_practice?' · Next practice chosen':''}</small></article>`).join('')||'<p>No saved comparisons yet.</p>'}</div>`;
      if(eligible.some(r=>r.id===wanted))$('save-comparison').elements.earlier.value=wanted;
      const request=crypto.randomUUID();
      bind('save-comparison',async form=>{const f=form.elements;if(f.earlier.value===f.later.value)throw Error('Choose two different runs.');const id=await rows(db.rpc('grinder_save_comparison',{earlier:f.earlier.value,later:f.later.value,context_text:f.context.value,similar_context:f.similar.checked,request}));history.replaceState(null,'','/?comparison='+id);await detail(id)});
    } catch(error){$('progress-body').innerHTML='<p>Progress could not load. <a href="/?mine">Your runs are still available.</a></p>';fail(error);}
  }
  async function detail(id) {
    if(!start('Your saved comparison','progress'))return;
    if(!uuid(id)){$('progress-body').textContent='This comparison link is invalid.';return;}
    try {
      const saved=(await rows(db.from('grinder_comparisons').select('*').eq('owner_id',me().id).eq('id',id)))[0];
      if(!saved){$('progress-body').textContent='This comparison is private or unavailable.';return;}
      $('progress-body').innerHTML=`<p>${esc(saved.task_context)}</p><p class="meta">Saved ${esc(date(saved.created_at))}. Both measurements are frozen; later edits to a run do not change this comparison.</p>${comparisonHTML(saved.before_run,saved.after_run,saved.limitations||[])}${saved.next_practice?`<section class="panel reply-form"><h2>One change for your next run</h2><p>Your practice and its baseline are saved. Record a new session, then return to review what happened.</p><a class="act" href="/?practice=${saved.next_practice}#attempt-${saved.next_attempt}">Open my practice</a></section>`:`<form id="comparison-practice" class="panel reply-form"><h2>One change for your next run</h2><label>What will you do differently?<input name="action" required maxlength="160" placeholder="Run the named test before asking the agent to finish"></label><label>What change would you look for?<textarea name="expected" required maxlength="2000" placeholder="A test result in the same turn as the completion claim"></textarea></label><p>The later run above becomes the frozen baseline. The practice and attempt stay private.</p><button type="submit">Save practice and start attempt</button></form>`}<p><a href="/?progress">All comparisons</a> · <a href="/?mine">My runs</a></p>`;
      bind('comparison-practice',async form=>{await rows(db.rpc('grinder_practice_from_comparison',{comparison:id,action_title:form.elements.action.value,expected_change:form.elements.expected.value}));await detail(id)});
    } catch(error){$('progress-body').textContent='This comparison could not load.';fail(error);}
  }
  return {history:historyView,index,detail,comparisonHTML};
};
