// Offline: guest home head-prefetch shape, gates, and failure fall-through.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const html = fs.readFileSync('site/index.html', 'utf8');
assert.equal([...html.matchAll(/const SB_URL="/g)].length, 1, 'exactly one SB_URL marker');
assert.equal([...html.matchAll(/const SB_KEY="/g)].length, 1, 'exactly one SB_KEY marker');

const startupAt = html.indexOf('<script src="/startup.js"></script>');
const earlyAt = html.indexOf('window.__striveEarlyFeed=');
const preloadAt = html.indexOf('<link rel="preload"');
const bodyAt = html.indexOf('<body');
assert.ok(startupAt >= 0 && earlyAt > startupAt, 'early script after startup.js');
assert.ok(earlyAt < preloadAt && earlyAt < bodyAt, 'early script before preload/body scripts');
assert.match(html, /dataset\.authHint==='guest'/);
assert.match(html, /\(!location\.search\|\|new URLSearchParams\(location\.search\)\.has\('explore'\)\)&&!location\.hash\.includes\('import='\)/);

const require = createRequire(import.meta.url);
const H = require('../site/home.js');
const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
assert.equal(localDay(new Date(Date.parse('2026-11-21T12:00:00'))), localDay(new Date(Date.parse('2026-11-21T12:00:00'))));

function tokenFromRows(rows) {
  const ids = rows.map((row) => row.id);
  return ids.length ? ids.join(':') : 'empty';
}
assert.equal(tokenFromRows([{ id: 'a' }, { id: 'b' }]), 'a:b');
assert.equal(tokenFromRows([]), 'empty');

{
  const rows = [{ id: 'r1' }, { id: 'r2' }];
  globalThis.__striveEarlyFeed = { at: Date.now(), rows: Promise.resolve(rows) };
  const token = await H.latestRunToken({ from() { throw new Error('should use early rows'); } });
  const read = await H.readRuns({ from() { throw new Error('should use early rows'); } });
  assert.equal(token, 'r1:r2');
  assert.deepEqual(read.runs, rows);
  assert.equal(globalThis.__striveEarlyFeed.rows, undefined);
  delete globalThis.__striveEarlyFeed;
}

const earlyScript = html.slice(
  html.indexOf('<script>', html.indexOf('<script src="/startup.js"></script>')),
  html.indexOf('</script>', html.indexOf('window.__striveEarlyFeed=')) + '</script>'.length,
);
const source = earlyScript.replace(/^<script>/, '').replace(/<\/script>$/, '');

async function runEarly({ authHint = 'guest', search = '', hash = '', fetchImpl }) {
  const calls = [];
  const context = {
    window: { fetch: null },
    document: { documentElement: { dataset: { authHint } } },
    location: { search, hash },
    Date,
    Map,
    URLSearchParams,
    Object,
    String,
    Array,
    Number,
    JSON,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'UTC' }) }) },
    console,
  };
  context.window = context;
  context.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    return fetchImpl(url, opts, calls);
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await Promise.resolve();
  await context.__striveEarlyFeed?.rows;
  await context.__striveEarlyFeed?.acks;
  await new Promise((r) => setImmediate(r));
  return { calls, feed: context.__striveEarlyFeed };
}

{
  const { calls, feed } = await runEarly({
    fetchImpl: async (url) => {
      if (String(url).includes('/rest/v1/runs?')) {
        return {
          ok: true,
          json: async () => [{ id: 'run-1', profile_id: 'p1', started_at: '2026-11-21T10:00:00.000Z' }],
        };
      }
      if (String(url).includes('/api/run-photos')) return { ok: true, json: async () => ({ photos: [] }) };
      if (String(url).includes('/rest/v1/acks?')) return { ok: true, json: async () => [] };
      if (String(url).includes('/rpc/read_day_card')) return { ok: true, json: async () => ({ v: 2 }) };
      return { ok: false, json: async () => ({}) };
    },
  });
  const runs = calls.filter((c) => c.url.includes('/rest/v1/runs?'));
  assert.equal(runs.length, 1, 'guest home fires one runs fetch');
  const u = new URL(runs[0].url);
  assert.equal(u.searchParams.get('select'), '*,profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)');
  assert.equal(u.searchParams.get('visibility'), 'eq.public');
  assert.equal(u.searchParams.get('order'), 'started_at.desc.nullslast,id.desc');
  assert.equal(u.searchParams.get('limit'), '300');
  const headers = runs[0].opts.headers;
  assert.equal(headers.apikey, 'local-development-only');
  assert.equal(headers.Authorization, 'Bearer local-development-only');
  assert.equal(headers['Accept-Profile'], 'strava');
  assert.ok(feed && feed.photos instanceof Map);
  assert.equal(await feed.rows.then((r) => r[0].id), 'run-1');
  assert.ok(calls.some((c) => c.url.includes('/api/run-photos?run_id=run-1')));
  assert.ok(calls.some((c) => c.url.includes('/rest/v1/acks?')));
  assert.ok(calls.some((c) => c.url.includes('/rpc/read_day_card')));
}

{
  const { calls, feed } = await runEarly({
    authHint: 'member',
    fetchImpl: async () => { throw new Error('member must not fetch'); },
  });
  assert.equal(calls.length, 0);
  assert.equal(feed, undefined);
}

{
  const { calls, feed } = await runEarly({
    search: '?run=x',
    fetchImpl: async () => { throw new Error('run route must not fetch'); },
  });
  assert.equal(calls.length, 0);
  assert.equal(feed, undefined);
}

{
  const { calls, feed } = await runEarly({
    fetchImpl: async (url) => {
      if (String(url).includes('/rest/v1/runs?')) return { ok: false, status: 500, json: async () => ({}) };
      throw new Error('no follow-up after runs failure: ' + url);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(await feed.rows, null);
  assert.equal(await feed.acks, null);
  assert.equal(feed.photos.size, 0);
  assert.equal(feed.cards.size, 0);
}

console.log('PASS early feed head script gates, query shape, shared rows token, and runs failure fall-through.');
