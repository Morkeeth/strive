import assert from 'node:assert/strict';
import handler from '../api/share.js';

const publicId='90a16040-8ad5-4096-978c-8b1f78f3dd2f';
const privateId='11111111-1111-1111-1111-111111111111';
const rows={
 [publicId]:{id:publicId,title:'Public title',caption:'Public first line',visibility:'public',profiles:{handle:'morkeeth',display_name:'Oscar'}},
 [privateId]:{id:privateId,title:'Secret title',caption:'Secret sentence',visibility:'private',profiles:{handle:'morkeeth'}}
};
globalThis.fetch=async raw=>{
 const url=new URL(raw),select=url.searchParams.get('select')||'';
 if(url.pathname.endsWith('/profiles'))return {ok:true,json:async()=>[{id:'p1',handle:'morkeeth',display_name:'Oscar'}]};
 if(url.pathname.endsWith('/run_photos')||url.pathname.endsWith('/acks'))return {ok:true,json:async()=>[]};
 if(url.pathname.endsWith('/runs')){
  const idFilter=url.searchParams.get('id')||'';
  const matching=Object.values(rows).filter(row=>row.visibility==='public'&&(idFilter==='eq.'+row.id||(!idFilter&&url.searchParams.get('and')?.includes(row.id.slice(0,8)))));
  return {ok:true,status:200,json:async()=>select.startsWith('id,visibility')?matching.map(({id,visibility,profiles})=>({id,visibility,profiles})):matching};
 }
 throw Error('Unexpected URL '+url);
};
async function crawl(handle,run){
 const response={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},send(body){this.body=body;return this},end(body){this.body=body;return this}};
 await handler({query:{handle,run},headers:{'user-agent':'Twitterbot/1.0'}},response);
 return response;
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
console.log('PASS: crawler public run and profile; private and missing runs identical');
