// PARITY: the browser drop-in reader (site/dropin-parse.js) must give the same numbers as the
// Python readers in agentgrinder/ingest.py for the same file. Fixtures are synthetic and live in
// samples/. `--real N` also compares the N newest real sessions per harness on this machine; those
// files are read locally and never copied anywhere.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Dropin = require('../site/dropin-parse.js');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PY = existsSync(path.join(ROOT, '.venv/bin/python')) ? path.join(ROOT, '.venv/bin/python') : 'python3';

const FIXTURES = [
  ['Claude Code', 'samples/sample_session.jsonl'],
  ['Claude Code', 'samples/dropin/claude-edge.jsonl'],
  ['Codex', 'samples/dropin/codex-edge.jsonl'],
  ['Codex', 'samples/dropin/codex-delegated.jsonl'],
  ['Codex', 'samples/dropin/codex-desktop.jsonl'],
  ['Cursor', 'samples/dropin/cursor-edge.jsonl'],
].map(([h, p]) => [h, path.join(ROOT, p)]);

function python(pairs) {
  const out = [];
  for (let i = 0; i < pairs.length; i += 40) {
    const chunk = pairs.slice(i, i + 40);
    out.push(...JSON.parse(execFileSync(PY, [path.join(ROOT, 'scripts/dropin-python-counts.py'), ...chunk.flat()], { encoding: 'utf8', maxBuffer: 1 << 26 })));
  }
  return out;
}

async function browser(file) {
  // The same streaming path the page uses: a Blob read chunk by chunk.
  const blob = new Blob([readFileSync(file)]);
  try { return await Dropin.parseFile(blob); } catch (e) { return { error: e.code || e.message }; }
}

function compare(harness, file, py, js) {
  const where = `${harness} ${path.basename(file)}`;
  if (py.error) { assert.ok(js.error, `${where}: Python refused (${py.error}) but the browser read ${JSON.stringify(js)}`); return 'refused'; }
  assert.ok(!js.error, `${where}: browser refused (${js.error}) but Python read it`);
  assert.equal(js.harness, harness, `${where}: detected ${js.harness}`);
  for (const k of ['turns_typed', 'tool_calls', 'files_touched', 'commits', 'rhythm', 'route'])
    assert.deepEqual(js[k], py[k], `${where}: ${k} browser ${JSON.stringify(js[k])} python ${JSON.stringify(py[k])}`);
  // The line the card draws. Claude Code: tool calls per bin of moving time, from both readers,
  // so the drop-in card and the local card show one shape for one file.
  if (harness === 'Claude Code') assert.deepEqual(js.line ?? null, py.line ?? null, `${where}: line browser ${JSON.stringify(js.line)} python ${JSON.stringify(py.line)}`);
  if (py.duration_source === 'file' || py.duration_source === 'call-index') assert.equal(js.duration_s, py.duration_s, `${where}: duration_s`);
  else assert.equal(js.duration_s, null, `${where}: browser must not invent the wall time the chat store gave Python`);
  const started = js.started == null ? null : Date.parse(js.started) / 1000;
  if (py.started == null) assert.equal(started, null, `${where}: started`);
  else assert.ok(Math.abs(started - py.started) < 0.001, `${where}: started ${started} vs ${py.started}`);
  return 'same';
}

const results = python(FIXTURES);
for (let i = 0; i < FIXTURES.length; i++) {
  const [h, f] = FIXTURES[i];
  const verdict = compare(h, f, results[i], await browser(f));
  console.log(`${verdict.padEnd(7)} ${h.padEnd(11)} ${path.relative(ROOT, f)}`);
}
// Every fixture must exercise something: prove the edge files are not trivially empty.
const edge = await browser(path.join(ROOT, 'samples/dropin/claude-edge.jsonl'));
assert.deepEqual([edge.turns_typed, edge.tool_calls, edge.files_touched, edge.commits], [3, 8, 2, 2]);
// The route is station indices: the fixture visits a nested folder and comes back, and no
// folder name survives the read.
assert.deepEqual(edge.route, [0, 1, 0]);
assert.ok(!JSON.stringify(edge).includes('SECRET-FOLDER'), 'a folder name must not survive the read');
assert.equal((await browser(path.join(ROOT, 'samples/dropin/not-a-session.jsonl'))).error, 'unknown');
const delegated = await browser(path.join(ROOT, 'samples/dropin/codex-delegated.jsonl'));
assert.equal(delegated.turns_typed,0);
assert.equal(delegated.prompt_provenance.counts['agent-to-agent'],1);
const relayed = await browser(path.join(ROOT, 'samples/dropin/claude-sdk-bb.jsonl'));
assert.equal(relayed.turns_typed,0);
assert.equal(relayed.prompt_provenance.counts.unknown,1);
assert.ok(Number.isFinite(Date.parse(relayed.started)),'unknown-only capture keeps a finite recorded start');
// A Codex desktop rollout keeps the typed turns as user-role messages, beside two injected ones.
const desktop = await browser(path.join(ROOT, 'samples/dropin/codex-desktop.jsonl'));
assert.deepEqual([desktop.turns_typed, desktop.tool_calls, desktop.route], [2, 2, [0, 1]]);

const mixedCodex=Dropin.parseText([
  JSON.stringify({timestamp:'2026-10-20T10:00:00Z',type:'session_meta',payload:{source:'desktop'}}),
  JSON.stringify({timestamp:'2026-10-20T10:00:01Z',type:'event_msg',payload:{type:'user_message',message:'real request'}}),
  JSON.stringify({timestamp:'2026-10-20T10:00:01Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'real request'}]}}),
  JSON.stringify({timestamp:'2026-10-20T10:00:02Z',type:'event_msg',payload:{type:'user_message',message:'# AGENTS.md instructions\n<INSTRUCTIONS>injected</INSTRUCTIONS>'}}),
].join('\n'));
assert.equal(mixedCodex.turns_typed,1);
assert.equal(mixedCodex.prompt_provenance.counts['human-typed'],1);
assert.equal(Object.values(mixedCodex.prompt_provenance.counts).reduce((a,b)=>a+b,0),1);

const scheduledCodex=Dropin.parseText([
  JSON.stringify({timestamp:'2026-10-20T10:00:00Z',type:'session_meta',payload:{source:'cron'}}),
  JSON.stringify({timestamp:'2026-10-20T10:00:01Z',type:'event_msg',payload:{type:'user_message',message:'scheduled task'}}),
].join('\n'));
assert.equal(scheduledCodex.turns_typed,0);
assert.equal(scheduledCodex.prompt_provenance.counts.automation,1);

const realAt = process.argv.indexOf('--real');
if (realAt !== -1) {
  const n = Number(process.argv[realAt + 1] || 20);
  const home = homedir();
  const walk = (dir, test, acc = []) => { if (!existsSync(dir)) return acc; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, test, acc); else if (test(p)) acc.push(p); } return acc; };
  // A file still being written (this very session, for one) changes between the two reads.
  const settled = Date.now() - 10 * 60 * 1000;
  const newest = (files) => files.map(f => [f, statSync(f).mtimeMs]).filter(x => x[1] < settled).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
  const sets = [
    ['Claude Code', newest(walk(path.join(home, '.claude/projects'), p => p.endsWith('.jsonl') && path.dirname(path.dirname(p)) === path.join(home, '.claude/projects')))],
    ['Cursor', newest(walk(path.join(home, '.cursor/projects'), p => p.endsWith('.jsonl') && p.includes('/agent-transcripts/')))],
    ['Codex', newest(walk(path.join(home, '.codex/sessions'), p => /rollout-.*\.jsonl$/.test(p)))],
  ];
  for (const [h, files] of sets) {
    const pairs = files.map(f => [h, f]);
    const py = python(pairs);
    const tally = { same: 0, refused: 0 };
    for (let i = 0; i < files.length; i++) tally[compare(h, files[i], py[i], await browser(files[i]))] += 1;
    console.log(`real ${h}: ${tally.same} same, ${tally.refused} refused by both, of ${files.length} newest files`);
  }
}
console.log('Drop-in parity passed: the browser reader and the Python reader give the same numbers.');
