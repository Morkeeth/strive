import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';
for(const origin of ['https://striverun.app','https://strive-preview.example.test','http://localhost:8000']){
 execFileSync(process.execPath,['scripts/build-site.mjs'],{env:{...process.env,STRAVA_ORIGIN:origin},stdio:'pipe'});
 const guide=readFileSync('dist/agents.md','utf8'),llms=readFileSync('dist/llms.txt','utf8'),html=readFileSync('dist/index.html','utf8');
 assert.ok(guide.includes(origin+'/capture/'));assert.ok(guide.includes("strive sessions --all --open --site '"+origin+"'"));assert.ok(guide.includes(origin+'/api/agent/runs'));
 const command=prefix=>html.split('\n').find(line=>line.trim().startsWith(prefix));
 const capture=new Function(command('const ONE_LINE=')+';return ONE_LINE("cursor");')();
 const picker=new Function(command('const picker=')+';return picker("cursor");')();
 const sync=new Function(command('const SYNC_LINE=')+';return SYNC_LINE("TEST_TOKEN");')();
 assert.ok(capture.endsWith('--push-url '+origin));assert.ok(picker.endsWith('--site '+origin));assert.ok(sync.includes('--install --site '+origin));
 assert.ok(llms.includes(origin+'/agents.md'));assert.ok(html.includes('rel="canonical" href="'+origin+'/"'));
 assert.ok(!guide.includes('agentic-strava.vercel.app'));
}
console.log('PASS: actual generated canonical, preview and local instructions preserve the explicit build origin');
