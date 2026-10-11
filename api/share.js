module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const {readProfile,readShortRun,canonicalProfile,profilePath,runPath,validHandle}=await import('../server/share-routes.mjs');
  const {readKudos,readPublicPhotos,html,origin}=await import('../server/public-run.mjs');
  const handle=String(req.query.handle||'');
  if(!validHandle(handle))return res.status(404).send('Page unavailable.');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
  if(req.query.run){
   const match=String(req.query.run).match(/^([0-9a-f]{8})(?:-[a-z0-9-]+)?$/i);
   if(!match)return res.status(404).send('Run unavailable.');
   const run=await readShortRun(handle,match[1]);
   if(!run)return res.status(404).send('Run unavailable.');
   const path=runPath(run);
   if(!path)return res.status(404).send('Run unavailable.');
   const [kudos,photos]=await Promise.all([readKudos(run.id),readPublicPhotos(run)]);
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html(run,{kudos,photos}));
  }
  const profile=await readProfile(handle);
  if(!profile)return res.status(404).send('Profile unavailable.');
  const preferred=profile.handle||profile.github_handle;
  if(!preferred||!validHandle(preferred))return res.status(404).send('Profile unavailable.');
  const path=profilePath(preferred);
  const title=escape(profile.display_name||preferred),url=canonicalProfile(preferred),image=origin+'/api/og?profile='+encodeURIComponent(preferred);
  const description=escape(`Public runs by ${profile.display_name||'@'+preferred} on STRIVE.`);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · STRIVE</title><meta name="description" content="${description}"><meta property="og:type" content="profile"><meta property="og:title" content="${title} · STRIVE"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${url}"></head><body style="font:16px system-ui;background:#f7f7f5;color:#111;margin:0;padding:24px"><main style="max-width:680px;margin:auto"><a href="/" style="color:#0047ff;text-decoration:none;font-weight:700">STRIVE</a><h1>${title}</h1><p>@${escape(preferred)}</p><p>${description}</p><a href="/?u=${encodeURIComponent(preferred)}" style="color:#0047ff">Open profile and activities →</a></main></body></html>`);
 }catch(_){return res.status(503).send('Share page temporarily unavailable.')}
};
