// The request board, research consent panel and self mark, driven through a real DOM (jsdom) against
// the real migrated database (PGlite). The client shim runs each call as the signed-in user under
// row level security, the way PostgREST would. No network and no production data.
import {PGlite} from '@electric-sql/pglite';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
process.on('uncaughtException',e=>{console.error(e.stack?.split('\n').slice(0,6).join('\n'));process.exit(1)});
process.on('unhandledRejection',e=>{console.error(e?.stack||e);process.exit(1)});

const A='40000000-0000-0000-0000-00000000000a',B='40000000-0000-0000-0000-00000000000b',RUN='50000000-0000-0000-0000-00000000000a';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;alter default privileges grant all on tables to anon,authenticated;alter default privileges grant execute on functions to anon,authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;`);
await db.exec(execFileSync('python3',['scripts/prepare-strava-database.py'],{encoding:'utf8'}));
await db.exec(`set search_path=strava,pg_temp;insert into profiles(id,auth_uid,name) values('${A}','${A}','Ana'),('${B}','${B}','Ben');
 insert into runs(id,profile_id,title,project,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm) values('${RUN}','${A}','Ana run','Tide','private','Codex',1,repeat('c',64),'elapsed','[1,2]');`);

// A small PostgREST-shaped client. Every call sets the role and user first.
let user=null;const calls=[];
async function asUser(){await db.exec('reset role');if(user){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user])}else{await db.exec('set role anon');await db.query("select set_config('request.jwt.claim.sub','',false)")}}
const fail=e=>({data:null,error:{message:e.message,code:e.code}});
const SETOF=new Set(['feature_request_board']);
const client={
 async rpc(name,args={}){calls.push(name);try{await asUser();const keys=Object.keys(args),vals=keys.map(k=>args[k]!==null&&typeof args[k]==='object'?JSON.stringify(args[k]):args[k]);
  const named=keys.map((k,i)=>`${k}=>$${i+1}${args[k]!==null&&typeof args[k]==='object'?'::jsonb':''}`).join(',');
  const r=await db.query(SETOF.has(name)?`select * from strava.${name}(${named})`:`select strava.${name}(${named}) as v`,vals);
  return {data:SETOF.has(name)?r.rows:r.rows[0].v,error:null}}catch(e){return fail(e)}},
 from(table){const where=[],vals=[];let cols='*',order='',limit='',op='select',row=null;
  const q={select(c){cols=c||'*';return q},eq(k,v){vals.push(v);where.push(`${k}=$${vals.length}`);return q},not(k,is,v){where.push(`${k} is not null`);return q},
   order(k,o){order=` order by ${k} ${o?.ascending===false?'desc':'asc'}`;return q},limit(n){limit=` limit ${Number(n)}`;return q},
   insert(r){op='insert';row=r;return q},delete(){op='delete';return q},
   then(res,rej){return (async()=>{try{await asUser();let r;
    if(op==='insert'){const k=Object.keys(row);r=await db.query(`insert into strava.${table}(${k.join(',')}) values(${k.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row))}
    else if(op==='delete')r=await db.query(`delete from strava.${table}${where.length?' where '+where.join(' and '):''}`,vals);
    else r=await db.query(`select ${cols} from strava.${table}${where.length?' where '+where.join(' and '):''}${order}${limit}`,vals);
    return {data:r.rows,error:null}}catch(e){return fail(e)}})().then(res,rej)}};
  return q}
};
const dom=new JSDOM('<main id="app"></main>',{url:'https://strive.example.com/?feedback',runScripts:'outside-only'}),w=dom.window;
w.confirm=()=>true;
for(const f of ['project-update.js','feature-requests.js','research-consent.js','self-mark.js'])w.eval(readFileSync('site/'+f,'utf8'));
const $=s=>w.document.querySelector(s),$$=s=>[...w.document.querySelectorAll(s)];
const until=async(fn,what)=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out: '+what)};
const n=async(q,p=[])=>{await db.exec('reset role');return (await db.query(q,p)).rows[0].n};
const app=$('#app');let signIns=0;
const mountBoard=async()=>{app.innerHTML='<div id="fr"></div>';await w.StriveRequests({client,me:()=>user?{id:user}:null,slot:$('#fr'),signIn:()=>signIns++})};

// Signed out: the board reads, posting asks for sign-in and writes nothing.
user=null;await mountBoard();assert.match($('#fr-list').textContent,/No requests yet/);
$('#fr-form [name=title]').value='Signed out';$('#fr-form [name=body]').value='x';$('#fr-form').dispatchEvent(new w.Event('submit'));
assert.equal(signIns,1);assert.equal(await n('select count(*)::int n from strava.feature_requests'),0);

// Ana posts with evidence. A bad link is refused before any call.
user=A;await mountBoard();
$('#fr-form [name=title]').value='Export my runs';$('#fr-form [name=body]').value='Download every run as JSON.';
$('#fr-form [name=evidence]').value='javascript:alert(1) bad';calls.length=0;$('#fr-form').dispatchEvent(new w.Event('submit'));
assert.match($('#fr-state').textContent,/public http or https/);assert.ok(!calls.includes('create_feature_request'));
$('#fr-form [name=evidence]').value='https://github.com/Morkeeth/strive/issues/1 Issue';$('#fr-form').dispatchEvent(new w.Event('submit'));
await until(()=>/Posted/.test($('#fr-state').textContent),'post');
assert.equal(await n('select count(*)::int n from strava.feature_requests'),1);
let c=$('.feature-request');assert.match(c.textContent,/Person\s+Ana/);assert.match(c.textContent,/0 people asked/);assert.ok(c.querySelector('[data-withdraw]'));assert.ok(!c.querySelector('[data-vote]'),'no vote on your own request');
assert.equal(c.querySelector('a').getAttribute('href'),'https://github.com/Morkeeth/strive/issues/1');

// Ben votes, sees it, undoes it.
user=B;await mountBoard();$('[data-vote]').click();await until(()=>$('[data-unvote]'),'vote');
assert.match($('.feature-request').textContent,/1 person asked/);assert.match($('[data-unvote]').textContent,/You asked/);
assert.doesNotMatch($('.feature-request').textContent,/agent vote/,'no agent chip without agent votes');
$('[data-unvote]').click();await until(()=>$('[data-vote]'),'unvote');assert.match($('.feature-request').textContent,/0 people asked/);

// Ana withdraws; the request and its votes are gone.
user=B;$('[data-vote]').click();await until(()=>$('[data-unvote]'),'vote again');
user=A;await mountBoard();$('[data-withdraw]').click();await until(()=>/No requests yet/.test($('#fr-list').textContent),'withdraw');
assert.equal(await n('select count(*)::int n from strava.feature_votes'),0);

// Research: an old browser-only yes is shown, never sent.
w.localStorage.setItem('strive-research-preference-v1',JSON.stringify({choice:'yes'}));
app.innerHTML='<section id="rc"></section>';calls.length=0;let downloaded=null;
await w.StriveResearchConsent({client,slot:$('#rc'),profileId:A,download:d=>{downloaded=d}});
assert.match($('#rc').textContent,/You said yes on a device before\. That was never sent/);
assert.match($('#rc').textContent,/Off\./);assert.ok(!calls.includes('grant_research_consent'),'no grant from the old yes');
assert.equal(await n('select count(*)::int n from strava.research_consents'),0);
assert.deepEqual($$('#research-form [name=project] option').map(o=>o.value),['','Tide'],'only my own projects are offered');
$('#research-form [name=project]').value='Tide';$('#research-form').dispatchEvent(new w.Event('submit'));
await until(()=>/Recorded/.test($('#rc').textContent),'grant');
assert.equal(await n("select count(*)::int n from strava.research_consents where profile_id=$1 and project='Tide' and revoked_at is null",[A]),1);
assert.equal(w.localStorage.getItem('strive-research-preference-v1'),null,'old yes cleared after a real choice');
assert.match($('.research-active').textContent,/Tide/);
$('[data-revoke]').click();await until(()=>/Stopped/.test($('#rc').textContent),'revoke');
assert.equal(await n('select count(*)::int n from strava.research_consents where revoked_at is not null'),1);assert.match($('#rc').textContent,/Ended choices \(1\)/);
$('#research-export').click();await until(()=>downloaded,'export');
assert.equal(downloaded.format,'strive-feedback-consent-export-v1');assert.equal(downloaded.research_consents.length,1);
$('#research-delete').click();await until(()=>/Deleted 1 research choice/.test($('#rc').textContent),'delete');
assert.equal(await n('select count(*)::int n from strava.research_consent_events'),0);

// Self mark on the account, then a mark someone else cannot see.
assert.equal(await w.StriveSelfMark.connect(client,A),'account');
assert.equal(await w.StriveSelfMark.toggle(RUN),true);assert.equal(await n('select count(*)::int n from strava.run_self_marks'),1);
user=B;await asUser();assert.equal((await db.query('select * from strava.run_self_marks')).rows.length,0);
user=A;assert.equal(await w.StriveSelfMark.toggle(RUN),false);assert.equal(await n('select count(*)::int n from strava.run_self_marks'),0);

// Before the SQL is applied: say so, record nothing, and never fall back to the browser.
const absent={rpc:async()=>({data:null,error:{code:'PGRST202',message:'Could not find the function'}}),from:()=>{const q={select:()=>q,order:()=>q,eq:()=>q,not:()=>q,limit:()=>q,then:r=>r({data:null,error:{code:'PGRST205',message:'Could not find the table'}})};return q}};
w.localStorage.clear();app.innerHTML='<section id="rc"></section><div id="fr"></div>';
await w.StriveResearchConsent({client:absent,slot:$('#rc'),profileId:A});assert.match($('#rc').textContent,/not available yet\. Nothing is recorded, and research use stays off/);
await w.StriveRequests({client:absent,me:()=>({id:A}),slot:$('#fr')});assert.match($('#fr-list').textContent,/not available yet/);
assert.equal(await w.StriveSelfMark.connect(absent,A),'device','self mark falls back to this browser, labelled as such');
assert.equal(w.localStorage.length,0,'nothing was written to the browser');
console.log('PASS request board, research consent and self mark against migrated SQL through the DOM');
