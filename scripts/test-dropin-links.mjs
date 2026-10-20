// Drop-in links (supabase/strava/011_dropin_links.sql) in real PostgreSQL/WASM.
// Proves: the migration changes nothing that existed, the tables are not readable by clients,
// only allowlisted counts are accepted, the rate limits hold, and delete needs the secret.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const db = new PGlite();
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const build = p => execFileSync('python3', [new URL('./' + p, import.meta.url).pathname], { encoding: 'utf8' });
await db.exec(`create role anon; create role authenticated;
alter default privileges grant all on tables to anon,authenticated;
alter default privileges grant execute on functions to anon,authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;`);
await db.exec(read('tests/fixtures/hosted-base.sql'));
await db.exec(build('prepare-migration.py'));

// Bootstrap the strava schema WITHOUT 011, snapshot every existing object, then apply 011 alone.
const full = build('prepare-strava-database.py');
// 011 made the tables and 012 added the route column; the pair is one feature, sliced out
// together and applied together below.
const marker = '-- strava/011_dropin_links.sql';
assert.ok(full.includes(marker), '011 must be part of the strava bootstrap');
const start = full.indexOf(marker);
const marker12 = '-- strava/012_dropin_route.sql';
assert.ok(full.includes(marker12), '012 must be part of the strava bootstrap');
const start12 = full.indexOf(marker12);
const next = full.indexOf('\n-- strava/', start12 + marker12.length);
const end = next === -1 ? full.indexOf("notify pgrst, 'reload schema';\ncommit;", start12) : next;
const marker51 = '-- strava/051_prompt_provenance.sql';
const start51 = full.indexOf(marker51);
assert.ok(start51 > end, '051 must follow the drop-in base migrations');
const next51 = full.indexOf('\n-- strava/', start51 + marker51.length);
const end51 = next51 === -1 ? full.length : next51;
assert.ok(start < start12 && full.indexOf('\n-- strava/', start + marker.length) === start12 - 1, '011 and 012 must be adjacent');
await db.exec(full.slice(0, start) + full.slice(end, start51) + full.slice(end51));

async function existing() {
  return (await db.query(`select jsonb_build_object(
   'policies',(select jsonb_agg(jsonb_build_object('t',c.relname,'p',p.polname,'cmd',p.polcmd,'perm',p.polpermissive,'roles',p.polroles::text,'q',pg_get_expr(p.polqual,p.polrelid),'c',pg_get_expr(p.polwithcheck,p.polrelid)) order by c.relname,p.polname)
     from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='strava'::regnamespace),
   'grants',(select jsonb_agg(jsonb_build_object('t',table_name,'g',grantee,'p',privilege_type) order by table_name,grantee,privilege_type)
     from information_schema.role_table_grants where table_schema='strava'),
   'columns',(select jsonb_agg(jsonb_build_object('t',table_name,'c',column_name,'d',data_type,'n',is_nullable,'x',column_default) order by table_name,ordinal_position)
     from information_schema.columns where table_schema='strava'),
   'rls',(select jsonb_agg(jsonb_build_object('t',relname,'r',relrowsecurity,'f',relforcerowsecurity) order by relname) from pg_class where relnamespace='strava'::regnamespace and relkind='r'),
   'functions',(select jsonb_agg(jsonb_build_object('f',p.oid::regprocedure::text,'src',md5(p.prosrc),'acl',p.proacl::text) order by p.oid::regprocedure::text) from pg_proc p where pronamespace='strava'::regnamespace),
   'triggers',(select jsonb_agg(tgname::text order by tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='strava'::regnamespace and not t.tgisinternal)) v`)).rows[0].v;
}
const before = await existing();
await db.exec(read('supabase/strava/011_dropin_links.sql'));
await db.exec(read('supabase/strava/012_dropin_route.sql'));
const after = await existing();
const NEW_TABLES = new Set(['dropin_links', 'dropin_rate']);
const NEW_FUNCS = /^strava\.dropin_(create|read|delete)\(/;
const normalise = value => JSON.parse(JSON.stringify(value).replaceAll('strava.', ''));
for (const key of ['policies', 'grants', 'columns', 'rls', 'triggers'])
  assert.deepEqual(normalise((after[key] || []).filter(x => !NEW_TABLES.has(x.t))), normalise(before[key] || []), `011 changed existing ${key}`);
assert.deepEqual(normalise((after.functions || []).filter(f => !NEW_FUNCS.test(f.f))), normalise(before.functions), '011 changed an existing function');
assert.equal((after.functions || []).filter(f => NEW_FUNCS.test(f.f)).length, 3);
console.log('011 and 012 are additive: no existing policy, grant, column, RLS flag, function or trigger changed.');
await db.exec(read('supabase/strava/051_prompt_provenance.sql'));
await db.exec(read('supabase/strava/051_prompt_provenance.sql'));

// Clients cannot read or write either table directly.
await db.exec('set search_path=strava,pg_temp');
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from strava.dropin_links'), /permission denied/, `${role} must not select links`);
  await assert.rejects(db.query('select * from strava.dropin_rate'), /permission denied/, `${role} must not select rate rows`);
  await assert.rejects(db.query(`insert into strava.dropin_links(delete_hash,title,harness,turns_typed,tool_calls,rhythm) values(repeat('a',64),'x','Codex',1,1,'{1}')`), /permission denied/);
  await db.exec('reset role');
}

const prompt_provenance={v:1,counts:{'human-typed':3,'human-via-tool':0,'agent-to-agent':0,automation:0,unknown:0},human_turns:3,known_autonomous_turns:0,unknown_turns:0,relays:{}};
const agent_provenance={v:1,counts:{'human-typed':0,'human-via-tool':0,'agent-to-agent':1,automation:0,unknown:0},human_turns:0,known_autonomous_turns:1,unknown_turns:0,relays:{}};
const good = { title: 'Shipped the drop-in', harness: 'Claude Code', turns_typed: 3, tool_calls: 12, files_touched: 2, commits: 1, duration_s: 1800, started_hour: 23, rhythm: [1, 0, 2], route: [0, 1, 0, 2], prompt_provenance };
const create = async (payload, bucket = 'ip-a') => (await db.query('select strava.dropin_create($1::jsonb,$2) r', [JSON.stringify(payload), bucket])).rows[0].r;
const refuse = (payload, re, bucket) => assert.rejects(create(payload, bucket), re);

await db.exec('set role anon');
const made = await create(good);
assert.match(made.id, /^[0-9a-f-]{36}$/);
assert.match(made.delete_token, /^[0-9a-f]{64}$/);
const back = (await db.query('select strava.dropin_read($1) r', [made.id])).rows[0].r;
assert.equal(back.title, good.title);
assert.deepEqual(back.rhythm, good.rhythm);
assert.deepEqual(back.route, good.route);
assert.deepEqual(back.prompt_provenance,prompt_provenance);
const agentOnly=await create({...good,title:'Agent-only run',turns_typed:0,prompt_provenance:agent_provenance},'ip-agent-only');
assert.equal((await db.query('select strava.dropin_read($1) r',[agentOnly.id])).rows[0].r.turns_typed,0,'known agent-only links preserve measured zero human turns');
// A link made by a client that predates the route (or a run with no file touch) has none.
const { route: _omitted, ...without } = good;
const older = await create(without, 'ip-route');
assert.equal((await db.query('select strava.dropin_read($1) r', [older.id])).rows[0].r.route, null);
assert.equal(back.delete_token, undefined, 'read must never return the secret');
assert.equal(back.delete_hash, undefined, 'read must never return the hash');

// Allowlist: a prompt, a path or any unknown key is refused, not dropped.
await refuse({ ...good, prompt: 'secret prompt' }, /Field not allowed: prompt/);
await refuse({ ...good, project: '/Users/alice/app' }, /Field not allowed: project/);
await refuse({ ...good, title: 'see https://spam.example' }, /link or an address/);
await refuse({ ...good, title: 'buy now at cheap.shop' }, /link or an address/);
await refuse({ ...good, title: 'mail me a@b' }, /link or an address/);
await refuse({ ...good, title: '' }, /1 to 80/);
await refuse({ ...good, title: 'x'.repeat(81) }, /1 to 80/);
await refuse({ ...good, harness: 'Grok Bot' }, /out of range/);
await refuse({ ...good, turns_typed: -1 }, /out of range/);
await refuse({ ...good, turns_typed: 1.5 }, /whole numbers/);
await refuse({ ...good, turns_typed: null, prompt_provenance: null }, /require prompt provenance/);
await refuse({ ...good, rhythm: ['a'] }, /rhythm/);
await refuse({ ...good, rhythm: 'text' }, /rhythm/);
await refuse({ ...good, rhythm: Array(25).fill(1) }, /out of range/);
await refuse({ ...good, rhythm: [] }, /out of range/);
await refuse({ ...good, started_hour: 24 }, /out of range/);
// The route is indices only: a folder name, a path, a 17th station or a 401st move is refused.
await refuse({ ...good, route: ['site'] }, /route holds small whole numbers/);
await refuse({ ...good, route: ['/Users/alice/app'] }, /route holds small whole numbers/);
await refuse({ ...good, route: [0, 16] }, /out of range/);
await refuse({ ...good, route: Array(401).fill(0) }, /out of range/);
// An empty route is no route: stored as null, read back as null.
const empty = await create({ ...good, route: [] }, 'ip-route');
assert.equal((await db.query('select strava.dropin_read($1) r', [empty.id])).rows[0].r.route, null);
await refuse({ ...good, title: 'x'.repeat(40), rhythm: Array(24).fill(1), turns_typed: 1, pad: 'y'.repeat(5000) }, /4 KiB/);
console.log('Allowlist holds: prompts, paths, links and unknown keys are refused.');

// Per-bucket limit: 10 per hour. `made` used one; refusals above never counted.
for (let i = 0; i < 9; i++) await create(good, 'ip-a');
await refuse(good, /limit reached for this network/, 'ip-a');
await create(good, 'ip-b'); // another bucket still works
// The raw bucket is not stored.
await db.exec('reset role');
assert.equal((await db.query(`select count(*)::int n from strava.dropin_rate where bucket_hash in ('ip-a','ip-b')`)).rows[0].n, 0, 'raw bucket must not be stored');
// Per-bucket daily cap: 30 in 24 hours even when spread over hours.
await db.exec(`insert into strava.dropin_rate(bucket_hash,created_at) select encode(sha256(convert_to('ip-c','UTF8')),'hex'), now()-interval '3 hours' from generate_series(1,30)`);
await db.exec('set role anon');
await refuse(good, /limit reached for this network/, 'ip-c');
// Global cap: 300 links in the last hour stops every bucket, including a fresh one.
await db.exec('reset role');
await db.exec(`insert into strava.dropin_links(delete_hash,title,harness,turns_typed,tool_calls,rhythm)
  select repeat('0',64),'filler','Codex',1,1,'{1}' from generate_series(1,300)`);
await db.exec('set role anon');
await refuse(good, /Link limit reached for now/, 'fresh-bucket');
await db.exec('reset role');
await db.exec(`delete from strava.dropin_links where title='filler'`);
// Old rate rows are purged on the next create.
await db.exec(`insert into strava.dropin_rate(bucket_hash,created_at) values('old',now()-interval '2 days')`);
await db.exec('set role anon');
await create(good, 'ip-d');
await db.exec('reset role');
assert.equal((await db.query(`select count(*)::int n from strava.dropin_rate where bucket_hash='old'`)).rows[0].n, 0);
console.log('Rate limits hold: 10/hour and 30/day per network, 300/hour globally.');

// Delete: wrong secret and missing id answer the same; the right secret deletes once.
await db.exec('set role anon');
const del = async (id, token) => (await db.query('select strava.dropin_delete($1,$2) r', [id, token])).rows[0].r;
assert.equal(await del(made.id, 'f'.repeat(64)), false);
assert.equal(await del('00000000-0000-0000-0000-000000000000', made.delete_token), false);
assert.equal(await del(made.id, 'not-hex'), false);
assert.equal(await del(made.id, made.delete_token), true);
assert.equal(await del(made.id, made.delete_token), false);
assert.equal((await db.query('select strava.dropin_read($1) r', [made.id])).rows[0].r, null);
// Expired links read as missing.
const old = await create(good, 'ip-e');
await db.exec('reset role');
await db.exec(`update strava.dropin_links set expires_at=now()-interval '1 second' where id='${old.id}'`);
await db.exec('set role anon');
assert.equal((await db.query('select strava.dropin_read($1) r', [old.id])).rows[0].r, null);
console.log('Delete needs the secret; expired and deleted links read as missing.');
console.log('Drop-in link database checks passed.');
