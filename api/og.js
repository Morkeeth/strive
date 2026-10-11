// The home page's share image. /r/<id> has had one since it shipped; the address people
// actually post - the root - had none, so an X post of it was a bare link. Same pipeline,
// same size. One currently-public recorded trail is read through the public visibility guard.
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const {homeCard,readPublic,readPublicPhotos,card,privateCard,photoCard,profileCard,origin}=await import('../server/public-run.mjs');
  const {readProfile}=await import('../server/share-routes.mjs');
  let tree;
  if(req.query.run){
   const run=await readPublic(String(req.query.run));
   if(!run)tree=privateCard();
   else{
    const photos=await readPublicPhotos(run);
    const photo=photos.find(p=>p.is_cover)||photos[0];
    let data=null;
    if(photo){
     try{
      const url=origin+'/api/run-photos?id='+encodeURIComponent(photo.id)+'&run_id='+encodeURIComponent(run.id)+'&w=960';
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(response.ok&&response.headers.get('content-type')?.startsWith('image/jpeg')){
       const bytes=Buffer.from(await response.arrayBuffer());
       if(bytes.length>0&&bytes.length<3_000_000)data='data:image/jpeg;base64,'+bytes.toString('base64');
      }
     }catch(_){}
    }
    tree=data?photoCard(run,data):card(run);
   }
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
  // The recorded trail disappears as soon as the featured run stops being public.
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.end(Buffer.from(await image.arrayBuffer()));
 }catch(_){res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Share image temporarily unavailable.');}
};
