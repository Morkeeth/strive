// Agent publish path for STRIVE, exercised in disposable PostgreSQL (PGlite). TEST DATA only.
// Never pointed at production. Loads the production function bodies first to prove the new
// checks fail on them, then applies supabase/strava/006_agent_publish_ridge.sql.
//
// Root acceptance list covered here: field allowlist, token hash, expiry, revocation, default
// private, explicit scopes, request size limit, per-token abuse limit, security definer with a
// fixed search path, execute grants, audience escalation, and per-owner idempotency that never
// overwrites another record or widens an audience on retry.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

const { PGlite } = await import("@electric-sql/pglite");
const db = new PGlite();
const OWNER_A = "a1000000-0000-0000-0000-000000000001";
const OWNER_B = "b1000000-0000-0000-0000-000000000002";
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

await db.exec(`
create role anon; create role authenticated;
create schema strava;
-- Supabase auth.uid() stand-in: the signed-in user comes from request.jwt.claim.sub.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table strava.profiles(id uuid primary key, auth_uid uuid);
create table strava.grinder_agents(id uuid primary key default gen_random_uuid(), owner_id uuid references strava.profiles(id),
  name text, rig_revision uuid, visibility text not null default 'private', created_at timestamptz not null default now());
create table strava.grinder_agent_tokens(id uuid primary key default gen_random_uuid(), agent_id uuid references strava.grinder_agents(id),
  token_hash text unique, scopes text[], audiences text[], expires_at timestamptz, revoked boolean default false,
  window_started timestamptz default now(), window_actions integer default 0, created_at timestamptz default now());
create table strava.grinder_agent_requests(token_id uuid not null, request_id uuid not null, fingerprint text not null,
  response jsonb not null, created_at timestamptz not null default now(), primary key(token_id, request_id));
create table strava.grinder_agent_drafts(id uuid primary key default gen_random_uuid(), owner_id uuid, agent_id uuid, payload jsonb, created_at timestamptz default now());
create table strava.grinder_replies(id uuid primary key default gen_random_uuid(), run_id uuid, author_id uuid, parent_id uuid, body text,
  evidence_ref text, created_at timestamptz default now(), edited_at timestamptz, source_actor_id uuid, agent_name text, question_id uuid);
create table strava.acks(id uuid primary key default gen_random_uuid(), from_profile uuid, to_profile uuid, run_id uuid, reason text, same_owner boolean);
-- runs: the production column set and constraints this path touches, read 2026-09-19.
create table strava.runs(id uuid primary key default gen_random_uuid(), profile_id uuid not null, title text not null, project text,
  harness text, started_at timestamptz, duration_s double precision, prompts integer, tool_calls integer, files_touched integer,
  commits integer, rhythm jsonb, is_ship boolean not null default false, visibility text not null default 'private',
  created_at timestamptz not null default now(), note text, route jsonb, claims integer, claims_verified integer,
  artifacts_produced integer, schema_version integer, measurement_revision text, baseline_revision text, trace_basis text,
  source_actor_id uuid, agent_name text, caption text, model text, wall_time_s integer, ridge jsonb, worker_bins jsonb,
  commit_bins jsonb, ridge_basis text, ridge_wall_seconds double precision, ridge_tool_calls integer, shell_calls integer,
  constraint runs_visibility_check check (visibility = any(array['private','close_friends','link','public','crew','anonymous'])),
  constraint runs_ridge_basis_check check (ridge_basis is null or ridge_basis = any(array['wall-time','call-index','turn-order'])),
  constraint runs_ridge_shape_check check (ridge is null or (jsonb_typeof(ridge)='array' and jsonb_array_length(ridge) between 40 and 60
    and worker_bins is not null and jsonb_typeof(worker_bins)='array' and jsonb_array_length(worker_bins)=jsonb_array_length(ridge)
    and (commit_bins is null or jsonb_typeof(commit_bins)='array'))));
create unique index runs_profile_measurement_revision_unique on strava.runs(profile_id, measurement_revision) where measurement_revision is not null;
insert into strava.profiles(id, auth_uid) values('${OWNER_A}','${OWNER_A}'),('${OWNER_B}','${OWNER_B}');
`);

async function agent(owner, { visibility = "private" } = {}) {
  const r = await db.query("insert into strava.grinder_agents(owner_id,name,visibility) values($1,$2,$3) returning id", [owner, "Grok Bot", visibility]);
  return r.rows[0].id;
}
async function token(agentId, { scopes = ["publish"], audiences = ["private"], expires = "now() + interval '30 days'", revoked = false } = {}) {
  // Same construction as production grinder_issue_agent_token: ag_ plus two random UUIDs.
  const secret = "ag_" + randomUUID() + randomUUID();
  await db.query(
    `insert into strava.grinder_agent_tokens(agent_id,token_hash,scopes,audiences,expires_at,revoked) values($1,$2,$3,$4,${expires},$5)`,
    [agentId, sha(secret), scopes, audiences, revoked],
  );
  return secret;
}
const act = async (secret, action, payload, requestId = randomUUID()) =>
  (await db.query("select strava.grinder_agent_action($1,$2,$3,$4) as v", [secret, action, payload, requestId])).rows[0].v;
async function refused(promise, pattern) {
  await assert.rejects(promise, (e) => pattern.test(e.message), `expected refusal matching ${pattern}`);
}

const BINS = 50;
const RIDGE = Array.from({ length: BINS }, (_, i) => [1, 2, 5, 13, 0, 7][Math.floor(i / 9) % 6]);
const WORKERS = Array.from({ length: BINS }, () => 1);
const REV = (n) => sha("measurement-" + n);
const strivePayload = (rev, extra = {}) => ({
  title: "Sunday build", harness: "Grok Bot", turns_typed: 6, tool_calls: 28, schema_version: 1,
  measurement_revision: rev, ridge: RIDGE, worker_bins: WORKERS, ridge_basis: "turn-order", ridge_tool_calls: 28, ...extra,
});

// ---------- RED: production functions refuse the STRIVE shape ----------
await db.exec(await readFile(new URL("../tests/fixtures/agent-action-prod-2026-09-19.sql", import.meta.url), "utf8"));
{
  const secret = await token(await agent(OWNER_A));
  await refused(act(secret, "publish", strivePayload(REV("red"))), /Unsupported public field: (ridge|worker_bins|ridge_basis|ridge_tool_calls)/);
  // Retry of the same measurement with a fresh request ID hits the unique index raw.
  await act(secret, "publish", { title: "old shape", measurement_revision: REV("dup") });
  await refused(act(secret, "publish", { title: "old shape", measurement_revision: REV("dup") }), /duplicate key|unique/i);
  console.log("RED on production functions: ridge refused, retry collides raw");
}

// ---------- apply 006 ----------
await db.exec(await readFile(new URL("../supabase/strava/006_agent_publish_ridge.sql", import.meta.url), "utf8"));

// Grants and definer settings.
{
  const g = (role, fn) => db.query(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn]).then((r) => r.rows[0].ok);
  const ACTION = "strava.grinder_agent_action(text,text,jsonb,uuid)";
  const CHECK = "strava.grinder_check_agent_payload(jsonb)";
  assert.equal(await g("anon", ACTION), true);
  assert.equal(await g("authenticated", ACTION), true);
  assert.equal(await g("anon", CHECK), false, "payload check must not be callable directly");
  const meta = (await db.query(
    "select prosecdef, proconfig from pg_proc where oid = $1::regprocedure", [ACTION])).rows[0];
  assert.equal(meta.prosecdef, true);
  assert.ok(meta.proconfig.some((c) => c.startsWith("search_path=") && c.includes("strava")), "fixed search_path");
  console.log("grants and security definer settings hold");
}

const agentA = await agent(OWNER_A, { visibility: "public" });
const pubA = await token(agentA, { scopes: ["publish", "reply"], audiences: ["private", "public"] });

// GREEN: the STRIVE shape persists, default audience private.
{
  const out = await act(pubA, "publish", strivePayload(REV(1)));
  const run = (await db.query("select * from strava.runs where id=$1", [out.id])).rows[0];
  assert.equal(run.visibility, "private", "default audience is private");
  assert.equal(run.ridge_basis, "turn-order");
  assert.deepEqual(run.ridge, RIDGE);
  assert.equal(run.ridge_tool_calls, 28);
  assert.equal(run.profile_id, OWNER_A);
  assert.equal(out.existing, false);
  assert.equal(out.visibility, "private", "the response reports the stored audience");
  console.log("publish persists ridge, turn-order basis and counts, private by default");
}

// Idempotency: same request ID returns the stored response, a different payload is refused.
{
  const rid = randomUUID();
  const a = await act(pubA, "publish", strivePayload(REV(2)), rid);
  const b = await act(pubA, "publish", strivePayload(REV(2)), rid);
  assert.deepEqual(a, b);
  await refused(act(pubA, "publish", strivePayload(REV(2), { title: "changed" }), rid), /cannot be reused/);
  console.log("request ID idempotency holds and cannot be reused for a different payload");
}

// Per-owner measurement idempotency: no duplicate, no overwrite, no audience widening.
{
  const first = await act(pubA, "publish", strivePayload(REV(3), { title: "original" }));
  const retry = await act(pubA, "publish", strivePayload(REV(3), { title: "overwrite attempt", visibility: "public" }));
  assert.equal(retry.id, first.id);
  assert.equal(retry.existing, true);
  assert.equal(retry.visibility, "private", "a retry must not widen the audience");
  const rows = (await db.query("select title, visibility from strava.runs where profile_id=$1 and measurement_revision=$2", [OWNER_A, REV(3)])).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { title: "original", visibility: "private" });
  console.log("same measurement returns the existing run untouched, audience not widened");
}

// Never matches another owner's record.
{
  const agentB = await agent(OWNER_B);
  const tokB = await token(agentB);
  const outB = await act(tokB, "publish", strivePayload(REV(3)));
  const aRow = (await db.query("select id from strava.runs where profile_id=$1 and measurement_revision=$2", [OWNER_A, REV(3)])).rows[0];
  assert.notEqual(outB.id, aRow.id);
  assert.equal(outB.existing, false);
  console.log("another owner with the same measurement gets their own run");
}

// Comments: the reply scope. Identity is explicit (owner as author, agent as source actor).
// The audience is the run's audience, never wider.
{
  const own = await act(pubA, "publish", strivePayload(REV(30)));
  const r = await act(pubA, "reply", { run_id: own.id, body: "Tests green at bin 42." });
  assert.equal(r.action, "reply");
  const row = (await db.query("select author_id, source_actor_id, agent_name, body from strava.grinder_replies where id=$1", [r.id])).rows[0];
  assert.deepEqual(row, { author_id: OWNER_A, source_actor_id: agentA, agent_name: "Grok Bot", body: "Tests green at bin 42." });
  const bPrivate = (await db.query("select id from strava.runs where profile_id=$1 limit 1", [OWNER_B])).rows[0].id;
  await refused(act(pubA, "reply", { run_id: bPrivate, body: "hi" }), /outside the granted audience/);
  const bPublic = (await db.query("insert into strava.runs(profile_id,title,visibility) values($1,'B public','public') returning id", [OWNER_B])).rows[0].id;
  const pub = await act(pubA, "reply", { run_id: bPublic, body: "Nice climb." });
  assert.ok(pub.id, "a public agent with the public audience may reply to a public run");
  const privAgent = await agent(OWNER_A);
  const privAgentTok = await token(privAgent, { scopes: ["reply"], audiences: ["private", "public"] });
  await refused(act(privAgentTok, "reply", { run_id: bPublic, body: "hi" }), /Make the agent profile public/);
  const privAudience = await token(agentA, { scopes: ["reply"], audiences: ["private"] });
  await refused(act(privAudience, "reply", { run_id: bPublic, body: "hi" }), /outside the granted audience/);
  const noReply = await token(agentA, { scopes: ["publish"], audiences: ["private", "public"] });
  await refused(act(noReply, "reply", { run_id: own.id, body: "hi" }), /scope|not granted|permission/i);
  await refused(act(pubA, "reply", { run_id: own.id, body: { transcript: "raw" } }), /body must be text/);
  const pubRun = await act(pubA, "publish", strivePayload(REV(31), { visibility: "public" }));
  assert.equal(pubRun.visibility, "public", "an allowed public publish reports public");
  console.log("reply scope: explicit identity, run audience enforced, public needs a public agent");
}

// Audience escalation, expiry, revocation, scopes.
{
  const privOnly = await token(agentA, { audiences: ["private"] });
  await refused(act(privOnly, "publish", strivePayload(REV(4), { visibility: "public" })), /audience is outside/);
  const agentPrivate = await agent(OWNER_B, { visibility: "private" });
  const wantsPublic = await token(agentPrivate, { audiences: ["private", "public"] });
  await refused(act(wantsPublic, "publish", strivePayload(REV(5), { visibility: "public" })), /agent profile public/);
  const expired = await token(agentA, { expires: "now() - interval '1 minute'" });
  await refused(act(expired, "publish", strivePayload(REV(6))), /Agent access is unavailable/);
  const revoked = await token(agentA, { revoked: true });
  await refused(act(revoked, "publish", strivePayload(REV(7))), /Agent access is unavailable/);
  await refused(act("ag_not-a-real-token", "publish", strivePayload(REV(8))), /Agent access is unavailable/);
  const publishOnly = await token(agentA, { scopes: ["publish"] });
  await refused(act(publishOnly, "reply", { run_id: randomUUID(), body: "hi" }), /outside the granted scope/);
  console.log("escalation, expired, revoked, unknown token and missing scope all refused");
}

// Allowlist and validation.
{
  await refused(act(pubA, "publish", { title: "x", transcript: "raw text" }), /Unsupported public field: transcript/);
  await refused(act(pubA, "publish", strivePayload(REV(9), { ridge: RIDGE.slice(0, 30), worker_bins: WORKERS.slice(0, 30) })), /40 to 60 bins/);
  await refused(act(pubA, "publish", strivePayload(REV(10), { worker_bins: WORKERS.slice(0, 10) })), /same length as the ridge/);
  await refused(act(pubA, "publish", strivePayload(REV(11), { ridge_basis: "vibes" })), /ridge_basis must be/);
  await refused(act(pubA, "publish", strivePayload(REV(12), { shell_calls: -1 })), /non-negative whole numbers/);
  await refused(act(pubA, "publish", { title: "x", note: "y".repeat(70000) }), /under 64 KiB/);
  // worker_bins and commit_bins content, not only their type.
  await refused(act(pubA, "publish", strivePayload(REV(14), { worker_bins: WORKERS.map((w, i) => (i === 3 ? -2 : w)) })), /worker_bins must be non-negative/);
  await refused(act(pubA, "publish", strivePayload(REV(15), { worker_bins: WORKERS.map((w, i) => (i === 3 ? 1.5 : w)) })), /worker_bins must be non-negative/);
  await refused(act(pubA, "publish", strivePayload(REV(16), { commit_bins: [3, 50] })), /ridge bin indexes from 0 to 49/);
  await refused(act(pubA, "publish", strivePayload(REV(17), { commit_bins: [-1] })), /ridge bin indexes/);
  await refused(act(pubA, "publish", strivePayload(REV(18), { commit_bins: [2.5] })), /ridge bin indexes/);
  await refused(act(pubA, "publish", { title: "x", commit_bins: [1] }), /need a ridge/);
  // Regression rows from the independent review of 006 (backend-review/results.txt, 2026-09-19).
  // Each of these was accepted by the database while the browser renderer dropped or mislabelled it.
  await refused(act(pubA, "publish", strivePayload(REV(20), { ridge: RIDGE.map((v, i) => (i === 0 ? 0.5 : v)) })), /Ridge bins must be non-negative whole/);
  await refused(act(pubA, "publish", strivePayload(REV(21), { worker_bins: WORKERS.map((w, i) => (i === 0 ? 1e20 : w)) })), /worker_bins must be non-negative whole/);
  await refused(act(pubA, "publish", strivePayload(REV(22), { ridge_basis: null })), /ridge_basis must be/);
  const noBasis = strivePayload(REV(23)); delete noBasis.ridge_basis;
  await refused(act(pubA, "publish", noBasis), /ridge_basis must be/);
  await refused(act(pubA, "publish", strivePayload(REV(24), { caption: { transcript: "raw source text" } })), /caption must be text/);
  await refused(act(pubA, "publish", strivePayload(REV(25), { model: { secret: "nested raw" } })), /model must be text/);
  await refused(act(pubA, "publish", strivePayload(REV(26), { title: ["raw"] })), /title must be text/);
  await refused(act(pubA, "publish", { title: "x", ridge_basis: "turn-order" }), /need a ridge/);
  // The largest safe integer is still accepted, so the bound is exact.
  const edge = await act(pubA, "publish", strivePayload(REV(27), { ridge: RIDGE.map((v, i) => (i === 0 ? 9007199254740991 : v)) }));
  assert.ok(edge.id);
  const ok = await act(pubA, "publish", strivePayload(REV(19), { commit_bins: [3, 17, 42] }));
  assert.deepEqual((await db.query("select commit_bins from strava.runs where id=$1", [ok.id])).rows[0].commit_bins, [3, 17, 42]);
  console.log("allowlist, ridge shape, worker and commit bin contents, basis, counts and 64 KiB limit enforced");
}

// Per-token abuse limit.
{
  const limited = await token(agentA);
  await db.query("update strava.grinder_agent_tokens set window_actions=60, window_started=now() where token_hash=$1", [sha(limited)]);
  await refused(act(limited, "publish", strivePayload(REV(13))), /Hourly action limit/);
  console.log("per-token hourly limit enforced");
}
// ---------- 007: Connect tokens, thin wrappers over the deployed issuer ----------
await db.exec(await readFile(new URL("../supabase/strava/007_agent_token_connect.sql", import.meta.url), "utf8"));
{
  const OWNER_C = "c1000000-0000-0000-0000-000000000003";
  await db.query("insert into strava.profiles(id, auth_uid) values($1,$1)", [OWNER_C]);
  const as = async (uid, sql, params = []) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
    return (await db.query(sql, params)).rows[0].v;
  };
  const g = (role, fn) => db.query(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn]).then((r) => r.rows[0].ok);
  for (const fn of ["strava.agent_token_create(text)", "strava.agent_token_list()", "strava.agent_token_revoke(uuid)"]) {
    assert.equal(await g("anon", fn), false, `${fn} is not callable signed out`);
    assert.equal(await g("authenticated", fn), true);
    const meta = (await db.query("select prosecdef, proconfig from pg_proc where oid=$1::regprocedure", [fn])).rows[0];
    assert.equal(meta.prosecdef, true);
    assert.ok(meta.proconfig.some((c) => c.startsWith("search_path=") && c.includes("strava")));
  }
  await refused(as(null, "select strava.agent_token_create('x') as v"), /Sign in/);
  await refused(as(OWNER_C, "select strava.agent_token_create('  ') as v"), /1 to 80/);
  await refused(as(OWNER_C, "select strava.agent_token_create($1) as v", ["x".repeat(81)]), /1 to 80/);

  const made = await as(OWNER_C, "select strava.agent_token_create(' Grok laptop ') as v");
  assert.match(made.token, /^ag_[0-9a-f-]{72}$/);
  assert.equal(made.label, "Grok laptop");
  assert.equal(made.token_prefix, made.token.slice(0, 8));
  assert.deepEqual(made.scopes, ["draft", "publish"]);
  assert.deepEqual(made.audiences, ["private"], "Connect tokens are owner-private");
  const stored = (await db.query("select * from strava.grinder_agent_tokens where id=$1", [made.id])).rows[0];
  assert.equal(stored.token_hash, sha(made.token), "only the hash is stored");
  assert.ok(!JSON.stringify(stored).includes(made.token), "no stored column holds the secret");
  const days = (new Date(stored.expires_at) - Date.now()) / 864e5;
  assert.ok(days > 29 && days <= 30, "30 day expiry");

  const listed = await as(OWNER_C, "select strava.agent_token_list() as v");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, made.id);
  assert.ok(!("token" in listed[0]) && !JSON.stringify(listed).includes(made.token), "list never returns the secret");
  assert.deepEqual(await as(OWNER_B, "select strava.agent_token_list() as v"), [], "another owner sees none of them");

  // The minted token uploads a private run and cannot widen, reply or ACK.
  const up = await act(made.token, "publish", strivePayload(REV(40)));
  assert.equal(up.visibility, "private");
  assert.equal(up.existing, false);
  assert.equal((await db.query("select profile_id from strava.runs where id=$1", [up.id])).rows[0].profile_id, OWNER_C);
  await refused(act(made.token, "publish", strivePayload(REV(41), { visibility: "public" })), /audience/i);
  await refused(act(made.token, "reply", { run_id: up.id, body: "hi" }), /scope|not granted|permission/i);

  // One Connect agent is reused, and five active tokens is the cap.
  for (let k = 2; k <= 5; k++) await as(OWNER_C, "select strava.agent_token_create($1) as v", ["t" + k]);
  assert.equal((await db.query("select count(*)::int as n from strava.grinder_agents where owner_id=$1 and name='Connect'", [OWNER_C])).rows[0].n, 1);
  await refused(as(OWNER_C, "select strava.agent_token_create('six') as v"), /five active/);
  // Regression from the independent 007 review: renaming the agent (an owner-granted update)
  // once hid every token from the list and reset the cap to allow a sixth.
  await db.query("update strava.grinder_agents set name='Renamed' where owner_id=$1 and name='Connect'", [OWNER_C]);
  assert.equal((await as(OWNER_C, "select strava.agent_token_list() as v")).length, 5, "list survives an agent rename");
  await refused(as(OWNER_C, "select strava.agent_token_create('six') as v"), /five active/);
  // Tokens from the advanced grant form carry no label and stay out of Connect.
  const advanced = await agent(OWNER_C);
  await token(advanced, { scopes: ["reply"], audiences: ["private"] });
  assert.equal((await as(OWNER_C, "select strava.agent_token_list() as v")).length, 5);

  await refused(as(OWNER_B, "select strava.agent_token_revoke($1) as v", [made.id]), /Token not found/);
  assert.equal(await as(OWNER_C, "select strava.agent_token_revoke($1) as v", [made.id]), true);
  await refused(act(made.token, "publish", strivePayload(REV(42))), /Agent access is unavailable/);
  assert.equal((await as(OWNER_C, "select strava.agent_token_list() as v")).find((t) => t.id === made.id).revoked, true);
  assert.ok((await as(OWNER_C, "select strava.agent_token_create('after revoke') as v")).token, "revoking frees a slot");
  await refused(as(OWNER_C, "select strava.agent_token_revoke($1) as v", [randomUUID()]), /Token not found/);
  console.log("Connect tokens: owner-private defaults, hash only, capped, revocable, usable for private upload");

  // POST /api/agent/runs, end to end: the handler logic against this database through a
  // PostgREST stand-in. The server adds no power: same token, same RPC, anon key only.
  const { upload } = await import("../server/agent-upload.mjs");
  const calls = [];
  const fakeRest = async (url, init) => {
    calls.push({ url, init });
    const { token, action, payload, request_id } = JSON.parse(init.body);
    try {
      const v = await act(token, action, payload, request_id);
      return { ok: true, status: 200, json: async () => v };
    } catch (e) {
      return { ok: false, status: 400, json: async () => ({ message: e.message }) };
    }
  };
  const cfg = { SB_URL: "https://example.supabase.co", SB_KEY: "sb_publishable_test" };
  const fresh = await as(OWNER_C, "select strava.agent_token_create('http') as v").catch(async () => {
    // The cap is full from the checks above: free one slot first.
    const first = (await as(OWNER_C, "select strava.agent_token_list() as v")).find((t) => !t.revoked);
    await as(OWNER_C, "select strava.agent_token_revoke($1) as v", [first.id]);
    return as(OWNER_C, "select strava.agent_token_create('http') as v");
  });
  const H = (extra = {}) => ({ authorization: "Bearer " + fresh.token, ...extra });
  const key = randomUUID();
  const r1 = await upload({ method: "POST", headers: H({ "idempotency-key": key }), body: strivePayload(REV(50)) }, cfg, fakeRest);
  assert.equal(r1.status, 200);
  assert.deepEqual(Object.keys(r1.body).sort(), ["existing", "id", "preview_url", "request_id", "review_required", "visibility"]);
  assert.equal(r1.body.visibility, "private");
  assert.equal(r1.body.existing, false);
  assert.equal(r1.body.request_id, key);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/grinder_agent_action");
  assert.equal(calls[0].init.headers["Content-Profile"], "strava");
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_test");
  assert.ok(!("authorization" in calls[0].init.headers) && !("Authorization" in calls[0].init.headers), "no service role or user JWT is forwarded");
  const r2 = await upload({ method: "POST", headers: H(), body: strivePayload(REV(50), { visibility: "public" }) }, cfg, fakeRest);
  assert.equal(r2.status, 200, "an agent public request prepares only a private draft");
  assert.equal(r2.body.visibility,"private");assert.equal(r2.body.review_required,true);
  const r3 = await upload({ method: "POST", headers: H(), body: strivePayload(REV(50)) }, cfg, fakeRest);
  assert.deepEqual([r3.status, r3.body.id, r3.body.existing, r3.body.visibility], [200, r1.body.id, true, "private"]);
  const r4 = await upload({ method: "POST", headers: H(), body: strivePayload(REV(51), { transcript: "raw" }) }, cfg, fakeRest);
  assert.equal(r4.status, 400);
  assert.match(r4.body.error, /Unsupported public field: transcript/);
  assert.ok(!JSON.stringify(r4.body).includes(fresh.token), "errors never echo the token");
  assert.equal((await upload({ method: "GET", headers: H(), body: null }, cfg, fakeRest)).status, 405);
  assert.equal((await upload({ method: "POST", headers: {}, body: {} }, cfg, fakeRest)).status, 401);
  assert.equal((await upload({ method: "POST", headers: { authorization: "Bearer nope" }, body: {} }, cfg, fakeRest)).status, 401);
  const forged = "ag_" + randomUUID() + randomUUID();
  assert.equal((await upload({ method: "POST", headers: { authorization: "Bearer " + forged }, body: strivePayload(REV(52)) }, cfg, fakeRest)).status, 401);
  assert.equal((await upload({ method: "POST", headers: H({ "content-length": "70000" }), body: {} }, cfg, fakeRest)).status, 413);
  // Regression from the independent review: no content-length header, 70 KB parsed body.
  const before = calls.length;
  assert.equal((await upload({ method: "POST", headers: H(), body: { title: "x", note: "y".repeat(70000) } }, cfg, fakeRest)).status, 413);
  assert.equal((await upload({ method: "POST", headers: H(), body: { title: "x", note: "é".repeat(33000) } }, cfg, fakeRest)).status, 413, "counts UTF-8 bytes, not characters");
  assert.equal(calls.length, before, "an oversized body never reaches the database");
  assert.equal((await upload({ method: "POST", headers: H(), body: [1] }, cfg, fakeRest)).status, 400);
  assert.equal((await upload({ method: "POST", headers: H({ "idempotency-key": "x" }), body: {} }, cfg, fakeRest)).status, 400);
  const down = await upload({ method: "POST", headers: H(), body: strivePayload(REV(53)) }, cfg, async () => { throw new Error("net"); });
  assert.equal(down.status, 503);
  console.log("POST /api/agent/runs: private upload, retry returns existing, refusals mapped, no token echo");

  // The Grok kit's exact upload payload (templates/grokbot/post-agent-run/scripts/upload.py)
  // passes the database check and draws: turn-order ridge, private, retry returns existing.
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const kit = new URL("../templates/grokbot/post-agent-run/", import.meta.url).pathname;
  const rows = (await readFile(kit + "samples/sample_grokbot_bot_activity.jsonl", "utf8")).trim().split("\n")
    .map((l) => { const r = JSON.parse(l); delete r.agentgrinder_sample; return JSON.stringify(r); });
  const exportPath = mkdtempSync(tmpdir() + "/strive-kit-") + "/export.jsonl";
  writeFileSync(exportPath, rows.join("\n") + "\n");
  const kitPayload = JSON.parse(execFileSync("python3", [kit + "scripts/upload.py", exportPath, "--dry-run"], { encoding: "utf8" })).payload;
  const k1 = await upload({ method: "POST", headers: H(), body: kitPayload }, cfg, fakeRest);
  assert.equal(k1.status, 200, JSON.stringify(k1.body));
  const kitRun = (await db.query("select ridge_basis, visibility, jsonb_array_length(ridge) as bins from strava.runs where id=$1", [k1.body.id])).rows[0];
  assert.deepEqual(kitRun, { ridge_basis: "turn-order", visibility: "private", bins: 50 });
  const k2 = await upload({ method: "POST", headers: H(), body: kitPayload }, cfg, fakeRest);
  assert.deepEqual([k2.body.id, k2.body.existing], [k1.body.id, true]);
  console.log("Grok kit payload uploads as a private turn-order run; rerun returns the saved run");
}


// ---------- 008: declared outcome receipts ----------
await db.exec(await readFile(new URL("../supabase/strava/008_outcome_receipts.sql", import.meta.url), "utf8"));
{
  const agentC = await agent(OWNER_A);
  const tok = await token(agentC, { scopes: ["publish"], audiences: ["private"] });
  const outcome = {
    repo_url: "https://github.com/Morkeeth/agentgrinder-public",
    receipts: [{ label: "PR 51", url: "https://github.com/Morkeeth/agentgrinder-public/pull/51" },
               { label: "commit e56a748", url: "https://github.com/Morkeeth/agentgrinder-public/commit/e56a748" }],
    shipped: ["My runs keeps the primary rail", "Outcome receipts on the run contract"],
    artifact_url: "https://agentic-strava.vercel.app/",
    image_url: "https://agentic-strava.vercel.app/card.png",
  };
  const saved = await act(tok, "publish", { title: "Outcome run", measurement_revision: REV(60), ...outcome });
  const row = (await db.query("select repo_url, receipts, shipped, artifact_url, image_url, ridge, visibility from strava.runs where id=$1", [saved.id])).rows[0];
  assert.equal(row.repo_url, outcome.repo_url);
  assert.deepEqual(row.receipts, outcome.receipts);
  assert.deepEqual(row.shipped, outcome.shipped);
  assert.equal(row.artifact_url, outcome.artifact_url);
  assert.equal(row.image_url, outcome.image_url);
  assert.equal(row.ridge, null, "an outcome run needs no measured ridge");
  assert.equal(row.visibility, "private", "declared outcomes do not change the default audience");

  const bad = async (extra, pattern) => refused(act(tok, "publish", { title: "x", measurement_revision: REV("b" + JSON.stringify(extra).length + Math.random()), ...extra }), pattern);
  await bad({ repo_url: "http://github.com/a/b" }, /https link/);
  await bad({ repo_url: "https://example.com/a/b" }, /repository on github/);
  await bad({ artifact_url: 'https://x.com/a" onerror="alert(1)' }, /https link/);
  await bad({ artifact_url: "https://x.com/a b" }, /https link/);
  await bad({ artifact_url: "https://x.com/" + "y".repeat(320) }, /https link/);
  await bad({ image_url: "https://x.com/a.svg" }, /png, .jpg/);
  await bad({ image_url: { url: "https://x.com/a.png" } }, /image_url must be text/);
  await bad({ shipped: ["a", "b", "c", "d", "e", "f"] }, /at most 5 lines/);
  await bad({ shipped: [""] }, /1 to 120 characters/);
  await bad({ shipped: ["z".repeat(121)] }, /1 to 120 characters/);
  await bad({ shipped: [{ text: "not a string" }] }, /1 to 120 characters|text/);
  await bad({ receipts: [{ label: "ok", url: "http://x.com/a" }] }, /label of 1 to 60/);
  await bad({ receipts: [{ label: "ok", url: "https://x.com/a", extra: 1 }] }, /label of 1 to 60/);
  await bad({ receipts: [{ url: "https://x.com/a" }] }, /label of 1 to 60/);
  await bad({ receipts: Array.from({ length: 6 }, () => ({ label: "l", url: "https://x.com/a" })) }, /at most 5 links/);
  await bad({ output_url: "https://x.com/a" }, /Unsupported public field: output_url/);
  console.log("outcome receipts persist, stay private, and refuse unsafe links, oversized lists and unknown keys");
}



// ---------- 009: Code Route persistence (local only; not applied to production here) ----------
await db.exec(await readFile(new URL("../supabase/strava/009_code_route.sql", import.meta.url), "utf8"));
{
  const agentC = await agent(OWNER_A);
  const tok = await token(agentC, { scopes: ["publish"], audiences: ["private"] });
  const code_route = {
    v: 1,
    projects: [
      { id: "zup", label: "zup", basis: "measured" },
      { id: "agentgrinder-public", label: "agentgrinder-public", basis: "measured" },
      { id: "mountain-of-helicon", label: "mountain-of-helicon", basis: "measured" },
    ],
    stops: [
      { id: "a", project: "zup", kind: "commit", label: "Board commit", basis: "measured" },
      { id: "b", project: "agentgrinder-public", kind: "check", label: "Checks passed", basis: "measured" },
      { id: "c", project: "mountain-of-helicon", kind: "artifact", label: "Wheel built", basis: "measured" },
    ],
    connectors: [{ from: "a", to: "b", kind: "handoff", label: "Cursor to Claude CLI" }],
    finish: { stop: "c", kind: "artifact", label: "Wheel built" },
    stats: { projects_touched: 3, commits: 1, files_changed: 4, verified_checkpoints: 3, shipped_artifacts: 1 },
    harnesses: { observed: ["cursor", "claude-cli", "codex"], absent: ["grok-bot"], basis: "manifest" },
  };
  const saved = await act(tok, "publish", { title: "Code Route run", measurement_revision: REV(90), code_route });
  const row = (await db.query("select code_route, visibility from strava.runs where id=$1", [saved.id])).rows[0];
  assert.deepEqual(row.code_route, code_route);
  assert.equal(row.visibility, "private");
  await refused(act(tok, "publish", { title: "x", measurement_revision: REV("crbad1"), code_route: { v: 1, prompt: "PRIVATE" } }), /Unsupported public field|code_route|paths|secrets|private lane|must be/);
  await refused(act(tok, "publish", { title: "x", measurement_revision: REV("crbad2"), code_route: { v: 1, unavailable: { why: "/Users/me/secret" } } }), /paths|secrets|private lane/);
  console.log("code_route persists privately and refuses path-bearing or unknown-key payloads");
}

console.log("\nAGENT PUBLISH: all checks passed");


// Current review gate. The old function demonstrably permits direct public writes.
await db.exec(await readFile(new URL('../supabase/strava/032_capture_metadata.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/strava/033_agent_capture_metadata.sql',import.meta.url),'utf8'));
const reviewToken=await token(await agent(OWNER_A,{visibility:'public'}),{scopes:['publish','draft'],audiences:['private','public']});
const beforeGate=await act(reviewToken,'publish',strivePayload(REV('review-before'),{visibility:'public'}));
assert.equal(beforeGate.visibility,'public','baseline: scoped agent could publish without the run panel');
await db.exec(await readFile(new URL('../supabase/strava/041_agent_run_review.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/strava/011_dropin_links.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/strava/012_dropin_route.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/strava/051_prompt_provenance.sql',import.meta.url),'utf8'));
const promptProvenance={v:1,counts:{'human-typed':2,'human-via-tool':0,'agent-to-agent':1,automation:0,unknown:0},human_turns:2,known_autonomous_turns:1,unknown_turns:0,relays:{}};
const afterGate=await act(reviewToken,'publish',strivePayload(REV('review-after'),{visibility:'public'}));
assert.equal(afterGate.visibility,'private');assert.equal(afterGate.review_required,true);
assert.equal((await db.query('select visibility from strava.runs where id=$1',[afterGate.id])).rows[0].visibility,'private');
const reviewed=JSON.parse(Buffer.from(afterGate.preview_url.split('#import=')[1],'base64').toString());
assert.equal(reviewed.review_run_id,afterGate.id);assert.equal(reviewed.visibility,'private');assert.equal(reviewed.tool_calls,28);
const publicBefore=(await db.query('select to_jsonb(r) as row from strava.runs r where id=$1',[beforeGate.id])).rows[0].row;
const repeatPublic=await act(reviewToken,'publish',strivePayload(REV('review-before'),{visibility:'public',title:'should never replace title'}));
assert.equal(repeatPublic.id,beforeGate.id);assert.equal(repeatPublic.existing,true);assert.equal(repeatPublic.visibility,'public');assert.equal(repeatPublic.review_required,false);assert.equal(repeatPublic.preview_url,undefined);
assert.deepEqual((await db.query('select to_jsonb(r) as row from strava.runs r where id=$1',[beforeGate.id])).rows[0].row,publicBefore);
const draftGate=await act(reviewToken,'draft',strivePayload(REV('review-draft'),{visibility:'public'}));
assert.equal(draftGate.review_required,true);
assert.equal((await db.query('select payload from strava.grinder_agent_drafts where id=$1',[draftGate.id])).rows[0].payload.visibility,'private');
assert.equal((await db.query("select count(*)::int as n from strava.runs where measurement_revision=$1 and visibility<>'private'",[REV('review-after')])).rows[0].n,0);
const provenanceRun=await act(reviewToken,'publish',strivePayload(REV('review-provenance'),{prompt_provenance:promptProvenance}));
assert.deepEqual((await db.query('select prompt_provenance from strava.runs where id=$1',[provenanceRun.id])).rows[0].prompt_provenance,promptProvenance);
console.log('PASS database review gate: direct RPC public request saves privately; private preview preserves measurements; existing public run is byte-for-byte unchanged on retry; draft payload forced private');
await db.close();
