import assert from 'node:assert/strict';
import {bootDisposable, seedJourneyActors, CASEY, RILEY} from './disposable-supabase.mjs';

// TEST DATA only. Exercise the real scoped RPC before both private draft and run storage.
const {db, as} = await bootDisposable();
try {
  await seedJourneyActors(db);
  await as(CASEY);
  const actor = (await db.query("insert into strava.grinder_agents(owner_id,name) values($1,'TEST DATA metadata agent') returning id", [CASEY])).rows[0].id;
  const token = (await db.query("select strava.grinder_issue_agent_token($1,array['draft','publish'],array['private'],now()+interval '1 day') value", [actor])).rows[0].value.token;
  const metadata = {models:['model-a'], basis:'codex-records', input_tokens:10, output_tokens:2, cached_input_tokens:5, reasoning_tokens:1};
  let revision = 0;
  const act = (action, meta, trace='elapsed') => db.query("select strava.grinder_agent_action($1,$2,$3,gen_random_uuid()) value", [token, action, {
    title:'TEST DATA metadata storage', harness:'Codex', trace_basis:trace, capture_metadata:meta,
    schema_version:1, measurement_revision:(++revision).toString(16).padStart(64,'0'), rhythm:[1,2],
  }]);
  const invalid = [
    [{...metadata, raw_text:'TEST DATA should be refused'}, /Unsupported capture metadata/],
    [{...metadata, cached_input_tokens:999}, /Cached input exceeds input/],
    [{...metadata, reasoning_tokens:3}, /Reasoning exceeds output/],
    [{...metadata, input_tokens:true}, /Invalid token count/],
    [{...metadata, output_tokens:-1}, /Invalid token count/],
    [{...metadata, input_tokens:9007199254740992}, /Invalid token count/],
    [{...metadata, input_tokens:9007199254740991}, /Token count too large/],
    [{...metadata, models:['unsafe\nmodel']}, /Invalid recorded models/],
    [{...metadata, basis:'unrecorded'}, /Unknown capture metadata source/],
    [[], /Invalid capture metadata/],
  ];
  for (const [meta, error] of invalid) {
    for (const action of ['draft', 'publish']) {
      await assert.rejects(act(action, meta), error);
    }
  }
  for (const trace of ['typed-by-author', 'historical-reconstruction']) {
    for (const action of ['draft', 'publish']) {
      await assert.rejects(act(action, metadata, trace), /Recorded usage needs a session capture/);
    }
  }
  // Rejected requests cannot leave drafts, runs, request records or rate-limit charges.
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from strava.grinder_agent_drafts')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from strava.runs')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from strava.grinder_agent_requests')).rows[0].n, 0);
  assert.equal((await db.query('select window_actions from strava.grinder_agent_tokens where agent_id=$1', [actor])).rows[0].window_actions, 0);
  await as(CASEY);
  const draft = (await act('draft', metadata)).rows[0].value;
  assert.deepEqual((await db.query('select payload from strava.grinder_agent_drafts where id=$1', [draft.id])).rows[0].payload.capture_metadata, metadata);
  const published = (await act('publish', metadata)).rows[0].value;
  assert.deepEqual((await db.query('select capture_metadata from strava.runs where id=$1', [published.id])).rows[0].capture_metadata, metadata);
  // Missing and explicit null metadata retain the existing unknown-data path.
  for (const meta of [undefined, null, {models:[], basis:'codex-records'}]) {
    await act('draft', meta);
    await act('publish', meta);
  }
  await as(RILEY);
  assert.equal((await db.query('select id from strava.grinder_agent_drafts where id=$1', [draft.id])).rows.length, 0);
  assert.equal((await db.query('select id from strava.runs where id=$1', [published.id])).rows.length, 0);
  console.log('PASS: private draft and publish reject malformed metadata before storage; valid/unknown metadata persists; rejected requests leave no rows or charges; audience stays private');
} finally {
  await db.close();
}
