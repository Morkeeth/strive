import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {face}=require('../site/feed-card.js');
const {card,readAvatar}=await import('../server/public-run.mjs');
const person={profiles:{name:'Oscar Morkeeth',github_handle:'Morkeeth',avatar_url:'https://example.test/oscar.jpg'}};
const html=face(person,56);

assert.match(html, /class="fc-face fc-brand"/);
assert.match(html, /<svg viewBox="0 0 64 64"/);
assert.match(html, /https:\/\/github\.com\/Morkeeth\.png\?size=160/);
assert.match(html, /onerror="this\.remove\(\)"/);
const legacy=face({profiles:{name:'Legacy',github_handle:'SomeoneElse'}},56);
assert.match(legacy, /github\.com\/SomeoneElse\.png/);
const noProvider=face({profiles:{name:'No provider',handle:'chosen'}},56);
assert.match(noProvider, /class="fc-face fc-brand"/);
assert.doesNotMatch(noProvider, /<img|>N<\/span>/);
assert.doesNotMatch(face({visibility:'anonymous',profiles:person.profiles}), /github\.com|<img/);
const share=card({visibility:'public',title:'Legacy run',profiles:{display_name:'Legacy',github_handle:'SomeoneElse'}});
const elements=[];
const visit=node=>{if(!node||typeof node!=='object')return;elements.push(node);for(const child of [].concat(node.props?.children||[]))visit(child)};
visit(share);
assert.ok(elements.some(node=>node.type==='svg'&&node.props?.viewBox==='0 0 64 64'),'share image uses the STRIVE mark');
assert.ok(!elements.some(node=>node.type==='div'&&node.props?.children==='L'),'share image never shows an author initial');
const png=Buffer.from([137,80,78,71,13,10,26,10]);
let called=0;
const provider=await readAvatar({visibility:'public',profiles:{github_handle:'SomeoneElse'}},async url=>{
  called++;
  assert.match(url,/github\.com\/SomeoneElse\.png/);
  return {ok:true,url:'https://avatars.githubusercontent.com/u/42?v=4',headers:new Map([['content-type','image/png'],['content-length',String(png.length)]]),arrayBuffer:async()=>png};
});
assert.equal(provider,`data:image/png;base64,${png.toString('base64')}`);
assert.equal(called,1);
assert.equal(await readAvatar({visibility:'private',profiles:{github_handle:'SomeoneElse'}},async()=>{throw Error('private read')}),null);
assert.equal(await readAvatar({visibility:'public',profiles:{avatar_url:'https://example.test/unknown.png'}},async()=>{throw Error('untrusted host')}),null);
const photo=card({visibility:'public',title:'Legacy run',profiles:{display_name:'Legacy'}},{avatar:provider});
const photoElements=[];
const collect=node=>{if(!node||typeof node!=='object')return;photoElements.push(node);for(const child of [].concat(node.props?.children||[]))collect(child)};
collect(photo);
assert.ok(photoElements.some(node=>node.type==='img'&&node.props?.src===provider));

console.log('Avatar uses verified GitHub identity and a STRIVE mark when no image is available.');
