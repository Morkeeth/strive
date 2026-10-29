// Feature requests (059), research consent (060) and private self marks (061) on a real Postgres
// (PGlite) with anon/authenticated roles and row level security. Runs twice: on the full install,
// and with 058 removed, because 058 is not applied in production. Then rolls back and re-applies.
import {PGlite} from '@electric-sql/pglite';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error(e.stack?.split('\n').slice(0,6).join('\n'));process.exit(1)});

const full=execFileSync('python3',['scripts/prepare-strava-database.py'],{encoding:'utf8'});
const without058=full.replace(/-- strava\/058_manual_project_updates\.sql[\s\S]*?(?=-- strava\/059_)/,'');
assert.ok(full.includes('-- strava/058_')&&!without058.includes('-- strava/058_'),'058 removed for the second run');
const sha=s=>createHash('sha256').update(s).digest('hex');
const A='20000000-0000-0000-0000-00000000000a',B='20000000-0000-0000-0000-00000000000b',C='20000000-0000-0000-0000-00000000000c';

async function install(sql){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;alter default privileges grant all on tables to anon,authenticated;alter default privileges grant execute on functions to anon,authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;`);
 await db.exec(sql);
 await db.exec(`set search_path=strava,pg_temp;insert into profiles(id,auth_uid,name) values('${A}','${A}','Ana'),('${B}','${B}','Ben'),('${C}','${C}','Cy');`);
 await db.exec(`insert into runs(id,profile_id,title,project,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm) values('30000000-0000-0000-0000-00000000000a','${A}','Ana run','Tide','private','Codex',1,repeat('a',64),'elapsed','[1,2]'),('30000000-0000-0000-0000-00000000000b','${B}','Ben run','Kite','private','Codex',1,repeat('b',64),'elapsed','[1,2]');`);
 return db;
}
const as=async(db,who)=>{await db.exec('reset role');if(who){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who])}else{await db.exec('set role anon');await db.query("select set_config('request.jwt.claim.sub','',false)")}};
const root=async db=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)")};
const one=async(db,q,p=[])=>(await db.query(q,p)).rows[0];
const all=async(db,q,p=[])=>(await db.query(q,p)).rows;
async function agent(db,owner,{visibility='public',scopes=['reply'],audiences=['public'],revoked=false}={}){
 await root(db);const id=(await one(db,'insert into grinder_agents(owner_id,name,visibility) values($1,$2,$3) returning id',[owner,'Scout',visibility])).id;
 const token='tok-'+randomUUID();await db.query("insert into grinder_agent_tokens(agent_id,token_hash,scopes,audiences,expires_at,revoked) values($1,$2,$3,$4,now()+interval '1 day',$5)",[id,sha(token),scopes,audiences,revoked]);
 return {id,token};
}

async function suite(sql,label){
 const db=await install(sql);
 // People post. Idempotent by request ID; validated; rate limited.
 await as(db,A);const r1=randomUUID();
 const made=await one(db,'select create_feature_request($1,$2,$3,$4) as x',[r1,'Export my runs','Let me download every run as JSON.',JSON.stringify([{label:'Issue',url:'https://github.com/Morkeeth/strive/issues/1'}])]);
 assert.equal(made.x.existing,false);
 assert.equal((await one(db,'select create_feature_request($1,$2,$3) as x',[r1,'Export my runs','Let me download every run as JSON.'])).x.existing,true,'retry is idempotent');
 for(const bad of [[{label:'x',url:'javascript:alert(1)'}],[{label:'x',url:'https://a.b',extra:1}],Array(6).fill({label:'x',url:'https://a.b'}),[{label:'x',url:'https://user@a.b'}]])
  await assert.rejects(db.query('select create_feature_request($1,$2,$3,$4)',[randomUUID(),'Valid title','Body',JSON.stringify(bad)]),/Evidence/,JSON.stringify(bad));
 await assert.rejects(db.query('select create_feature_request($1,$2,$3)',[randomUUID(),'abc','Body']),/title/);
 // Missing keys, wrong types and non-arrays are false, never NULL.
 await root(db);
 const ok=async v=>(await one(db,'select strava.feature_evidence_ok($1::jsonb) as v',[v===undefined?null:JSON.stringify(v)])).v;
 for(const bad of [[{url:'https://example.com',other:'x'}],[{label:'x',other:'y'}],[{label:null,url:'https://example.com'}],[{label:1,url:'https://example.com'}],[{label:'x',url:null}],[{label:'x',url:['https://example.com']}],[{label:'x'}],[{url:'https://example.com'}],[{}],['https://example.com'],[null],[1],
   [{label:'x',url:'https://localhost/a'}],[{label:'x',url:'http://127.0.0.1/'}],[{label:'x',url:'http://thing.local/'}],[{label:'x',url:'https://api.internal/x'}],[{label:'x',url:'https://intranet/'}],[{label:'',url:'https://example.com'}]])
  assert.equal(await ok(bad),false,JSON.stringify(bad));
 for(const bad of ['x',1,true,{},{label:'x',url:'https://example.com'}])assert.equal(await ok(bad),false,'not an array: '+JSON.stringify(bad));
 assert.equal(await ok(undefined),false,'SQL null');
 assert.equal(await ok([]),true);assert.equal(await ok([{label:'Issue',url:'https://github.com/a/b/issues/1?x=1#y'}]),true);
 await as(db,A);await assert.rejects(db.query('select create_feature_request($1,$2,$3,$4)',[randomUUID(),'Valid title','Body',JSON.stringify([{url:'https://example.com',other:'x'}])]),/Evidence/,'two keys but no label');
 await assert.rejects(db.query('select create_feature_request($1,$2,$3,$4)',[randomUUID(),'Valid title','Body','"https://example.com"']),/Evidence/,'scalar evidence');
 await as(db,B);await assert.rejects(db.query('select create_feature_request($1,$2,$3)',[r1,'Steal the id','Body']),/already used/);
 // Clients cannot write the tables directly or move state.
 await assert.rejects(db.query("insert into feature_requests(id,author_profile,title,body) values($1,$2,'Direct insert','b')",[randomUUID(),B]));
 await assert.rejects(db.query("update feature_requests set state='shipped' where id=$1",[r1]),/permission denied/);
 await assert.rejects(db.query("select set_feature_request_state($1,'shipped')",[r1]),/permission denied/);
 await assert.rejects(db.query('select feature_write($1,null,$2,$3,$4)',[B,'request',randomUUID(),'{}']),/permission denied/);
 await as(db,null);await assert.rejects(db.query('select create_feature_request($1,$2,$3)',[randomUUID(),'Anon post','Body']),/permission denied|Sign in/);
 await assert.rejects(db.query('select vote_feature_request($1)',[r1]),/permission denied|Sign in/);
 assert.equal((await all(db,'select * from feature_request_board()')).length,1,'anon can read the board');
 await assert.rejects(db.query('select * from feature_votes'),/permission denied/);

 // Votes: one per owner, never your own, people and agents counted apart.
 await as(db,A);await assert.rejects(db.query('select vote_feature_request($1)',[r1]),/own request/);
 await as(db,B);await one(db,'select vote_feature_request($1)',[r1]);assert.equal((await one(db,'select vote_feature_request($1) as x',[r1])).x.existing,true);
 const cAgent=await agent(db,C);await as(db,null);
 const av=await one(db,'select feature_agent_action($1,$2,$3,$4) as x',[cAgent.token,'vote',JSON.stringify({feature_request_id:r1}),randomUUID()]);
 assert.equal(av.x.action,'feature_vote');
 await as(db,C);assert.equal((await one(db,'select vote_feature_request($1) as x',[r1])).x.existing,true,'owner whose agent voted cannot vote again in person');
 let row=(await all(db,'select * from feature_request_board() where id=$1',[r1]))[0];
 assert.equal(Number(row.people_votes),1);assert.equal(Number(row.agent_votes),1);assert.equal(row.author_kind,'person');assert.equal(row.my_vote,'agent');assert.equal(row.mine,false);
 assert.equal(await one(db,'select count(*)::int as n from feature_votes').then(r=>r.n),1,'a person sees only their own vote');
 await as(db,B);assert.equal((await db.query('delete from feature_votes where request_id=$1',[r1])).affectedRows,1,'unvote');
 assert.equal(Number((await all(db,'select * from feature_request_board() where id=$1',[r1]))[0].people_votes),0);
 await as(db,C);assert.equal((await db.query('delete from feature_votes where voter_profile=$1',[A])).affectedRows,0,'cannot remove another vote');

 // Agents: reply scope, public audience and a public agent profile, like agent replies.
 const rq=randomUUID(),payload=JSON.stringify({title:'Agent asks for webhooks',body:'Notify my bot when a reply lands.',evidence:[{label:'Log',url:'https://example.com/log'}]});
 const posted=await one(db,'select feature_agent_action($1,$2,$3,$4) as x',[cAgent.token,'request',payload,rq]);
 assert.equal((await one(db,'select feature_agent_action($1,$2,$3,$4) as x',[cAgent.token,'request',payload,rq])).x.id,posted.x.id,'agent retry replays');
 await assert.rejects(db.query('select feature_agent_action($1,$2,$3,$4)',[cAgent.token,'vote',JSON.stringify({feature_request_id:r1}),rq]),/reused/);
 await assert.rejects(db.query('select feature_agent_action($1,$2,$3,$4)',[cAgent.token,'vote',JSON.stringify({feature_request_id:posted.x.id}),randomUUID()]),/own request/,'an agent cannot vote for its owner');
 await as(db,B);await assert.rejects(db.query('insert into feature_votes(request_id,voter_profile,kind) values($1,$2,$3)',[posted.x.id,B,'person']),/permission denied/);await as(db,null);
 row=(await all(db,'select * from feature_request_board() where id=$1',[posted.x.id]))[0];assert.equal(row.author_kind,'agent');assert.equal(row.agent_name,'Scout');assert.equal(row.author_name,'Cy');
 for(const opts of [{visibility:'private'},{scopes:['draft','publish']},{audiences:['private']},{revoked:true}]){
  const t=await agent(db,B,opts);await as(db,null);
  await assert.rejects(db.query('select feature_agent_action($1,$2,$3,$4)',[t.token,'request',payload,randomUUID()]),/Agent access|reply scope|public/,JSON.stringify(opts));
 }
 await assert.rejects(db.query('select feature_agent_action($1,$2,$3,$4)',['not-a-token','request',payload,randomUUID()]),/Agent access/);
 await assert.rejects(db.query('select feature_agent_action($1,$2,$3,$4)',[cAgent.token,'grant_consent','{}',randomUUID()]),/action/,'agents have no consent action');

 // Ranking: open requests by people votes; closed ones after. Agent votes do not rank.
 await root(db);await db.query("select set_feature_request_state($1,'planned','Next month')",[r1]);
 await as(db,A);await one(db,'select vote_feature_request($1)',[posted.x.id]);
 const board=await all(db,'select id,state,people_votes from feature_request_board()');
 assert.equal(board[0].id,posted.x.id,'more people votes rank first');
 await root(db);await db.query("select set_feature_request_state($1,'shipped')",[posted.x.id]);
 await as(db,B);await assert.rejects(db.query('select vote_feature_request($1)',[posted.x.id]),/closed/);
 assert.equal((await all(db,'select id from feature_request_board()'))[0].id,r1,'closed requests sort after open ones');

 // Closed or decided requests keep their thread and votes.
 await root(db);await assert.rejects(db.query("select set_feature_request_state($1,'done')",[r1]),/Unknown state/);
 await assert.rejects(db.query("select set_feature_request_state($1,'duplicate',null,$1)",[r1]),/duplicate itself/);
 await assert.rejects(db.query("select set_feature_request_state($1,'duplicate')",[r1]),/duplicate_of/);
 await as(db,A);assert.equal((await db.query('delete from feature_requests where id=$1',[r1])).affectedRows,0,'no withdraw once planned');
 await as(db,A);assert.equal((await db.query('delete from feature_votes where request_id=$1',[posted.x.id])).affectedRows,0,'no unvote once shipped');
 // Withdraw: only the author.
 const r2=randomUUID();await as(db,B);await one(db,'select create_feature_request($1,$2,$3)',[r2,'Temporary ask','Body']);
 await as(db,A);assert.equal((await db.query('delete from feature_requests where id=$1',[r2])).affectedRows,0);
 await as(db,B);assert.equal((await db.query('delete from feature_requests where id=$1',[r2])).affectedRows,1);

 // Research consent: off by default, scoped, server checked, separate from publishing.
 await as(db,A);
 assert.equal((await all(db,'select * from research_consents')).length,0,'no consent by default');
 await root(db);await db.query("update runs set visibility='public' where profile_id=$1",[A]);
 await as(db,A);assert.equal((await all(db,'select * from research_consents')).length,0,'publishing creates no consent');
 await assert.rejects(db.query("select grant_research_consent('raw_transcript')"),/supported research scope/);
 await assert.rejects(db.query("select grant_research_consent('update_text','Kite')"),/your own projects/,'another person\'s project');
 await assert.rejects(db.query("select grant_research_consent('update_text','Nope')"),/your own projects/);
 await assert.rejects(db.query("insert into research_consents(profile_id,scope) values($1,'update_text')",[A]),/permission denied/);
 await root(db);await db.query("insert into runs(profile_id,title,project,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm) values($1,'Padded','Pad ','private','Codex',1,repeat('e',64),'elapsed','[1]')",[A]);
 await as(db,A);const padded=(await one(db,"select grant_research_consent('update_text','Pad') as id")).id;
 assert.equal((await one(db,'select project from research_consents where id=$1',[padded])).project,'Pad','a stored project with spaces still matches');
 await db.query('select delete_research_consent($1)',[padded]);
 const g=(await one(db,"select grant_research_consent('update_text','Tide') as id")).id;
 assert.equal((await one(db,"select grant_research_consent('update_text','Tide') as id")).id,g,'granting twice keeps one active consent');
 const g2=(await one(db,"select grant_research_consent('run_measurements') as id")).id;
 await root(db);const vis=(await one(db,'select visibility from runs where profile_id=$1',[A])).visibility;assert.equal(vis,'public','consent leaves visibility alone');
 await as(db,B);assert.equal((await all(db,'select * from research_consents')).length,0,'others cannot read my consent');
 assert.equal((await one(db,'select revoke_research_consent($1) as ok',[g])).ok,false,'others cannot revoke');
 assert.equal((await one(db,'select delete_research_consent($1) as n',[g])).n,0,'others cannot delete');
 await as(db,null);await assert.rejects(db.query("select grant_research_consent('update_text')"),/permission denied|Sign in/);
 await assert.rejects(db.query('select export_my_feedback_and_consent()'),/permission denied|Sign in/);
 await as(db,A);assert.equal((await one(db,'select revoke_research_consent($1) as ok',[g])).ok,true);
 const ev=await all(db,'select event from research_consent_events where consent_id=$1 order by id',[g]);assert.deepEqual(ev.map(e=>e.event),['granted','revoked']);
 const again=(await one(db,"select grant_research_consent('update_text','Tide') as id")).id;assert.notEqual(again,g,'a new grant after revoke is a new record');

 // Self marks: own run only, private, not counted anywhere.
 await as(db,A);await db.query('insert into run_self_marks(profile_id,run_id) values($1,$2)',[A,'30000000-0000-0000-0000-00000000000a']);
 await assert.rejects(db.query('insert into run_self_marks(profile_id,run_id) values($1,$2)',[A,'30000000-0000-0000-0000-00000000000b']),/own run/);
 await assert.rejects(db.query('insert into run_self_marks(profile_id,run_id) values($1,$2)',[B,'30000000-0000-0000-0000-00000000000b']),/own run|row-level security/);
 await as(db,B);assert.equal((await all(db,'select * from run_self_marks')).length,0,'others cannot see my mark');
 await as(db,null);await assert.rejects(db.query('select * from run_self_marks'),/permission denied/);
 await root(db);assert.equal((await one(db,'select count(*)::int as n from acks')).n,0,'a self mark is not an ack');

 // Export holds everything, then delete removes consent and its history.
 await as(db,A);const ex=(await one(db,'select export_my_feedback_and_consent() as x')).x;
 assert.equal(ex.format,'strive-feedback-consent-export-v1');assert.equal(ex.research_consents.length,3);assert.equal(ex.research_consent_events.length,4);
 assert.equal(ex.feature_requests.length,1);assert.equal(ex.feature_votes.length,1);assert.equal(ex.self_marks.length,1);
 await as(db,B);assert.equal((await one(db,'select export_my_feedback_and_consent() as x')).x.research_consents.length,0,'export is only mine');
 await as(db,A);assert.equal((await one(db,'select delete_research_consent() as n')).n,3);
 await root(db);assert.equal((await one(db,'select count(*)::int as n from research_consent_events where profile_id=$1',[A])).n,0,'delete removes history');
 console.log(label,'ok');
 return db;
}

await suite(without058,'without 058:');
const db=await suite(full,'full install:');

// Rolling back 061 alone leaves export working, with no marks.
await root(db);await db.exec(readFileSync('supabase/rollback/061_run_self_marks.sql','utf8'));
await as(db,A);assert.deepEqual((await one(db,'select export_my_feedback_and_consent() as x')).x.self_marks,[],'export survives 061 rollback');
await root(db);await db.exec(readFileSync('supabase/strava/061_run_self_marks.sql','utf8'));
// Rollback, check nothing is left, re-apply.
await root(db);
for(const f of ['060_research_consent','059_feature_requests','061_run_self_marks'])await db.exec(readFileSync(`supabase/rollback/${f}.sql`,'utf8'));
const left=await all(db,"select relname as n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='strava' and relname ~ '^(feature_|research_consent|run_self_marks)' union all select proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='strava' and proname ~ '^(feature_|create_feature_|vote_feature_|set_feature_|grant_research_|revoke_research_|delete_research_|export_my_|run_self_mark)'");
assert.deepEqual(left,[],'rollback leaves nothing: '+JSON.stringify(left));
for(const f of ['059_feature_requests','060_research_consent','061_run_self_marks'])await db.exec(readFileSync(`supabase/strava/${f}.sql`,'utf8'));
await as(db,A);assert.equal((await all(db,'select * from feature_request_board()')).length,0);
console.log('rollback and re-apply: ok');
