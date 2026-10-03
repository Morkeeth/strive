import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';
for(const origin of ['https://striverun.app','https://strive-preview.example.test','http://localhost:8000']){
 execFileSync(process.execPath,['scripts/build-site.mjs'],{env:{...process.env,STRAVA_ORIGIN:origin},stdio:'pipe'});
 const guide=readFileSync('dist/agents.md','utf8'),llms=readFileSync('dist/llms.txt','utf8'),html=readFileSync('dist/index.html','utf8');
 assert.ok(guide.includes(origin+'/capture/'));assert.ok(guide.includes("--push-url '"+origin+"'"));assert.ok(guide.includes(origin+'/api/agent/runs'));
 assert.ok(html.includes('--push --push-url '+origin));assert.ok(html.includes('--install --site '+origin));
 assert.ok(llms.includes(origin+'/agents.md'));assert.ok(html.includes('rel="canonical" href="'+origin+'/"'));
 assert.ok(!guide.includes('agentic-strava.vercel.app'));
}
console.log('PASS: actual generated canonical, preview and local instructions preserve the explicit build origin');
