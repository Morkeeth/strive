// Account lane: site/auth.js recovery additions against a mocked client. Synthetic only; the
// hosted provider's exact error values on a real cancel are not asserted here.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
process.on('uncaughtException', (e) => { console.error(e.name === 'AssertionError' ? e.stack : e.message); process.exit(1); });
const GrinderAuth = createRequire(import.meta.url)('../site/auth.js');

// Pure parsing: fragment (implicit flow, the page default) and query (PKCE) both read; other params kept.
let r = GrinderAuth.parseAuthError('?post', '#error=access_denied&error_code=access_denied&error_description=The+user+cancelled');
assert.equal(r.code, 'cancelled'); assert.equal(r.retry, true); assert.deepEqual(r.clean, { search: '?post=', hash: '' });
r = GrinderAuth.parseAuthError('?error=server_error&error_description=Unable+to+exchange+external+code&u=alice', '');
assert.equal(r.code, 'provider_failed'); assert.equal(r.clean.search, '?u=alice');
r = GrinderAuth.parseAuthError('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
assert.equal(r.code, 'link_expired');
r = GrinderAuth.parseAuthError('', '#error_description=Something+odd');
assert.equal(r.code, 'unknown'); assert.equal(r.retry, true);
assert.equal(GrinderAuth.parseAuthError('?post', '#import=abc'), null, 'a draft hash is not an auth error');
assert.equal(GrinderAuth.parseAuthError('', ''), null);
// New codes do not shadow the existing ones.
assert.equal(GrinderAuth.explain({ code: 'validation_failed', message: 'unsupported provider cursor' }).code, 'provider_unavailable');
assert.equal(GrinderAuth.explain({ code: 'single_identity_not_deletable', message: 'User must have at least 1 identity after unlinking' }).code, 'last_identity');
assert.equal(GrinderAuth.explain({ code: 'unexpected_failure', message: '' }).code, 'provider_failed');
assert.equal(GrinderAuth.explain({ code: 'bad_oauth_callback', message: '' }).code, 'link_expired');

// Client-bound: the pending marker follows a started sign-in or link and settles on return.
function mockClient(user) {
  const calls = [];
  const auth = {
    async getSession() { return { data: { session: user ? { user } : null }, error: null }; },
    async signInWithOAuth(a) { calls.push(['oauth', a.provider]); return { data: { url: 'x' }, error: null }; },
    async signInWithOtp(a) { calls.push(['otp', a.email]); return { data: {}, error: null }; },
    async linkIdentity(a) { calls.push(['link', a.provider]); return { data: { url: 'y' }, error: null }; },
    async signOut() { user = null; return { error: null }; },
  };
  const none = () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } });
  return { auth, from: none, rpc: none, calls, setUser(u) { user = u; } };
}
const store = new Map(); const storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
let m = mockClient(null);
let A = GrinderAuth.create({ client: m, redirectTo: 'https://strava.test/', storage });
assert.equal(A.pending(), null);
await A.signIn('github', { returnTo: '?post' });
let p = A.pending();
assert.equal(p.action, 'signin'); assert.equal(p.provider, 'github'); assert.equal(p.returnTo, '?post'); assert.ok(p.at > 0);
assert.equal(A.returnTo(), '?post', 'return location is still stashed separately');
// Came back with an error: recovery reads the URL, cleans it, settles the marker, names the attempt.
const loc = { pathname: '/', search: '?post', hash: '#error=access_denied&error_code=access_denied&error_description=cancelled' };
const hist = { replaced: null, replaceState(_s, _t, url) { this.replaced = url; } };
const rec = A.recoverFromUrl(loc, hist);
assert.equal(rec.code, 'cancelled'); assert.equal(rec.action, 'signin'); assert.equal(rec.provider, 'github'); assert.equal(rec.returnTo, '?post');
assert.equal(hist.replaced, '/?post=');
assert.equal(A.pending(), null, 'a reported outcome clears the marker');
assert.equal(A.recoverFromUrl({ pathname: '/', search: '', hash: '' }, hist), null);
// Email link: marker names email; a later session settles it inside current().
await A.signIn('email', { email: 'p@example.test' });
assert.equal(A.pending().provider, 'email');
m.setUser({ id: 'u1', identities: [{ identity_id: 'i1', provider: 'email', identity_data: { email: 'p@example.test' } }] });
await A.current();
assert.equal(A.pending(), null, 'signed-in user settles a pending sign-in');
// Link: marker names the link; it settles only once that provider is on the user.
await A.link('github', { returnTo: '?account' });
assert.equal(A.pending().action, 'link');
await A.current();
assert.equal(A.pending().action, 'link', 'pending link stays until the identity exists');
m.setUser({ id: 'u1', identities: [{ identity_id: 'i1', provider: 'email', identity_data: {} }, { identity_id: 'i2', provider: 'github', identity_data: { user_name: 'p' } }] });
await A.current();
assert.equal(A.pending(), null, 'linked identity settles the pending link');
A.clearPending(); assert.equal(A.pending(), null);
// A storage that throws never breaks sign-in.
const broken = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('quota'); }, removeItem() { throw new Error('quota'); } };
A = GrinderAuth.create({ client: mockClient(null), storage: broken });
assert.deepEqual(await A.signIn('github'), { provider: 'github', started: true });
assert.equal(A.pending(), null);
console.log('PASS account: URL error parsing (hash and query), pending sign-in/link marker, recovery clears and cleans, explain precedence kept');
