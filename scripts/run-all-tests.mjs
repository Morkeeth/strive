// Runs every offline scripts/test-*.mjs unchanged, four at a time. A failure fails the run unless
// docs/testing/node-failure-triage-20261012.jsonl inventories it. An inventoried script that passes also fails
// the run until its row is deleted, so the inventory always equals the set of real failures.
import {readdirSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const INVENTORY='docs/testing/node-failure-triage-20261012.jsonl';
const BY_HAND=new Map([
 ['scripts/test-compact-photo-parity.mjs','reads photos from production striverun.app'],
 ['scripts/test-link-image-parity.mjs','compares PNGs saved from a browser review; pass their folder'],
]);
const pinned=new Set(readFileSync(root+INVENTORY,'utf8').split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line).test));
const tests=readdirSync(root+'scripts').filter(name=>/^test-.*\.mjs$/.test(name)).map(name=>'scripts/'+name).filter(name=>!BY_HAND.has(name)).sort();

function run(name){
 return new Promise(resolve=>{
  const started=Date.now(),child=spawn(process.execPath,[name],{cwd:root,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const timer=setTimeout(()=>child.kill('SIGKILL'),300_000);
  child.on('close',code=>{clearTimeout(timer);resolve({name,ok:code===0,seconds:((Date.now()-started)/1000).toFixed(1),output})});
 });
}
const results=[];let next=0;
await Promise.all(Array.from({length:4},async()=>{while(next<tests.length)results.push(await run(tests[next++]))}));
results.sort((a,b)=>a.name.localeCompare(b.name));
const unexpected=results.filter(r=>!r.ok&&!pinned.has(r.name));
const repaired=results.filter(r=>r.ok&&pinned.has(r.name));
for(const r of results)console.log(`${r.ok?'pass':pinned.has(r.name)?'known':'FAIL'}  ${r.seconds.padStart(5)}s  ${r.name}`);
for(const r of unexpected)console.log(`\n--- ${r.name}\n${r.output.trim().split('\n').slice(-25).join('\n')}`);
if(repaired.length)console.log(`\nInventoried scripts that pass now. Delete their rows from ${INVENTORY}:\n${repaired.map(r=>'  '+r.name).join('\n')}`);
console.log(`\nNot run here:\n${[...BY_HAND].map(([name,why])=>`  ${name}: ${why}`).join('\n')}`);
const count=(n,noun)=>`${n} ${noun}${n===1?'':'s'}`;
console.log(`\n${results.filter(r=>r.ok).length} passed, ${count(results.length-results.filter(r=>r.ok).length-unexpected.length,'inventoried failure')}, ${count(unexpected.length,'failure')} outside ${INVENTORY}`);
process.exit(unexpected.length||repaired.length?1:0);
