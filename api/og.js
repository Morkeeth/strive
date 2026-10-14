// The home page's share image. /r/<id> has had one since it shipped; the address people
// actually post - the root - had none, so an X post of it was a bare link. Same pipeline,
// same size. One currently-public recorded trail is read through the public visibility guard.
// A run also renders as the story and square images its share sheet offers (?format=).
const SIZES={link:{width:1200,height:630},square:{width:1080,height:1080},story:{width:1080,height:1920}};
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 try{
  const {homeCard,readPublic,readPublicPhotos,readAvatar,privateCard,photoCard,shareCard,photoSlots,profileSlots,profileCard,SHARE_IMAGE_CACHE}=await import('../server/public-run.mjs');
  const {readProfile,readProfileActivities,shareOrigin}=await import('../server/share-routes.mjs');
  const {shareFonts}=await import('../server/share-fonts.mjs');
  const format=req.query.run&&Object.hasOwn(SIZES,req.query.format)?req.query.format:'link';
  // Each selected image is cropped to the slot the card gives it.
  const photoData=async(run,chosen,slot)=>{try{
   if(!slot)return null;
   let bytes=null;
   if(process.env.STRIVE_STORAGE_SERVICE_ROLE_KEY){
    const {runPhotos}=await import('../server/run-photos.mjs');
    const {runtimeConfig}=await import('../server/runtime-config.mjs');
    const image=await runPhotos({method:'GET',query:{run_id:run.id,id:chosen.id,w:'960'}},
     {...runtimeConfig(),STORAGE_KEY:process.env.STRIVE_STORAGE_SERVICE_ROLE_KEY});
    if(image.status===200&&Buffer.isBuffer(image.body))bytes=image.body;
   }
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
    const cropHeight=Math.min(meta.height,Math.round(meta.width*slot.height/slot.width));
    const tallScreenshot=chosen.role!=='personal'&&meta.height/meta.width>1.5&&cropHeight<meta.height;
    const framed=tallScreenshot?image.extract({left:0,top:Math.round((meta.height-cropHeight)*0.28),width:meta.width,height:cropHeight}):image;
    bytes=await framed.resize(slot.width,slot.height,{fit:'cover',position:chosen.role==='personal'?'attention':'north'}).jpeg({quality:82}).toBuffer();
    return 'data:image/jpeg;base64,'+bytes.toString('base64');
   }
  }catch(_){/* A missing public image leaves the card truthful. */}
  return null;
  };
  let tree;
  if(req.query.run){
   const run=await readPublic(String(req.query.run));
   if(!run)tree=privateCard(format);
   else {
    const [photos,avatar]=await Promise.all([readPublicPhotos(run),readAvatar(run)]);
    const screenshots=photos.filter(photo=>photo.role!=='personal');
    const selected=(screenshots.length?screenshots:photos).slice(0,3);
    const slots=photoSlots(run,format,selected.length);
    const photoUrls=(await Promise.all(selected.map((chosen,index)=>photoData(run,chosen,slots[index])))).filter(Boolean);
    tree=format==='link'?photoCard(run,photoUrls,{avatar}):shareCard(run,photoUrls,{avatar,format});
   }
  }else if(req.query.profile){
   const profile=await readProfile(String(req.query.profile));
   if(!profile)tree=privateCard();
   else{
    const activities=await readProfileActivities(profile);
    const [avatar,photoGroups]=await Promise.all([
     readAvatar({visibility:'public',profiles:profile}),
     Promise.all(activities.slice(0,12).map(run=>readPublicPhotos(run)))
    ]);
    const withPhotos=activities.slice(0,12).flatMap((run,index)=>{
     const photos=photoGroups[index]||[];
     const chosen=photos.find(photo=>photo.role!=='personal')||photos[0];
     return chosen?[{run,photo:chosen}]:[];
    }).sort((a,b)=>(a.photo.role==='personal')-(b.photo.role==='personal')).slice(0,3);
    const slots=profileSlots(Math.min(3,Math.max(withPhotos.length,activities.length)));
    const photos=await Promise.all(withPhotos.map(async({run,photo},index)=>({title:run.title,url:await photoData(run,photo,slots[index])})));
    const tiles=photos.filter(tile=>tile.url);
    for(const run of activities){
     if(tiles.length>=3)break;
     if(!withPhotos.some(item=>item.run.id===run.id))tiles.push({title:run.title,url:null});
    }
    tree=profileCard(profile,{activities,avatar,tiles});
   }
  }else{
   // Recheck the featured run under anonymous RLS on every request; a hidden run leaves no trace.
   const run=await readPublic('90a16040-8ad5-4096-978c-8b1f78f3dd2f').catch(()=>null);
   tree=homeCard(run);
  }
  const {ImageResponse}=await import('@vercel/og');
  const image=new ImageResponse(tree,{...SIZES[format],fonts:await shareFonts()});
  const png=Buffer.from(await image.arrayBuffer());
  res.statusCode=200;
  res.setHeader('Content-Type','image/png');
  res.setHeader('Cache-Control',SHARE_IMAGE_CACHE);
  res.end(png);
 }catch(_){res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Share image temporarily unavailable.');}
};
