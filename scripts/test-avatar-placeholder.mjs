import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {face}=require('../site/feed-card.js');
const person={profiles:{name:'Oscar Morkeeth',github_handle:'Morkeeth'}};
const html=face(person,56);

assert.match(html, /class="fc-face fc-mono"/);
assert.match(html, /class="fc-face-initial">O<\/span>/);
assert.match(html, /github\.com\/Morkeeth\.png\?size=112/);
assert.match(html, /onload="this\.previousElementSibling\.remove\(\)"/);
assert.match(html, /onerror="this\.remove\(\)"/);
assert.doesNotMatch(face({visibility:'anonymous',profiles:person.profiles}), /github\.com/);

console.log('Avatar has a visible initial until its photo loads, and retains it if loading fails.');
