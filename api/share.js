module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const {readProfile,readProfileActivities,readShortRun,canonicalProfile,profilePath,runPath,validHandle,shareOrigin}=await import('../server/share-routes.mjs');
  const {readKudos,readPublicPhotos,readAvatar,html}=await import('../server/public-run.mjs');
  const handle=String(req.query.handle||'');
  if(!validHandle(handle))return res.status(404).send('Page unavailable.');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const crawler=/(?:bot|crawler|spider|facebookexternalhit|facebot|whatsapp|discord|slack|telegram|linkedin|pinterest|preview|embed|opengraph)/i.test(String(req.headers?.['user-agent']||''));
  if(req.query.run){
   const match=String(req.query.run).match(/^([0-9a-f]{8})(?:-[a-z0-9-]+)?$/i);
   if(!match)return res.status(404).send('Run unavailable.');
   const run=await readShortRun(handle,match[1]);
   if(!run)return res.status(404).send('Run unavailable.');
   const path=runPath(run);
   if(!path)return res.status(404).send('Run unavailable.');
   if(`${handle}/${req.query.run}`!==path.slice(1)){res.writeHead(301,{Location:path});return res.end()}
   if(!crawler){res.writeHead(307,{Location:'/?run='+encodeURIComponent(run.id)+'&legacy=1'});return res.end()}
   const [kudos,photos,avatar,activities]=await Promise.all([readKudos(run.id),readPublicPhotos(run),readAvatar(run),readProfileActivities({id:run.profile_id}).catch(()=>[])]);
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html(run,{kudos,photos,avatar,moreRuns:activities.filter(item=>item.id!==run.id).slice(0,3)}));
  }
  const profile=await readProfile(handle);
  if(!profile)return res.status(404).send('Profile unavailable.');
  const preferred=profile.handle||profile.github_handle;
  if(!preferred||!validHandle(preferred))return res.status(404).send('Profile unavailable.');
  const path=profilePath(preferred);
  if(handle!==path.slice(1)){res.writeHead(301,{Location:path});return res.end()}
  if(!crawler){res.writeHead(307,{Location:'/?u='+encodeURIComponent(preferred)+'&legacy=1'});return res.end()}
  const title=escape(profile.display_name||preferred),url=canonicalProfile(preferred),image=shareOrigin+'/api/og?profile='+encodeURIComponent(preferred);
  const description=escape(`Public runs by ${profile.display_name||'@'+preferred} on STRIVE.`);
  const activities=await readProfileActivities(profile);
  const activityHtml=activities.length?`<ol style="list-style:none;padding:0;margin:0">${activities.map(run=>`<li style="border-top:1px solid #ddd;padding:16px 0"><a href="${escape(runPath(run)||'/r/'+run.id)}" style="color:#111;font-weight:600;text-decoration:none">${escape(run.title||'Run')}</a><p style="color:#555;margin:6px 0">${escape(String(run.caption||'').split(/\r?\n/)[0].slice(0,180))}</p></li>`).join('')}</ol>`:'<p>No public activities yet.</p>';
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · STRIVE</title><meta name="description" content="${description}"><meta property="og:type" content="profile"><meta property="og:title" content="${title} · STRIVE"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${url}"></head><body style="font:16px system-ui;background:#f7f7f5;color:#111;margin:0;padding:24px"><main style="max-width:680px;margin:auto"><a href="/" style="color:#0047ff;text-decoration:none;font-weight:700">STRIVE</a><h1>${title}</h1><p>@${escape(preferred)}</p><p>${description}</p><h2>Activities</h2>${activityHtml}<p><a href="${escape(path)}" style="color:#0047ff">Open in STRIVE →</a></p></main></body></html>`);
 }catch(_){return res.status(503).send('Share page temporarily unavailable.')}
};
