import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {deliverFeedback} from '../server/feedback-notifications.mjs';
const deployment=JSON.parse(readFileSync('vercel.json','utf8'));
assert.deepEqual(deployment.crons.find(c=>c.path==='/api/feedback-notifications'),{path:'/api/feedback-notifications',schedule:'0 4 * * *'});
assert.equal(deployment.functions['api/feedback-notifications.js'].maxDuration,60);
assert.ok(deployment.crons.some(c=>c.path==='/api/photo-cleanup'),'keep existing recovery task');
const config={SB_URL:'https://db.test',SERVICE_KEY:'fixture',WEBHOOK_URL:'https://receiver.test/feedback',WEBHOOK_HOST:'receiver.test',INBOX_URL:'https://supabase.com/dashboard/project/test/editor'};
const row={feedback_id:'11000000-0000-0000-0000-000000000001',lease_token:'22000000-0000-0000-0000-000000000001',category:'bug'};
let sent=0,limits=[],timeouts=[];const originalTimeout=AbortSignal.timeout;AbortSignal.timeout=ms=>{timeouts.push(ms);return originalTimeout(ms)};
const transport=async(url,opts)=>{
 assert.ok(opts.signal instanceof AbortSignal,'every transport must have timeout');
 if(url.endsWith('feedback_notification_claim')){limits.push(JSON.parse(opts.body).p_limit);return {ok:true,json:async()=>Array.from({length:4},()=>row)}}
 if(url===config.WEBHOOK_URL){sent++;return {ok:false}}
 if(url.endsWith('feedback_notification_complete'))return {ok:true,json:async()=>true};
 throw Error('Unexpected transport');
};
assert.deepEqual(await deliverFeedback(config,transport),{delivered:0,retry:4});assert.deepEqual(limits,[4]);assert.equal(sent,4);assert.deepEqual(timeouts,Array(9).fill(5000));AbortSignal.timeout=originalTimeout;
let overflowSent=false;await assert.rejects(deliverFeedback(config,async(url)=>{if(url.endsWith('feedback_notification_claim'))return {ok:true,json:async()=>Array(5).fill(row)};overflowSent=true;throw Error('Unexpected')}),/batch/);assert.equal(overflowSent,false);
// Claim plus each ping and acknowledgement: declared five-second calls leave platform headroom.
assert.ok((1+4*2)*5000 < deployment.functions['api/feedback-notifications.js'].maxDuration*1000);
console.log('Daily recovery targets real authenticated endpoint; batch bounded below platform duration and existing cron retained');
