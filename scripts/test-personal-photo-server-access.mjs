import assert from 'node:assert/strict';
import {runPhotos} from '../server/run-photos.mjs';

const run='599095f1-3b49-4c0e-b50c-13afd4ae369e';
const cover='c76e8a26-76dd-487c-8585-f56f25cf6c74';
const unchosen='22222222-2222-4222-8222-222222222222';
const resultPhoto='33333333-3333-4333-8333-333333333333';
const owner='b2c14bf7-6f7b-4c27-a4f9-e397e36a620a';
const another='11111111-1111-4111-8111-111111111111';
const config={SB_URL:'https://db.test',SB_KEY:'public-test',STORAGE_KEY:'storage-test'};
const requests=[];
const all=[
 {id:cover,run_id:run,width:800,role:'personal',is_cover:true},
 {id:unchosen,run_id:run,width:800,role:'personal',is_cover:false},
 {id:resultPhoto,run_id:run,width:800,role:'result',is_cover:false}
];
const fetcher=async(url,options)=>{
 requests.push(url);
 if(url.includes('rpc/grinder_profile_id'))return Response.json(options.headers.Authorization==='Bearer another-test'?another:owner);
 if(url.includes('runs?select=id'))return Response.json(!url.includes('profile_id=eq.')||url.includes('profile_id=eq.'+owner)?[{id:run}]:[]);
 if(url.includes('run_photos?')){
  const id=new URL(url).searchParams.get('id')?.replace(/^eq\./,'')||null;
  return Response.json(id?all.filter(p=>p.id===id):all);
 }
 if(url.includes('/storage/v1/object/'))return new Response(Buffer.from('image bytes'),{status:200});
 throw new Error('Unexpected request: '+url);
};
const call=(query,who)=>runPhotos({method:'GET',headers:who?{authorization:'Bearer '+who+'-test'}:{},query},config,fetcher);

for(const who of [null,'another']){
 const list=await call({run_id:run},who);
 assert.equal(list.status,200);
 assert.deepEqual(list.body.photos.map(p=>p.id),[cover,resultPhoto],'readers see chosen cover and result, not unchosen personal image');
 const before=requests.length;
 assert.equal((await call({run_id:run,id:unchosen},who)).status,404,'unchosen personal image has no reader direct URL');
 assert.equal(requests.slice(before).some(url=>url.includes('/storage/v1/object/')),false,'denial precedes image-byte read');
 assert.equal((await call({run_id:run,id:cover},who)).status,200,'author-chosen public cover remains accessible');
}
const ownerList=await call({run_id:run},'owner');
assert.deepEqual(ownerList.body.photos.map(p=>p.id),[cover,unchosen,resultPhoto],'owner retains every saved record');
assert.equal((await call({run_id:run,id:unchosen},'owner')).status,200,'owner can manage unchosen personal image');
assert.equal((await call({run_id:run,id:resultPhoto})).status,200,'result image remains public');

console.log('PASS: only chosen personal cover is public; unchosen personal photos remain owner-only without changing saved records');
const {default:sharp}=await import('sharp');const jpeg=await sharp({create:{width:800,height:400,channels:3,background:'#0047ff'}}).jpeg().toBuffer();
const tiny=await runPhotos({method:'GET',headers:{},query:{run_id:run,id:resultPhoto,w:'64'}},config,async(url,opts)=>url.includes('/storage/v1/object/')?new Response(jpeg):fetcher(url,opts));
assert.equal(tiny.status,200);assert.equal((await sharp(tiny.body).metadata()).width,64);assert.match(tiny.headers['Cache-Control'],/private/);
assert.equal((await call({run_id:run,id:unchosen,w:'64'})).status,404,'tiny preview cannot expose unchosen personal photos');
console.log('PASS 64px blur-up variant is truly sized and retains the same personal-photo authorization.');
