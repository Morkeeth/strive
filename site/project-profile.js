// Profile projects as rich cards (1 Nov): the author's intro, then one card per project, newest
// first, each with its authored headline and pitch, a selected public image, the latest run's
// recorded facts, its links and a share-to-X link. Every word comes from the run or the profile;
// a missing fact is left out, never shown as zero. Caveman mode is a deterministic shortening of
// the author's own headline (Oscar Labs reading mode A, 24 Oct), not generated prose.
(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'project';
const firstSentence=s=>{const t=String(s||'').trim().split(/\r?\n/)[0];const m=t.match(/^.*?[.!?](?=\s|$)/);return (m?m[0]:t).trim();};
const safeUrl=u=>{try{const x=new URL(String(u||''));return /^https?:$/.test(x.protocol)?x.href:'';}catch(_){return '';}};
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch(_){return '';}};
const FILLER=new Set(['a','an','the','very','just','really','that','which','of','to','and','for','into','on','in','by','one','is','was','were','be','been','it','its','this','these','those','some','about','fairly']);

// One blunt line from the author's headline: first clause, filler dropped, at most six words.
function caveman(text){
 const clause=String(text||'').split(/[.,;:!?()—–]|\s-\s/)[0];
 const words=clause.split(/\s+/).filter(w=>w&&!FILLER.has(w.toLowerCase().replace(/[^a-z]/gi,'')));
 if(!words.length)return '';
 const line=words.slice(0,6).join(' ');
 return line.charAt(0).toUpperCase()+line.slice(1)+'.';
}

// Group runs by project, newest recorded start first (shared comparator; unknown starts last).
function groups(runs,{project,compare}){
 const map=new Map();
 for(const r of runs||[]){const name=project(r.project);if(!name)continue;const g=map.get(r.project)||{key:r.project,name,runs:[],latest:r};g.runs.push(r);if(compare(r,g.latest)<0)g.latest=r;map.set(r.project,g);}
 for(const g of map.values())g.runs.sort(compare);
 return [...map.values()].sort((a,b)=>compare(a.latest,b.latest)||a.name.localeCompare(b.name));
}

// Headline: the run's authored title. Pitch: the authored result, else the first sentence of the public caption.
function story(run){
 const headline=String(run.title||'').trim();
 const result=String(run.story_result||'').trim();
 const pitch=result||firstSentence(run.caption);
 return {headline,pitch:pitch&&pitch!==headline?pitch:''};
}

function duration(s){if(!(s>0))return '';const m=Math.round(s/60);return m<60?m+' min':(Math.round(m/6)/10)+' h';}
// The latest run's recorded facts. A fact the run does not have is left out.
function facts(group){
 const r=group.latest,out=[];
 out.push([group.runs.length,group.runs.length===1?'update':'updates']);
 if(r.trace_basis==='typed-by-author')return out;
 if(Number.isFinite(r.commits)&&r.commits>0)out.push([r.commits,r.commits===1?'commit':'commits']);
 if(Number.isFinite(r.files_touched)&&r.files_touched>0)out.push([r.files_touched,'files']);
 const d=duration(r.duration_s);if(d)out.push([d,'session']);
 return out;
}

function links(group,runHref){
 const r=group.latest,out=[];
 const run=runHref?runHref(r):'';if(run)out.push({href:run,label:'Open project',kind:'run'});
 const live=safeUrl(r.output_url);if(live){const h=host(live);out.push({href:live,label:h&&h.length<=22?h:'Live site',kind:'live'});}
 const repo=safeUrl(r.repo_url);if(repo&&repo!==live)out.push({href:repo,label:'Code',kind:'code'});
 return out;
}

function shareUrl(origin,handle,group){return String(origin||'').replace(/\/$/,'')+'/'+encodeURIComponent(handle)+'?project='+encodeURIComponent(group.name);}
function shareText(group,displayName){
 const {headline}=story(group.latest);
 return `${group.name}: ${headline||'latest run'}`.slice(0,200)+` · ${displayName||'my'} work on STRIVE`;
}
function xIntent(origin,handle,group,displayName){
 return 'https://x.com/intent/post?'+new URLSearchParams({text:shareText(group,displayName),url:shareUrl(origin,handle,group)}).toString();
}

function photoSrc(photo){return photo?'/api/run-photos?'+new URLSearchParams({run_id:photo.run_id,id:photo.id,w:'960'}).toString():'';}

function card(group,{handle,displayName,origin,runHref,photo}){
 const {headline,pitch}=story(group.latest),id='project-'+slug(group.name);
 const img=photoSrc(photo);
 const cave=caveman(headline||pitch);
 return `<article class="pp-card" id="${esc(id)}" aria-labelledby="${esc(id)}-name">
  ${img?`<a class="pp-hero" href="${esc(runHref?runHref(group.latest):'#'+id)}"><img src="${esc(img)}" alt="${esc(group.name)}: image the author selected for this run" loading="lazy"></a>`:''}
  <div class="pp-body">
   <p class="pp-name" id="${esc(id)}-name">${esc(group.name)}</p>${group.latest.trace_basis==='typed-by-author'?(root.StriveGitHubProject?.badge(group.latest.repo_url)||''):''}
   ${headline?`<h3 class="pp-headline pp-full">${esc(headline)}</h3>`:''}
   
   ${pitch?`<p class="pp-pitch pp-full">${esc(pitch)}</p>`:''}
   
   <dl class="pp-facts">${facts(group).map(([v,k])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
   <div class="pp-links">${links(group,runHref).map(l=>`<a class="pp-link pp-${l.kind}" href="${esc(l.href)}"${l.kind==='run'?'':' target="_blank" rel="noopener noreferrer"'}>${esc(l.label)}</a>`).join('')}
    <a class="pp-link pp-x" href="${esc(xIntent(origin,handle,group,displayName))}" target="_blank" rel="noopener noreferrer">Share on X</a></div>
  </div></article>`;
}

function updates(group,runHref){
 const rows=group.runs.slice(0,3);
 return `<ol class="pp-updates" aria-label="Recent project updates">${rows.map(r=>{
  const label=root.StriveActivity?.label(r)||'Activity time not recorded';
  return `<li><a href="${esc(runHref?runHref(r):'#')}">${esc(story(r).headline||'Project update')}</a><span>${esc(label)}${r.trace_basis==='typed-by-author'?' · Author update':''}</span></li>`;
 }).join('')}</ol>`;
}

// The intro the author wrote, else a line of recorded facts. The owner gets a prompt to write one.
function intro(prof,groupsList,runs,{mine,about=true}){
 const details=(prof&&prof.rig&&prof.rig.profile_details)||{};
 const bio=String(details.bio||'').trim(),focus=String(details.focus||'').trim();
 const name=prof.display_name||prof.name||prof.handle||'This builder';
 const fact=runs.length?`${esc(name)} shares projects here: ${runs.length} public ${runs.length===1?'update':'updates'} across ${groupsList.length} ${groupsList.length===1?'project':'projects'}.`:'';
 return `<section class="pp-intro" aria-label="Intro">
  ${about&&bio?`<p class="pp-bio">${esc(bio)}</p>`:about&&fact?`<p class="pp-bio">${fact}</p>`:''}
  ${about&&focus?`<p class="pp-focus">Building: ${esc(focus)}</p>`:''}
  
  
 </section>`;
}

// Visitors (signed out or not the owner) get a Strava-like first action.
function visitorCta(){
 return `<section class="pp-cta" aria-label="Post your own">
  <div><h2>Post your project</h2><p>Import a real agent session or post a project with a screenshot or link. You review the card, then choose who sees it.</p></div>
  <div class="pp-cta-actions"><a class="act blue" href="/?post">Post a project</a><a class="act" href="/?connect">Record an agent run</a></div>
 </section>`;
}

function section(groupsList,opts){
 if(!groupsList.length)return '';
 return `<section class="pp-section" aria-labelledby="pp-title"><div class="head"><h2 id="pp-title">Projects</h2><span class="meta">${groupsList.length} projects · latest updates first</span></div>
  <div class="pp-grid">${groupsList.map(g=>card(g,{...opts,photo:(opts.photos||{})[g.latest.id]})).join('')}</div></section>`;
}

// One public, selected, non-personal photo per run (personal only when the author made it public).
function pickPhoto(rows,runId){
 const ok=(rows||[]).filter(p=>p&&p.run_id===runId&&p.is_selected!==false&&p.is_private!==true&&(p.role!=='personal'||p.personal_public_selected===true));
 ok.sort((a,b)=>(b.is_cover===true)-(a.is_cover===true)||(a.role==='personal')-(b.role==='personal')||(a.sort_position??0)-(b.sort_position??0));
 return ok[0]||null;
}

function wire(rootEl,{onEdit}={}){
 if(!rootEl)return;
 const box=rootEl.querySelector('[data-pp-cave]');
 if(box){
  let on=false;try{on=localStorage.getItem('strive_caveman')==='1'}catch(_){}
  box.checked=on;rootEl.classList.toggle('pp-caveman',on);
  box.onchange=()=>{rootEl.classList.toggle('pp-caveman',box.checked);try{localStorage.setItem('strive_caveman',box.checked?'1':'0')}catch(_){}};
 }
 const edit=rootEl.querySelector('[data-pp-edit]');if(edit&&onEdit)edit.onclick=onEdit;
 if(/^#project-/.test(location.hash||'')){const el=document.getElementById(location.hash.slice(1));if(el)el.scrollIntoView({block:'start'});}
}

const api={slug,caveman,groups,story,facts,links,shareUrl,shareText,xIntent,card,intro,visitorCta,section,updates,pickPhoto,photoSrc,wire};
root.StriveProjectProfile=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
