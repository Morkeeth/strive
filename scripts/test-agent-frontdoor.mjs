import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
execFileSync(process.execPath,['scripts/build-site.mjs'],{stdio:'pipe'});
const html=await readFile('dist/index.html','utf8');
assert.match(html,/<link[^>]+href="\/agents.md"/);
const guide=await readFile('dist/agents.md','utf8');
const manifest=JSON.parse(await readFile('dist/.well-known/agent-grinder.json','utf8'));
assert.equal(manifest.agent_instructions,'/agents.md');
const release=JSON.parse(await readFile('dist/capture/release.json','utf8'));
const bytes=await readFile('dist'+release.package);
assert.equal(createHash('sha256').update(bytes).digest('hex'),release.sha256);
assert.match(release.package,/capture\/[a-f0-9]{64}\.tar\.gz$/);
assert.ok(guide.includes(release.package));
assert.ok(!guide.includes('github.com/Morkeeth/strive'));
assert.match(guide,/explicitly selected/);
assert.match(guide,/does not upload/);
for(const path of ['/capture/grok/SKILL.md','/capture/grok/scripts/preview.py'])assert.ok((await readFile('dist'+path)).length);
assert.match(html,/role="menuitem"[^>]*href="\/\?feedback"|href="\/\?feedback"[^>]*role="menuitem"/);
console.log('Front door, same-release archive hash and Grok kit pass');

// Cold HTTP reader: discover the contract and fetch every reusable kit component.
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;res.end(await readFile('dist'+(path==='/'?'/index.html':path)));}catch{res.writeHead(404);res.end('Missing asset');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/', '/agents.md','/llms.txt','/.well-known/agent-grinder.json','/capture/release.json',release.package,'/capture/grok/SKILL.md','/capture/grok/scripts/preview.py','/capture/grok/scripts/upload.py','/capture/grok/scripts/test_contract.py','/capture/grok/scripts/smoke_test.py','/capture/grok/samples/sample_grokbot_bot_activity.jsonl']) {
  const response=await fetch(base+path);assert.equal(response.status,200,path);assert.ok((await response.arrayBuffer()).byteLength,path);
 }
 const response=await fetch(base+release.package);
 assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),release.sha256);
 console.log('Cold HTTP root, instructions, complete kit and hashed package pass');
} finally {await new Promise(resolve=>server.close(resolve));}
