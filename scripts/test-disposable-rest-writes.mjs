import assert from 'node:assert/strict';
import {bootDisposable,seedJourneyActors,startDisposableServer,mintJwt} from './disposable-supabase.mjs';

// The REST shim returns written rows only when asked, as PostgREST does. A plain write then needs
// no SELECT on columns readers cannot select, such as profiles.auth_uid (042_private_auth_uid.sql).
const {db}=await bootDisposable();
await seedJourneyActors(db);
await db.exec('reset role');
const {server,url}=await startDisposableServer(db);
const STRANGER='11000000-0000-0000-0000-0000000000a7',token=mintJwt(STRANGER,'stranger@example.test');
const rest=(method,path,body,extra={})=>fetch(url+'/rest/v1/'+path,{method,body:body&&JSON.stringify(body),
 headers:{apikey:'local-development-only','Accept-Profile':'strava','Content-Profile':'strava','Content-Type':'application/json',Authorization:'Bearer '+token,...extra}});
const stored=async()=>(await db.query('select handle,display_name from strava.profiles where id=$1',[STRANGER])).rows[0];
try {
 const created=await rest('POST','profiles',{id:STRANGER,auth_uid:STRANGER,handle:'test-stranger',display_name:'TEST DATA Stranger'});
 assert.equal(created.status,200,await created.clone().text());
 assert.deepEqual(await created.json(),[],'a plain insert returns no row');
 assert.deepEqual(await stored(),{handle:'test-stranger',display_name:'TEST DATA Stranger'});

 const renamed=await rest('PATCH','profiles?id=eq.'+STRANGER,{display_name:'TEST DATA Stranger renamed'});
 assert.equal(renamed.status,200,await renamed.clone().text());
 assert.deepEqual(await renamed.json(),[],'a plain update returns no row');
 assert.equal((await stored()).display_name,'TEST DATA Stranger renamed');

 const named=await rest('PATCH','profiles?id=eq.'+STRANGER+'&select=id,display_name',{display_name:'TEST DATA Stranger named'},{Prefer:'return=representation'});
 assert.deepEqual(await named.json(),[{id:STRANGER,display_name:'TEST DATA Stranger named'}],'named columns come back when asked');

 const everything=await rest('PATCH','profiles?id=eq.'+STRANGER,{display_name:'TEST DATA Stranger all'},{Prefer:'return=representation'});
 assert.ok(!everything.ok,'asking for every column includes auth_uid');
 assert.equal((await everything.json()).code,'42501');
 console.log('PASS REST shim writes: rows only when asked; plain profile insert and update need no auth_uid read; * stays refused');
} finally {
 server.close();await db.close();
}
