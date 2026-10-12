module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const {readPublic,readKudos,readPublicPhotos,readAvatar,html,card,privateCard,neutralHtml,validId,SHARE_IMAGE_CACHE}=await import('../server/public-run.mjs');
  const {readProfileActivities}=await import('../server/share-routes.mjs');
  const run=await readPublic(req.query.id);
  if(req.query.image==='1'){
   const {ImageResponse}=await import('@vercel/og');const avatar=run?await readAvatar(run):null;const image=new ImageResponse(run?card(run,{avatar}):privateCard(),{width:1200,height:630});
   const png=Buffer.from(await image.arrayBuffer());
   res.statusCode=200;res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control',SHARE_IMAGE_CACHE);res.end(png);
  }else if(!run&&validId(req.query.id)){
   // Missing and not public look the same on purpose: 200 and the neutral card, so a link in a
   // message unfurls a neutral image instead of nothing, and a tap lands on a way in.
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(neutralHtml(req.query.id))}
  else if(!run){res.statusCode=404;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('This public run is unavailable.')}
  else{const [kudos,photos,avatar,activities]=await Promise.all([readKudos(run.id),readPublicPhotos(run),readAvatar(run),readProfileActivities({id:run.profile_id}).catch(()=>[])]);res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(run,{kudos,photos,avatar,moreRuns:activities.filter(item=>item.id!==run.id).slice(0,3)}))}
 }catch(_){res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Run preview temporarily unavailable.');}
};
