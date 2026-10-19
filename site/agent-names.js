/* The names a person reads for a run's agent and recorded models, and the mark of each maker.
   A recorded identifier these rules do not recognise is shown exactly as it was recorded. */
(function(root){
 // An agent arrives as the capture's display name or one of its older keys.
 const AGENTS=new Map([
  ...['claude code','claude-code','claude_code','claudecode','claude','claude-cli','claude-agent'].map(k=>[k,['Claude Code','anthropic']]),
  ...['cursor','cursor-agent','cursor-cli','cursor agent'].map(k=>[k,['Cursor','cursor']]),
  ...['codex','codex-cli','codex cli','openai codex','openai-codex'].map(k=>[k,['Codex','openai']]),
  ...['grok bot','grok-bot','grok_bot','grokbot'].map(k=>[k,['Grok Bot','x']])
 ]);
 function agent(raw){
  const text=String(raw??'').trim();if(!text)return null;
  const hit=AGENTS.get(text.toLowerCase());
  return hit?{name:hit[0],maker:hit[1]}:{name:text,maker:null};
 }
 const agentName=raw=>agent(raw)?.name||'';

 const upper=w=>/^[a-z]\d/.test(w)||/^\d+b$/.test(w)?w.toUpperCase():/^\d/.test(w)?w:w.charAt(0).toUpperCase()+w.slice(1);
 // OpenAI writes its size suffixes in lower case: GPT-4.1 mini, GPT-5 nano.
 const openaiWord=w=>w==='mini'||w==='nano'?w:upper(w);
 const words=(text,word=upper)=>text.split('-').filter(Boolean).map(word).join(' ');
 // Routing prefixes, dated snapshots and release aliases are not part of a model's name.
 const bare=id=>id
  .replace(/^(?:(?:us|eu|apac|global)\.)?(?:anthropic|openai|google|vertex_ai|x-ai|xai|mistralai|meta-llama|deepseek|moonshotai|qwen)[./]/i,'')
  .replace(/@\d{8}$/,'')
  .replace(/-v\d+:\d+$/i,'')
  .replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/,'')
  .replace(/-latest$/i,'');
 function recognise(id){
  const s=bare(id).toLowerCase(),thinking=/-thinking$/.test(s),base=s.replace(/-thinking$/,''),tail=thinking?' Thinking':'';
  let m;
  if((m=base.match(/^claude-(opus|sonnet|haiku|fable|instant)-(\d+)(?:[-.](\d))?$/)))
   return {name:`Claude ${upper(m[1])} ${m[2]}${m[3]?'.'+m[3]:''}${tail}`,maker:'anthropic'};
  if((m=base.match(/^claude-(\d+)(?:[-.](\d))?-(opus|sonnet|haiku|instant)$/))){
   const version=m[2]?`${m[1]}.${m[2]}`:m[1];
   return {name:(Number(m[1])>=4?`Claude ${upper(m[3])} ${version}`:`Claude ${version} ${upper(m[3])}`)+tail,maker:'anthropic'};
  }
  if((m=base.match(/^gpt-(\d+(?:\.\d+)?)(o)?(?:-(.+))?$/)))
   return {name:`GPT-${m[1]}${m[2]||''}${m[3]?' '+words(m[3],openaiWord):''}${tail}`,maker:'openai'};
  if((m=base.match(/^(o\d)(-mini|-pro)?(?:-(low|medium|high))?$/)))
   return {name:`${m[1]}${m[2]||''}${m[3]?` (${m[3]})`:''}`,maker:'openai'};
  if((m=base.match(/^codex(?:-(.+))?$/)))return {name:'Codex'+(m[1]?' '+words(m[1],openaiWord):''),maker:'openai'};
  if((m=base.match(/^gemini-(\d+(?:\.\d+)?)-(.+)$/)))return {name:`Gemini ${m[1]} ${words(m[2])}`,maker:'google'};
  if((m=base.match(/^grok-(.+)$/)))return {name:`Grok ${words(m[1])}${tail}`,maker:'xai'};
  if((m=base.match(/^(composer|cheetah)(?:-(.+))?$/)))return {name:upper(m[1])+(m[2]?' '+words(m[2]):''),maker:'cursor'};
  if(base==='cursor-small')return {name:'Cursor Small',maker:'cursor'};
  if(/^(?:mistral|codestral|devstral|magistral|ministral)(?:-|$)/.test(base))return {name:words(base),maker:'mistral'};
  if((m=base.match(/^llama-?(\d.*)$/)))return {name:'Llama '+words(m[1]),maker:'meta'};
  if((m=base.match(/^deepseek-(.+)$/)))return {name:`DeepSeek ${words(m[1])}${tail}`,maker:null};
  if((m=base.match(/^kimi-(.+)$/)))return {name:`Kimi ${words(m[1])}${tail}`,maker:null};
  if((m=base.match(/^qwen(\d[\w.]*)?(?:-(.+))?$/)))return {name:`Qwen${m[1]||''}${m[2]?' '+words(m[2]):''}`,maker:null};
  return null;
 }
 function model(raw){
  const id=String(raw??'').trim();if(!id)return null;
  const known=recognise(id);
  return {id,name:known?known.name:id,maker:known?known.maker:null};
 }
 const modelName=raw=>model(raw)?.name||'';
 // The models a capture recorded, once each by the name a person reads, in recorded order.
 function recordedModels(run){
  const list=Array.isArray(run?.capture_metadata?.models)?run.capture_metadata.models:[];
  const seen=new Set(),out=[];
  for(const raw of list){if(typeof raw!=='string')continue;const m=model(raw);if(!m||seen.has(m.name))continue;seen.add(m.name);out.push(m)}
  return out;
 }

 // Brand marks: Simple Icons 15.22.0 (CC0 1.0), one 24 by 24 path each. The trademarks belong to
 // their owners; a mark only identifies the tool a run used. OpenAI, Cursor and X ask for a
 // single dark colour, so those three are drawn in ink rather than the catalogue's hex.
 const MARKS={
  anthropic:{label:'Claude',color:'#D97757',d:'m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z'},
  openai:{label:'OpenAI',color:'#0a0a0a',d:'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'},
  cursor:{label:'Cursor',color:'#0a0a0a',d:'M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23'},
  x:{label:'X',color:'#0a0a0a',d:'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z'},
  google:{label:'Gemini',color:'#8E75B2',d:'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81'},
  mistral:{label:'Mistral AI',color:'#FA520F',d:'M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z'},
  meta:{label:'Meta',color:'#0467DF',d:'M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z'}
 };
 const mark=maker=>MARKS[maker]||null;
 function markSvg(maker,{size=16,className='agent-logo'}={}){
  const m=mark(maker);if(!m)return '';
  return `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="${m.color}" d="${m.d}"/></svg>`;
 }
 // The same mark as an image-renderer node; `el` is the caller's element factory.
 function markNode(el,maker,size,color){
  const m=mark(maker);if(!m)return null;
  return el('svg',{width:size,height:size,viewBox:'0 0 24 24'},el('path',{d:m.d,fill:color||m.color}));
 }
 const api={agent,agentName,model,modelName,recordedModels,MARKS,mark,markSvg,markNode};
 root.StriveAgents=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
