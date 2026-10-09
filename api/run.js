module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const {readPublic,readKudos,readPublicPhotos,html,card,privateCard,neutralHtml,validId}=await import('../server/public-run.mjs');
  const run=await readPublic(req.query.id);
  if(req.query.image==='1'){
   const {ImageResponse}=await import('@vercel/og');const image=new ImageResponse(run?card(run):privateCard(),{width:1200,height:630});
   res.statusCode=200;
   res.setHeader('Content-Type','image/png');res.end(Buffer.from(await image.arrayBuffer()));
  }else if(!run&&validId(req.query.id)){
   // Missing and not public look the same on purpose: 200 and the neutral card, so a link in a
   // message unfurls a neutral image instead of nothing, and a tap lands on a way in.
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(neutralHtml(req.query.id))}
  else if(!run){res.statusCode=404;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('This public run is unavailable.')}
  else{const [kudos,photos]=await Promise.all([readKudos(run.id),readPublicPhotos(run)]);res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(run,{kudos,photos}))}
 }catch(_){res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Run preview temporarily unavailable.');}
};
