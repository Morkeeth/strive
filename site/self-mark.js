/* A private "proud of this" mark on your own run. XUDOS are recognition from other people and the
   database refuses a XUDOS to yourself, so this mark is not a XUDOS: it is stored only in this
   browser, only you see it, and it is never added to any count. Research consent works the same
   way until STRIVE has a reviewed place to record it: the choice stays on this device. */
(function(root){
'use strict';
const SELF='strive-self-marks-v1',RESEARCH='strive-research-preference-v1';
function read(key,fallback){try{const v=JSON.parse(root.localStorage.getItem(key)||'null');return v==null?fallback:v;}catch(_){return fallback;}}
function write(key,value){try{root.localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
function marked(runId){const all=read(SELF,{});return !!(all&&typeof all==='object'&&all[runId]);}
function toggle(runId){const all=read(SELF,{});const next=!(all&&all[runId]);const copy={...(all&&typeof all==='object'?all:{})};if(next)copy[runId]=new Date().toISOString();else delete copy[runId];return write(SELF,copy)?next:!next;}
function research(){const v=read(RESEARCH,null);return v&&v.choice==='yes'?'yes':'no';}  // default off
function setResearch(yes){return write(RESEARCH,{choice:yes?'yes':'no',at:new Date().toISOString(),stored:'this browser only'});}
const api={marked,toggle,research,setResearch,SELF,RESEARCH};
root.StriveSelfMark=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
