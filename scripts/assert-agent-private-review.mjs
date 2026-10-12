import assert from 'node:assert/strict';

// Exercise real disposable SQL and reader roles, never a hosted account.
export async function assertAgentPrivateReview({db,as,anonymous,owner,reader,actor,token,payload}) {
  const submit=async(access,revision)=> (await db.query("select strava.grinder_agent_action($1,'publish',$2,gen_random_uuid()) value",[access,{...payload,visibility:'public',measurement_revision:revision}])).rows[0].value;
  const check=async(result)=>{
    assert.equal(result.visibility,'private','an agent cannot choose a visible audience');
    assert.equal(result.review_required,true);
    const stored=(await db.query('select visibility from strava.runs where id=$1',[result.id])).rows[0];
    assert.equal(stored.visibility,'private','private must be stored, not merely reported');
    const link=new URL(result.preview_url);assert.equal(link.origin,'https://striverun.app');
    assert.ok(link.hash.startsWith('#import='));
    const preview=JSON.parse(Buffer.from(link.hash.slice(8),'base64').toString('utf8'));
    assert.equal(preview.visibility,'private');assert.equal(preview.review_run_id,result.id);
    await as(reader);assert.equal((await db.query('select id from strava.runs where id=$1',[result.id])).rows.length,0);
    await anonymous();assert.equal((await db.query('select id from strava.runs where id=$1',[result.id])).rows.length,0);
    await as(owner);
  };
  await check(await submit(token,'a'.repeat(64)));
  // A legacy public capability still cannot bypass the owner's review.
  await db.exec('reset role');
  await db.query("update strava.grinder_agents set visibility='public' where id=$1",[actor]);
  await as(owner);
  const wide=(await db.query("select strava.grinder_issue_agent_token($1,array['draft','publish'],array['private','public'],now()+interval '1 day') value",[actor])).rows[0].value.token;
  await check(await submit(wide,'b'.repeat(64)));
}
