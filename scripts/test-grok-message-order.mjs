import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const box={window:{},console};vm.createContext(box);
for(const file of ['run-contract.js','sharing.js'])vm.runInContext(readFileSync('site/'+file,'utf8'),box);
const run={harness:'Grok Bot',ridge_basis:'turn-order',trace_basis:'timestamps unavailable',ridge:Array(40).fill(1),worker_bins:Array(40).fill(0)};
assert.match(box.GrinderContract.ridge(run),/Activity along message order/);
assert.equal(box.window.GrinderSharing.traceSeries(run).label,'Tool calls over message order');
for(const other of [{...run,harness:'Claude Code'},{...run,trace_basis:'elapsed'}]){
 assert.match(box.GrinderContract.ridge(other),/Activity along turn order/);
 assert.equal(box.window.GrinderSharing.traceSeries(other).label,'Tool calls over turn order');
}
assert.equal(box.window.GrinderSharing.traceSeries({...run,ridge_basis:'wall-time'}).label,'Tool calls over wall time');
console.log('Native Grok message-order labels preserve other trace bases');
