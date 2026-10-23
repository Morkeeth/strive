module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
 // /r/<id>.json arrives through the same /r/:id rewrite as the share page.
 const json=/\.json$/i.test(String(req.query.id||''));
 const id=json?String(req.query.id).slice(0,-5):req.query.id;
 try{
  const {readPublic,readKudos,readPublicPhotos,readAvatar,html,card,privateCard,neutralHtml,validId,SHARE_IMAGE_CACHE}=await import('../server/public-run.mjs');
  const {readProfileActivities,readPublicByShortId}=await import('../server/share-routes.mjs');
  // The JSON view also takes the short id that share links and the sitemap carry.
  const run=json&&!validId(id)?await readPublicByShortId(id):await readPublic(id);
  if(json){
   const {runJson}=await import('../server/run-json.mjs');
   res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Access-Control-Allow-Origin','*');
   // Missing and not public get one answer, so the response never says which.
   if(!run){res.statusCode=404;res.end(JSON.stringify({error:'This public run is unavailable.'}));return}
   res.statusCode=200;res.end(JSON.stringify(runJson(run)));return;
  }
  if(req.query.image==='1'){
   const {ImageResponse}=await import('@vercel/og');const {shareFonts}=await import('../server/share-fonts.mjs');const avatar=run?await readAvatar(run):null;const image=new ImageResponse(run?card(run,{avatar}):privateCard(),{width:1200,height:630,fonts:await shareFonts()});
   const png=Buffer.from(await image.arrayBuffer());
   res.statusCode=200;res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control',SHARE_IMAGE_CACHE);res.end(png);
  }else if(!run&&validId(id)){
   // Missing and not public look the same on purpose: 200 and the neutral card, so a link in a
   // message unfurls a neutral image instead of nothing, and a tap lands on a way in.
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(neutralHtml(id))}
  else if(!run){res.statusCode=404;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('This public run is unavailable.')}
  else{const [kudos,photos,avatar,activities]=await Promise.all([readKudos(run.id),readPublicPhotos(run),readAvatar(run),readProfileActivities({id:run.profile_id}).catch(()=>[])]);res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(run,{kudos,photos,avatar,moreRuns:activities.filter(item=>item.id!==run.id).slice(0,3)}))}
 }catch(_){
  res.statusCode=503;
  if(json){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:'Run temporarily unavailable.'}));return}
  res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Run preview temporarily unavailable.');
 }
};
