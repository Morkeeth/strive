import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {face}=require('../site/feed-card.js');
const {card}=await import('../server/public-run.mjs');
const person={profiles:{name:'Oscar Morkeeth',github_handle:'Morkeeth',avatar_url:'https://example.test/oscar.jpg'}};
const html=face(person,56);

assert.match(html, /class="fc-face fc-mono"/);
assert.match(html, /class="fc-face-initial">O<\/span>/);
assert.match(html, /https:\/\/example\.test\/oscar\.jpg/);
assert.match(html, /onload="if\(this\.previousElementSibling\?\.classList\.contains\('fc-face-initial'\)\)this\.previousElementSibling\.remove\(\)"/);
assert.match(html, /onerror="this\.remove\(\)"/);
const legacy=face({profiles:{name:'Legacy',github_handle:'SomeoneElse'}},56);
assert.match(legacy, /class="fc-face fc-mono"[^>]*>L<\/span>/);
assert.doesNotMatch(legacy, /<img|github\.com/);
assert.doesNotMatch(face({visibility:'anonymous',profiles:person.profiles}), /github\.com/);
const share=card({visibility:'public',title:'Legacy run',profiles:{display_name:'Legacy',github_handle:'SomeoneElse'}});
const elements=[];
const visit=node=>{if(!node||typeof node!=='object')return;elements.push(node);for(const child of [].concat(node.props?.children||[]))visit(child)};
visit(share);
assert.ok(elements.some(node=>node.type==='div'&&node.props?.children==='L'),'share image uses the legacy author initial');
assert.ok(!elements.some(node=>node.type==='img'),'share image does not guess an avatar from an old GitHub handle');

console.log('Avatar has a visible initial until its photo loads, and retains it if loading fails.');
