// The sample run's four facts were rendered with no style at all: label and number ran together
// outside the card padding. Keep them a labelled grid inside the card.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const css=await readFile('site/activity.css','utf8'),js=await readFile('site/example.js','utf8');
assert.match(js,/class="run-key-facts"><div><span>/,'example renders labelled facts');
assert.match(css,/\.run-key-facts\{display:grid;grid-template-columns:repeat\(4,/,'facts are a four-column grid');
assert.match(css,/\.run-key-facts span\{display:block/,'label sits above its number');
assert.match(css,/@media\(max-width:700px\)\{\.run-key-facts\{grid-template-columns:repeat\(2,/,'two columns on phones');
console.log('example key facts: styled');
