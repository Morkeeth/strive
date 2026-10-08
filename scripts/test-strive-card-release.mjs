import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {bootDisposable,seedJourneyActors,CASEY} from './disposable-supabase.mjs';
const sql=execFileSync('python3',['scripts/prepare-strive-card-release.py'],{encoding:'utf8'});
const {db}=await bootDisposable();
try {
 await seedJourneyActors(db);
 await assert.rejects(db.exec(sql),/already exists/); await db.exec('rollback');
 await db.exec('drop trigger private_day_choices on strava.profiles; drop function strava.reject_public_day_choices(); drop function strava.read_day_card(uuid,text,text); drop function strava.save_day_card(text,jsonb); drop table strava.day_card_choices; drop table strava.project_follows');
 await db.query('update strava.profiles set rig=$1 where id=$2',[JSON.stringify({day_cards:['invalid'],preserved:'yes'}),CASEY]);
 await assert.rejects(db.exec(sql),/Invalid legacy card container/); await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('strava.day_card_choices') as t")).rows[0].t,null);
 const choices={v:2,title:'TEST DATA private choice'};
 await db.query('update strava.profiles set rig=$1 where id=$2',[JSON.stringify({day_cards:{'2026-10-05_2026-10-06':choices},preserved:'yes'}),CASEY]);
 await db.exec(sql);
 assert.deepEqual((await db.query('select choices from strava.day_card_choices where profile_id=$1',[CASEY])).rows[0].choices,choices);
 assert.deepEqual((await db.query('select rig from strava.profiles where id=$1',[CASEY])).rows[0].rig,{preserved:'yes'});
 assert.ok((await db.query("select to_regclass('strava.project_follows') as t")).rows[0].t);
 console.log('PASS: atomic STRIVE bundle migrates private choices, preserves unrelated settings, rejects existing migration and malformed source without partial writes');
} finally {await db.close()}
