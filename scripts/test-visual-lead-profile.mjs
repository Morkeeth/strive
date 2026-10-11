import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import Context from '../site/run-context.js';
import Estimates from '../site/run-estimates.js';
import {full} from '../tests/fixtures/estimate-capture.mjs';
// Real ODAWG native-session shape (01a12828): 40.472 seconds crossing two clock minutes.
// Price/usage fixture stays explicitly synthetic; this regression tests time, not its bill.
const capture=structuredClone(full);capture.estimates.source.started_at='2026-10-10T23:31:30.741Z';capture.estimates.source.ended_at='2026-10-10T23:32:11.213Z';capture.estimates.tool_activity.origin_utc='2026-10-10T23:31:00Z';capture.estimates.tool_activity.occupied_bins=[0,1];
const run={capture_metadata:capture,duration_s:40.472};
assert.equal(Context.headlineFacts(run)[2][0],'Elapsed');assert.equal(Context.headlineFacts(run)[2][1],'40 sec');assert.equal(Estimates.facts(capture).rows[1][1],'2 occupied clock minutes');assert.match(Context.measurementDetails(run),/partial boundary minutes/);assert.doesNotMatch(Context.headlineHtml(run),/2 min|Tool-active/);
assert.doesNotMatch(Context.profileFacts([run]),/Dollars|Active time|No bill/);
const w=new JSDOM('<div id="slot"></div>',{url:'https://strive.test',runScripts:'outside-only'}).window;w.eval(fs.readFileSync('site/social.js','utf8'));let viewer=null,signIns=0;const writes=[];
const client={from(table){return {select(){return this},eq(){return this},insert(value){writes.push([table,'insert',value]);return this},delete(){writes.push([table,'delete']);return this},then(resolve){resolve({data:[]})}}}};
const ui=w.GrinderSocial({client,me:()=>viewer,status(){},signInGitHub(){signIns++}}),slot=w.document.querySelector('#slot');slot.dataset.label='Follow';
await ui.followControl({id:'owner'},slot);assert.equal(slot.textContent,'Follow');slot.querySelector('button').click();assert.equal(signIns,1);assert.equal(writes.length,0);
viewer={id:'other'};slot.replaceChildren();await ui.followControl({id:'owner'},slot);assert.equal(slot.querySelectorAll(':scope > button').length,1);const menu=slot.querySelector('details');assert.equal(menu.open,false);assert.equal(menu.querySelector('summary').getAttribute('aria-label'),'More profile actions');assert.equal(menu.querySelector('button').textContent,'Block');await menu.querySelector('button').onclick();assert.deepEqual(JSON.parse(JSON.stringify(writes)),[['grinder_blocks','insert',{blocker_id:'other',blocked_id:'owner'}]]);
viewer={id:'owner'};await ui.followControl({id:'owner'},slot);assert.equal(slot.children.length,0);
const page=fs.readFileSync('site/index.html','utf8');assert.doesNotMatch(page,/name="run-photo-layout"|run-lead-choice/);assert.match(page,/profile-follow/);
console.log('PASS real 40.472s/two occupied bins shape: elapsed headline, explicit clock-bin disclosure; no fake profile bill/time; real Follow/Block controls signed out/other/owner; old layout modes removed.');
