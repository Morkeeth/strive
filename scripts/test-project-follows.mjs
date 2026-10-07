import assert from 'node:assert/strict';
import {bootDisposable,seedJourneyActors,seedCoachRun,CASEY,RILEY} from './disposable-supabase.mjs';
const {db,as,anonymous,denied}=await bootDisposable();
try {
  await seedJourneyActors(db);
  const pub=await seedCoachRun(db,CASEY,'TEST DATA public project','a'.repeat(64),'now()');
  const priv=await seedCoachRun(db,CASEY,'TEST DATA private project','b'.repeat(64),'now()');
  await db.exec('reset role');
  await db.query("update strava.runs set project='public-chapter',visibility='public' where id=$1",[pub]);
  await db.query("update strava.runs set project='private-chapter',visibility='private' where id=$1",[priv]);
  await as(RILEY);
  await db.query('insert into strava.project_follows(profile_id,project) values($1,$2)',[RILEY,'public-chapter']);
  assert.equal((await db.query('select * from strava.project_follows')).rows.length,1);
  await denied('insert into strava.project_follows(profile_id,project) values($1,$2)',[RILEY,'private-chapter']);
  await denied('insert into strava.project_follows(profile_id,project) values($1,$2)',[CASEY,'public-chapter']);
  await as(CASEY);
  assert.equal((await db.query('select * from strava.project_follows')).rows.length,0,'authors cannot enumerate who follows a project');
  await db.query("update strava.runs set visibility='private' where id=$1",[pub]);
  await as(RILEY);
  assert.equal((await db.query("select * from strava.runs where project in (select project from strava.project_follows) and visibility='public'")).rows.length,0,'following never preserves revoked run access');
  await db.query('delete from strava.project_follows where profile_id=$1',[RILEY]);
  assert.equal((await db.query('select * from strava.project_follows')).rows.length,0);
  await anonymous();
  await denied('select * from strava.project_follows');
  console.log('PASS: project follow persists, private names and other subscriptions denied, revocation removes updates, unfollow and anonymous denial');
} finally {await db.close()}
