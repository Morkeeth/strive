// The home page's share image. /r/<id> has had one since it shipped; the address people
// actually post - the root - had none, so an X post of it was a bare link. Same pipeline,
// same size. One currently-public recorded trail is read through the public visibility guard.
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 try{
  const {homeCard,readPublic,privateCard,linkPreviewCard,profileCard}=await import('../server/public-run.mjs');
  const {readProfile}=await import('../server/share-routes.mjs');
  let tree;
  if(req.query.run){
   const run=await readPublic(String(req.query.run));
   if(!run)tree=privateCard();
   else tree=linkPreviewCard(run);
  }else if(req.query.profile){
   const profile=await readProfile(String(req.query.profile));
   tree=profile?profileCard(profile):privateCard();
  }else{
   // Recheck the featured run under anonymous RLS on every request; a hidden run leaves no trace.
   const run=await readPublic('90a16040-8ad5-4096-978c-8b1f78f3dd2f').catch(()=>null);
   tree=homeCard(run);
  }
  const {ImageResponse}=await import('@vercel/og');
  const image=new ImageResponse(tree,{width:1200,height:630});
  res.statusCode=200;
  res.setHeader('Content-Type','image/png');
  res.end(Buffer.from(await image.arrayBuffer()));
 }catch(_){res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Share image temporarily unavailable.');}
};
