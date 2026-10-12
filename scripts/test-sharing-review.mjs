import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('site/import-row.js','utf8'),ctx);
const run={schema_version:1,measurement_revision:'a'.repeat(64),tool_calls:385,shell_calls:28,files_touched:15,commits:0,model:'TEST MODEL',duration_s:600,wall_time_s:600,ridge:Array(50).fill(1),worker_bins:Array(50).fill(0),commit_bins:[1],ridge_basis:'wall-time',ridge_wall_seconds:600,ridge_tool_calls:50,capture_metadata:{basis:'cursor-model-info',models:['TEST MODEL']}};
const opts={profileId:'owner',title:'TEST run',project:'test',metricChoices:{tool_calls:false,files_touched:false,commits:false,model:false,duration:false}};
const row=ctx.StriveImportRow.build(run,opts);
for(const key of ['tool_calls','shell_calls','files_touched','commits','model','duration_s','wall_time_s','ridge','worker_bins','ridge_tool_calls','ridge_wall_seconds','commit_bins'])assert.equal(Object.hasOwn(row,key),false,'unchecked must not be saved: '+key);
assert.ok(!JSON.stringify(row.capture_metadata).includes('TEST MODEL'));
assert.equal(row.visibility,'private');assert.equal(run.tool_calls,385,'original capture remains unchanged');
console.log('PASS omitted optional metrics and their dependent fields are absent from the actual saved row');
