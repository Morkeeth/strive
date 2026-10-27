// Real SQL in disposable PostgreSQL/WASM. Never connects to hosted STRIVE.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Blob} from 'node:buffer';
import {bootDisposable,seedJourneyActors,CASEY,RILEY} from './disposable-supabase.mjs';

globalThis.Blob=Blob;
const {db,as}=await bootDisposable();
let n=0;
async function privateRun(owner){
  await db.exec('reset role');
  const revision=createHash('sha256').update('TEST DATA alert '+(++n)).digest('hex');
  const {rows}=await db.query(`insert into strava.runs
    (profile_id,title,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm)
    values($1,$2,'private','Codex',1,$3,'elapsed','[1]'::jsonb)
    returning id,created_at`,[owner,'TEST DATA '+n,revision]);
  return rows[0];
}
async function counts(owner){
  await as(owner);
  const {rows}=await db.query('select strava.review_alert_counts() as value');
  return rows[0].value;
}
try{
  await seedJourneyActors(db);
  await privateRun(CASEY);await privateRun(CASEY);
  assert.deepEqual(await counts(CASEY),{new_count:0,pending_count:2},'first read baselines old private backlog');
  const arrival=await privateRun(CASEY);
  assert.deepEqual(await counts(CASEY),{new_count:1,pending_count:3},'new private run raises one alert');
  await as(RILEY);
  await assert.rejects(()=>db.query('select strava.mark_review_alerts_seen($1::timestamptz,$2::uuid)',[arrival.created_at,arrival.id]),/owned waiting run/);
  assert.deepEqual(await counts(CASEY),{new_count:1,pending_count:3},'another account cannot acknowledge');
  await as(CASEY);
  await db.query('select strava.mark_review_alerts_seen($1::timestamptz,$2::uuid)',[arrival.created_at,arrival.id]);
  assert.deepEqual(await counts(CASEY),{new_count:0,pending_count:3},'opening queue clears alert, preserves backlog');
  await privateRun(RILEY);
  const publicRun=await privateRun(CASEY);
  await db.exec('reset role');
  await db.query('update strava.runs set visibility=$1 where id=$2',['public',publicRun.id]);
  assert.deepEqual(await counts(CASEY),{new_count:0,pending_count:3},'other-account and public runs are excluded');
  console.log('PASS live-baseline 057: old backlog zero alert; new private arrival one; owner-only ack; queue unchanged');
}finally{await db.close()}
