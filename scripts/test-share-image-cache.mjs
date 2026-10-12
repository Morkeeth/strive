import assert from 'node:assert/strict';
import ogHandler from '../api/og.js';
import runHandler from '../api/run.js';

// Share images are cached briefly at the CDN; a failed render is never cached.
const runId='90a16040-8ad5-4096-978c-8b1f78f3dd2f';
let failing=false;
globalThis.fetch=async raw=>{
 if(failing)return {ok:false,status:500,clone(){return this},text:async()=>'down',json:async()=>({})};
 const url=new URL(raw);
 if(url.pathname.endsWith('/runs'))return {ok:true,status:200,json:async()=>[]};
 return {ok:true,status:200,json:async()=>[]};
};
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v},end(b){this.body=b}}}
async function call(handler,query){const res=response();await handler({query,headers:{}},res);return res}

for(const [name,handler,query] of [['home image',ogHandler,{}],['run image',ogHandler,{run:runId}],['/r/ image',runHandler,{id:runId,image:'1'}]]){
 const res=await call(handler,query);
 assert.equal(res.statusCode,200,name);
 assert.equal(res.headers['content-type'],'image/png',name);
 assert.ok(Buffer.isBuffer(res.body)&&res.body.length>1000,name+' renders a PNG');
 assert.equal(res.headers['cache-control'],'public, max-age=0, s-maxage=300, stale-while-revalidate=600',name);
}
failing=true;
const broken=await call(ogHandler,{run:runId});
assert.equal(broken.statusCode,503);
assert.match(broken.headers['cache-control'],/no-store/,'a failed render is never cached');
const page=await call(runHandler,{id:runId});
assert.match(page.headers['cache-control'],/no-store/,'share pages stay uncached');
console.log('PASS: share images are CDN-cached for five minutes; failures and HTML pages stay no-store');
