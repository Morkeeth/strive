import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('site/index.html','utf8');
const code=source.slice(source.indexOf('async function ackData(runs){'),source.indexOf('function curve('));
const w=new JSDOM('',{runScripts:'outside-only'}).window;w.eval(readFileSync('site/feed-card.js','utf8'));
async function read(response,me=null){const query={select(){return this},eq(){return this},in(){return response instanceof Error?Promise.reject(response):Promise.resolve(response)}};return new Function('sb','ME',code+';return ackData([{id:"run"}]);')({from:()=>query},me);}
const empty=await read({data:[],error:null});assert.equal(empty.countsKnown,true);assert.equal(empty.counts.run,0);
const counted=await read({data:[{run_id:'run'},{run_id:'run'}],error:null});assert.equal(counted.counts.run,2);
for(const failure of [{data:null,error:{message:'read failed'}},new Error('network'),{data:null,error:null}]){
 const result=await read(failure);assert.equal(result.countsKnown,false);assert.equal(result.counts.run,undefined);
 const html=w.GrinderFeed.actions({id:'run',to:'owner',count:result.countsKnown?result.counts.run:null});assert.match(html,/Count unavailable/);assert.doesNotMatch(html,/class="num">0/);
}
const zero=w.GrinderFeed.actions({id:'run',to:'owner',count:0});assert.match(zero,/class="num">0/);assert.doesNotMatch(zero,/unavailable/);
const listCode=source.slice(source.indexOf('function ackListHtml(rows){'),source.indexOf('async function fetchAckList'));
const list=new Function(listCode+';return ackListHtml;')();assert.match(list(null),/could not load/);assert.match(list([]),/No XUDOS yet/);
assert.match(source,/acksR=profileAcks.countsKnown===false\?null:/,'profile sum requires a successful count read');
assert.match(source,/acksR===null\?'Unavailable':acksR/);
console.log('PASS: failed or thrown XUDOS reads stay unavailable; successful empty reads remain zero in cards, profile totals and full-run list.');
