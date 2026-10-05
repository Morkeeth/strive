// The import preview labels the note optional, and runs_caption_length refuses an empty string.
// An untouched note must therefore reach the database as null, as the edit form already sends it.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bootDisposable,seedJourneyActors,CASEY} from './disposable-supabase.mjs';
const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');
const start=html.indexOf("const caption=$('i_caption').value.trim()"),end=html.indexOf('insert({...base,...coach})',start);
assert.ok(start>0&&end>start,'import save path not found');
const save=html.slice(start,end);
assert.match(save,/[,{]caption:caption\|\|null,/,'the import save must send an empty note as null');
assert.doesNotMatch(save,/rhythm:run\.rhythm\|\|null,caption,/,'the import save must not send the trimmed note unchanged');
const {db}=await bootDisposable();await seedJourneyActors(db);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[CASEY]);await db.exec('set role authenticated');
const insert=caption=>db.query("insert into strava.runs(profile_id,title,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm,caption) values($1,'TEST DATA empty note','private','Cursor',1,$2,'elapsed','[1,2]',$3) returning id",[CASEY,(caption===null?'a':'b').repeat(64),caption]);
await assert.rejects(insert(''),/runs_caption_length/,'the database refuses an empty-string note');
assert.equal((await insert(null)).rows.length,1,'the database accepts a missing note');
await db.close();
console.log('PASS: an untouched optional note is saved as null; an empty string would be refused by runs_caption_length');
process.exit(0);
