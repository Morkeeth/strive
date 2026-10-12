import assert from 'node:assert/strict';
import {html,neutralHtml} from '../server/public-run.mjs';

// A stranger on a shared run page gets one way to make their own card; the page stays script-free.
const run={id:'90a16040-8ad5-4096-978c-8b1f78f3dd2f',title:'TEST DATA public run',caption:'TEST DATA caption',visibility:'public',
 harness:'Codex',profiles:{handle:'testbuilder',display_name:'TEST DATA Builder'}};
const page=html(run,{kudos:0,photos:[],moreRuns:[]});
const ctas=page.match(/<aside class="share-make"[\s\S]*?<\/aside>/g)||[];
assert.equal(ctas.length,1);
assert.match(ctas[0],/<h2 id="share-make-title">Make a card like this<\/h2>/);
assert.match(ctas[0],/<a class="open" href="\/\?post">Add your run<\/a>/);
assert.match(ctas[0],/stays on your machine until you deliberately save it/);
assert.ok(page.indexOf('class="share-make"')>page.indexOf('class="share-main"'),'the CTA follows the run, never leads it');
assert.doesNotMatch(page,/<script/i,'the public share page stays script-free');
assert.doesNotMatch(neutralHtml(run.id),/<aside class="share-make"/,'a private or missing run page keeps its own single way in');
console.log('PASS: shared run pages end with one "Make a card like this" link to Add run, and stay script-free');
