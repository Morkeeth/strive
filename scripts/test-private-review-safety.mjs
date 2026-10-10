import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {safeReviewUrl} from './private-review-safety.mjs';
import {achievementCard} from './sunday-achievement-card.mjs';
for(const url of ['javascript:alert(1)','data:text/html,<script>','http://example.com','https://user:pass@example.com'])assert.throws(()=>safeReviewUrl(url));
assert.equal(safeReviewUrl('https://example.com/prices'),'https://example.com/prices');
const attack='<img src=x onerror=alert(1)>';
const card={id:'test',project:attack,state:'LOCAL',title:attack,summary:attack,start:'2026-10-09T00:00:00Z',end:'2026-10-09T00:01:00Z',stateNote:attack,imageNote:attack,usage:{total_tokens:1,input_tokens:1,output_tokens:0,cached_input_tokens:0,records:1,basis:attack},tool_active_minutes_proxy:1,models:['test'],commits:[],files:[],source:'test.jsonl',source_lines:[attack],source_sha256:attack,you_typed:null,user_messages:attack,quote_candidate:{text:attack,line:attack,timestamp:'2026-10-09T00:00:00Z'}};
const result=achievementCard(card,0,[]);
assert.ok(!result.includes(attack));assert.ok(result.includes('&lt;img'));
card.model_price_estimate={usd:1,source:'javascript:alert(1)',components:{}};
assert.throws(()=>achievementCard(card,0,[]));
console.log('PASS private review escapes source/quote fields and rejects active or credentialed source URLs');

const repo=fileURLToPath(new URL('../',import.meta.url)),out=mkdtempSync(repo+'.private-review-guard-');
try{assert.throws(()=>execFileSync(process.execPath,[repo+'scripts/build-sunday-review.mjs'],{cwd:tmpdir(),env:{...process.env,STRIVE_PRIVATE_CANDIDATES:'/nonexistent',STRIVE_PRIVATE_REVIEW_DIR:out},stdio:'pipe'}),error=>/Private review must be outside the repository/.test(String(error.stderr)));}finally{rmSync(out,{recursive:true,force:true})}
console.log('PASS private renderer rejects repository output even when invoked from another directory');
