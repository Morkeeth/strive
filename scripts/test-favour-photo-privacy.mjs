import assert from 'node:assert/strict';
import {runPhotos} from '../server/run-photos.mjs';

const run='599095f1-3b49-4c0e-b50c-13afd4ae369e';
const photo='c76e8a26-76dd-487c-8585-f56f25cf6c74';
const owner='b2c14bf7-6f7b-4c27-a4f9-e397e36a620a';
const other='11111111-1111-4111-8111-111111111111';
const config={SB_URL:'https://db.test',SB_KEY:'public-test',STORAGE_KEY:'storage-test'};
const requests=[];
const fetcher=async(url,options)=>{
 requests.push(url);
 if(url.includes('rpc/grinder_profile_id'))return Response.json(options.headers.Authorization==='Bearer other-test'?other:owner);
 if(url.includes('runs?select=id'))return Response.json(!url.includes('profile_id=eq.')||url.includes('profile_id=eq.'+owner)?[{id:run}]:[]);
 if(url.includes('run_photos?')){
  const id=new URL(url).searchParams.get('id')?.replace(/^eq\./,'')||null;
  const rows=[{id:photo,run_id:run,width:800,role:'personal',is_cover:true},{id:other,run_id:run,width:800,role:'result',is_cover:false}];
  return Response.json(id?rows.filter(p=>p.id===id):rows);
 }
 if(url.includes('/storage/v1/object/'))return new Response(Buffer.from('image bytes'),{status:200});
 throw new Error('Unexpected request: '+url);
};
const call=(query,who)=>runPhotos({method:'GET',headers:who?{authorization:'Bearer '+who+'-test'}:{},query},config,fetcher);

const publicList=await call({run_id:run});
assert.equal(publicList.status,200);
assert.deepEqual(publicList.body.photos.map(p=>p.id),[other],'public list omits the old personal cover');
const direct=await call({run_id:run,id:photo});
assert.equal(direct.status,404,'an old direct image URL is no longer public');
assert.equal(requests.some(url=>url.includes('/storage/v1/object/')),false,'denial occurs before image bytes are read');

const otherList=await call({run_id:run},'other');
assert.deepEqual(otherList.body.photos.map(p=>p.id),[other],'another signed-in user sees the same public list');
assert.equal((await call({run_id:run,id:photo},'other')).status,404,'another signed-in user cannot use the old direct URL');
const ownerList=await call({run_id:run},'owner');
assert.deepEqual(ownerList.body.photos.map(p=>p.id),[photo,other],'owner retains both saved records');
const ownerImage=await call({run_id:run,id:photo},'owner');
assert.equal(ownerImage.status,200,'owner can still view the old photo');
assert.equal(ownerImage.body.toString(),'image bytes');
const publicResult=await call({run_id:run,id:other});
assert.equal(publicResult.status,200,'project result images keep their normal access');

console.log('PASS: old FAVOUR personal cover is owner-only on list and direct reads; saved record and other images remain');
