// The drop-in link path end to end, without a browser: parse a fixture whose prompts carry a
// sentinel, build the upload payload the page sends, post it through the production handler to
// the real SQL (PGlite), and check what was sent, what was stored, the limits and the delete.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve } from './dropin-dev-server.mjs';
import * as L from '../server/dropin-link.mjs';
const require = createRequire(import.meta.url);
const Dropin = require('../site/dropin-parse.js');
const Feed = require('../site/feed-card.js');

const SENTINEL = 'PROMPT-SENTINEL-7f3a';
const fixture = new URL('../samples/dropin/claude-edge.jsonl', import.meta.url);
assert.ok(readFileSync(fixture, 'utf8').includes(SENTINEL), 'the fixture must carry the sentinel or this test proves nothing');

// 1. THE PAYLOAD. Only allowlisted keys, only numbers and the typed title, no prompt text or path.
const run = Dropin.parseText(readFileSync(fixture, 'utf8'));
const payload = Dropin.uploadPayload(run, 'My title');
assert.deepEqual(Object.keys(payload).sort(), [...Dropin.UPLOAD_KEYS].sort());
const raw = JSON.stringify(payload);
for (const probe of [SENTINEL, '/Users/', 'fixture', 'git commit', 'a.py', 'cwd'])
  assert.ok(!raw.includes(probe), `payload must not contain ${probe}: ${raw}`);
for (const [k, v] of Object.entries(payload)) {
  if (k === 'title') assert.equal(v, 'My title');
  else if (k === 'harness') assert.ok(Dropin.HARNESSES.includes(v));
  else if (k === 'rhythm') assert.ok(v.every(Number.isSafeInteger));
  else if (k === 'route') assert.ok(v === null || (Array.isArray(v) && v.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 15)), 'route is station indices only');
  else assert.ok(v === null || Number.isSafeInteger(v), `${k} must be a whole number or null`);
}
// Nothing on the parsed run itself can carry text either: the reader keeps no prompt.
assert.ok(!JSON.stringify(run).includes(SENTINEL), 'the parsed run must not hold prompt text');
// Mutation guard: this check does go red when a prompt field is added.
assert.ok(JSON.stringify({ ...payload, prompt: SENTINEL }).includes(SENTINEL));
console.log('Payload: allowlisted keys only; no prompt text, path or command.');

// 2. THE SERVER. Real handler, real SQL.
const { server, db, origin } = await serve({ listen: 0 });
const base = `http://localhost:${server.address().port}`;
const post = (body, ip = '203.0.113.7', path = '/api/link') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) });
try {
  let res = await post(payload);
  assert.equal(res.status, 200, await res.clone().text());
  const made = await res.json();
  assert.match(made.delete_url, /\/delete#[0-9a-f]{64}$/);
  const stored = (await db.query('select * from strava.dropin_links where id=$1', [made.id])).rows[0];
  assert.ok(!JSON.stringify(stored).includes(SENTINEL));
  assert.equal(stored.title, 'My title');
  assert.equal(stored.delete_hash.length, 64);
  assert.notEqual(stored.delete_hash, made.delete_url.split('#')[1], 'the secret itself is never stored');

  // Refused at the server before the database is called.
  res = await post({ ...payload, prompt: SENTINEL });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Field not allowed: prompt/);
  res = await post({ ...payload, title: 'go to https://x.example' });
  assert.equal(res.status, 400);

  // The page and its share image.
  const page = await (await fetch(`${base}/l/${made.id}`)).text();
  assert.match(page, /<meta name="robots" content="noindex,nofollow">/);
  assert.ok(page.includes('My title') && !page.includes(SENTINEL));
  const a = Feed.achievement(L.linkRow({ ...stored, rhythm: stored.rhythm }));
  if (a) assert.ok(page.includes(a.label), 'the page shows the badge the card earns');
  const { card } = await import('../server/public-run.mjs');
  const tree = JSON.stringify(card(L.linkRow({ ...stored })));
  assert.ok(tree.includes('Anonymous builder') && tree.includes('My title'));
  if (a) assert.ok(tree.includes(a.label), 'the share image carries the same badge');

  // 3. RATE LIMIT through HTTP: 10 per network per hour. One made above; refusals do not count.
  for (let i = 0; i < 9; i++) assert.equal((await post(payload)).status, 200, `create ${i + 2}`);
  res = await post(payload);
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /limit reached/);
  assert.equal((await post(payload, '198.51.100.9')).status, 200, 'another network is not blocked');
  console.log('Rate limit: the 11th link from one network in an hour gets 429.');

  // 4. DELETE needs the secret, and GET never deletes.
  const token = made.delete_url.split('#')[1];
  assert.equal((await fetch(`${base}/l/${made.id}/delete`)).status, 200);
  assert.equal((await fetch(`${base}/l/${made.id}`)).status, 200, 'opening the delete page deletes nothing');
  assert.equal((await post({ id: made.id, token: 'f'.repeat(64) }, undefined, '/api/link?action=delete')).status, 404);
  assert.equal((await post({ id: made.id, token }, undefined, '/api/link?action=delete')).status, 200);
  assert.equal((await fetch(`${base}/l/${made.id}`)).status, 404);
  console.log('Delete: needs the secret; a GET of the delete page deletes nothing.');
} finally {
  server.close();
}
console.log('Drop-in API checks passed.');
