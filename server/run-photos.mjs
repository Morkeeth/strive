import sharp from 'sharp';
import { randomUUID, createHash } from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_PHOTO_BYTES=3*1024*1024;
const BUCKET='strive-run-photos';
const fields='id,run_id,width,height,byte_size,created_at,is_cover';
export const PHOTO_HEADERS={'Cache-Control':'private, no-store, max-age=0',Vary:'Authorization','X-Content-Type-Options':'nosniff'};
function result(status,body,headers={}) {return {status,body,headers:{...PHOTO_HEADERS,...headers}};}
function present(p){return {...p,url:`/api/run-photos?id=${p.id}&run_id=${p.run_id}`};}
function path(p){return `${p.run_id}/${p.id}.jpg`;}

export async function sanitizePhoto(base64) {
 if(typeof base64!=='string'||base64.length>Math.ceil(MAX_PHOTO_BYTES/3)*4||!base64.length||base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
  throw new Error('Choose a JPEG, PNG or WebP photo under 3 MB. Resize it first if needed.');
 const input=Buffer.from(base64,'base64');
 if(input.length>MAX_PHOTO_BYTES) throw new Error('Resize this photo to under 3 MB first.');
 const decoder=sharp(input,{limitInputPixels:40_000_000,failOn:'error',animated:false});
 const meta=await decoder.metadata();
 if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)
  throw new Error('Choose a still JPEG, PNG or WebP photo.');
 // rotate applies EXIF orientation before discarding all metadata; never call withMetadata.
 const {data,info}=await decoder.rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true})
  .flatten({background:'#fff'}).jpeg({quality:85}).toBuffer({resolveWithObject:true});
 if(data.length>MAX_PHOTO_BYTES) throw new Error('Resize this photo to under 3 MB first.');
 return {data,width:info.width,height:info.height};
}

export async function runPhotos({method,headers={},query={},body},config,fetchImpl=fetch) {
 try {
  if(!['GET','POST','PATCH','DELETE'].includes(method)) return result(405,{error:'Use GET, POST, PATCH or DELETE.'},{Allow:'GET, POST, PATCH, DELETE'});
  if(!config.STORAGE_KEY) return result(503,{error:'Photo storage is not available yet.'});
  const bearer=String(headers.authorization||'');
  if(bearer && !/^Bearer [A-Za-z0-9._~-]+$/.test(bearer)) return result(401,{error:'Sign in again to manage photos.'});
  if(method!=='GET'&&!bearer) return result(401,{error:'Sign in to manage photos.'});
  if(method==='POST'&&Number(headers['content-length']||0)>4_200_000) return result(413,{error:'Resize this photo to under 3 MB first.'});
  const runId=['POST','PATCH'].includes(method)?body?.run_id:query.run_id;
  if(runId!==undefined&&!UUID.test(String(runId))) return result(400,{error:'Choose a saved run.'});
  if(method==='POST'&&!runId) return result(400,{error:'Save the session privately before adding photos.'});
  if(query.id!==undefined&&!UUID.test(String(query.id))) return result(400,{error:'Photo not found.'});
  const dbHeaders={apikey:config.SB_KEY,...(bearer?{Authorization:bearer}:{}),
   'Accept-Profile':'strava','Content-Profile':'strava','Content-Type':'application/json',
   ...(runId?{'x-grinder-run-id':runId}:{})};
  async function request(url,opts={}) {
   return fetchImpl(config.SB_URL+url,{...opts,headers:{...dbHeaders,...opts.headers},cache:'no-store',signal:AbortSignal.timeout(15000)});
  }
  async function storage(url,opts={}) {
   // Server capability is confined to this bucket after requester-JWT access checks.
   return fetchImpl(config.SB_URL+'/storage/v1/object/'+url,{...opts,
    headers:{apikey:config.STORAGE_KEY,Authorization:`Bearer ${config.STORAGE_KEY}`,'Content-Type':'application/json',...opts.headers},
    cache:'no-store',signal:AbortSignal.timeout(15000)});
  }
  async function rows(url,opts={}) {
   const response=await request('/rest/v1/'+url,opts);
   if(!response.ok) {const error=new Error('Photo request failed.');error.status=response.status;throw error;}
   return response.status===204?[]:await response.json();
  }
  async function ownsRun(id) {
   const owner=await rows('rpc/grinder_profile_id',{method:'POST',body:'{}'});
   if(!UUID.test(String(owner))) return false;
   return (await rows('runs?select=id&id=eq.'+id+'&profile_id=eq.'+owner)).length>0;
  }
  async function eraseOrQueue(p) {
   try {
    const removed=await storage(BUCKET,{method:'DELETE',body:JSON.stringify({prefixes:[path(p)]})});
    if(removed.ok) return;
   } catch {}
   // The metadata may already have cascaded away and its original queue entry been drained.
   // Recreate only this request's erasure obligation using the server capability.
   const queued=await fetchImpl(config.SB_URL+'/rest/v1/photo_deletion_queue',{method:'POST',
    headers:{apikey:config.STORAGE_KEY,Authorization:`Bearer ${config.STORAGE_KEY}`,
     'Content-Type':'application/json','Content-Profile':'strava',Prefer:'resolution=ignore-duplicates'},
    body:JSON.stringify({object_name:path(p)}),cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!queued.ok) throw new Error('Photo cleanup could not be confirmed.');
  }
  if(method==='PATCH') {
   if(!runId||!UUID.test(String(body?.photo_id))) return result(400,{error:'Choose a saved photo for this run.'});
   if(!await ownsRun(runId)) return result(404,{error:'Run not found.'});
   try {
    const chosen=await rows('rpc/choose_run_cover',{method:'POST',body:JSON.stringify({target_run:runId,target_photo:body.photo_id})});
    return result(200,{cover_photo_id:chosen});
   } catch {return result(404,{error:'This photo is not available on your run.'});}
  }
  if(method==='POST') {
   // Reject invalid tokens and other people's runs before spending image-decoder resources.
   if(!await ownsRun(runId)) return result(404,{error:'Run not found.'});
   // INSERT RLS proves ownership and the captured source before the server writes any bytes.
   const image=await sanitizePhoto(body?.image_base64).catch(()=>null);
   if(!image) return result(400,{error:'Choose a still JPEG, PNG or WebP photo under 3 MB (up to 40 megapixels).'});
   const digest=createHash('sha256').update(image.data).digest('hex');
   async function existingPhoto(){
    const candidates=await rows('run_photos?select='+fields+',content_sha256&run_id=eq.'+runId);
    for(const candidate of candidates){
     if(candidate.content_sha256&&candidate.content_sha256!==digest)continue;
     const stored=await storage('authenticated/'+BUCKET+'/'+path(candidate),{method:'GET'});
     if(!stored.ok){if(candidate.content_sha256===digest)return result(409,{error:'This photo is still being added. Wait a moment, then try again.'});continue;}
     if(createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex')===digest){
      const {content_sha256,...visible}=candidate;
      return result(200,{photo:present(visible),duplicate:true});
     }
    }
    return null;
   }
   const prior=await existingPhoto();if(prior)return prior;
   const p={id:randomUUID(),run_id:runId,width:image.width,height:image.height,byte_size:image.data.length,content_sha256:digest};
   let saved;
   try {saved=await rows('run_photos?select='+fields,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(p)});}
   catch(error) {if(error.status===409){const prior=await existingPhoto();if(prior)return prior;}return result(error.status===401?401:400,{error:'This run cannot accept the photo. Use your own recorded session, with no more than six photos.'});}
   let uploaded;
   try {uploaded=await storage(BUCKET+'/'+path(p),{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:image.data});} catch {}
   if(!uploaded?.ok) {
    await eraseOrQueue(p);
    try {await rows('run_photos?id=eq.'+p.id,{method:'DELETE'});} catch {}
    return result(503,{error:'Photo upload did not complete. Try again.'});
   }
   let stillSaved;
   try {stillSaved=await rows('run_photos?select=id&id=eq.'+p.id);} catch(error) {await eraseOrQueue(p);throw error;}
   if(!stillSaved.length) {
    await eraseOrQueue(p);
    return result(409,{error:'The run or photo was removed during upload. Nothing was added.'});
   }
   return result(201,{photo:present(saved[0])});
  }
  if(!query.id) {
   if(method==='DELETE'||!runId) return result(400,{error:'Choose a saved run or photo.'});
   const accessible=await rows('runs?select=id&id=eq.'+runId);
   if(!accessible.length) return result(404,{error:'Run not found.'});
   const photos=await rows('run_photos?select='+fields+'&run_id=eq.'+runId+'&order=is_cover.desc,created_at.asc,id.asc');
   return result(200,{photos:photos.map(present)});
  }
  const found=await rows('run_photos?select='+fields+'&id=eq.'+query.id+(runId?'&run_id=eq.'+runId:''));
  if(!found.length) return result(404,{error:'Photo not found.'});
  const p=found[0];
  if(method==='DELETE') {
   // Check owner under caller JWT before using the server Storage capability.
   if(!await ownsRun(p.run_id)) return result(404,{error:'Photo not found.'});
   const removed=await storage(BUCKET,{method:'DELETE',body:JSON.stringify({prefixes:[path(p)]})});
   if(!removed.ok) return result(503,{error:'Photo was not removed. Try again.'});
   await rows('run_photos?id=eq.'+p.id,{method:'DELETE'});
   return result(200,{removed:true});
  }
  const image=await storage('authenticated/'+BUCKET+'/'+path(p),{method:'GET'});
  if(!image.ok) return result(404,{error:'Photo not found.'});
  // Metadata RLS checked on every request. No signed URL survives a revoke or delete.
  return result(200,Buffer.from(await image.arrayBuffer()),{'Content-Type':'image/jpeg','Content-Disposition':'inline'});
 } catch(error) {
  if(error.status===401) return result(401,{error:'Your sign-in expired. Sign in again to manage photos.'});
  if(error.status===403) return result(404,{error:'Photo not found.'});
  return result(503,{error:'Photos are unavailable. Try again.'});
 }
}
