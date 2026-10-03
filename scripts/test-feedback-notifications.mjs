import assert from 'node:assert/strict';
import {deliverFeedback,webhookConfig} from '../server/feedback-notifications.mjs';
const config={SB_URL:'https://database.test',SERVICE_KEY:'server-only',WEBHOOK_URL:'https://hooks.slack.com/services/test',WEBHOOK_HOST:'hooks.slack.com',WEBHOOK_FORMAT:'slack',INBOX_URL:'https://supabase.com/dashboard/project/test/editor'};
const item={feedback_id:'11000000-0000-0000-0000-000000000001',lease_token:'22000000-0000-0000-0000-000000000001',category:'bug',created_at:'2026-10-03T10:00:00Z'};
for(const url of ['http://hooks.slack.com/test','https://evil.test/test','https://user:password@hooks.slack.com/test','https://hooks.slack.com/test#fragment'])assert.throws(()=>webhookConfig({...config,WEBHOOK_URL:url}));
assert.throws(()=>webhookConfig({...config,WEBHOOK_URL:'https://127.0.0.1/test',WEBHOOK_HOST:'127.0.0.1'}));
let calls=[];let mode='success';
const reply=(data,ok=true)=>({ok,json:async()=>data});
async function transport(url,opts){calls.push({url,opts});
 if(url.includes('feedback_notification_claim'))return reply([item]);
 if(url===config.WEBHOOK_URL){if(mode==='timeout')throw Error('private response body');return reply({},mode!=='refused');}
 if(url.includes('feedback_notification_complete')){if(mode==='ack-fails')return reply({},false);return reply(true);}
 throw Error('Unexpected destination');
}
for(const failure of ['refused','timeout']){calls=[];mode=failure;assert.deepEqual(await deliverFeedback(config,transport),{delivered:0,retry:1});const ack=calls.find(c=>c.url.includes('complete'));assert.equal(JSON.parse(ack.opts.body).p_ok,false);}
calls=[];mode='success';assert.deepEqual(await deliverFeedback(config,transport),{delivered:1,retry:0});
const sent=calls.find(c=>c.url===config.WEBHOOK_URL);assert.equal(sent.opts.redirect,'error');assert.ok(!JSON.stringify(sent.opts).includes('server-only'));assert.ok(!JSON.stringify(sent.opts).includes('lease_token'));assert.equal(sent.opts.headers['Idempotency-Key'],item.feedback_id);assert.match(JSON.parse(sent.opts.body).text,/Private STRIVE feedback/);
mode='ack-fails';await assert.rejects(deliverFeedback(config,transport),/completion/);
calls=[];await assert.rejects(deliverFeedback({...config,WEBHOOK_URL:undefined},transport));assert.equal(calls.length,0,'Unconfigured delivery cannot claim or consume jobs');
console.log('PASS: fixed destination, no redirect/token leakage, failed ping retained for retry, failed ack stays unknown, unconfigured worker does not claim');
