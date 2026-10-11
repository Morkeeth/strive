// The home page's share image. /r/<id> has had one since it shipped; the address people
// actually post - the root - had none, so an X post of it was a bare link. Same pipeline,
// same size. One currently-public recorded trail is read through the public visibility guard.
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 try{
  const {homeCard,readPublic,readPublicPhotos,readAvatar,privateCard,linkPreviewCard,photoCard,profileCard}=await import('../server/public-run.mjs');
  const {readProfile,shareOrigin}=await import('../server/share-routes.mjs');
  let tree;
  if(req.query.run){
   const run=await readPublic(String(req.query.run));
   if(!run)tree=privateCard();
   else {
    const [photos,avatar]=await Promise.all([readPublicPhotos(run),readAvatar(run)]);
    const screenshots=photos.filter(photo=>photo.role!=='personal');
    const selected=(screenshots.length?screenshots:photos).slice(0,3);
    const tileWidth=Math.floor((1112-12*(selected.length-1))/Math.max(1,selected.length));
    const photoUrls=await Promise.all(selected.map(async chosen=>{try{
     let bytes=null;
     if(process.env.STRIVE_STORAGE_SERVICE_ROLE_KEY){
      const {runPhotos}=await import('../server/run-photos.mjs');
      const {runtimeConfig}=await import('../server/runtime-config.mjs');
      const image=await runPhotos({method:'GET',query:{run_id:run.id,id:chosen.id,w:'960'}},
       {...runtimeConfig(),STORAGE_KEY:process.env.STRIVE_STORAGE_SERVICE_ROLE_KEY});
      if(image.status===200&&Buffer.isBuffer(image.body))bytes=image.body;
     }
     // Preview deployments have anonymous reads but no storage service key. The public
     // photo endpoint checks visibility again, so it can supply the selected image.
     if(!bytes){
      const url=new URL('/api/run-photos',shareOrigin);
      url.search=new URLSearchParams({run_id:run.id,id:chosen.id,w:'960'}).toString();
      const response=await fetch(url,{signal:AbortSignal.timeout(4000)});
      const size=Number(response.headers.get('content-length')||0);
      if(response.ok&&response.headers.get('content-type')?.startsWith('image/')&&size<=3_000_000)
       bytes=Buffer.from(await response.arrayBuffer());
     }
      if(bytes&&bytes.length<=3_000_000){
       const sharp=(await import('sharp')).default;
       const image=sharp(bytes),meta=await image.metadata();
       const cropHeight=Math.min(meta.height,Math.round(meta.width*248/tileWidth));
       const tallScreenshot=chosen.role!=='personal'&&meta.height/meta.width>1.5&&cropHeight<meta.height;
       const framed=tallScreenshot?image.extract({left:0,top:Math.round((meta.height-cropHeight)*0.28),width:meta.width,height:cropHeight}):image;
       bytes=await framed.resize(tileWidth,248,{fit:'cover',position:chosen.role==='personal'?'attention':'north'}).jpeg({quality:82}).toBuffer();
       return 'data:image/jpeg;base64,'+bytes.toString('base64');
     }
    }catch(_){/* A missing public image leaves the card truthful. */}
    return null;}));
    tree=photoCard(run,photoUrls.filter(Boolean),{avatar});
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
  res.end(Buffer.from(await image.arrayBuffer()));
 }catch(_){res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Share image temporarily unavailable.');}
};
