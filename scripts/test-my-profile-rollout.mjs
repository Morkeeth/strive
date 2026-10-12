import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// The site can ship before migration 042: a missing my_profile() falls back to the old owner read.
const GrinderAuth=createRequire(import.meta.url)('../site/auth.js');
const user={id:'u-1',identities:[]};
function client(rpcResult){
 const calls=[];
 return {calls,auth:{async getSession(){return {data:{session:{user}},error:null}}},
  rpc(name){calls.push(['rpc',name]);return {maybeSingle:async()=>rpcResult}},
  from(table){const filters=[];const q={select(c){calls.push(['select',table,c]);return q},eq(k,v){filters.push([k,v]);return q},
   maybeSingle:async()=>{calls.push(['filters',filters]);return {data:{id:'p-1',auth_uid:'u-1',handle:'old-path'},error:null}}};return q}};
}
const after=client({data:{id:'p-1',auth_uid:'u-1',handle:'my-profile'},error:null});
assert.equal((await GrinderAuth.create({client:after}).current()).profile.handle,'my-profile');
assert.deepEqual(after.calls,[['rpc','my_profile']],'with 042 applied, auth_uid is read only through my_profile()');
const before=client({data:null,error:{code:'PGRST202',message:'Could not find the function strava.my_profile'}});
assert.equal((await GrinderAuth.create({client:before}).current()).profile.handle,'old-path');
assert.deepEqual(before.calls,[['rpc','my_profile'],['select','profiles','*'],['filters',[['auth_uid','u-1']]]],'before 042, the old owner read is used');
const plainPostgres=client({data:null,error:{code:'42883',message:'function strava.my_profile() does not exist'}});
assert.equal((await GrinderAuth.create({client:plainPostgres}).current()).profile.handle,'old-path','a PostgREST-less stand-in reports the same miss as 42883');
const broken=client({data:null,error:{code:'42501',message:'permission denied'}});
await assert.rejects(GrinderAuth.create({client:broken}).current(),'any other error is not papered over');
assert.deepEqual(broken.calls,[['rpc','my_profile']]);
console.log('PASS my_profile rollout: uses the RPC when present, the old owner read only when the function is missing');
