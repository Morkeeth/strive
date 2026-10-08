import {runtimeConfig} from './runtime-config.mjs';
import {BRAND,TAGLINE} from './brand.mjs';
// The feed's card. A CommonJS module (site/feed-card.js), so its default import is its exports.
import Feed from '../site/feed-card.js';
import Evidence from '../site/run-evidence.js';
import Story from '../site/run-story.js';
import Context from '../site/run-context.js';
import Checkpoints from '../site/code-route-view.js';
const config=runtimeConfig();
export const origin=config.ORIGIN;
export const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PUBLIC_RUN_FIELDS='id,created_at,title,caption,photo_layout,story_result,story_next,feedback_question,output_url,repo_url,receipts,shipped,artifact_url,image_url,hero_visual,project,harness,model,capture_metadata,started_at,duration_s,wall_time_s,prompts,tool_calls,shell_calls,files_touched,artifacts_produced,commits,rhythm,route,trace_basis,measurement_revision,history_evidence,ridge,worker_bins,commit_bins,ridge_basis,ridge_wall_seconds,ridge_tool_calls,code_route,visibility,profiles!runs_profile_id_fkey(github_handle,handle,display_name)';
export async function readPublic(id,fetcher=fetch){
 if(!validId(id))return null;
 const request=select=>{const query=new URLSearchParams({id:'eq.'+id,visibility:'eq.public',select,limit:'1'});return fetcher(config.SB_URL+'/rest/v1/runs?'+query,{headers:{apikey:config.SB_KEY,"Accept-Profile":config.SB_SCHEMA},cache:'no-store',signal:AbortSignal.timeout(8000)})};
 let response=await request(PUBLIC_RUN_FIELDS);
 // Production can trail an additive visual-choice migration. Keep the public page available on
 // that older schema; retry only for this exact missing optional column, never for a broad 400.
 if(response.status===400){
  const detail=await response.clone().text();
  if(/hero_visual/i.test(detail)&&/(does not exist|not found|schema cache|PGRST204)/i.test(detail))
   response=await request(PUBLIC_RUN_FIELDS.replace(',hero_visual',''));
 }
 if(!response.ok)throw new Error('Public run unavailable');const rows=await response.json();
 // The query asks for public rows only. The row is checked again here, so a lost filter or a
 // permissive REST layer still cannot put a close friends, link or only-me run on this page.
 return Array.isArray(rows)&&rows.length===1&&rows[0]?.visibility==='public'?rows[0]:null;
}
// THE SHARED CARD. /r/<id> draws the run with the same function the feed uses (site/feed-card.js),
// so the card a stranger opens from a link is the card they would have scrolled past in the feed:
// face, name, agent, title, one big number, up to three small figures, the activity line, and the
// heart, discuss and share row. The page links the app's own stylesheets for the look; nothing
// below the card is part of it.
const pageStyle=`*{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}body{background:var(--paper);color:var(--ink);font:15px/1.5 'IBM Plex Sans',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;padding:0 16px 40px}a{color:inherit;text-decoration:none}.num{font-variant-numeric:tabular-nums}main{max-width:560px;margin:0 auto}a.home{display:inline-flex;align-items:center;min-height:48px;margin:8px 0;font-weight:600;letter-spacing:.08em;color:var(--blue)}.fc{margin:0 0 16px}.fc h1.fc-title{font-size:24px}.share-open{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:0 0 16px}a.open{display:inline-flex;align-items:center;min-height:48px;background:var(--blue);color:#fff;padding:0 20px;font-weight:500}a.open-profile{display:inline-flex;align-items:center;min-height:48px;color:var(--blue);font-weight:500}a.output{color:var(--blue);font-weight:500}a:focus-visible{outline:2px solid var(--blue);outline-offset:3px}.note{color:var(--soft);font-size:13px;margin:0}.private-card{background:var(--box);border:1px solid var(--rule);padding:24px 16px;margin:0 0 16px}.private-card h1{font-size:22px;line-height:1.25;font-weight:600;margin:0 0 8px}.private-card p{color:var(--soft);margin:0 0 16px}.public-run-photos{margin:0 0 16px}.public-run-photos h2{font-size:15px;margin:0 0 8px}.public-run-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.public-run-photo-grid img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain;background:#f4f4f2}.public-run-photo-grid img{display:block;width:100%;height:auto;max-height:520px;object-fit:contain;background:var(--box);border:1px solid var(--rule)}.public-run-photo-grid img:first-child:nth-last-child(1){grid-column:1/-1}.outcome{background:var(--box);border:1px solid var(--rule);padding:14px 16px;margin:0 0 16px;overflow-wrap:anywhere}.outcome h2{font-size:13px;color:var(--soft);font-weight:500;margin:0 0 6px}.outcome p,.outcome li{font-size:14px;margin:6px 0}.outcome ul{margin:8px 0;padding-left:20px}.outcome a{color:var(--blue)}.code-route{background:var(--box);border:1px solid var(--rule);padding:14px 16px;margin:0 0 16px;color:var(--blue);min-width:0;overflow-wrap:anywhere}.code-route h2{font-size:13px;color:var(--blue);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px}.code-route svg{display:block;width:100%;height:auto}.code-route-projects{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px;color:var(--ink);font-size:14px}.code-route-projects li{display:flex;gap:8px;align-items:baseline;min-width:0}.code-route-projects li[data-dense="1"] .code-route-project-name{font-weight:600}.code-route-lane-mark{flex:none;min-width:1.1em;color:var(--blue);font-weight:600}.code-route-insight{font-size:16px;line-height:1.35;color:var(--ink);margin:12px 0 0;font-weight:600}.code-route-stats,.code-route-harnesses,.code-route-why{font-size:13px;color:var(--soft);margin:8px 0 0}.code-route-stops{margin:8px 0 0;display:grid;gap:6px;min-width:0;color:var(--ink);font-size:14px}.code-route-point summary{cursor:pointer;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;min-width:0}.code-route-kind{color:var(--blue);font-size:12px;font-weight:600;text-transform:uppercase}.code-route-stop-label,.code-route-stop-project{min-width:0;overflow-wrap:anywhere}.code-route-basis{color:var(--soft)}`;
const publicStyle=`main{max-width:640px}.public-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0 16px}.public-nav a.home{font-size:24px;letter-spacing:-1px}.public-nav a.open{font-size:13px;min-height:44px;padding:0 14px;border-radius:3px}.fc{border-radius:5px}.fc-activity-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:16px 0 18px}.fc-activity-stats>div{padding:0 16px;border-left:1px solid var(--rule)}.fc-activity-stats>div:first-child{border:0;padding-left:0}.fc-activity-stats dt{font-size:11px;color:var(--soft)}.fc-activity-stats dd{font-size:24px;font-weight:500;margin:4px 0 0}.public-run-photo-grid figure{margin:0;min-width:0}.public-run-photo-grid figcaption{font-size:12px;color:var(--soft);margin-top:5px}.public-run-photos{margin-top:24px}@media(max-width:400px){body{padding:0 12px 30px}.fc-activity-stats dd{font-size:20px}.fc-activity-stats>div{padding:0 10px}.public-nav{gap:8px}.public-nav a.open{font-size:12px;padding:0 10px}}`;
const pageHead=`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght%40400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/feed.css"><link rel="stylesheet" href="/activity.css"><style>${pageStyle}${publicStyle}</style><link rel="icon" href="/favicon.svg" type="image/svg+xml">`;
// The same footer the site's own pages carry.
const siteFoot='<footer class="site-foot"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/Morkeeth/strive/issues">Contact</a><a href="/privacy#deletion">Delete your data</a></footer>';
// How many XUDOS a public run has. The acks policy lets anyone read the acks of a run they can
// read, and this is only called for a row that came back public. A failed read returns null and
// the heart is drawn without a number rather than with a zero nobody measured.
export async function readKudos(id,fetcher=fetch){
 if(!validId(id))return null;
 try{
  const query=new URLSearchParams({run_id:'eq.'+id,select:'run_id'});
  const response=await fetcher(config.SB_URL+'/rest/v1/acks?'+query,{headers:{apikey:config.SB_KEY,"Accept-Profile":config.SB_SCHEMA},cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(!response.ok)return null;const rows=await response.json();
  return Array.isArray(rows)?rows.filter(row=>row&&row.run_id===id).length:null;
 }catch(_){return null}
}
// Public photo metadata is read with the configured anonymous key. Database RLS is the first
// access check; the public run passed here is the second. The page receives only identifiers and
// dimensions, then loads bytes through /api/run-photos so no Storage URL can escape into HTML.
export async function readPublicPhotos(run,fetcher=fetch){
 if(!run||run.visibility!=='public'||!validId(run.id))return [];
 try{
  const query=new URLSearchParams({run_id:'eq.'+run.id,select:'id,run_id,width,height,byte_size,created_at,is_cover,role',order:'is_cover.desc,created_at.asc,id.asc',limit:'6'});
  const response=await fetcher(config.SB_URL+'/rest/v1/run_photos?'+query,{headers:{apikey:config.SB_KEY,"Accept-Profile":config.SB_SCHEMA},cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(!response.ok)return [];
  const rows=await response.json();
  if(!Array.isArray(rows))return [];
  return rows.filter(photo=>validId(photo?.id)&&photo?.run_id===run.id).slice(0,6).map(photo=>({
   id:photo.id,run_id:photo.run_id,role:photo.role,is_cover:photo.is_cover===true,
   width:Number.isInteger(photo.width)&&photo.width>0?photo.width:null,
   height:Number.isInteger(photo.height)&&photo.height>0?photo.height:null
  }));
 }catch(_){return []}
}
// A stored row is untrusted input: it was written by an agent through the upload endpoint. Every
// link is re-checked here before it reaches a signed-out page, with the same rule the database and
// the browser contract use.
const safeUrl=u=>typeof u==='string'&&u.length>=12&&u.length<=300&&/^https:\/\//.test(u)&&!/[\s<>"'\\]/.test(u)&&!/javascript:/i.test(u);
const outcomeLink=(href,text)=>safeUrl(href)?`<a href="${esc(href)}" rel="noopener noreferrer nofollow">${esc(text)}</a>`:'';
// Declared by the uploader, never measured, so this block sits under its own heading and never
// joins the counts. No remote image is embedded: an arbitrary third party host would learn the IP
// and user agent of every visitor to a public page, and a dead link would show a broken box. The
// screenshot is offered as a link the reader chooses to open.
const pageOutcome=run=>{
 const parts=[];
 if(safeUrl(run.repo_url))parts.push(`<p class="outcome-repo">${outcomeLink(run.repo_url,String(run.repo_url).replace(/^https:\/\//,''))}</p>`);
 const shipped=Array.isArray(run.shipped)?run.shipped.filter(l=>typeof l==='string'&&l.trim()).slice(0,5):[];
 if(shipped.length)parts.push(`<ul class="outcome-shipped">${shipped.map(l=>`<li>${esc(l.trim().slice(0,120))}</li>`).join('')}</ul>`);
 const links=(Array.isArray(run.receipts)?run.receipts:[]).filter(r=>r&&typeof r.label==='string'&&safeUrl(r.url)).slice(0,5)
  .map(r=>outcomeLink(r.url,r.label.trim().slice(0,60)));
 if(safeUrl(run.artifact_url))links.push(outcomeLink(run.artifact_url,'Open the demo'));
 if(safeUrl(run.image_url)&&/\.(png|jpe?g|webp)([?#].*)?$/i.test(run.image_url))links.push(outcomeLink(run.image_url,'Open the screenshot'));
 if(links.length)parts.push(`<p class="outcome-links">${links.join(' · ')}</p>`);
 return parts.length?`<section class="outcome"><h2>Said by the uploader, not measured</h2>${parts.join('')}</section>`:'';
};

const pagePhotos=(run,photos)=>{
 if(run?.visibility!=='public'||!Array.isArray(photos)||!photos.length)return '';
 const all=photos.filter(photo=>validId(photo?.id)&&photo?.run_id===run.id).slice(0,6);
 const before=all.find(p=>p.role==='before'),after=all.find(p=>p.role==='after');
 const cover=all.find(p=>p.is_cover)||(all.length===1?all[0]:null);
 const chosen=run.photo_layout==='before_after'&&before&&after?[before,after]:[run.photo_layout==='result'?(all.find(p=>p.role==='result')||cover):cover].filter(Boolean);
 // A candid photo is an author's deliberate cover choice. Keep supporting images,
 // but do not turn older multi-photo uploads into a gallery of personal photos.
 const personal=all.find(p=>p.role==='personal'&&p.is_cover);
 const safe=[...chosen,...all.filter(p=>!chosen.includes(p))].filter(p=>p.role!=='personal'||p===personal);
 if(!safe.length)return '';
 return `<section class="public-run-photos" aria-labelledby="public-run-photos-title"><h2 id="public-run-photos-title">Images from this run</h2><div class="public-run-photo-grid">${safe.map((photo,index)=>{const src=`/api/run-photos?id=${encodeURIComponent(photo.id)}&run_id=${encodeURIComponent(run.id)}&w=960`;const size=Number.isInteger(photo.width)&&photo.width>0&&Number.isInteger(photo.height)&&photo.height>0?` width="${photo.width}" height="${photo.height}"`:'';return `<figure><img src="${esc(src)}" alt="${esc(({result:'Result',before:'Before',after:'After',personal:'Personal photo'})[photo.role]||'Run photo')}"${size} loading="lazy"><figcaption>${esc(({result:'Result',before:'Before',after:'After',personal:'Personal photo'})[photo.role]||'Photo')}</figcaption></figure>`;}).join('')}</div></section>`;
};

const routeInsight=route=>{
 if(!route||typeof route!=='object'||Array.isArray(route)||route.v!==1||route.unavailable)return '';
 const projects=Array.isArray(route.projects)?route.projects:[];
 const stops=Array.isArray(route.stops)?route.stops:[];
 if(!projects.length||!stops.length)return '';
 const connectors=Array.isArray(route.connectors)?route.connectors:[];
 const handoffs=connectors.filter(c=>c&&c.kind==='handoff');
 const measured=stops.filter(s=>s&&s.basis==='measured').length;
 const declared=stops.filter(s=>s&&s.basis==='declared').length;
 const counts=Object.create(null);
 for(const stop of stops){if(!stop||!stop.project)continue;counts[stop.project]=(counts[stop.project]||0)+1;}
 let densest=null,densestN=0,ties=0;
 for(const project of projects){const n=counts[project.id]||0;if(n>densestN){densest=project;densestN=n;ties=1;}else if(n===densestN&&n>0)ties+=1;}
 const finishStop=route.finish&&stops.find(s=>s.id===route.finish.stop);
 const finishProject=finishStop&&projects.find(p=>p.id===finishStop.project);
 const parts=[];
 if(densest&&ties===1&&densestN>0&&densestN<stops.length)parts.push(densest.label+' held the densest stretch ('+densestN+' of '+stops.length+' stops)');
 if(handoffs.length){
  if(finishProject&&densest&&finishProject.id!==densest.id)parts.push(handoffs.length+(handoffs.length===1?' handoff carried the work to ':' handoffs carried the work to ')+finishProject.label);
  else parts.push(handoffs.length+(handoffs.length===1?' handoff across the route':' handoffs across the route'));
 }
 if(measured+declared===stops.length){
  if(declared===0&&measured===stops.length)parts.push('every stop is measured');
  else if(declared>0)parts.push(measured+' measured, '+declared+' declared');
 }
 if(route.finish&&route.finish.kind==='artifact'&&route.finish.label&&parts.length<2)parts.push('finish '+route.finish.label);
 if(!parts.length)return '';
 return parts[0]+parts.slice(1).map(part=>'. '+part.charAt(0).toUpperCase()+part.slice(1)).join('')+'.';
};

const pageCodeRoute=run=>{
 if(Checkpoints.claimed(run))return ""; // The shared card contains the same inspected checkpoint view as the app.
 const route=run&&run.code_route;
 if(!route||route.v!==1)return '';
 if(route.unavailable){
  const harness=route.harnesses?`<p class="code-route-harnesses">Harness populations · basis ${esc(route.harnesses.basis)} · observed: ${(route.harnesses.observed||[]).map(esc).join(', ')||'none'} · absent: ${(route.harnesses.absent||[]).map(esc).join(', ')||'none'}</p>`:'';
  return `<section class="code-route"><h2>Code Route</h2><p class="code-route-why">${esc(route.unavailable.why||'')}</p>${harness}</section>`;
 }
 const projects=Array.isArray(route.projects)?route.projects:[];
 const stops=Array.isArray(route.stops)?route.stops:[];
 if(!projects.length||!stops.length)return '';
 const idx=Object.fromEntries(projects.map((p,i)=>[p.id,i]));
 const left=28,width=360,rowH=28,top=18,height=top+projects.length*rowH+12;
 const finishId=route.finish&&route.finish.stop;
 const handoffTo=new Set((Array.isArray(route.connectors)?route.connectors:[]).filter(c=>c&&c.kind==='handoff'&&c.to).map(c=>c.to));
 const insight=routeInsight(route);
 const counts=Object.create(null);for(const stop of stops){if(stop&&stop.project)counts[stop.project]=(counts[stop.project]||0)+1;}
 let dense=null,denseN=0,ties=0;for(const p of projects){const n=counts[p.id]||0;if(n>denseN){dense=p;denseN=n;ties=1;}else if(n===denseN&&n>0)ties+=1;}
 const denseId=ties===1&&denseN>0?dense.id:null;
 const points=stops.map((stop,i)=>{const row=idx[stop.project]??0;const x=left+(i*(width-left-16))/Math.max(1,stops.length-1);const y=top+row*rowH+rowH/2;return {stop,x,y,finish:stop.id===finishId,handoff:handoffTo.has(stop.id)};});
 const line=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
 const dots=points.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.finish?5.5:p.handoff?4.5:3.5}" fill="${p.finish?'#111':'#123cff'}" ${p.handoff&&!p.finish?'stroke="#111" stroke-width="1.5"':''}/>`).join('');
 const lanes=projects.map((p,i)=>{const y=top+i*rowH+rowH/2+4;return `<text x="0" y="${y}" fill="#596174" font-size="11">${i+1}</text>`;}).join('');
 const projectList=projects.map((p,i)=>`<li${denseId===p.id?' data-dense="1"':''}><span class="code-route-lane-mark" aria-hidden="true">${i+1}</span><span class="code-route-project-name">${esc(p.label)}</span></li>`).join('');
 const names=projects.map(p=>p.label).join(', ');
 const measured=stops.filter(s=>s.basis==='measured').length,declared=stops.filter(s=>s.basis==='declared').length;
 const aria=`Code Route across ${projects.length} projects: ${names}. ${stops.length} ordered checkpoints · ${measured} measured · ${declared} declared${insight?' · '+insight:''}`;
 const stopList=stops.map(stop=>{const project=projects.find(p=>p.id===stop.project);const lane=project?(idx[project.id]??0)+1:null;const evidence=Array.isArray(stop.evidence)&&stop.evidence.length?`<ul>${stop.evidence.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:'';return `<details class="code-route-point"${stop.id===finishId?' data-finish="1"':''}><summary><span class="code-route-kind">${esc(stop.kind)}</span><span class="code-route-stop-label">${esc(stop.label)}</span><span class="code-route-basis">${esc(stop.basis)}</span>${project?`<span class="code-route-stop-project">${lane!=null?`${lane} · `:''}${esc(project.label)}</span>`:''}</summary>${evidence}</details>`;}).join('');
 const harness=route.harnesses?`<p class="code-route-harnesses">Harness populations · basis ${esc(route.harnesses.basis)} · observed: ${(route.harnesses.observed||[]).map(esc).join(', ')||'none'} · absent: ${(route.harnesses.absent||[]).map(esc).join(', ')||'none'}</p>`:'';
 return `<section class="code-route" aria-label="${esc(aria)}"><h2>Code Route</h2><svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true"><path class="code-route-line" pathLength="1" d="${line}" fill="none" stroke="#123cff" stroke-width="2.5"/>${dots}${lanes}</svg><ol class="code-route-projects">${projectList}</ol>${insight?`<p class="code-route-insight">${esc(insight)}</p>`:''}<div class="code-route-stops">${stopList}</div>${harness}</section>`;
};

export function html(run,opts={}){const title=esc(Feed.titleOf(run)),insight=Checkpoints.claimed(run)?'':routeInsight(run&&run.code_route),description=esc(Story.summary(run)||insight||'See the work, its recorded activity and the conversation.'),id=encodeURIComponent(run.id),image=origin+'/api/run?id='+id+'&image=1',url=origin+'/r/'+id;
 const handle=run.profiles?.handle||run.profiles?.github_handle;
 const profileHref=handle?'/?u='+encodeURIComponent(handle):'';
 // opts.kudos is the count readKudos returned: a number, or null when it could not be read.
 // The stride line is on the card with its address; the page carries no script (the probe in
 // tests/fixtures/public_outcome_probe.mjs holds it to that), so it is text to select, not a button.
 const shared=Feed.card(run,{page:true,count:opts.kudos===undefined?null:opts.kudos,url});
 const output=outputKind(run)&&safeUrl(run.output_url)?`<a class="output" href="${esc(run.output_url)}" rel="noopener noreferrer">View linked output</a>`:'';
 const profileAct=profileHref?`<a class="open-profile" href="${esc(profileHref)}">Open builder profile</a>`:'';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${BRAND}</title><meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}"><link rel="canonical" href="${url}">${pageHead}</head><body><main><nav class="public-nav" aria-label="STRIVE"><a class="home" href="/" aria-label="${BRAND} home">${BRAND}</a><a class="open" href="/?run=${id}">Open in STRIVE →</a></nav>${shared}${pagePhotos(run,opts.photos)}${pageCodeRoute(run)}${pageOutcome(run)}${Story.detail({...run,story_result:null}).replace('href="#grind-thread"','href="/?run='+id+'#grind-thread"')}${Context.setup(run)}${Context.metrics(run)}${Evidence.detail(run)}<p class="share-open"><a class="open" href="/?run=${id}">Open run and discussion</a>${profileAct}${output}</p><p class="note">Counts describe activity, not result quality.</p></main>${siteFoot}</body></html>`;
}
// The page for a run that is missing or not public. Same words as privateCard, same neutral
// image, and nothing from a row, because there is no row: the public-only query returns
// nothing for a close friends, link or only-me run exactly as it does for an id that never
// existed, and the page must not tell those apart. The run link goes to /?run=id, where a
// signed-in reader who was given access can open it.
export function neutralHtml(id){const safe=encodeURIComponent(id),image=origin+'/api/run?id='+safe+'&image=1',url=origin+'/r/'+safe,title=esc(`This run is private on ${BRAND}`),description='Sign in and open the shared run link to check your access.';
 // Crawlers and strangers keep this neutral card. A signed-in permitted reader is sent to
 // /?run=<id>, where the SPA enforces follow or close-friends before showing the truthful card.
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="robots" content="noindex"><meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}">${pageHead}</head><body><main><a class="home" href="/" aria-label="${BRAND} home">${BRAND}</a><article class="private-card"><h1>${title}</h1><p>${description}</p><a class="open" href="/?run=${safe}">Sign in and open the run</a></article></main>${siteFoot}<script>try{var id=${JSON.stringify(String(id||''))};if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))location.replace("/?run="+encodeURIComponent(id))}catch(e){}</script></body></html>`;
}
const el=(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}});
// The persisted ridge wins when the run carries one. It is the same 40 to 60 bins the run page
// draws (site/run-contract.js, function ridge), so the share image and the page agree. A run
// saved before migration 003 has no bins and keeps its rhythm polyline.
const ridgeSeries=run=>{
 const values=run.ridge,workers=run.worker_bins;
 if(!Array.isArray(values)||values.length<40||values.length>60)return null;
 if(!values.every(v=>Number.isInteger(v)&&v>=0))return null;
 if(workers!=null&&(!Array.isArray(workers)||workers.length!==values.length||!workers.every(v=>Number.isSafeInteger(v)&&v>=0)))return null;
 return{values,label:run.trace_basis==='observed native events; timestamps unavailable'?'Observed message order':'Agent ridge',filled:true};
};
const series=run=>{
 const ridge=ridgeSeries(run);
 if(ridge)return ridge;
 // A legacy rhythm remains readable when no ridge bins exist. A flat all-zero leftover rhythm is
 // not a trace, so it stays undrawn. `route` is the run map (Feed.routeGeometry), never a line.
 for(const [values,label] of [[run.rhythm,'Session trace']]){
  if(Array.isArray(values)&&values.length>1&&values.length<=10000&&values.every(v=>Number.isFinite(v)&&v>=0)&&values.some(v=>v>0))return{values,label,filled:false};
 }
 return null;
};
// Prefer the transcript count. When it is zero or missing and the stored ridge carried a
// real call count, print that count so the label matches the graph and the SPA strip.
// A recorded zero beside a live ridge with no ridge_tool_calls contradicts the map; omit it.
export const toolCallCount=run=>{
 const recorded=run.tool_calls;
 const fromRidge=run.ridge_tool_calls;
 if((recorded==null||recorded===0)&&Number.isFinite(fromRidge)&&fromRidge>0)return fromRidge;
 const ridge=Array.isArray(run.ridge)?run.ridge:null;
 const ridgeLive=ridge&&ridge.length&&ridge.every(v=>Number.isFinite(v)&&v>=0)&&ridge.some(v=>v>0);
 if(recorded===0&&ridgeLive&&!(Number.isFinite(fromRidge)&&fromRidge>0))return null;
 return recorded;
};
// A workspace name is a flattened absolute path, so it arrives with the account name in front of
// it: `Users-morkeeth-code-app`, or a bare `Users-morkeeth` when the session was opened on the
// home directory. Production 7858535 printed that slug as "Project touched" on the share image a
// stranger meets first. Same rule as site/run-contract.js projectLabel and ingest.project_label;
// tests/fixtures/project_label_probe.mjs runs one table of cases through all three.
const HOME_SLUG=/^-?(?:Users|home)-[^-]+(?:-|$)/;
const projectName=run=>{
 let value=typeof run.project==='string'?run.project.trim():'';
 if(!value||['session','unknown','project unknown'].includes(value.toLowerCase()))return null;
 const unslugged=value.replace(HOME_SLUG,'');
 if(unslugged!==value)value=unslugged;
 if(!value)return null;
 // `CODE-` is one author's worktree convention and is matched as written. It was
 // case-insensitive, which was harmless while a home slug hid what followed it and wrong the
 // moment the slug came off: `Users-alice-code-myapp` cleaned to `code-myapp`, and a lowercase
 // `code-` is a directory somebody named, not a convention to strip.
 const cleaned=value.replace(/^CODE-(?:worktrees-)?/,'').replace(/-\d{8}$/,'');
 // Only turn dashes into spaces when we stripped a worktree prefix or date stamp.
 if(cleaned!==value)value=cleaned.replace(/-/g,' ').replace(/\s+/g,' ').trim();
 else value=cleaned;
 return value||null;
};
// Exported for tests/fixtures/project_label_probe.mjs, which runs one table of workspace names
// through this reader, the browser contract and the Python one, so the three cannot drift.
export const projectNameForTest=projectName;
const outputKind=run=>{
 try{
  const url=new URL(run.output_url);
  if(!/^https?:$/.test(url.protocol))return null;
  if(/github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(url.href))return'PR linked';
  if(/\.(png|jpe?g|webp)(?:[?#]|$)/i.test(url.href))return'Screenshot linked';
  return'Output linked';
 }catch(_){return null}
};
const codeRoutePlot=run=>{
 const measured=Checkpoints.model(run);
 if(Checkpoints.claimed(run))return null; // Sparse checkpoint counts are a receipt, not a route diagram.
 const route=measured||run&&run.code_route;
 if(!route||(!measured&&route.v!==1)||route.unavailable||!Array.isArray(route.projects)||!Array.isArray(route.stops)||!route.projects.length||!route.stops.length)return null;
 const idx=Object.fromEntries(route.projects.map((p,i)=>[p.id,i]));
 const n=Math.max(1,route.projects.length);
 return {measured:!!measured,connectors:route.connectors||[],projects:route.projects,stops:route.stops,idx,n,finish:route.finish&&route.finish.stop,stats:route.stats||{},label:measured?'Code Route · observed checkpoint order':(route.stats&&route.stats.projects_touched!=null)?`${route.stats.projects_touched} projects touched · Code Route`:'Code Route'};
};
// THE SHARE IMAGE is the feed card at 1200x630. The numbers come from the same functions the feed
// and /r/<id> use (Feed.headline, Feed.stats), so the image, the page and the feed cannot print
// different figures for one run. No remote image is fetched: the face is the builder's initial.
const INK='#0a0a0a',SOFT='#6f6f6b',BLUE='#0047ff',WASH='#f2f5ff',BLUE_SOFT='#c4d2ff',RULE='#e3e3df',PAPER='#f7f7f5',ORANGE='#fc4c02';
// The builder's face for the share image: their GitHub picture, fetched here on the server (a
// fixed host, never a URL from the row), so the image shows the same face as the page. Any
// failure returns null and the image draws the initial.
// Redirects are followed by hand, and every hop must stay on GitHub's own avatar hosts over
// https: a redirect to any other host (an internal address included) ends the lookup.
const AVATAR_HOSTS=new Set(['github.com','avatars.githubusercontent.com']);
const avatarHop=url=>{try{const u=new URL(url);return u.protocol==='https:'&&AVATAR_HOSTS.has(u.hostname)&&!u.username&&!u.password&&(u.port===''||u.port==='443')?u.href:null}catch(_){return null}};
export async function readAvatar(run,fetcher=fetch){
 const gh=run&&run.visibility==='public'&&run.profiles?.github_handle;
 if(typeof gh!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(gh))return null;
 try{
  let url=`https://github.com/${gh}.png?size=128`,response=null;
  for(let hop=0;hop<4;hop++){
   response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(3000)});
   if(response.status<300||response.status>=400)break;
   const next=avatarHop(new URL(response.headers.get('location')||'',url).href);
   if(!next||hop===3)return null;
   url=next;
  }
  const type=response.headers.get('content-type')||'';
  if(!response.ok||!/^image\/(png|jpeg)$/.test(type.split(';')[0]))return null;
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.length||bytes.length>400000)return null;
  return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
 }catch(_){return null}
}
export function card(run,opts={}){
 const availableRoutePlot=codeRoutePlot(run);
 const availableSeries=series(run);
 const availableGeo=Feed.routeGeometry(run);
 const requested=run.hero_visual;
 const selected=requested==='activity_terrain'&&availableSeries?'activity_terrain'
  :requested==='change_atlas'&&(availableGeo||availableRoutePlot)?'change_atlas'
  :requested==='proof_route'&&availableRoutePlot?'proof_route'
  :requested==='result'?'result'
  :availableRoutePlot?'proof_route':availableSeries?'activity_terrain':availableGeo?'change_atlas':'result';
 const routePlot=selected==='proof_route'||(selected==='change_atlas'&&!availableGeo)?availableRoutePlot:null;
 const insight=routePlot&&!routePlot.measured?routeInsight(run.code_route):'';
 const plotted=selected==='activity_terrain'?availableSeries:null;
 const lead=null,facts=[];
 const who=Feed.profileOf(run);
 const name=run.visibility==='public'?who.name:run.visibility==='anonymous'?'Anonymous builder':'Builder';
 const badge=null;
 const initial=run.visibility==='anonymous'?'?':(String(name||'?').trim().charAt(0)||'?').toUpperCase();
 const avatar=run.visibility==='public'&&typeof opts.avatar==='string'&&opts.avatar.startsWith('data:image/')?opts.avatar:null;
 // The same line the page's card prints under the name: the agent and when.
 const meta=[run.harness,Feed.when(run.created_at||run.started_at)].filter(Boolean).join(' · ');
 const output=safeUrl(run.output_url)?'Work linked':'';
 const drawn=!!(plotted||routePlot);
 const W=1044;
 // THE RUN MAP, the same geometry the card draws (Feed.routeGeometry), scaled to the image.
 // The card's 300 by 44 drawing, scaled to the image: x by the width, y by a flatter 2.2 so the
 // map stays a strip, and every station still a circle.
 const geo=selected==='change_atlas'?availableGeo:null;
 const SX=W/300,SY=2.2,MAP_H=Math.round((geo?geo.h:44)*SY),RAIL_Y=(geo?geo.rail:30)*SY;
 const hop=d=>{const n=d.match(/-?[\d.]+/g).map(Number);return `M${(n[0]*SX).toFixed(1)},${(n[1]*SY).toFixed(1)} Q${(n[2]*SX).toFixed(1)},${(n[3]*SY).toFixed(1)} ${(n[4]*SX).toFixed(1)},${(n[5]*SY).toFixed(1)}`;};
 const map=geo?el('div',{style:{display:'flex',flexDirection:'column',marginTop:6}},
  el('svg',{width:W,height:MAP_H,viewBox:`0 0 ${W} ${MAP_H}`},
   el('line',{x1:12*SX,y1:RAIL_Y,x2:288*SX,y2:RAIL_Y,stroke:BLUE_SOFT,strokeWidth:2}),
   ...geo.hops.map(d=>el('path',{d:hop(d),fill:'none',stroke:BLUE,strokeWidth:2.4,strokeOpacity:0.4,strokeLinecap:'round'})),
   ...geo.stations.map(([cx,r])=>el('circle',{cx:cx*SX,cy:RAIL_Y,r:r*2,fill:'#fff',stroke:BLUE,strokeWidth:3}))),
  el('div',{style:{display:'flex',fontSize:17,color:SOFT,marginTop:0}},geo.label)):null;
 let drawing=null;
 if(plotted){
  // The page's rule for a short sitting (Feed.settle): a comb of ones and zeros is not a shape.
  const values=Feed.settle(plotted.values),max=Math.max(...values)||1,h=geo?52:110,top=10;
  const x=i=>i*W/(values.length-1),y=v=>h-v/max*(h-top);
  const points=values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const peak=values.indexOf(Math.max(...values));
  drawing=el('div',{style:{display:'flex',flexDirection:'column',marginTop:geo?8:18}},
   el('svg',{width:W,height:h,viewBox:`0 0 ${W} ${h}`},...(plotted.filled?[
    el('polygon',{points:`0,${h} ${points} ${W},${h}`,fill:WASH}),
    el('polyline',{points,stroke:BLUE,strokeWidth:4,strokeLinejoin:'round',strokeLinecap:'round',fill:'none'}),
    el('circle',{cx:x(peak),cy:y(values[peak]),r:9,fill:ORANGE,stroke:'#fff',strokeWidth:3})]:[
    el('polyline',{points,stroke:BLUE,strokeWidth:5,strokeLinejoin:'round',strokeLinecap:'round',fill:'none'})])));
 }else if(routePlot){
  const h=Math.max(70,routePlot.n*22+16);
  const at=(stop,i)=>({x:24+i/Math.max(1,routePlot.stops.length-1)*(W-48),y:12+(routePlot.idx[stop.project]||0)*22+11});
  drawing=el('div',{style:{display:'flex',flexDirection:'column',marginTop:14}},
   el('svg',{width:W,height:h,viewBox:`0 0 ${W} ${h}`},
    el('path',{d:routePlot.measured?routePlot.connectors.map(c=>{const ai=routePlot.stops.findIndex(s=>s.id===c.from),bi=routePlot.stops.findIndex(s=>s.id===c.to),a=at(routePlot.stops[ai],ai),b=at(routePlot.stops[bi],bi);return `M${a.x} ${a.y} L${b.x} ${b.y}`;}).join(' '):routePlot.stops.map((stop,i)=>{const p=at(stop,i);return `${i?'L':'M'}${p.x} ${p.y}`;}).join(' '),stroke:BLUE,strokeWidth:4,fill:'none'}),
    ...routePlot.stops.map((stop,i)=>{const p=at(stop,i),finish=!routePlot.measured&&routePlot.finish===stop.id;if(routePlot.measured&&stop.kind==='commit')return el('path',{d:`M${p.x} ${p.y-7} l7 7 -7 7 -7 -7Z`,fill:BLUE});return el('circle',{cx:p.x,cy:p.y,r:finish?8:5,fill:finish?ORANGE:BLUE});})),
   el('div',{style:{display:'flex',flexWrap:'wrap',fontSize:17,color:INK,marginTop:4}},
    ...routePlot.projects.map((p,i)=>el('div',{style:{display:'flex',marginRight:22}},`${i+1} · ${p.label}`))),
   insight?el('div',{style:{display:'flex',fontSize:18,color:INK,fontWeight:600,marginTop:6,height:26,overflow:'hidden'}},insight):el('div',{style:{display:'flex',fontSize:16,color:SOFT,marginTop:4}},routePlot.label));
 }
 return el('div',{style:{width:'100%',height:'100%',background:PAPER,color:INK,display:'flex',padding:'28px',fontFamily:'sans-serif'}},
  el('div',{style:{width:'100%',height:'100%',background:'#fff',border:`1px solid ${RULE}`,display:'flex',flexDirection:'column',padding:'32px 48px 28px'}},
   el('div',{style:{display:'flex',alignItems:'center'}},
    avatar?el('img',{src:avatar,width:64,height:64,style:{width:64,height:64,borderRadius:32,border:`2px solid ${BLUE_SOFT}`}}):
    el('div',{style:{display:'flex',width:64,height:64,borderRadius:32,background:WASH,border:`2px solid ${BLUE_SOFT}`,color:BLUE,fontSize:28,fontWeight:600,alignItems:'center',justifyContent:'center'}},initial),
    el('div',{style:{display:'flex',flexDirection:'column',marginLeft:18,flexGrow:1,minWidth:0}},
     el('div',{style:{display:'flex',fontSize:26,fontWeight:700}},String(name).slice(0,60)),
     meta?el('div',{style:{display:'flex',fontSize:19,color:SOFT,marginTop:2,height:26,overflow:'hidden'}},meta):null),
    output?el('div',{style:{display:'flex',fontSize:18,color:BLUE,background:WASH,border:`1px solid ${BLUE_SOFT}`,borderRadius:999,padding:'4px 14px',marginRight:18}},output):null,
    el('div',{style:{display:'flex',color:BLUE,fontSize:24,fontWeight:700,letterSpacing:4}},BRAND)),
   el('div',{style:{display:'flex',fontSize:geo?38:drawn?44:56,fontWeight:700,letterSpacing:-1,marginTop:geo?16:22,height:geo?50:drawn?56:140,lineHeight:1.2,overflow:'hidden'}},String(Feed.titleOf(run)).slice(0,120)),
   Story.summary(run)?el('div',{style:{display:'flex',fontSize:25,color:INK,marginTop:14,height:100,lineHeight:1.25,overflow:'hidden'}},Story.summary(run)):null,
   lead||facts.length?el('div',{style:{display:'flex',alignItems:'flex-end',marginTop:geo?12:drawn?14:28}},
    lead?el('div',{style:{display:'flex',flexDirection:'column',marginRight:56}},
     el('div',{style:{display:'flex',fontSize:geo?64:drawn?84:120,fontWeight:700,letterSpacing:-3,lineHeight:1}},lead.n),
     el('div',{style:{display:'flex',fontSize:20,color:SOFT,marginTop:6}},lead.unit)):null,
    ...facts.map(([label,value])=>el('div',{style:{display:'flex',flexDirection:'column',marginRight:44,paddingBottom:4}},
     el('div',{style:{display:'flex',fontSize:17,color:SOFT}},label),
     el('div',{style:{display:'flex',fontSize:32,fontWeight:500,marginTop:2}},String(value))))):null,
   // The badge, as on the card: blue label, soft detail. Same function, so the image cannot award
   // a badge the page does not.
   badge?el('div',{style:{display:'flex',alignItems:'center',fontSize:22,marginTop:geo?8:drawn?12:22}},
    el('div',{style:{display:'flex',width:14,height:14,borderRadius:7,border:`3px solid ${BLUE}`,marginRight:10}}),
    el('div',{style:{display:'flex',color:BLUE,fontWeight:700,marginRight:10}},badge.label),
    el('div',{style:{display:'flex',color:SOFT}},badge.detail)):null,
   map,
   drawing,
   el('div',{style:{display:'flex',fontSize:15,color:SOFT,marginTop:'auto'}},Evidence.basis(run).label+' · '+(run.trace_basis==='observed native events; timestamps unavailable'?'Counts are a lower bound.':'Not independently verified.'))));
}
// THE HOME PAGE'S OWN CARD. Until now `/` carried no og: or twitter: tags at all, so a post that
// sent a thousand people to the address showed them a bare link with no title, no description and
// no image — the first impression of the product was the URL. This reuses the run image pipeline
// (@vercel/og at 1200x630, served by api/og.js) rather than committing a static PNG, so the
// brand and tagline come from server/brand.mjs like every other name on the site.
export function homeCard(){
 return el('div',{style:{width:'100%',height:'100%',background:'#f5f7fb',display:'flex',padding:'30px',fontFamily:'sans-serif',color:'#111'}},
  el('div',{style:{width:'100%',height:'100%',background:'#fff',border:'1px solid #d9deea',borderRadius:22,display:'flex',flexDirection:'column',justifyContent:'center',padding:'54px'}},
   el('div',{style:{display:'flex',color:'#123cff',fontSize:30,fontWeight:800,letterSpacing:6}},BRAND),
   el('div',{style:{display:'flex',fontSize:64,fontWeight:700,marginTop:26,lineHeight:1.1}},TAGLINE),
   el('div',{style:{display:'flex',fontSize:26,color:'#687083',marginTop:24,lineHeight:1.35}},
     'Real sessions. The work behind them. The people building next.'),
   el('div',{style:{display:'flex',fontSize:20,color:'#687083',marginTop:'auto'}},
     'Capture a Cursor, Claude Code, Codex or Grok Bot session · private until you choose to share')));
}

export function privateCard(){
 return el('div',{style:{width:'100%',height:'100%',background:'#f5f7fb',display:'flex',padding:'30px',fontFamily:'sans-serif',color:'#111'}},
  el('div',{style:{width:'100%',height:'100%',background:'#fff',border:'1px solid #d9deea',borderRadius:22,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}},
   el('div',{style:{display:'flex',color:'#123cff',fontSize:28,fontWeight:800}},BRAND),
   el('div',{style:{display:'flex',fontSize:42,fontWeight:700,marginTop:34}},`This run is private on ${BRAND}`),
   el('div',{style:{display:'flex',fontSize:21,color:'#687083',marginTop:18}},'Sign in and open the shared run link to check your access')));
}
