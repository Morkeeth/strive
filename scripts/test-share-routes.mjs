import assert from 'node:assert/strict';
import {validHandle,profilePath,runPath,readShortRun,readProfile} from '../server/share-routes.mjs';
import {html,neutralHtml,readPublicPhotos,origin} from '../server/public-run.mjs';

const id='90a16040-8ad5-4096-978c-8b1f78f3dd2f';
const profileId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const run={id,title:'A useful run: before & after',caption:'The first line.\nA second line.',visibility:'public',profiles:{handle:'morkeeth',display_name:'Oscar'},commits:3};
assert.equal(validHandle('api'),false);
assert.equal(validHandle('morkeeth'),true);
assert.equal(profilePath('api'),null);
assert.equal(runPath({...run,profiles:{handle:'api'}}),null);
assert.equal(profilePath('MORKEETH'),'/morkeeth');
assert.equal(runPath(run),'/morkeeth/90a16040-a-useful-run-before-after');
const page=html(run);
assert.match(page,/<meta property="og:title" content="A useful run: before &amp; after">/);
assert.match(page,/<meta property="og:description" content="The first line.">/);
assert.ok(page.includes(`<meta property="og:url" content="${origin}/morkeeth/90a16040-a-useful-run-before-after">`));
assert.ok(page.includes(`<meta property="og:image" content="${origin}/api/og?run=90a16040`));
const neutral=neutralHtml(id);
assert.doesNotMatch(neutral,/A useful run|The first line|morkeeth/);
const fetcher=async url=>{
 const u=new URL(url);
 if(u.pathname.endsWith('/profiles'))return {ok:true,json:async()=>[{id:profileId,handle:'morkeeth',display_name:'Oscar'}]};
 if(u.pathname.endsWith('/run_photos'))return {ok:true,json:async()=>[
  {id:'11111111-1111-1111-1111-111111111111',run_id:id,role:'personal',is_selected:true,personal_public_selected:false},
  {id:'22222222-2222-2222-2222-222222222222',run_id:id,role:'result',is_selected:true}
 ]};
 if(u.searchParams.get('select')?.startsWith('id,visibility'))return {ok:true,json:async()=>[{id,visibility:'public',profiles:{id:profileId,handle:'morkeeth'}}]};
 return {ok:true,status:200,json:async()=>[run]};
};
assert.equal((await readProfile('morkeeth',fetcher)).display_name,'Oscar');
const shadowFetch=async url=>{
 const u=new URL(url);
 if(u.searchParams.has('handle'))return {ok:true,json:async()=>[{id:profileId,handle:'morkeeth'}]};
 if(u.searchParams.has('github_handle'))return {ok:true,json:async()=>[{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',github_handle:'Morkeeth'}]};
 throw Error('Ambiguous alias lookup must stop before run read');
};
assert.equal(await readProfile('morkeeth',shadowFetch),null);
assert.equal(await readShortRun('morkeeth','90a16040',shadowFetch),null);
assert.equal((await readShortRun('morkeeth','90a16040',fetcher)).id,id);
assert.equal(await readShortRun('api','90a16040',fetcher),null);
assert.equal((await readPublicPhotos(run,fetcher)).length,1);
assert.equal((await readPublicPhotos({...run,visibility:'private'},fetcher)).length,0);
console.log('PASS: clean paths, public metadata, private neutrality, and photo selection');
