// GET /r/<id>.json: the facts a public run card shows, for agents and tools (#66).
// Only rows readPublic returned reach this module. Missing measurements are null, never zero.
import Contract from '../site/run-contract.js';
import {runPath,profilePath,shareOrigin} from './share-routes.mjs';

const BASES=new Set(['wall-time','call-index','turn-order']);
const count=value=>Number.isInteger(value)&&value>=0?value:null;
const seconds=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const text=value=>typeof value==='string'&&value.trim()?value.trim():null;
const bins=value=>Array.isArray(value)&&value.every(v=>Number.isInteger(v)&&v>=0)?value:null;
const safeUrl=value=>typeof value==='string'&&value.length<=300&&/^https:\/\/[^\s<>"'\\]+$/.test(value)?value:null;

function ridge(run){
 const values=bins(run.ridge);
 if(!values||!BASES.has(run.ridge_basis))return null;
 return {basis:run.ridge_basis,bins:values,wall_seconds:seconds(run.ridge_wall_seconds),
  worker_bins:bins(run.worker_bins),commit_bins:bins(run.commit_bins)};
}

export function runJson(run){
 const handle=run.profiles?.handle||run.profiles?.github_handle||null;
 const profile=profilePath(handle);
 const harness=text(run.harness);
 const tools=Contract.toolCallCount(run);
 return {
  schema_version:1,
  id:run.id,
  visibility:'public',
  url:shareOrigin+(runPath(run)||'/r/'+run.id),
  builder:profile?{handle:handle.toLowerCase(),profile_url:shareOrigin+profile}:null,
  intent:text(run.title),
  summary:text(run.caption),
  started_at:text(run.started_at),
  harnesses_observed:harness?[harness.toLowerCase().replace(/\s+/g,'-')]:[],
  measured:{
   files_touched:count(run.files_touched),
   commits:count(run.commits),
   turns_typed:count(run.prompts),
   tool_calls:Number.isInteger(tools)&&tools>=0?tools:null,
   duration_s:seconds(run.duration_s),
   ridge:ridge(run),
  },
  declared:{
   project:text(run.project),
   shipped:(Array.isArray(run.shipped)?run.shipped:[]).map(text).filter(Boolean).slice(0,5),
   repo_url:safeUrl(run.repo_url),
   receipts:(Array.isArray(run.receipts)?run.receipts:[]).filter(r=>r&&text(r.label)&&safeUrl(r.url)).slice(0,5)
    .map(r=>({label:text(r.label).slice(0,60),url:r.url})),
  },
  code_route:Contract.readCodeRoute(run),
 };
}
