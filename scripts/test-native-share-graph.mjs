import {card} from '../server/public-run.mjs';import assert from 'node:assert/strict';
const run={id:'fixture',title:'Native fixture',visibility:'public',harness:'Grok Bot',ridge:Array(50).fill(1),ridge_basis:'turn-order',trace_basis:'timestamps unavailable',tool_calls:50,profiles:{handle:'fixture'}};
assert.ok(JSON.stringify(card(run)).includes('"type":"polygon"'),'public share image must retain untimed native graph');
assert.ok(JSON.stringify(card({...run,worker_bins:Array(50).fill(2)})).includes('"type":"polygon"'));
assert.ok(!JSON.stringify(card({...run,worker_bins:[-1]})).includes('"type":"polygon"'));
console.log('Public share graph preserves native unknown workers and measured worker shapes');
