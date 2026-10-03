// Probe the capabilities the product actually needs, not merely one reachable table.
export async function readiness(config,{fetcher=fetch,storageKey=process.env.STRIVE_STORAGE_SERVICE_ROLE_KEY,cronSecret=process.env.CRON_SECRET}={}) {
 const headers={apikey:config.SB_KEY,'Accept-Profile':'strava'};
 const read=async(path,extra={})=>{
  try{return await fetcher(config.SB_URL+path,{headers,...extra,signal:AbortSignal.timeout(5000),cache:'no-store'});}
  catch{return null;}
 };
 const tables={
  profiles:'profiles?select=id,handle,github_handle,display_name&limit=0',
  runs:'runs?select=id,title,visibility,measurement_revision,rhythm,ridge,code_route,hero_visual,history_evidence&limit=0',
  photos:'run_photos?select=id,run_id,width,height,byte_size,is_cover&limit=0'
 };
 const checks=Object.fromEntries(await Promise.all(Object.entries(tables).map(async([name,path])=>[name,(await read('/rest/v1/'+path))?.ok?'ready':'unavailable'])));
 // An anonymous caller must reach the RPC but be denied, not receive a missing-function error.
 const discovery=await read('/rest/v1/rpc/strava_github_matches',{method:'POST',headers:{...headers,'Content-Profile':'strava','Content-Type':'application/json'},body:'{"github_ids":[]}'});
 let denied=false;try{denied=[401,403].includes(discovery?.status)&&(await discovery.json()).code==='42501';}catch{}
 checks.discovery=denied?'ready':'unavailable';
 const cover=await read('/rest/v1/rpc/choose_run_cover',{method:'POST',headers:{...headers,'Content-Profile':'strava','Content-Type':'application/json'},body:JSON.stringify({target_run:'00000000-0000-0000-0000-000000000000',target_photo:'00000000-0000-0000-0000-000000000000'})});
 let coverDenied=false;try{coverDenied=[401,403].includes(cover?.status)&&(await cover.json()).code==='42501';}catch{}
 checks.photo_cover=coverDenied?'ready':'unavailable';
 checks.photo_storage='unavailable';
 checks.photo_cleanup='unavailable';
 if(storageKey){
  const storage=await read('/storage/v1/bucket/strive-run-photos',{headers:{apikey:storageKey,Authorization:'Bearer '+storageKey}});
  try{if(storage?.ok&&(await storage.json()).public===false)checks.photo_storage='ready';}catch{}
  if(cronSecret){
   const queue=await read('/rest/v1/photo_deletion_queue?select=object_name&limit=0',{headers:{apikey:storageKey,Authorization:'Bearer '+storageKey,'Accept-Profile':'strava'}});
   if(queue?.ok)checks.photo_cleanup='ready';
  }
 }
 return {ready:Object.values(checks).every(v=>v==='ready'),checks};
}
