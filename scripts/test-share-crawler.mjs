import assert from 'node:assert/strict';
import handler from '../api/share.js';
import legacyHandler from '../api/legacy.js';
import ogHandler from '../api/og.js';

const publicId='90a16040-8ad5-4096-978c-8b1f78f3dd2f';
const privateId='11111111-1111-1111-1111-111111111111';
const profileId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let profileName='Oscar';
const rows={
 [publicId]:{id:publicId,profile_id:profileId,title:'Public title',caption:'Public first line',visibility:'public',profiles:{id:profileId,handle:'morkeeth',display_name:'Oscar'}},
 [privateId]:{id:privateId,title:'Secret title',caption:'Secret sentence',visibility:'private',profiles:{handle:'morkeeth'}}
};
globalThis.fetch=async raw=>{
 const url=new URL(raw),select=url.searchParams.get('select')||'';
 if(url.pathname.endsWith('/profiles'))return {ok:true,json:async()=>[{id:profileId,handle:'morkeeth',display_name:profileName}]};
 if(url.pathname.endsWith('/run_photos')||url.pathname.endsWith('/acks'))return {ok:true,json:async()=>[]};
 if(url.pathname.endsWith('/runs')){
  const idFilter=url.searchParams.get('id')||'';
  const matching=Object.values(rows).filter(row=>row.visibility==='public'&&(idFilter==='eq.'+row.id||(!idFilter&&url.searchParams.get('and')?.includes(row.id.slice(0,8)))||url.searchParams.get('profile_id')==='eq.'+row.profile_id));
  return {ok:true,status:200,json:async()=>select.startsWith('id,visibility')?matching.map(({id,visibility,profiles})=>({id,visibility,profiles})):matching};
 }
 throw Error('Unexpected URL '+url);
};
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},writeHead(code,headers){this.statusCode=code;Object.assign(this.headers,headers);return this},status(code){this.statusCode=code;return this},send(body){this.body=body;return this},end(body){this.body=body;return this}}}
async function crawl(handle,run){
 const responseValue=response();
 await handler({query:{handle,run},headers:{'user-agent':'Twitterbot/1.0'}},responseValue);
 return responseValue;
}
const publicPage=await crawl('morkeeth','90a16040-public-title');
assert.equal(publicPage.statusCode,200);
assert.match(publicPage.body,/<meta property="og:title" content="Public title">/);
assert.match(publicPage.body,/<meta property="og:description" content="Public first line">/);
const privatePage=await crawl('morkeeth','11111111-secret-title');
const missingPage=await crawl('morkeeth','aaaaaaaa-missing-run');
assert.equal(privatePage.statusCode,404);
assert.equal(missingPage.statusCode,404);
assert.equal(privatePage.body,missingPage.body);
assert.doesNotMatch(privatePage.body,/Secret title|Secret sentence/);
const profilePage=await crawl('morkeeth');
assert.equal(profilePage.statusCode,200);
assert.match(profilePage.body,/<meta property="og:title" content="Oscar · STRIVE">/);
assert.match(profilePage.body,/<h2>Activities<\/h2>/);
assert.match(profilePage.body,/Public title/);
profileName="Oscar O'Connor";
const apostrophe=await crawl('morkeeth');
assert.match(apostrophe.body,/Oscar O&#39;Connor/);
profileName='Oscar';
const uppercase=await crawl('MORKEETH','90A16040-PUBLIC-TITLE');
assert.equal(uppercase.statusCode,301);
assert.equal(uppercase.headers.Location,'/morkeeth/90a16040-public-title');
const profileUpper=await crawl('MORKEETH');
assert.equal(profileUpper.statusCode,301);
assert.equal(profileUpper.headers.Location,'/morkeeth');
const oldRun=response();await legacyHandler({query:{run:publicId}},oldRun);
assert.equal(oldRun.statusCode,301);
assert.equal(oldRun.headers.Location,'/morkeeth/90a16040-public-title');
const oldProfile=response();await legacyHandler({query:{u:'morkeeth'}},oldProfile);
assert.equal(oldProfile.statusCode,301);
assert.equal(oldProfile.headers.Location,'/morkeeth');
rows[publicId].visibility='private';
const oldPrivate=response();await legacyHandler({query:{run:publicId}},oldPrivate);
assert.equal(oldPrivate.statusCode,307);
assert.match(oldPrivate.headers.Location,/legacy=1/);
const hidden=response();await ogHandler({query:{run:publicId}},hidden);
const absent=response();await ogHandler({query:{run:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}},absent);
assert.equal(hidden.headers['Cache-Control'],'private, no-store, max-age=0');
assert.equal(hidden.statusCode,200);
assert.deepEqual(hidden.body,absent.body);
console.log('PASS: crawler public run and profile; private and missing runs identical');
