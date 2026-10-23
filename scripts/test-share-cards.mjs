import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ImageResponse} from '@vercel/og';
import Agents from '../site/agent-names.js';
import LinkPreview from '../site/link-preview-card.js';
import {shareCard,photoCard,privateCard,profileCard,photoSlots,html} from '../server/public-run.mjs';
import {shareFonts} from '../server/share-fonts.mjs';

// The share cards a public run travels as: story, square and link preview, plus the profile and
// neutral cards. Every assertion reads the tree the renderer draws, then the PNG it makes.
const nodes=tree=>tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat().flatMap(nodes)]:[];
const texts=tree=>nodes(tree).flatMap(node=>[node.props?.children].flat().filter(child=>typeof child==='string'||typeof child==='number').map(String));
const paths=tree=>nodes(tree).filter(node=>node.type==='path').map(node=>node.props.d);
const ridge=Array.from({length:48},(_,i)=>i%7===3?0:(i*5)%11+1);
const run={id:'3830b205-1111-4111-8111-111111111111',visibility:'public',profile_id:'11000000-0000-0000-0000-000000000001',
 profiles:{handle:'test-casey',display_name:'TEST DATA Casey'},title:'TEST DATA: Add offline sync to the notes app',
 caption:'TEST DATA caption. Queued edits now sync when the connection returns.',project:'Users-alice-code-notes',
 harness:'claude-agent',model:'claude-opus-4-5-20251101',capture_metadata:{basis:'claude-message-usage',models:['claude-opus-4-5-20251101','claude-haiku-4-5-20251001']},
 started_at:'2026-10-13T08:40:00Z',commits:3,files_touched:12,wall_time_s:7800,tool_calls:186,prompts:9,
 ridge,ridge_basis:'wall-time',ridge_wall_seconds:7800,commit_bins:[14,30,45]};
const fonts=await shareFonts();
assert.equal(fonts.length,4,'two weights in two subsets');
assert.deepEqual([...new Set(fonts.map(font=>font.name))],['IBM Plex Sans']);
assert.deepEqual([...new Set(fonts.map(font=>font.weight))].sort(),[400,600]);
assert.ok(existsSync(new URL('../site/fonts/OFL.txt',import.meta.url)),'the font licence ships beside the fonts');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
for(const fn of ['api/og.js','api/run.js'])assert.equal(vercel.functions[fn].includeFiles,'site/fonts/**',fn+' ships the fonts');
const png=async(tree,{width,height})=>{const bytes=Buffer.from(await new ImageResponse(tree,{width,height,fonts}).arrayBuffer());
 assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height);return bytes;};
const {FORMATS}=LinkPreview;
assert.deepEqual(FORMATS,{link:{width:1200,height:630},square:{width:1080,height:1080},story:{width:1080,height:1920}});

for(const format of ['story','square','link']){
 const tree=shareCard(run,[],{format}),words=texts(tree),joined=words.join(' ');
 await png(tree,FORMATS[format]);
 assert.equal(tree.props.style.width,FORMATS[format].width,format+' tree is drawn at its size');
 assert.ok(words.includes('STRIVE'),format+': the brand string on every card is STRIVE');
 // PRODUCT.md: at most three recorded facts, commits, labelled elapsed span and files touched.
 assert.deepEqual(words.filter(text=>['Commits','Elapsed','Files'].includes(text)),['Commits','Elapsed','Files'],format+' facts in order');
 assert.deepEqual(words.filter(text=>['3','2h 10m','12'].includes(text)),['3','2h 10m','12'],format+' figures');
 for(const banned of ['Tool calls','186','Typed turns','Turns','Unknown','Not recorded','—'])assert.ok(!words.includes(banned),`${format} never draws ${banned}`);
 // Names a person reads, never the recorded identifiers, each with its maker's mark.
 assert.ok(words.includes('Claude Code')&&words.includes('Claude Opus 4.5'),format+' human names');
 assert.ok(!/claude-agent|claude-opus-4-5-20251101/.test(joined),format+' no raw ids');
 assert.ok(paths(tree).includes(Agents.MARKS.anthropic.d),format+' Claude mark');
 // No home directory or account name reaches a card.
 assert.ok(!/Users-|alice|notes$/.test(joined),format+' no workspace slug');
 // The trace is the stored ridge, one bar per bin, with ticks only on measured commit bins.
 const bars=nodes(tree).filter(node=>node.props?.style?.flex===1&&/%$/.test(String(node.props.style.height)));
 assert.equal(bars.length,ridge.length,format+' one bar per ridge bin');
 assert.equal(bars.filter((bar,i)=>ridge[i]===0&&bar.props.style.height==='3%').length,ridge.filter(v=>v===0).length,format+' an idle bin stays at the baseline');
 const ticks=nodes(tree).filter(node=>node.props?.style?.background==='#232733'&&node.props.style.height===(format==='story'?22:format==='square'?16:14));
 assert.equal(ticks.length,3,format+' three commit ticks');
 assert.equal(words.includes('Post yours →'),format!=='link',format+' Post yours only on the formats posted as images');
 assert.equal(words.includes('striverun.app/test-casey/3830b205'),format!=='link',format+' carries the run address');
 assert.ok(words.includes('13 Oct 2026'),format+' the run day, never relative');
}
// Same input, same bytes: the CDN copy and a re-render agree.
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(await png(shareCard(run,[],{format:'story'}),FORMATS.story)),hash(await png(shareCard(run,[],{format:'story'}),FORMATS.story)));

// Zero and missing stay off; with no images and no trace, the author's caption is the picture.
const plain={...run,ridge:null,commit_bins:null,commits:0,files_touched:null,wall_time_s:null,duration_s:null,tool_calls:40};
for(const format of ['story','square','link']){
 const tree=shareCard(plain,[],{format}),words=texts(tree);
 assert.ok(!words.some(text=>['Commits','Elapsed','Files','0','40'].includes(text)),format+' no zero or missing fact');
 assert.ok(words.includes('“'),format+' caption tile');
 assert.ok(words.some(text=>text.startsWith('TEST DATA caption')),format+' caption is the picture');
}
const bare={...plain,caption:null,story_result:null};
assert.ok(!texts(shareCard(bare,[],{format:'link'})).includes('“'),'nothing to draw leaves the link card to its words');
assert.equal(texts(shareCard(bare,[],{format:'story'})).filter(text=>text===bare.title).length,1,'a story with nothing else carries its title once, on the tile');

// Images: each lands in the slot the hosted route crops it to, the first one largest.
const shot='data:image/jpeg;base64,/9j/';
for(const format of ['story','square','link'])for(const count of [1,2,3]){
 const tree=shareCard(run,Array(count).fill(shot),{format}),tiles=nodes(tree).filter(node=>node.type==='img'&&node.props.src===shot);
 assert.deepEqual(tiles.map(({props})=>[props.width,props.height]),photoSlots(run,format,count).map(slot=>[slot.width,slot.height]),`${format} ${count} images`);
 assert.ok(tiles.every(({props},i)=>i===0||props.width*props.height<=tiles[0].props.width*tiles[0].props.height),`${format} first image largest`);
}
assert.deepEqual(photoSlots(run,'story',0),[]);assert.equal(photoSlots(run,'link',9).length,3);
assert.ok(nodes(shareCard(run,[shot],{format:'story'})).filter(node=>node.props?.style?.flex===1&&/%$/.test(String(node.props.style.height))).length===ridge.length,'the story keeps the trace under an image');
assert.ok(!JSON.stringify(shareCard(run,['https://example.com/x.png'],{format:'story'})).includes('example.com'),'only inline image data is drawn');

// A run made by an unknown agent and model keeps its recorded words and draws no mark.
const other=shareCard({...run,harness:'my-agent',model:'my-local-model',capture_metadata:null},[],{format:'square'});
assert.ok(texts(other).includes('my-agent')&&texts(other).includes('my-local-model'));
assert.ok(!Object.values(Agents.MARKS).some(mark=>paths(other).includes(mark.d)),'no logo is guessed');
// The legacy entry point still draws the link card.
assert.deepEqual(texts(photoCard(run,[],{})),texts(shareCard(run,[],{format:'link'})));

// The neutral card: the same image for a missing and a private run, in every format.
for(const format of ['link','story','square']){
 const tree=privateCard(format),words=texts(tree);
 await png(tree,FORMATS[format]);
 assert.deepEqual(words,['STRIVE','This run is private on STRIVE','Sign in and open the shared run link to check your access'],format);
 assert.equal(JSON.stringify(tree),JSON.stringify(privateCard(format)));
}

// A profile link: public runs only, totals that were recorded, the agents they post with.
const profile={id:run.profile_id,handle:'test-casey',display_name:'TEST DATA Casey'};
const activities=[{...run,project:'notes'},{...run,id:'5a5a0000-2222-4222-8222-222222222222',harness:'Cursor',commits:0,project:'search'},
 {...run,id:'7b7b0000-3333-4333-8333-333333333333',visibility:'private',title:'Secret title',harness:'Codex',commits:99},
 {...run,id:'not-a-run',title:'Bad row'}];
const card=profileCard(profile,{activities,tiles:[{title:'Latest public run',url:null}]}),words=texts(card);
await png(card,FORMATS.link);
assert.deepEqual(words.filter(text=>['Public runs','Projects','Commits'].includes(text)),['Public runs','Projects','Commits']);
assert.deepEqual(words.filter(text=>['2','3'].includes(text)),['2','2','3'],'two public runs, two projects, three commits');
assert.ok(words.includes('Claude Code')&&words.includes('Cursor')&&!words.includes('Codex'),'agents from public runs only');
assert.ok(!/Secret title|Bad row|99/.test(words.join(' ')),'nothing from a private or invalid row');
assert.ok(words.includes('Latest public run')&&words.includes('STRIVE'));
const empty=texts(profileCard(profile,{activities:[]}));
assert.ok(empty.includes('No public runs yet')&&!empty.some(text=>['Commits','—','0'].includes(text)),'an empty profile states it, with no em-dash row');

// The endpoint: ?format= picks the size; anything else is the link card.
const og=(await import('../api/og.js')).default;
const row={...run,profiles:{handle:'test-casey',display_name:'TEST DATA Casey'}};
let rows=[row];
globalThis.fetch=async raw=>{const url=new URL(String(raw));return {ok:true,status:200,headers:new Map(),json:async()=>url.pathname.endsWith('/runs')?rows:[],clone(){return this},text:async()=>''};};
const call=async query=>{const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(body){this.body=body}};await og({query,headers:{}},res);return res;};
for(const [format,size] of [['story',FORMATS.story],['square',FORMATS.square],['link',FORMATS.link],['poster',FORMATS.link],[undefined,FORMATS.link]]){
 const res=await call({run:run.id,format});
 assert.equal(res.statusCode,200,String(format));assert.equal(res.headers['content-type'],'image/png');
 assert.deepEqual([res.body.readUInt32BE(16),res.body.readUInt32BE(20)],[size.width,size.height],String(format));
}
rows=[];
const hidden=await call({run:run.id,format:'story'});
assert.deepEqual([hidden.body.readUInt32BE(16),hidden.body.readUInt32BE(20)],[1080,1920],'a run that is not public gets the neutral story card');
assert.equal(hash(hidden.body),hash(await png(privateCard('story'),FORMATS.story)),'byte for byte the neutral card');

// The tags a link unfurls with: the new image, its description, and the site name.
const page=html(row);
assert.ok(page.includes(`<meta property="og:image" content="https://striverun.app/api/og?run=${run.id}&v=5">`));
assert.ok(page.includes('<meta property="og:site_name" content="STRIVE">'));
const alt=page.match(/<meta property="og:image:alt" content="([^"]*)">/)[1];
assert.equal(alt,'STRIVE run card: TEST DATA: Add offline sync to the notes app by TEST DATA Casey · 3 commits · 2h 10m elapsed · 12 files · Claude Code');
assert.ok(page.includes(`<meta name="twitter:image:alt" content="${alt}">`));
const share=readFileSync(new URL('../api/share.js',import.meta.url),'utf8');
for(const tag of ['og:site_name','og:image:alt','twitter:title','twitter:description','twitter:image','twitter:image:alt'])assert.ok(share.includes(tag),'profile page carries '+tag);
assert.ok(share.includes("'&v=3'"),'profile image version moves with its design');
console.log('PASS share cards: story, square and link images follow PRODUCT.md facts, human names and maker marks, the stored trace and slots; profile and neutral cards; endpoint formats and unfurl tags');
