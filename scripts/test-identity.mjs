// Strava identity: real SQL/RLS in PostgreSQL/WASM plus site/auth.js against a mocked client.
// Synthetic actors only. Hosted OAuth, X identity_data and manual linking stay unverified here.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
process.on('uncaughtException', (e) => { console.error(e.name === 'AssertionError' ? e.stack : e.message); process.exit(1); });
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const build = (p) => execFileSync('python3', [new URL('./' + p, import.meta.url).pathname], { encoding: 'utf8' });
const a = '10000000-0000-0000-0000-000000000001', b = '10000000-0000-0000-0000-000000000002', c = '10000000-0000-0000-0000-000000000003';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated;
alter default privileges grant all on tables to anon,authenticated;
alter default privileges grant execute on functions to anon,authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;
create table auth.identities(user_id uuid, provider text, identity_data jsonb);
insert into auth.identities values
('${a}','github','{"user_name":"AliceGH"}'),
('${b}','github','{"user_name":"bob_legacy"}'),
('${c}','github','{"user_name":"alice_builder"}');`);
await db.exec(read('tests/fixtures/hosted-base.sql'));
await db.exec(build('prepare-migration.py'));
await db.exec(`insert into public.profiles(id,auth_uid,name,github_handle) values ('${a}','${a}','Grinder sentinel','sentinel');`);
async function grinder() { return (await db.query(`select jsonb_build_object(
 'columns',(select jsonb_agg(row_to_json(x) order by attrelid,attnum) from pg_attribute x join pg_class c on c.oid=x.attrelid where c.relnamespace='public'::regnamespace),
 'triggers',(select jsonb_agg(row_to_json(t) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace),
 'functions',(select jsonb_agg(row_to_json(p) order by p.oid) from pg_proc p where pronamespace='public'::regnamespace),
 'profiles',(select jsonb_agg(row_to_json(p)) from public.profiles p),
 'auth',(select jsonb_agg(row_to_json(i)) from auth.identities i)) v`)).rows[0].v; }
const before = await grinder();
const bootstrap = build('prepare-strava-database.py');
assert(bootstrap.includes('-- strava/identity.sql'), 'bootstrap must include the strava identity migration');
await db.exec(bootstrap);
const identity = read('supabase/strava/identity.sql');
await db.exec(identity); await db.exec(identity); // retry-safe on an installed schema
assert.deepEqual(await grinder(), before, 'identity migration must not change Grinder');
// Isolation rules from the shared-schema check apply to the new functions too.
for (const f of (await db.query("select proname,proconfig,prosrc from pg_proc where pronamespace='strava'::regnamespace and proname like 'strava_%'")).rows) {
  assert(!/\bpublic\./.test(f.prosrc), f.proname + ' references Grinder');
  assert(f.proconfig && f.proconfig.some((c) => c.startsWith('search_path=strava')), f.proname + ' needs a strava search path');
}
assert.equal((await db.query("select has_function_privilege('anon','strava.strava_profile_handle_guard()','EXECUTE') x")).rows[0].x, false);
assert.equal((await db.query("select has_function_privilege('anon','strava.strava_profile_by_handle(text)','EXECUTE') x")).rows[0].x, true);

await db.exec('set search_path=strava,pg_temp');
async function as(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); }
async function anon() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role anon'); }
async function denied(sql, params = [], codes = ['23505', '23514', '42501', 'P0001']) {
  try { await db.query(sql, params); } catch (e) { assert(codes.includes(e.code), 'unexpected ' + e.code + ' ' + e.message); return e; }
  assert.fail('expected denial: ' + sql);
}
const lookup = async (h) => (await db.query('select id,handle,github_handle from strava_profile_by_handle($1)', [h])).rows[0] || null;

// Onboarding: chosen handle is normalised, github_handle stays legacy/provider-owned.
await as(a);
const pa = (await db.query("insert into profiles(auth_uid,handle,display_name,avatar_url,github_handle,name) values($1,'  Alice_Builder ','  Alice  ','https://example.test/a.png','AliceGH','Alice') returning *", [a])).rows[0];
assert.equal(pa.handle, 'alice_builder'); assert.equal(pa.display_name, 'Alice'); assert.equal(pa.github_handle, 'AliceGH');
// Legacy profile: github_handle only, no chosen handle (what pre-migration rows look like).
await as(b);
const pb = (await db.query("insert into profiles(auth_uid,github_handle,name) values($1,'bob_legacy','Bob') returning *", [b])).rows[0];
assert.equal(pb.handle, null);
// Duplicate handle: exact, different case, and squatting a legacy github_handle all fail with 23505.
await as(c);
for (const h of ['alice_builder', 'ALICE_BUILDER', 'bob_legacy', 'Bob_Legacy', 'aliceGH']) {
  const e = await denied('insert into profiles(auth_uid,handle) values($1,$2)', [c, h], ['23505']);
  assert.match(e.message, /handle_taken|profiles_handle_unique/, h);
}
// Provider provenance is server-enforced, independent of the browser helper.
await denied("insert into profiles(auth_uid,handle,github_handle) values($1,'fakegh','unlinked')", [c], ['42501']);
await denied("insert into profiles(auth_uid,handle,github_handle) values($1,'third','alice_builder')", [c], ['23505']);
// Claim storage is never a client API, including under permissive default grants.
await denied("insert into profile_handle_claims(alias,profile_id) values('stolen',$1)", [pa.id], ['42501']);
await denied("delete from profile_handle_claims", [], ['42501']);
// Format and avatar constraints.
await denied('insert into profiles(auth_uid,handle) values($1,$2)', [c, '-bad'], ['23514']);
await denied('insert into profiles(auth_uid,handle) values($1,$2)', [c, 'a'.repeat(41)], ['23514']);
await denied("insert into profiles(auth_uid,handle,avatar_url) values($1,'carol','http://insecure.test/x.png')", [c], ['23514']);
await denied("insert into profiles(auth_uid,handle,avatar_url) values($1,'carol','javascript:alert(1)')", [c], ['23514']);
await denied("insert into profiles(auth_uid,handle,display_name) values($1,'carol',$2)", [c, 'x'.repeat(61)], ['23514']);
// Cannot insert a profile for someone else's auth_uid (server-side ownership, not handle).
await denied("insert into profiles(auth_uid,handle) values($1,'carol')", [a], ['42501']);
const pc = (await db.query("insert into profiles(auth_uid,handle) values($1,'Carol') returning *", [c])).rows[0];
assert.equal(pc.handle, 'carol');

// Lookup: chosen handle first, legacy github_handle second, case-insensitive without LIKE wildcards.
await anon();
assert.equal((await lookup('Alice_Builder')).id, pa.id);
assert.equal((await lookup('alicegh')).id, pa.id, 'legacy github_handle still resolves');
assert.equal((await lookup('BOB_LEGACY')).id, pb.id);
assert.equal(await lookup('bobxlegacy'), null, 'underscore is not a wildcard');
assert.equal(await lookup('nobody'), null);
// Anonymous cannot write anything.
await denied("update profiles set handle='hijack' where id=$1", [pa.id], ['42501']);

// Owner-only edits: B cannot touch A's handle, avatar or display name, even through the
// 'update ... returning' path (zero rows, no error), and cannot delete A.
await as(b);
assert.equal((await db.query("update profiles set handle='mine',avatar_url='https://example.test/b.png',display_name='Not Alice' where id=$1 returning id", [pa.id])).rows.length, 0);
assert.equal((await db.query('delete from profiles where id=$1 returning id', [pa.id])).rows.length, 0);
// Legacy owner adopts a chosen handle in place: same id, github_handle untouched, old URL still resolves.
await db.query("update profiles set handle='bob_legacy' where id=$1", [pb.id]); // both labels may belong to the same profile
const pb2 = (await db.query("update profiles set handle='Bobby',display_name='Bobby B' where id=$1 returning *", [pb.id])).rows[0];
assert.equal(pb2.id, pb.id); assert.equal(pb2.handle, 'bobby'); assert.equal(pb2.github_handle, 'bob_legacy');
await anon();
assert.equal((await lookup('bobby')).id, pb.id); assert.equal((await lookup('bob_legacy')).id, pb.id);
// Nobody else can now claim either label.
await as(c);
await denied("update profiles set handle='bobby' where id=$1", [pc.id], ['23505']);
await denied("update profiles set handle='bob_legacy' where id=$1", [pc.id], ['23505']);
// A profile may drop its chosen handle; its legacy github_handle keeps working.
await as(a);
await db.query('update profiles set handle=null where id=$1', [pa.id]);
await anon();
assert.equal(await lookup('alice_builder'), null); assert.equal((await lookup('alicegh')).id, pa.id);
await as(a);
await db.query("update profiles set handle='alice_builder' where id=$1", [pa.id]);
// Case-insensitive legacy aliases share the same unique namespace as chosen handles.
await as(b);
await denied("update profiles set github_handle='AliceGH' where id=$1", [pb.id], ['42501']);
await denied("update profiles set id=$1 where id=$2", [c, pb.id], ['23514']);
await db.exec('reset role');
assert.equal((await db.query("select count(*)::int n from strava.profile_handle_claims where alias in ('bobby','bob_legacy')")).rows[0].n, 2);
await db.exec(identity); // backfill on populated rows preserves both URLs
await as(c);
// Owner deletion removes the Strava row; the Grinder profile for the same Auth user is untouched.
await as(c);
await db.query('delete from profiles where id=$1', [pc.id]);
await db.exec('reset role');
assert.equal((await db.query('select count(*)::int n from strava.profiles')).rows[0].n, 2);
assert.equal((await db.query('select count(*)::int n from strava.profile_handle_claims where profile_id=$1', [pc.id])).rows[0].n, 0, 'deletion releases aliases');
// The storage constraint itself rejects a second owner, independent of profile trigger checks.
await denied("insert into strava.profile_handle_claims(alias,profile_id) values('alicegh',$1)", [pb.id], ['23505']);
assert.deepEqual(await grinder(), before, 'Strava identity actions must not change Grinder');
// Exercise the real auth helper against SQL, not a duplicate-rule mock: a GitHub
// alias may already be a chosen handle, but a different chosen handle must still work.
await as(c);
const RealAuth = createRequire(import.meta.url)('../site/auth.js');
const providerUser = {id:c, identities:[{provider:'github',identity_data:{user_name:'alice_builder'}}]};
let inserts=0;
const sqlClient={auth:{getSession:async()=>({data:{session:{user:providerUser}},error:null})},
  from(table){
    assert.equal(table,'profiles');
    let inserted=null;const filters=[];
    const q={select(){return q;},single(){return q;},maybeSingle(){return q;},
      eq(k,v){assert(['id','auth_uid'].includes(k));filters.push([k,v]);return q;},
      insert(row){inserted=row;return q;},
      async then(resolve){
        try{
          let result;
          if(inserted){
            inserts++;
            const keys=Object.keys(inserted);assert(keys.every(k=>/^[a-z_]+$/.test(k)));
            result=await db.query('insert into strava.profiles('+keys.join(',')+') values ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') returning *',Object.values(inserted));
          }else result=await db.query('select * from strava.profiles where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and '),filters.map(([,v])=>v));
          return resolve({data:result.rows[0]||null,error:null});
        }catch(e){return resolve({data:null,error:{code:e.code,message:e.message}});}
      }};return q;
  }};
const sqlAuth=RealAuth.create({client:sqlClient});
await assert.rejects(sqlAuth.onboard({handle:'alice_builder'}),e=>e.detail.code==='handle_taken');
assert.equal((await db.query('select count(*)::int n from profiles where auth_uid=$1',[c])).rows[0].n,0,'chosen collision creates no profile');
const recovered=await sqlAuth.onboard({handle:'new-builder',display_name:'New Builder'});
assert.equal(recovered.profile.handle,'new-builder');assert.equal(recovered.profile.github_handle,null);
assert.equal((await lookup('alice_builder')).id,pa.id,'existing URL owner is unchanged');
const attempts=inserts;
assert.equal((await sqlAuth.onboard({handle:'unused'})).profile.id,recovered.profile.id);
assert.equal(inserts,attempts,'retry after success reuses existing profile');
await db.query('delete from profiles where id=$1',[recovered.profile.id]);
await db.exec('reset role');

// Simulate an already-ambiguous legacy namespace (case variants were permitted by the
// old github_handle UNIQUE constraint). Migration must refuse, not choose a URL owner.
await db.exec(`drop trigger strava_profile_handle_guard on strava.profiles;
drop trigger strava_profile_handle_claim on strava.profiles;
insert into strava.profiles(id,auth_uid,github_handle) values('${c}','${c}','alicegh');`);
await assert.rejects(db.exec(identity), (e) => e.code === '23505');
await db.exec('rollback');
assert.equal((await db.query("select count(*)::int n from strava.profiles where lower(github_handle)='alicegh'")).rows[0].n, 2, 'ambiguous legacy profiles survive refusal');
assert.deepEqual(await grinder(), before, 'failed migration leaves Grinder and Auth unchanged');
await db.close();
console.log('PASS sql: identity columns, normalisation, duplicate/squat refusal, format checks, lookup precedence, owner-only edits, stable ids, deletion isolation');

/* ---------- site/auth.js against a mocked client: provider effects are recorded, not performed ---------- */
const GrinderAuth = createRequire(import.meta.url)('../site/auth.js');
assert.deepEqual(GrinderAuth.providers.map((p) => p.id), ['github', 'x', 'email'], 'no Cursor login is offered');
// Normalisation.
assert.equal(GrinderAuth.normalizeHandle('@Alice Builder!!'), 'alice-builder');
assert.equal(GrinderAuth.normalizeHandle('--__--', 'ABCDEF1234567890'), 'builder-abcdef12');
assert.equal(GrinderAuth.normalizeHandle('x'.repeat(50)), 'x'.repeat(40));
assert.equal(GrinderAuth.normalizeDisplayName('  Ada   Lovelace ', 'ada'), 'Ada Lovelace');
assert.equal(GrinderAuth.normalizeDisplayName('ada@example.test', 'ada'), 'ada', 'emails never become display names');
assert.equal(GrinderAuth.normalizeAvatarUrl('http://x.test/a.png'), null);
assert.equal(GrinderAuth.normalizeAvatarUrl('https://x.test/a.png'), 'https://x.test/a.png');
assert.equal(GrinderAuth.validateHandle('Bad Handle').code, 'handle_format');
// Presentation contract with legacy fallback.
assert.deepEqual(GrinderAuth.present({ id: 'p1', github_handle: 'Legacy', name: 'Old Name' }), { id: 'p1', handle: 'Legacy', display_name: 'Old Name', avatar_url: null, legacy: true, url: '/?u=Legacy' });
assert.deepEqual(GrinderAuth.present({ id: 'p2', handle: 'new', display_name: null, name: null, github_handle: null, avatar_url: 'https://x.test/p.png' }), { id: 'p2', handle: 'new', display_name: '@new', avatar_url: 'https://x.test/p.png', legacy: false, url: '/?u=new' });
assert.equal(GrinderAuth.present({ id: 'p3' }).display_name, 'A builder');
// Suggestion from identities: X handle candidate keys are read, github_handle only from GitHub.
const xUser = { id: 'u-x', identities: [{ identity_id: 'i1', provider: 'x', identity_data: { user_name: 'XPerson', name: 'X Person', avatar_url: 'https://pbs.test/x.jpg' } }] };
assert.deepEqual(GrinderAuth.suggest(xUser), { handle: 'xperson', display_name: 'X Person', avatar_url: 'https://pbs.test/x.jpg', providers: ['x'], github_handle: null });
const ghUser = { id: 'u-gh', user_metadata: { user_name: 'GHPerson' }, identities: [{ identity_id: 'i2', provider: 'github', identity_data: { user_name: 'GHPerson', full_name: 'G Person', avatar_url: 'https://avatars.test/g.png' } }] };
assert.equal(GrinderAuth.suggest(ghUser).github_handle, 'GHPerson');
assert.equal(GrinderAuth.githubHandleOf({ user_metadata: { user_name: 'FromMeta' }, identities: [] }), null, 'metadata alone never proves a GitHub account');
// Error mapping for documented linking failures.
assert.equal(GrinderAuth.explain({ code: 'manual_linking_disabled', message: '' }).code, 'linking_disabled');
assert.equal(GrinderAuth.explain({ code: 'identity_already_exists', message: '' }).code, 'identity_taken');
assert.equal(GrinderAuth.explain({ code: 'single_identity_not_deletable', message: '' }).code, 'last_identity');
assert.equal(GrinderAuth.explain({ code: '23505', message: 'handle_taken' }).code, 'handle_taken');
assert.equal(GrinderAuth.explain({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_auth_uid_key"' }).code, 'profile_exists');

// Mock client: an in-memory profiles table keyed by auth_uid, and an auth surface that records effects.
function mockClient({ user, rows = [], authIdentities = null }) {
  const calls = [];
  const table = rows.map((r) => ({ ...r }));
  const q = (name) => {
    const st = { op: 'select', filters: [], row: null };
    const api = {
      select() { return api; }, maybeSingle() { return api; }, single() { return api; },
      insert(row) { st.op = 'insert'; st.row = row; return api; },
      update(row) { st.op = 'update'; st.row = row; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(k, v) { st.filters.push([k, v]); return api; },
      then(resolve) {
        const match = (r) => st.filters.every(([k, v]) => r[k] === v);
        let data = null, error = null;
        if (st.op === 'select') data = table.find(match) || null;
        else if (st.op === 'insert') {
          if (table.some((r) => r.auth_uid === st.row.auth_uid)) error = { code: '23505', message: 'duplicate key value violates unique constraint "profiles_auth_uid_key"' };
          else if (table.some((r) => r.handle === st.row.handle || (r.github_handle || '').toLowerCase() === st.row.handle)) error = { code: '23505', message: 'handle_taken' };
          else { data = { id: 'id-' + (table.length + 1), name: null, github_handle: null, ...st.row }; table.push(data); }
        } else if (st.op === 'update') {
          const r = table.find(match);
          if (r) { Object.assign(r, st.row); data = r; } else error = { code: 'PGRST116', message: 'no rows' };
        } else if (st.op === 'delete') { const i = table.findIndex(match); data = i >= 0 ? table.splice(i, 1).map((r) => ({ id: r.id })) : []; }
        calls.push([name, st.op, st.filters]);
        return Promise.resolve({ data, error }).then(resolve);
      },
    };
    return api;
  };
  let identities = authIdentities ? [...authIdentities] : user ? [...(user.identities || [])] : [];
  const auth = {
    async getSession() { return { data: { session: user ? { user: { ...user, identities } } : null }, error: null }; },
    async signInWithOAuth(args) { calls.push(['oauth', args]); return { data: { url: 'https://auth.test/' + args.provider }, error: null }; },
    async signInWithOtp(args) { calls.push(['otp', args]); return { data: {}, error: null }; },
    async linkIdentity(args) { calls.push(['link', args]); return auth.linkResult || { data: { provider: args.provider, url: 'https://auth.test/link' }, error: null }; },
    async getUserIdentities() { return { data: { identities }, error: null }; },
    async unlinkIdentity(i) { calls.push(['unlink', i]); identities = identities.filter((x) => x.identity_id !== i.identity_id); return { data: {}, error: null }; },
    async signOut(args) { calls.push(['signout', args]); user = null; return { error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  };
  return { client: { auth, from: q, rpc: (fn, args) => ({ maybeSingle: async () => ({ data: table.find((r) => r.handle === args.lookup.toLowerCase()) || table.find((r) => (r.github_handle || '').toLowerCase() === args.lookup.toLowerCase()) || null, error: null }) }) }, calls, table };
}
const store = new Map(); const storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };

// Signed out: nothing to onboard, sign-in starts the provider and remembers where to return.
let m = mockClient({ user: null });
let A = GrinderAuth.create({ client: m.client, redirectTo: 'https://strava.test/', storage });
assert.deepEqual(await A.current(), { user: null, profile: null, needsOnboarding: false, suggestion: null });
await assert.rejects(A.onboard({ handle: 'x' }), (e) => e.detail.code === 'forbidden');
assert.deepEqual(await A.signIn('x', { returnTo: '?mine' }), { provider: 'x', started: true });
assert.deepEqual(m.calls.at(-1), ['oauth', { provider: 'x', options: { redirectTo: 'https://strava.test/' } }]);
assert.equal(A.returnTo(), '?mine'); assert.equal(A.returnTo(), null);
await assert.rejects(A.signIn('cursor'), (e) => e.detail.code === 'provider_unavailable');
await assert.rejects(A.signIn('email', { email: '' }), (e) => e.detail.code === 'provider_unavailable');
assert.deepEqual(await A.signIn('email', { email: 'p@example.test' }), { provider: 'email', started: true, sent: true });

// Signed in with X, no profile: onboarding creates once, retry returns the same id, github_handle stays null.
m = mockClient({ user: xUser, rows: [{ id: 'legacy-1', auth_uid: 'u-old', github_handle: 'Taken', name: 'Old' }] });
A = GrinderAuth.create({ client: m.client, storage });
let cur = await A.current();
assert.equal(cur.needsOnboarding, true); assert.equal(cur.suggestion.handle, 'xperson');
await assert.rejects(A.onboard({ handle: 'taken' }), (e) => e.detail.code === 'handle_taken', 'legacy github_handle cannot be squatted');
await assert.rejects(A.onboard({ handle: 'bad handle' }), (e) => e.detail.code === 'handle_format');
const first = await A.onboard({ handle: 'XPerson', display_name: '  X   Person ', avatar_url: 'http://insecure.test/x.png' });
assert.equal(first.created, true); assert.equal(first.profile.handle, 'xperson'); assert.equal(first.profile.github_handle, null);
assert.equal(first.profile.display_name, 'X Person'); assert.equal(first.profile.avatar_url, null, 'insecure avatar dropped, not saved');
const second = await A.onboard({ handle: 'other' });
assert.equal(second.created, false); assert.equal(second.profile.id, first.profile.id, 'profile id is stable across onboarding retries');
assert.deepEqual(GrinderAuth.present(second.profile), { id: first.profile.id, handle: 'xperson', display_name: 'X Person', avatar_url: null, legacy: false, url: '/?u=xperson' });
// Edits keep the id and scope the statement to the owner.
const edited = await A.updateProfile({ display_name: 'X P', avatar_url: 'https://pbs.test/new.jpg' });
assert.equal(edited.id, first.profile.id); assert.equal(edited.avatar_url, 'https://pbs.test/new.jpg'); assert.equal(edited.name, 'X P');
assert.deepEqual(m.calls.at(-1), ['profiles', 'update', [['id', first.profile.id], ['auth_uid', 'u-x']]]);
await assert.rejects(A.updateProfile({ avatar_url: 'ftp://x' }), (e) => e.detail.code === 'avatar_invalid');
assert.equal((await A.byHandle('@XPERSON')).id, first.profile.id); assert.equal((await A.byHandle('taken')).id, 'legacy-1');

// GitHub-only first sign-in creates one provider-neutral profile while retaining the verified
// GitHub label solely as a compatibility alias.
m = mockClient({ user: ghUser });
A = GrinderAuth.create({ client: m.client, storage });
const githubOnly = await A.onboard({ handle: 'g-person', display_name: 'G Person' });
assert.equal(githubOnly.profile.handle, 'g-person');
assert.equal(githubOnly.profile.display_name, 'G Person');
assert.equal(githubOnly.profile.github_handle, 'GHPerson');
assert.equal((await A.onboard({ handle: 'different' })).profile.id, githubOnly.profile.id);

// Linking: effect recorded, redirect target passed; documented failures map to codes.
m = mockClient({ user: xUser, rows: [{ ...first.profile }] });
A = GrinderAuth.create({ client: m.client, storage });
assert.deepEqual(await A.link('github'), { provider: 'github', url: 'https://auth.test/link', started: true });
assert.equal(m.calls.at(-1)[1].provider, 'github');
await assert.rejects(A.link('email'), (e) => e.detail.code === 'provider_unavailable');
m.client.auth.linkResult = { data: null, error: { code: 'manual_linking_disabled', message: 'Manual linking is disabled' } };
await assert.rejects(A.link('github'), (e) => e.detail.code === 'linking_disabled');
m.client.auth.linkResult = { data: null, error: { code: 'identity_already_exists', message: 'Identity is already linked to another user' } };
await assert.rejects(A.link('github'), (e) => e.detail.code === 'identity_taken');
// Unlinking the only identity is refused before any provider call; with two it proceeds.
await assert.rejects(A.unlink('i1'), (e) => e.detail.code === 'last_identity');
await assert.rejects(A.unlink('nope'), (e) => e.detail.code === 'identity_missing');
const linkedIds = [...xUser.identities, { identity_id: 'i9', provider: 'github', identity_data: { user_name: 'XPersonGH', avatar_url: 'https://avatars.test/x.png' } }];
// The session deliberately remains X-only; getUserIdentities is the authoritative post-link read.
m = mockClient({ user: xUser, authIdentities: linkedIds, rows: [{ ...first.profile }] });
A = GrinderAuth.create({ client: m.client, storage });
assert.deepEqual((await A.identities()).map((i) => [i.provider, i.handle]), [['x', 'XPerson'], ['github', 'XPersonGH']]);
// A real GitHub identity fills the legacy column once; a chosen handle never does.
const synced = await A.syncGithubHandle();
assert.equal(synced.github_handle, 'XPersonGH'); assert.equal(synced.id, first.profile.id);
assert.equal((await A.current()).profile.id, first.profile.id, 'GitHub + X keep one stable STRIVE profile id');
assert.deepEqual(await A.unlink('i9'), { removed: 'i9' });
assert.equal((await A.identities()).length, 1);
// Local sign-out only, then the profile row is still there for the next sign-in.
assert.equal(await A.signOutLocal(), true);
assert.deepEqual(m.calls.at(-1), ['signout', { scope: 'local' }]);
assert.equal(m.table.length, 1);
// Delete: owner-scoped delete, then local sign-out; the Auth user is not deleted by the client.
m = mockClient({ user: xUser, rows: [{ ...first.profile }] });
A = GrinderAuth.create({ client: m.client, storage });
assert.deepEqual(await A.deleteProfile(), { deleted: first.profile.id });
assert.deepEqual(m.calls.at(-2), ['profiles', 'delete', [['id', first.profile.id], ['auth_uid', 'u-x']]]);
assert.deepEqual(m.calls.at(-1), ['signout', { scope: 'local' }]);
assert.equal(m.table.length, 0);
console.log('PASS auth.js: providers (no Cursor), normalisation, presentation fallback, onboarding once, stable id, owner-scoped edits, handle squat refusal, link/unlink error mapping, local sign-out, delete');
