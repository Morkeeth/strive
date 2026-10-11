import assert from 'node:assert/strict';
import {readiness} from '../server/readiness.mjs';
const config={SB_URL:'https://example.supabase.co',SB_KEY:'public-key'};
const good=async(url)=>url.includes('/rpc/')?new Response('{"code":"42501"}',{status:401}):new Response(url.includes('/bucket/')?'{"public":false}':'[]');
const options={fetcher:good,storageKey:'private-key',cronSecret:'test-cron'};
assert.equal((await readiness(config,options)).ready,true);
for(const failed of ['profiles?','runs?','run_photos?','/rpc/','/rpc/choose_run_cover','history_evidence','is_cover','is_selected','/rpc/set_run_photo_selected','/bucket/','photo_deletion_queue?']){
 const result=await readiness(config,{...options,fetcher:(url)=>url.includes(failed)?new Response('{}',{status:404}):good(url)});
 assert.equal(result.ready,false,failed+' failure must fail readiness');
}
assert.equal((await readiness(config,{fetcher:good,storageKey:''})).ready,false);
assert.equal((await readiness(config,{...options,cronSecret:''})).ready,false);
assert.equal((await readiness(config,{...options,fetcher:url=>url.includes('/bucket/')?new Response('{"public":true}'):good(url)})).ready,false);
assert.equal((await readiness(config,{...options,fetcher:async()=>{throw new Error('offline')}})).ready,false);
console.log('Readiness fails closed on missing schema, RPC, storage secret, public bucket and network errors.');
