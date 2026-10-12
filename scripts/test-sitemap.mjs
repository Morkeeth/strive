import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler from '../api/sitemap.js';

// /sitemap.xml lists public runs and their builders only; robots.txt points at it.
const runs=[
 {id:'90a16040-8ad5-4096-978c-8b1f78f3dd2f',title:'TEST DATA R&D <run>',created_at:'2026-10-11T09:00:00Z',visibility:'public',profiles:{handle:'testbuilder'}},
 {id:'7b44e8ca-0000-4000-8000-000000000001',title:'TEST DATA older run',created_at:'2026-10-02T09:00:00Z',visibility:'public',profiles:{github_handle:'TestBuilder'}},
 {id:'11111111-1111-1111-1111-111111111111',title:'Secret',created_at:'2026-10-11T09:00:00Z',visibility:'private',profiles:{handle:'someoneelse'}},
 {id:'not-a-uuid',title:'Broken',created_at:'2026-10-11T09:00:00Z',visibility:'public',profiles:{handle:'broken'}},
];
let query=null,failing=false;
globalThis.fetch=async raw=>{
 query=new URL(raw);
 if(failing)return {ok:false,status:500,json:async()=>({})};
 return {ok:true,status:200,json:async()=>runs};
};
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v},end(b){this.body=b}}}
const res=response();await handler({query:{},headers:{}},res);
assert.equal(res.statusCode,200);
assert.equal(res.headers['content-type'],'application/xml; charset=utf-8');
assert.equal(query.searchParams.get('visibility'),'eq.public','only public rows are requested');
assert.doesNotMatch(query.searchParams.get('select'),/auth_uid|caption/);
const locs=[...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.deepEqual(locs,[
 'https://striverun.app/','https://striverun.app/install',
 'https://striverun.app/testbuilder/90a16040-test-data-r-d-run','https://striverun.app/testbuilder',
 'https://striverun.app/testbuilder/7b44e8ca-test-data-older-run',
]);
assert.match(res.body,/<loc>https:\/\/striverun.app\/testbuilder<\/loc><lastmod>2026-10-11<\/lastmod>/,'a builder takes their newest public run date');
assert.doesNotMatch(res.body,/someoneelse|broken|Secret/);
failing=true;const down=response();await handler({query:{},headers:{}},down);
assert.equal(down.statusCode,503);assert.equal(down.headers['cache-control'],'no-store');

const routes=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url))).rewrites.map(r=>r.source);
assert.ok(routes.indexOf('/sitemap.xml')>=0&&routes.indexOf('/sitemap.xml')<routes.indexOf('/:handle/:run')&&routes.indexOf('/sitemap.xml')<routes.indexOf('/:handle'),
 'the sitemap rewrite runs before profile handles catch the path');
assert.match(readFileSync(new URL('../site/robots.txt',import.meta.url),'utf8'),/^Sitemap: __ORIGIN__\/sitemap\.xml$/m);
console.log('PASS: sitemap lists public runs and their builders only; robots.txt and the rewrite point at it');
