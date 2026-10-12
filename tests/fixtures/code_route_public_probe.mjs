// Public share page and OG card must use the same Code Route data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.AGENTGRINDER_SUPABASE_URL ||= 'http://localhost:54321';
process.env.AGENTGRINDER_SUPABASE_ANON_KEY ||= 'local-development-only';
const {html, card} = await import('../../server/public-run.mjs');
const manifest = JSON.parse(readFileSync(new URL('./code_route_multi_project_manifest.json', import.meta.url), 'utf8'));
// Build via Python validation path to keep the fixture identical to export bytes.
import {execFileSync} from 'node:child_process';
const code_route = JSON.parse(execFileSync('python3', ['-c',
  'import json,sys; from agentgrinder.code_route import from_manifest; print(json.dumps(from_manifest(json.load(sys.stdin))))'],
  {input: JSON.stringify(manifest), encoding: 'utf8'}));

const run = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Multi-project night',
  visibility: 'public',
  profiles: {handle: 'oscar'},
  harness: 'Cursor + Claude CLI + Codex',
  commits: 1,
  files_touched: 10,
  code_route,
};

const page = html(run);
assert.ok(page.includes('Code Route'), 'page missing Code Route');
assert.ok(page.includes('zup') && page.includes('agentgrinder-public') && page.includes('mountain-of-helicon'));
assert.ok(page.includes('measured') && page.includes('declared'));
assert.ok(page.includes('cursor') && page.includes('claude-cli') && page.includes('codex'));
assert.ok(page.includes('absent') && page.includes('grok-bot'));
assert.ok(page.includes('densest stretch'));
assert.ok(page.includes('handoffs carried the work to mountain-of-helicon'));
// The builder's name is the profile link, at the clean address (the "Open builder profile"
// button and /?u= left with the share page redesign c7a0001 and clean links b401e46).
assert.ok(page.includes('<div class="share-name"><a href="/oscar">oscar</a></div>'), 'page missing the builder profile link');
assert.ok(!page.includes('/?u='), 'page still links a query-string profile');
assert.equal(page.match(/<meta property="og:description" content="([^"]*)">/)[1], 'agentgrinder-public held the densest stretch (3 of 7 stops).');
// A journey across projects, not a token total (5036a42). This run recorded no tokens: the face
// of the page never mentions them, and the collapsed details say they are absent, with no number.
const face = page.slice(page.indexOf('<body'), page.indexOf('<details class="share-extra">'));
// Since the share page redesign (c7a0001) the route sits in "Recorded details and sources".
const extra = page.slice(page.indexOf('<details class="share-extra">'));
assert.ok(page.includes('<details class="share-extra">') && extra.includes('<section class="code-route"') && extra.includes('<h2>Code Route</h2>'), 'Code Route section missing from recorded details');
assert.equal((extra.match(/<details class="code-route-point"/g) || []).length, 7, 'every checkpoint is inspectable');
assert.ok(!/token/i.test(face), 'the face of the page mentions tokens');
assert.ok(!/token/i.test(page.slice(0, page.indexOf('<style'))), 'the share tags mention tokens');
assert.ok(page.includes('<p class="post-token-note">This capture does not include tokens</p>'));
assert.ok(!/\d[\d,.]*\s*[kKmM]?\s*(?:recorded\s+)?tokens?\b/i.test(page.replace(/<style[\s\S]*?<\/style>/g, '')), 'page prints a token figure nobody recorded');

const og = card(run);
assert.equal(og.type, 'div');
const dump = JSON.stringify(og);
assert.ok(page.includes('code-route-projects'), 'page missing project list');
assert.ok(dump.includes('zup') && dump.includes('agentgrinder-public') && dump.includes('mountain-of-helicon'), 'OG card missing full project names');
assert.ok(dump.includes('1 · zup') || dump.includes('1 ·'), 'OG card missing numbered lanes');
assert.ok(dump.includes('densest stretch'), 'OG card missing route insight');
assert.ok(!dump.includes('"ACTIVITY"'), 'OG card still headlines generic activity totals');
assert.ok(!dump.includes('"type":"text"'), 'OG SVG text nodes break Satori');
const {ImageResponse} = await import('@vercel/og');
const png = Buffer.from(await new ImageResponse(og,{width:1200,height:630}).arrayBuffer());
assert.equal(png.subarray(1,4).toString(),'PNG');
console.log('PASS public Code Route page and share image use the same route data');
