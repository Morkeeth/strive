// The home page's share image. /r/<id> has had one since it shipped; the address people
// actually post - the root - had none, so an X post of it was a bare link. Same pipeline,
// same size. One currently-public recorded trail is read through the public visibility guard.
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const {homeCard,readPublic}=await import('../server/public-run.mjs');
  // Recheck the featured run under anonymous RLS on every request; a hidden run leaves no trace.
  const run=await readPublic('90a16040-8ad5-4096-978c-8b1f78f3dd2f').catch(()=>null);
  const {ImageResponse}=await import('@vercel/og');
  const image=new ImageResponse(homeCard(run),{width:1200,height:630});
  res.statusCode=200;
  res.setHeader('Content-Type','image/png');
  // The recorded trail disappears as soon as the featured run stops being public.
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.end(Buffer.from(await image.arrayBuffer()));
 }catch(_){res.statusCode=503;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Share image temporarily unavailable.');}
};
