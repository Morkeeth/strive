import assert from 'node:assert/strict';
import handler from '../api/run.js';

// GET /r/<id>.json (#66): the public card's facts as JSON; private and missing runs are one 404.
const publicId='90a16040-8ad5-4096-978c-8b1f78f3dd2f';
const privateId='11111111-1111-1111-1111-111111111111';
const missingId='22222222-2222-2222-2222-222222222222';
const ridge=Array.from({length:50},(_,i)=>i%5);
const rows={
 [publicId]:{id:publicId,profile_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',title:'TEST DATA ship the json endpoint',caption:'TEST DATA caption',
  project:'strive',harness:'Claude Code',visibility:'public',started_at:'2026-10-10T09:00:00+00:00',prompts:6,tool_calls:42,commits:3,files_touched:null,
  duration_s:2533.5,ridge,ridge_basis:'wall-time',ridge_wall_seconds:2533.5,worker_bins:null,commit_bins:[4,9],
  shipped:['TEST DATA endpoint',''],repo_url:'https://github.com/example/strive',receipts:[{label:'PR',url:'https://github.com/example/strive/pull/1'},{label:'bad',url:'http://insecure.example'}],
  code_route:null,auth_uid:'should-never-appear',profiles:{handle:'TestBuilder',display_name:'TEST DATA Builder'}},
 // A permissive REST layer returning a private row must still not reach the JSON.
 [privateId]:{id:privateId,title:'Secret title',visibility:'private',profiles:{handle:'testbuilder'}},
};
globalThis.fetch=async raw=>{
 const url=new URL(raw);
 if(url.pathname.endsWith('/runs')){const id=(url.searchParams.get('id')||'').slice(3);return {ok:true,status:200,json:async()=>rows[id]?[rows[id]]:[]}}
 throw Error('Unexpected URL '+url);
};
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v},end(b){this.body=b}}}
async function get(id){const res=response();await handler({query:{id},headers:{}},res);return res}

const ok=await get(publicId+'.json');
assert.equal(ok.statusCode,200);
assert.equal(ok.headers['content-type'],'application/json; charset=utf-8');
assert.equal(ok.headers['access-control-allow-origin'],'*');
const doc=JSON.parse(ok.body);
assert.deepEqual(Object.keys(doc),['schema_version','id','visibility','url','builder','intent','summary','started_at','harnesses_observed','measured','declared','code_route']);
assert.equal(doc.url,'https://striverun.app/testbuilder/90a16040-test-data-ship-the-json-endpoint');
assert.deepEqual(doc.builder,{handle:'testbuilder',profile_url:'https://striverun.app/testbuilder'});
assert.deepEqual(doc.harnesses_observed,['claude-code']);
assert.deepEqual(doc.measured,{files_touched:null,commits:3,turns_typed:6,tool_calls:42,duration_s:2533.5,
 ridge:{basis:'wall-time',bins:ridge,wall_seconds:2533.5,worker_bins:null,commit_bins:[4,9]}});
assert.deepEqual(doc.declared,{project:'strive',shipped:['TEST DATA endpoint'],repo_url:'https://github.com/example/strive',
 receipts:[{label:'PR',url:'https://github.com/example/strive/pull/1'}]});
assert.equal(doc.code_route,null);
assert.doesNotMatch(ok.body,/auth_uid|should-never-appear|profile_id/);

const hidden=await get(privateId+'.json'),missing=await get(missingId+'.json'),junk=await get('not-a-run.json');
for(const res of [hidden,missing,junk]){
 assert.equal(res.statusCode,404);
 assert.equal(res.body,JSON.stringify({error:'This public run is unavailable.'}));
 assert.match(res.headers['cache-control'],/no-store/);
}
// The project name follows the one reader rule (site/run-contract.js projectLabel): a workspace
// slug built from a home path never leaves with the OS account name in it.
const {runJson}=await import('../server/run-json.mjs');
const declared=project=>runJson({...rows[publicId],project}).declared.project;
assert.equal(declared('Users-morkeeth-code-app'),'code-app');
assert.doesNotMatch(JSON.stringify(runJson({...rows[publicId],project:'Users-morkeeth-code-app'})),/morkeeth/);
assert.equal(declared('-home-dave-proj'),'proj');
assert.equal(declared('Users-morkeeth'),null,'a bare home directory is an unknown project');
assert.equal(declared('session'),null);
assert.equal(declared('agentgrinder-public'),'agentgrinder-public','an ordinary name is unchanged');
const page=await get(publicId);
assert.equal(page.headers['content-type'],'text/html; charset=utf-8','the HTML share page is unchanged');
console.log('PASS: /r/<id>.json returns the public card as JSON; private, missing and malformed runs share one 404');
