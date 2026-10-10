/* Optional, versioned estimates from stored inputs. Never a provider bill or human active time. */
(function(root){
 const count=n=>Number.isSafeInteger(n)&&n>=0;
 const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
 const required=(v,keys)=>keys.every(k=>Object.hasOwn(v,k));
 const tokenKeys=['input_tokens','output_tokens','cache_read_tokens','cache_write_5m_tokens','cache_write_1h_tokens'];
 const rateKeys=['input','output','cache_read','cache_write_5m','cache_write_1h'];
 const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
 const fail=()=>{throw Error('Invalid stored estimate inputs')};
 function validate(e,m){
  if(e===undefined)return;
  if(!object(e,['v','source','cost','tool_activity'])||e.v!==1)fail();
  const s=e.source;
  if(!object(s,['sha256','started_at','ended_at'])||!/^[a-f0-9]{64}$/.test(s.sha256)||!stamp(s.started_at)||!stamp(s.ended_at)||Date.parse(s.ended_at)<Date.parse(s.started_at))fail();
  if(e.cost!==undefined){
   if(!object(e.cost,['method','components'])||e.cost.method!=='model-price-v1'||!Array.isArray(e.cost.components)||e.cost.components.length<1||e.cost.components.length>64)fail();
   let input=0,output=0,cache=0;
   for(const c of e.cost.components){
    if(!object(c,['model','role',...tokenKeys,'price'])||!required(c,['model','role',...tokenKeys,'price'])||!m.models.includes(c.model)||!['primary','advisor'].includes(c.role)||!tokenKeys.every(k=>count(c[k]))||c.cache_read_tokens+c.cache_write_5m_tokens+c.cache_write_1h_tokens>c.input_tokens)fail();
    input+=c.input_tokens;output+=c.output_tokens;cache+=c.cache_read_tokens;
    const p=c.price;if(p===null)continue;
    if(!object(p,['table_url','table_version','checked_on','currency','service_tier','context_tier','rates_per_million'])||!required(p,['table_url','table_version','checked_on','currency','service_tier','context_tier','rates_per_million'])||p.currency!=='USD'||!['standard','fast','batch','standard-assumed'].includes(p.service_tier)||!/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,119}$/.test(p.table_version)||!/^[A-Za-z0-9][A-Za-z0-9 ._:/+<>=-]{0,119}$/.test(p.context_tier)||!/^\d{4}-\d{2}-\d{2}$/.test(p.checked_on)||!Number.isFinite(Date.parse(p.checked_on)))fail();
    let u;try{u=new URL(p.table_url)}catch{fail()}
    if(u.protocol!=='https:'||u.username||u.password||p.table_url.length>500)fail();
    if(!object(p.rates_per_million,rateKeys)||!required(p.rates_per_million,rateKeys)||!rateKeys.every(k=>Number.isFinite(p.rates_per_million[k])&&p.rates_per_million[k]>=0&&p.rates_per_million[k]<=1e6))fail();
   }
   if(!count(input)||!count(output)||input!==m.input_tokens||output!==m.output_tokens||(m.cached_input_tokens!=null&&cache!==m.cached_input_tokens))fail();
  }
  if(e.tool_activity!==undefined){
   const a=e.tool_activity;
   if(!object(a,['method','bin_seconds','origin_utc','occupied_bins'])||a.method!=='occupied-tool-minutes-v1'||a.bin_seconds!==60||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/.test(a.origin_utc)||Date.parse(a.origin_utc)!==Math.floor(Date.parse(s.started_at)/60000)*60000||!Array.isArray(a.occupied_bins)||a.occupied_bins.length>2048||new Set(a.occupied_bins).size!==a.occupied_bins.length||!a.occupied_bins.every(n=>count(n)&&n<=Math.floor((Date.parse(s.ended_at)-Date.parse(a.origin_utc))/60000)))fail();
  }
 }
 function encodedBytes(m){
  // Pretty JSON is a conservative allowance for PostgreSQL's added object/array spaces.
  const expand=n=>{const text=String(n);if(!/e/i.test(text))return n;const [mantissa,exponent]=text.split(/e/i),digits=mantissa.replace('.',''),point=(mantissa.split('.')[0].length)+Number(exponent);return point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);};
  // JSONB expands scientific notation; count its full decimal width as well.
  const text=JSON.stringify(m,(_,value)=>typeof value==='number'?expand(value):value,2);return new TextEncoder().encode(text).length;
 }
 function prepare(m){
  if(m?.estimates!==undefined&&encodedBytes(m)>=7500){const {estimates,...base}=m;return base;}
  return m;
 }
 function facts(m){
  const e=m?.estimates,rows=[],missing=[];
  if(!e){return {rows,missing:[['Est. dollars','No stored per-model usage and price provenance. No dollar estimate is shown.'],['Tool-active time · proxy','No stored tool-call bin provenance. No active-time proxy is shown.']]};}
  const source=`Capture window ${e.source.started_at} to ${e.source.ended_at}; source SHA-256 ${e.source.sha256}.`;
  if(!e.cost)missing.push(['Est. dollars','No stored cost inputs. No dollar estimate is shown.']);
  else if(e.cost.components.some(c=>c.price===null))missing.push(['Est. dollars','No recorded price for '+e.cost.components.filter(c=>c.price===null).map(c=>c.model).join(', ')+'. The complete dollar estimate is omitted.']);
  else{
   let dollars=0;
   for(const c of e.cost.components){const r=c.price.rates_per_million;dollars+=((c.input_tokens-c.cache_read_tokens-c.cache_write_5m_tokens-c.cache_write_1h_tokens)*r.input+c.cache_read_tokens*r.cache_read+c.cache_write_5m_tokens*r.cache_write_5m+c.cache_write_1h_tokens*r.cache_write_1h+c.output_tokens*r.output)/1e6;}
   const provenance=e.cost.components.map(c=>`${c.model} (${c.role}): ${c.input_tokens} input including ${c.cache_read_tokens} cache reads, ${c.cache_write_5m_tokens} 5-minute writes and ${c.cache_write_1h_tokens} 1-hour writes; ${c.output_tokens} output. Rates USD per million ${JSON.stringify(c.price.rates_per_million)}. ${c.price.table_url}, ${c.price.table_version}, checked ${c.price.checked_on}; service tier ${c.price.service_tier}; context tier ${c.price.context_tier}.`).join(' ');
   rows.push(['Est. dollars','$'+dollars.toFixed(2),`Model-price comparison from stored capture inputs, not a bill. Excludes subscription terms, tool fees and taxes; standard-assumed means processing speed was not recorded. ${source} ${provenance} Method model-price-v1. Captures and price inputs are uploader-supplied, not independently verified by STRIVE.`]);
  }
  if(e.tool_activity){const a=e.tool_activity;rows.push(['Tool-active time · proxy',a.occupied_bins.length+' min',`${a.occupied_bins.length} unique 60-second clock bins contain at least one recorded tool call. This counts occupied bins, including partial boundary minutes; it is not continuous tool runtime or measured human active time. Origin ${a.origin_utc}; method ${a.method}. ${source}`]);}
  else missing.push(['Tool-active time · proxy','No stored tool-call bin provenance. No active-time proxy is shown.']);
  return {rows,missing};
 }
 const api={validate,prepare,encodedBytes,facts};root.StriveEstimates=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
