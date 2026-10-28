import assert from 'node:assert/strict';
import {runShareAssets} from '../server/share-assets.mjs';
const run={id:'47e8f731-a4a3-44ce-add2-63fa6e815af5',visibility:'public'};
let releaseAvatar,releasePhoto;const calls=[];
const deps={readAvatar:r=>{calls.push(['avatar',r.id]);return new Promise(resolve=>releaseAvatar=resolve)},readPublicPhotos:async r=>{calls.push(['metadata',r.id]);return [{id:'image',role:'screenshot'}]},photoSlots:()=>[{width:600,height:400}],photoData:async(r,p,slot)=>{calls.push(['bytes',r.id,p.id,slot.width]);return new Promise(resolve=>releasePhoto=resolve)}};
const pending=runShareAssets(run,'link',deps);
await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(calls.map(c=>c[0]),['avatar','metadata','bytes'],'photo bytes begin while the avatar is unresolved');
releasePhoto('data:image/jpeg;base64,TEST');releaseAvatar(null);
assert.deepEqual(await pending,{avatar:null,photoUrls:['data:image/jpeg;base64,TEST']});
for(const visibility of ['private','link','close_friends',undefined]){
 const before=calls.length;assert.deepEqual(await runShareAssets({...run,visibility},'link',deps),{avatar:null,photoUrls:[]});assert.equal(calls.length,before,'nonpublic rows cannot start media reads');
}
let selections;
const photos=[{id:'personal',role:'personal'},...['a','b','c','d'].map(id=>({id,role:'screenshot'}))];
const chosen=await runShareAssets(run,'square',{readAvatar:async()=>null,readPublicPhotos:async()=>photos,photoSlots:(_r,_f,n)=>{selections=n;return Array(n).fill({})},photoData:async(_r,p)=>p.id==='b'?null:p.id});
assert.equal(selections,3);assert.deepEqual(chosen.photoUrls,['a','c'],'same screenshot priority, three-image bound and missing-image omission');
console.log('PASS authorized share assets: independent reads overlap; private rows start no reads; image selection and omission preserved.');
