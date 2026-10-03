// Server maintenance only. Drains at most 100 queued objects; no paths/keys/bytes logged.
// Run after account/run deletions or on a scheduled maintenance worker.
import {runtimeConfig} from '../server/runtime-config.mjs';
export async function cleanupPhotos(config,fetchImpl=fetch) {
 if(!config.STORAGE_KEY) throw new Error('STRIVE_STORAGE_SERVICE_ROLE_KEY is required.');
 const headers={apikey:config.STORAGE_KEY,Authorization:`Bearer ${config.STORAGE_KEY}`,
  'Accept-Profile':'strava','Content-Profile':'strava','Content-Type':'application/json'};
 const request=(path,opts={})=>fetchImpl(config.SB_URL+path,{...opts,headers,cache:'no-store',signal:AbortSignal.timeout(5000)});
 const response=await request('/rest/v1/photo_deletion_queue?select=object_name&order=requested_at.asc&limit=100');
 if(!response.ok) throw new Error('Could not read the deletion queue.');
 const queued=await response.json();
 if(!Array.isArray(queued)||queued.length>100) throw new Error('Unexpected deletion queue response.');
 // Validate the whole response before any deletion. Immutable generated paths only.
 const names=queued.map(row=>row.object_name);
 if(names.some(name=>typeof name!=='string'||!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(name)))
  throw new Error('Unexpected photo object path in queue.');
 const batches=[];
 for(let i=0;i<names.length;i+=20)batches.push(names.slice(i,i+20));
 // At most five concurrent batches, each with delete then acknowledge. The queue read
 // plus two bounded request stages take at most 15s of network waits, not 201 waits.
 const outcomes=await Promise.allSettled(batches.map(async batch=>{
  const deleted=await request('/storage/v1/object/strive-run-photos',{method:'DELETE',body:JSON.stringify({prefixes:batch})});
  if(!deleted.ok) throw new Error('Photo deletion failed; queue entry retained.');
  // Small filters avoid proxy URL limits. Acknowledgement follows successful storage erase.
  const filter=encodeURIComponent('('+batch.map(name=>JSON.stringify(name)).join(',')+')');
  const acknowledged=await request('/rest/v1/photo_deletion_queue?object_name=in.'+filter,{method:'DELETE'});
  if(!acknowledged.ok) throw new Error('Deletion queue acknowledgement failed; retry is safe.');
  return batch.length;
 }));
 const failure=outcomes.find(outcome=>outcome.status==='rejected');
 if(failure)throw failure.reason;
 const removed=outcomes.reduce((sum,outcome)=>sum+outcome.value,0);
 return {removed,remaining_unknown:queued.length===100};
}
if(import.meta.url===new URL(process.argv[1],'file:').href) {
 try {console.log(JSON.stringify(await cleanupPhotos({...runtimeConfig(),STORAGE_KEY:process.env.STRIVE_STORAGE_SERVICE_ROLE_KEY})));}
 catch(error) {console.error(error.message);process.exitCode=1;}
}
