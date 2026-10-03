import assert from 'node:assert/strict';
import handler from '../api/feedback-notifications.js';
let status,body,calls=[];
const res={setHeader(){},status(s){status=s;return this},json(b){body=b;return b;}};
process.env.CRON_SECRET='test-cron';
process.env.AGENTGRINDER_SUPABASE_URL='https://database.test';
process.env.AGENTGRINDER_SUPABASE_ANON_KEY='sb_publishable_test';
process.env.STRIVE_FEEDBACK_SERVICE_ROLE_KEY='test-service-only';
process.env.STRIVE_FEEDBACK_WEBHOOK_URL='https://hooks.slack.com/services/test';
process.env.STRIVE_FEEDBACK_WEBHOOK_HOST='hooks.slack.com';
process.env.STRIVE_FEEDBACK_INBOX_URL='https://supabase.com/dashboard/project/test/editor';
const owner='11000000-0000-0000-0000-000000000001';
const prior=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{
 calls.push({url,opts});
 if(url.endsWith('/grinder_profile_id'))return {ok:opts.headers.Authorization==='Bearer good-session',json:async()=>owner};
 if(url.endsWith('/feedback_notification_claim'))return {ok:true,json:async()=>[]};
 throw Error('No notification expected in empty-queue auth check');
};
try{
 for(const req of [{method:'GET',headers:{}},{method:'GET',headers:{authorization:'Bearer wrong'}},{method:'POST',headers:{}},{method:'DELETE',headers:{authorization:'Bearer test-cron'}}]){
  calls=[];await handler(req,res);assert.ok([401,405].includes(status));assert.equal(calls.length,0);
 }
 calls=[];await handler({method:'POST',headers:{authorization:'Bearer bad-session'}},res);assert.equal(status,401);assert.equal(calls.length,1);
 calls=[];await handler({method:'POST',headers:{authorization:'Bearer good-session'},body:{destination:'https://evil.test',profile_id:'victim'}},res);assert.equal(status,200);
 const claim=calls.find(c=>c.url.endsWith('/feedback_notification_claim'));assert.deepEqual(JSON.parse(claim.opts.body),{p_limit:1,p_profile_id:owner});assert.equal(claim.opts.headers.Authorization,'Bearer test-service-only');assert.ok(!JSON.stringify(calls).includes('evil.test'));assert.deepEqual(body,{delivered:0,retry:0});
 const savedSecret=process.env.CRON_SECRET;delete process.env.CRON_SECRET;calls=[];await handler({method:'GET',headers:{authorization:'Bearer test-cron'}},res);assert.equal(status,401);assert.equal(calls.length,0);process.env.CRON_SECRET=savedSecret;
 calls=[];await handler({method:'GET',headers:{authorization:'Bearer test-cron'}},res);assert.equal(status,200);assert.deepEqual(JSON.parse(calls[0].opts.body),{p_limit:4,p_profile_id:null});
 delete process.env.STRIVE_FEEDBACK_WEBHOOK_URL;calls=[];await handler({method:'POST',headers:{authorization:'Bearer good-session'}},res);assert.equal(status,503);assert.equal(calls.length,1);assert.match(body.error,/stored feedback is unchanged/);assert.ok(!JSON.stringify(body).includes('test-service'));
}finally{globalThis.fetch=prior;}
console.log('PASS: cron auth, JWT-bound immediate wake, owner-only claim, body cannot set destination, missing setup preserves stored feedback');
