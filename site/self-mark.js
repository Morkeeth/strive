/* A private "proud of this" mark on your own run. XUDOS are recognition from other people and the
   database refuses a XUDOS to yourself, so this mark is not a XUDOS and is never counted.
   Signed in, with 061 applied, the mark is saved to your account where only you can read it.
   Otherwise it stays in this browser. Marks kept in a browser are never uploaded in bulk: a mark
   reaches your account only when you tap it while signed in. */
(function(root){
'use strict';
const SELF='strive-self-marks-v1';
let server=null;  // {client, profileId, marks:Set}
function read(){try{const v=JSON.parse(root.localStorage.getItem(SELF)||'null');return v&&typeof v==='object'?v:{};}catch(_){return {};}}
function write(value){try{root.localStorage.setItem(SELF,JSON.stringify(value));return true;}catch(_){return false;}}
/* Use the account when the table answers; otherwise this browser. Returns 'account' or 'device'. */
async function connect(client,profileId){
 if(!client||!profileId){server=null;return 'device';}
 if(server&&server.client===client&&server.profileId===profileId)return 'account';
 try{const {data,error}=await client.from('run_self_marks').select('run_id');if(error)throw error;
  server={client,profileId,marks:new Set((data||[]).map(r=>r.run_id))};return 'account';}
 catch(_){server=null;return 'device';}
}
function where(){return server?'account':'device';}
function marked(runId){return server?server.marks.has(runId):!!read()[runId];}
async function toggle(runId){
 if(!server){const all={...read()};const next=!all[runId];if(next)all[runId]=new Date().toISOString();else delete all[runId];return write(all)?next:!next;}
 const on=!server.marks.has(runId),t=server.client.from('run_self_marks');
 const {error}=await(on?t.insert({profile_id:server.profileId,run_id:runId}):t.delete().eq('run_id',runId));
 if(error)throw error;
 if(on)server.marks.add(runId);else server.marks.delete(runId);
 return on;
}
const api={connect,where,marked,toggle,SELF};
root.StriveSelfMark=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
