import {runtimeConfig} from './runtime-config.mjs';
import {BRAND,TAGLINE} from './brand.mjs';
import {runPath,profilePath,shareOrigin} from './share-routes.mjs';
// The feed's card. A CommonJS module (site/feed-card.js), so its default import is its exports.
import Feed from '../site/feed-card.js';
import Agents from '../site/agent-names.js';
import PhotoFrame from '../site/photo-frame.js';
import LinkPreview from '../site/link-preview-card.js';
const {series,toolCallCount,wholeWords,shareDuration}=LinkPreview;
export {toolCallCount};
export const {photoSlots,profileSlots,FORMATS:SHARE_FORMATS}=LinkPreview;
export const linkPreviewCard=(run,opts={})=>LinkPreview.linkPreviewCard(run,{...opts,brand:BRAND});
export const photoCard=(run,urls,opts={})=>LinkPreview.photoCard(run,urls,{...opts,brand:BRAND});
// The story (1080x1920) and square (1080x1080) images carry the run's short address.
export const shareCard=(run,urls,opts={})=>LinkPreview.shareCard(run,urls,{...opts,brand:BRAND,address:opts.address??shareAddress(run)});
export const shareAddress=run=>{const path=runPath(run);return new URL(shareOrigin).host+(path?path.replace(/^(\/[^/]+\/[0-9a-f]{8}).*$/,'$1'):'');};
import Evidence from '../site/run-evidence.js';
import Story from '../site/run-story.js';
import Context from '../site/run-context.js';
import Placeholders from '../site/run-placeholders.js';
import Checkpoints from '../site/code-route-view.js';
const config=runtimeConfig();
const FAVOUR_SHOWCASE='599095f1-3b49-4c0e-b50c-13afd4ae369e';
export const origin=config.ORIGIN;
// Link previews fetch the image seconds after the page, and every fetch used to re-render it.
// Five minutes at the CDN bounds how long a run made private can keep its old image there;
// platforms that already unfurled it keep their own copy regardless.
export const SHARE_IMAGE_CACHE='public, max-age=0, s-maxage=300, stale-while-revalidate=600';
export const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PUBLIC_RUN_FIELDS='id,profile_id,created_at,title,caption,photo_layout,story_result,story_next,feedback_question,output_url,repo_url,receipts,shipped,artifact_url,image_url,hero_visual,project,harness,model,capture_metadata,prompt_provenance,started_at,duration_s,wall_time_s,prompts,tool_calls,shell_calls,files_touched,artifacts_produced,commits,rhythm,route,trace_basis,measurement_revision,history_evidence,ridge,worker_bins,commit_bins,ridge_basis,ridge_wall_seconds,ridge_tool_calls,code_route,visibility,profiles!runs_profile_id_fkey(github_handle,handle,display_name,avatar_url)';
export async function readPublic(id,fetcher=fetch){
 if(!validId(id))return null;
 const request=select=>{const query=new URLSearchParams({id:'eq.'+id,visibility:'eq.public',select,limit:'1'});return fetcher(config.SB_URL+'/rest/v1/runs?'+query,{headers:{apikey:config.SB_KEY,"Accept-Profile":config.SB_SCHEMA},cache:'no-store',signal:AbortSignal.timeout(8000)})};
 let fields=PUBLIC_RUN_FIELDS,response=await request(fields);
 // Production can trail an additive visual-choice migration. Keep the public page available on
 // that older schema; retry only for this exact missing optional column, never for a broad 400.
 for(let retries=0;response.status===400&&retries<2;retries++){
  const detail=await response.clone().text();
  const missing=['hero_visual','prompt_provenance'].find(name=>fields.includes(','+name)&&new RegExp(name,'i').test(detail));
  if(!missing||!/(does not exist|not found|schema cache|PGRST204)/i.test(detail))break;
  fields=fields.replace(','+missing,'');response=await request(fields);
 }
 if(!response.ok)throw new Error('Public run unavailable');const rows=await response.json();
 // The query asks for public rows only. The row is checked again here, so a lost filter or a
 // permissive REST layer still cannot put a close friends, link or only-me run on this page.
 return Array.isArray(rows)&&rows.length===1&&rows[0]?.visibility==='public'?rows[0]:null;
}
// THE SHARED CARD. /r/<id> draws the run with the same function the feed uses (site/feed-card.js),
// so the card a stranger opens from a link is the card they would have scrolled past in the feed:
// face, name, agent, title, one big number, up to three small figures, the activity line, and the
// heart, discuss and share row. The page links the app's own stylesheets for the look; nothing
// below the card is part of it.
const pageStyle=`*{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}body{background:var(--paper);color:var(--ink);font:15px/1.5 'IBM Plex Sans',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;padding:0 16px 40px}a{color:inherit;text-decoration:none}.num{font-variant-numeric:tabular-nums}main{max-width:560px;margin:0 auto}a.home{display:inline-flex;align-items:center;min-height:48px;margin:8px 0;font-weight:600;letter-spacing:.08em;color:var(--blue)}.fc{margin:0 0 16px}.fc h1.fc-title{font-size:24px}.share-open{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:0 0 16px}a.open{display:inline-flex;align-items:center;min-height:48px;background:var(--blue);color:#fff;padding:0 20px;font-weight:500}a.open-profile{display:inline-flex;align-items:center;min-height:48px;color:var(--blue);font-weight:500}a.output{color:var(--blue);font-weight:500}a:focus-visible{outline:2px solid var(--blue);outline-offset:3px}.note{color:var(--soft);font-size:13px;margin:0}.private-card{background:var(--box);border:1px solid var(--rule);padding:24px 16px;margin:0 0 16px}.private-card h1{font-size:22px;line-height:1.25;font-weight:600;margin:0 0 8px}.private-card p{color:var(--soft);margin:0 0 16px}.public-run-photos{margin:0 0 16px}.public-run-photos h2{font-size:15px;margin:0 0 8px}.public-run-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.public-run-photo-grid img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain;background:#f4f4f2}.public-run-photo-grid img{display:block;width:100%;height:auto;max-height:520px;object-fit:contain;background:var(--box);border:1px solid var(--rule)}.public-run-photo-grid img:first-child:nth-last-child(1){grid-column:1/-1}.outcome{background:var(--box);border:1px solid var(--rule);padding:14px 16px;margin:0 0 16px;overflow-wrap:anywhere}.outcome h2{font-size:13px;color:var(--soft);font-weight:500;margin:0 0 6px}.outcome p,.outcome li{font-size:14px;margin:6px 0}.outcome ul{margin:8px 0;padding-left:20px}.outcome a{color:var(--blue)}.code-route{background:var(--box);border:1px solid var(--rule);padding:14px 16px;margin:0 0 16px;color:var(--blue);min-width:0;overflow-wrap:anywhere}.code-route h2{font-size:13px;color:var(--blue);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px}.code-route svg{display:block;width:100%;height:auto}.code-route-projects{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px;color:var(--ink);font-size:14px}.code-route-projects li{display:flex;gap:8px;align-items:baseline;min-width:0}.code-route-projects li[data-dense="1"] .code-route-project-name{font-weight:600}.code-route-lane-mark{flex:none;min-width:1.1em;color:var(--blue);font-weight:600}.code-route-insight{font-size:16px;line-height:1.35;color:var(--ink);margin:12px 0 0;font-weight:600}.code-route-stats,.code-route-harnesses,.code-route-why{font-size:13px;color:var(--soft);margin:8px 0 0}.code-route-stops{margin:8px 0 0;display:grid;gap:6px;min-width:0;color:var(--ink);font-size:14px}.code-route-point summary{cursor:pointer;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;min-width:0}.code-route-kind{color:var(--blue);font-size:12px;font-weight:600;text-transform:uppercase}.code-route-stop-label,.code-route-stop-project{min-width:0;overflow-wrap:anywhere}.code-route-basis{color:var(--soft)}`;
const publicStyle=`main{max-width:640px}.public-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0 16px}.public-nav a.home{font-size:24px;letter-spacing:-1px}.public-nav a.open{font-size:13px;min-height:44px;padding:0 14px;border-radius:3px}.fc{border-radius:5px}.fc-activity-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:16px 0 18px}.fc-activity-stats>div{padding:0 16px;border-left:1px solid var(--rule)}.fc-activity-stats>div:first-child{border:0;padding-left:0}.fc-activity-stats dt{font-size:11px;color:var(--soft)}.fc-activity-stats dd{font-size:24px;font-weight:500;margin:4px 0 0}.public-run-photo-grid figure{margin:0;min-width:0}.public-run-photo-grid figcaption{font-size:12px;color:var(--soft);margin-top:5px}.public-run-photos{margin-top:24px}@media(max-width:400px){body{padding:0 12px 30px}.fc-activity-stats dd{font-size:20px}.fc-activity-stats>div{padding:0 10px}.public-nav{gap:8px}.public-nav a.open{font-size:12px;padding:0 10px}}`;
const projectStyle=`.public-run-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.public-run-photo-grid figure{min-width:0;position:relative;border:1px solid #d9dde6;border-radius:8px;overflow:hidden;background:#fff}.public-run-photo-grid img{display:block;width:100%;height:240px!important;object-fit:cover!important}.public-run-photo-grid figcaption{padding:6px 9px;margin:0;font-size:11px}.public-run-photo-grid .strive-empty{height:100%;min-height:240px;aspect-ratio:auto;padding:18px}.public-run-photo-grid .strive-empty .empty-story{color:#0047ff;font-size:21px;line-height:1.2}.public-run-photo-grid .empty-source{font-size:11px;color:#666}.public-run-photo-grid .empty-kicker{color:#0047ff;font-size:11px}@media(max-width:600px){.public-run-photo-grid img{height:180px!important}.public-run-photo-grid .strive-empty{padding:12px;min-height:180px}.public-run-photo-grid .strive-empty .empty-story{font-size:16px}.public-project-shots .public-run-photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}.public-project-shots img{max-height:none;object-fit:contain}.public-project-shots a{display:block}.public-project-shots figure{min-width:0}@media(max-width:600px){.public-project-shots .public-run-photo-grid{grid-template-columns:1fr}}.public-run-photo-grid[data-media-count="3"]{grid-template-columns:2fr 1fr;grid-template-rows:repeat(2,120px)}.public-run-photo-grid[data-media-count="3"] figure:first-child{grid-row:span 2}.public-run-photo-grid[data-media-count="3"] figure img{height:100%!important}.public-run-photo-grid[data-media-count="3"] figure a{height:100%}.public-run-photo-grid[data-media-count="3"] figcaption{position:absolute;bottom:0;left:0;right:0;background:#fffffff0}.public-run-photo-grid[data-media-count="1"]{grid-template-columns:1fr}.public-image-lightbox{display:none}.public-image-lightbox:target{display:flex;position:fixed;inset:0;z-index:100;background:#101522ed;align-items:center;justify-content:center;padding:60px 20px 20px}.public-image-lightbox img{display:block;object-fit:contain!important;max-width:92vw;max-height:85vh;width:auto;height:auto!important}.public-image-lightbox nav{position:absolute;top:12px;left:15px;right:15px;display:flex;justify-content:space-between;gap:12px}.public-image-lightbox a{color:#fff;padding:10px;font-size:14px}`;
const shareStyle=`body.share-page{background:#f5f6f8;color:#242833;padding:0 0 48px;font-size:16px}.share-page main{max-width:100%;margin:0}.share-page .public-nav{max-width:1120px;margin:auto;padding:10px 18px;background:#fff}.share-page .public-nav a.home{color:#1356ef;font-weight:800;letter-spacing:-.05em}.share-page .public-nav .open{background:#1258f4;border-radius:999px;padding:0 19px;font-weight:700}.share-page .share-shell{max-width:1120px;margin:24px auto;display:grid;grid-template-columns:minmax(0,760px) minmax(220px,300px);gap:24px;padding:0 18px;align-items:start}.share-page .share-main{background:#fff;border:1px solid #e5e8ef;border-radius:16px;overflow:hidden;min-width:0;box-shadow:0 10px 32px #1522470a}.share-page .share-author{display:flex;align-items:center;gap:12px;padding:22px 26px}.share-page .share-avatar{width:48px;height:48px;border-radius:50%;background:#dfe9ff;color:#1258f4;display:grid;place-items:center;font-size:18px;font-weight:800}.share-page .share-name{font-weight:750;line-height:1.1}.share-page .share-meta{color:#6f7787;font-size:13px;margin-top:4px}.share-page .public-run-photos{margin:0}.share-page .public-run-photos h2{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.share-page .public-run-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;background:#e9eef9}.share-page .public-run-photo-grid[data-media-count="1"]{grid-template-columns:1fr}.share-page .public-run-photo-grid[data-media-count="3"]{grid-template-columns:2fr 1fr;grid-template-rows:repeat(2,188px)}.share-page .public-run-photo-grid figure{border:0;border-radius:0;background:#e9eef9}.share-page .public-run-photo-grid figure img{width:100%;height:380px!important;max-height:none;object-fit:contain!important;background:#e9eef9}.share-page .public-run-photo-grid[data-media-count="3"] figure img{height:100%!important}.share-page .public-run-photo-grid figure a{display:flex;align-items:center;justify-content:center;height:100%}.share-page .public-run-photo-grid figcaption{position:absolute;bottom:10px;left:10px;right:auto;padding:4px 9px;border-radius:999px;background:#fff;color:#364154;font-size:11px;box-shadow:0 2px 8px #17213a22}.share-page .share-quote{min-height:260px;background:#1258f4;color:#fff;padding:32px 30px;display:flex;flex-direction:column;justify-content:space-between}.share-page .share-quote span{font-size:48px;line-height:1}.share-page .share-quote p{font-size:clamp(23px,4vw,34px);line-height:1.16;letter-spacing:-.035em;font-weight:750;max-width:620px;margin:12px 0 0}.share-page .share-copy{padding:26px 30px 30px}.share-page .share-type{color:#1258f4;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.share-page h1{font-size:clamp(28px,4vw,38px);line-height:1.13;letter-spacing:-.045em;margin:8px 0 12px}.share-page .share-caption{font-size:16px;line-height:1.5;margin:0;color:#424b5e;white-space:pre-line}.share-page .share-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid #e7eaf0;border-bottom:1px solid #e7eaf0;margin:24px 0}.share-page .share-stats>div{padding:17px 10px 19px;border-left:1px solid #e7eaf0}.share-page .share-stats>div:first-child{border:0;padding-left:0}.share-page .share-stats dt{color:#70798a;font-size:12px}.share-page .share-stats dd{font-size:clamp(27px,4vw,38px);line-height:1.1;font-weight:800;letter-spacing:-.05em;margin:7px 0 0}.share-page .share-route-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.share-page .share-route-head h2{margin:0;font-size:17px}.share-page .share-route-head span{font-size:12px;color:#7b8392}.share-page .share-route-bars{height:116px;display:flex;align-items:end;gap:2px;margin-top:14px;border-bottom:2px solid #cbd7f5}.share-page .share-route-bars i{flex:1;min-width:1px;background:linear-gradient(#3878ff,#1258f4);border-radius:3px 3px 0 0}.share-page .share-chips{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.share-page .share-chips span{display:inline-flex;align-items:center;gap:6px;border:1px solid #dce4f5;background:#f5f8ff;color:#31517d;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700}.share-page .share-chips svg{flex:none}.share-page .share-story{border-top:1px solid #e7eaf0;padding-top:20px}.share-page .share-story h2{font-size:17px;margin:0 0 9px}.share-page .share-story p{white-space:pre-line;color:#444e5f;margin:0 0 12px}.share-page .share-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px 22px;margin-top:24px;padding-top:18px;border-top:1px solid #e7eaf0}.share-page .share-actions a{font-weight:700;color:#3f4b61}.share-page .share-actions a.open{margin-left:auto;background:#1258f4;color:#fff;padding:12px 17px;border-radius:999px}.share-page .share-side{background:#fff;border:1px solid #e5e8ef;border-radius:16px;padding:20px;box-shadow:0 10px 32px #1522470a}.share-page .share-side h2{font-size:16px;margin:0 0 14px}.share-page .share-side ul{list-style:none;margin:0;padding:0}.share-page .share-side li{border-top:1px solid #e7eaf0;padding:12px 0}.share-page .share-side li:first-child{border:0}.share-page .share-side a{font-weight:700;line-height:1.3}.share-page .share-side small{display:block;color:#7b8392;margin-top:4px}.share-page .share-extra{border-top:1px solid #e7eaf0;padding:20px 30px 30px}.share-page .share-extra .code-route,.share-page .share-extra .outcome{border:0;padding:0}.share-page .share-extra .run-evidence{margin-top:14px}.share-page .site-foot{max-width:1120px;margin:34px auto;padding:18px}.share-page a:focus-visible{outline:3px solid #1258f4;outline-offset:3px}@media(max-width:760px){.share-page .share-shell{display:flex;flex-direction:column;margin:0;padding:0;gap:0}.share-page .share-main{width:100%;border-radius:0;border-left:0;border-right:0;box-shadow:none}.share-page .share-side{width:calc(100% - 24px);margin:18px 12px;border-radius:12px}.share-page .share-author{padding:18px 18px}.share-page .share-copy{padding:21px 18px 25px}.share-page .share-extra{padding:18px}.share-page .public-run-photo-grid figure img{height:260px!important}.share-page .public-run-photo-grid[data-media-count="3"]{grid-template-rows:repeat(2,130px)}.share-page .public-run-photo-grid[data-media-count="3"] figure img{height:100%!important}.share-page .public-run-photo-grid figcaption{bottom:6px;left:6px;font-size:10px}.share-page .share-stats dd{font-size:27px}.share-page .share-stats>div{padding:16px 6px}.share-page .share-quote{min-height:250px;padding:28px 22px}.share-page .share-actions a.open{margin-left:0;width:100%;justify-content:center}.share-page .public-nav{padding:8px 14px}.share-page .public-nav .open{font-size:12px}}`;
const shareTail=`.share-page .share-shell{display:block;max-width:860px}.share-page .share-side{margin-top:20px}.share-page .share-side ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.share-page .share-side li{border:0;border-left:1px solid #e7eaf0;padding:2px 14px}.share-page .share-side li:first-child{border:0;padding-left:0}.share-page .share-extra{padding:0}.share-page .share-extra>summary{cursor:pointer;padding:18px 30px;color:#485571;font-size:13px;font-weight:700}.share-page .share-extra-inner{padding:0 30px 26px}.share-page .share-extra-inner .run-context{margin-top:12px}@media(max-width:760px){.share-page .share-side ul{display:block}.share-page .share-side li,.share-page .share-side li:first-child{border:0;border-top:1px solid #e7eaf0;padding:12px 0}.share-page .share-side li:first-child{border:0}.share-page .share-extra>summary{padding:16px 18px}.share-page .share-extra-inner{padding:0 18px 22px}}`;
const shareSecond=`.share-page .share-shell{max-width:1100px}.share-page .public-nav,.share-page .site-foot{max-width:1100px}.share-page .site-foot{display:flex;flex-wrap:wrap;gap:8px 18px;color:#64718a;font-size:13px}.share-page .share-author{padding:20px 28px}.share-page .share-avatar{width:52px;height:52px;flex:none;overflow:hidden}.share-page .share-avatar img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}.share-page .public-run-photo-grid{gap:3px;background:#fff}.share-page .public-run-photo-grid figure{background:#d9e1f0}.share-page .public-run-photo-grid figure a{display:block;width:100%;height:100%}.share-page .public-run-photo-grid figure img,.share-page .public-project-shots figure img{width:100%;height:100%!important;object-fit:cover!important;background:none}.share-page .public-run-photo-grid figcaption{display:none}.share-page .public-run-photo-grid[data-media-count="3"]{grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);grid-template-rows:repeat(2,220px)}.share-page .public-run-photo-grid[data-media-count="3"] figure:first-child{grid-row:span 2}.share-page .public-run-photo-grid[data-media-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:360px}.share-page .public-run-photo-grid[data-media-count="1"]{grid-template-columns:1fr;grid-template-rows:460px}.share-page .share-copy{padding:30px 38px 38px}.share-page .share-caption{max-width:720px}.share-page .share-stats{border:0;gap:22px;margin:28px 0 30px}.share-page .share-stats>div,.share-page .share-stats>div:first-child{border:0;padding:0}.share-page .share-stats dt{font-size:13px;font-weight:700;color:#61708b}.share-page .share-stats dd{font-size:clamp(36px,4.2vw,56px);line-height:1.03;letter-spacing:-.055em;color:#172445;margin:7px 0 0}.share-page .share-route-bars{height:145px;gap:3px;border:0;align-items:end}.share-page .share-route-bars i{border-radius:8px 8px 3px 3px;min-height:4px}.share-page .share-route-fact{color:#445571;font-size:14px;font-weight:700;margin:13px 0 0}.share-page .share-actions{gap:9px}.share-page .share-actions a.share-social{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid #b8c8e5;border-radius:999px;color:#244370;font-size:13px}.share-page .share-actions a.open{min-height:44px}.share-page .share-source-note h2{font-size:14px}.share-page .share-source-note p{white-space:pre-line;color:#485571}@media(max-width:760px){.share-page .share-author{padding:17px 18px}.share-page .public-run-photo-grid[data-media-count="3"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,145px)}.share-page .public-run-photo-grid[data-media-count="3"] figure:first-child{grid-column:1/-1;grid-row:1;aspect-ratio:4/3}.share-page .public-run-photo-grid[data-media-count="3"]{grid-template-rows:auto 145px}.share-page .public-run-photo-grid[data-media-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:220px}.share-page .public-run-photo-grid[data-media-count="1"]{grid-template-rows:auto}.share-page .public-run-photo-grid[data-media-count="1"] figure{aspect-ratio:4/3}.share-page .share-copy{padding:22px 18px 28px}.share-page .share-stats{gap:8px;margin:26px 0}.share-page .share-stats dt{font-size:11px}.share-page .share-stats dd{font-size:clamp(27px,8vw,36px)}.share-page .share-route-bars{height:130px;gap:2px}.share-page .share-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.share-page .share-actions a.share-social{padding:0 8px}.share-page .share-actions a.open{grid-column:1/-1;width:100%;margin:0}}`;
const shareCardStyle=`.share-page .share-shell{max-width:720px;display:block}.share-page .share-main{width:100%;max-width:680px;margin:0 auto}.share-page .share-side{max-width:680px;margin:20px auto 0}.share-page .share-author img{width:52px;height:52px;border-radius:50%;object-fit:cover}.share-page .share-quote{min-height:310px}.share-page .share-extra-inner{padding:20px 30px}@media(max-width:760px){.share-page .share-shell{max-width:none}.share-page .share-main{max-width:none}.share-page .share-side{max-width:none}.share-page .share-extra-inner{padding:18px}}`;
const shareFooterStyle=`.share-page .share-foot{display:block;max-width:680px;margin:24px auto 0;padding:0 18px;color:#64718a}.share-page .share-foot details{width:max-content;max-width:100%}.share-page .share-foot summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;list-style:none;font-size:13px;font-weight:600}.share-page .share-foot summary::-webkit-details-marker{display:none}.share-page .share-foot summary::after{content:'⌄';font-size:18px;line-height:1;transform:translateY(-2px)}.share-page .share-foot details[open] summary::after{transform:rotate(180deg) translateY(2px)}.share-page .share-foot nav{display:flex;flex-wrap:wrap;gap:4px 18px;max-width:360px;padding:4px 0 12px}.share-page .share-foot nav a{display:inline-flex;align-items:center;min-height:36px;font-size:13px}@media(max-width:760px){.share-page .share-foot{margin-top:16px;padding:0 18px}.share-page .share-foot nav{display:grid;gap:2px}}`;
const shareMakeStyle=`.share-page .share-make{max-width:680px;margin:20px auto 0;background:#fff;border:1px solid #e5e8ef;border-radius:16px;padding:20px 24px}.share-page .share-make h2{font-size:17px;margin:0 0 6px}.share-page .share-make p{color:#485571;margin:0 0 14px;font-size:14px;line-height:1.5}.share-page .share-make a.open{border-radius:999px;min-height:44px;font-weight:700}@media(max-width:760px){.share-page .share-make{margin:18px 12px 0;border-radius:12px;padding:18px}}`;
const wholePhotoStyle=`
/* Same lossless source-shape rules as the browser card. Captions get a separate row. */
.share-page .public-run-photo-grid,.public-run-photo-grid{display:grid;gap:8px;overflow:visible}
.share-page .public-run-photo-grid[data-media-count],.public-run-photo-grid[data-media-count]{height:auto;grid-template-rows:none;grid-template-columns:repeat(2,minmax(0,1fr))}
.share-page .public-run-photo-grid[data-media-count="1"],.public-run-photo-grid[data-media-count="1"]{grid-template-columns:1fr}
.share-page .public-run-photo-grid[data-media-count] figure,.public-run-photo-grid[data-media-count] figure{display:grid;grid-template-rows:minmax(0,1fr) 24px;grid-column:auto;grid-row:auto;width:100%;height:auto;min-height:180px;max-height:440px;aspect-ratio:var(--image-aspect,4 / 3);margin:0;background:#f5f7fa}
.share-page .public-run-photo-grid[data-media-count] figure:first-child,.public-run-photo-grid[data-media-count] figure:first-child{grid-column:auto;grid-row:auto;aspect-ratio:var(--image-aspect,4 / 3)}
.share-page .public-run-photo-grid[data-media-count="3"] figure:first-child,.public-run-photo-grid[data-media-count="3"] figure:first-child{grid-column:1/-1}
.share-page .public-run-photo-grid[data-media-count] figure>a,.public-run-photo-grid[data-media-count] figure>a{display:block;position:relative;width:100%;height:100%;min-height:0;grid-column:1;grid-row:1}
.share-page .public-run-photo-grid[data-media-count] figure img,.public-run-photo-grid[data-media-count] figure img{display:block;width:100%;height:100%!important;min-height:0;max-height:none;object-fit:contain!important;object-position:center!important;background:#f5f7fa}
.share-page .public-run-photo-grid[data-media-count] figcaption,.public-run-photo-grid[data-media-count] figcaption{display:block;position:relative;inset:auto;grid-column:1;grid-row:2;height:24px;margin:0;padding:4px 32px 4px 8px;box-sizing:border-box;border-radius:0;background:transparent;box-shadow:none;font-size:11px;line-height:16px;overflow:hidden;color:#64718a}
.public-run-photo-grid .media-more-count{position:absolute;top:auto;right:5px;bottom:-23px;padding:1px 4px;font-size:11px;line-height:20px}
@media(max-width:760px){.share-page .public-run-photo-grid[data-media-count] figure,.public-run-photo-grid[data-media-count] figure{max-height:390px;min-height:140px}}
`;
const pageHead=`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght%40400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/feed.css"><link rel="stylesheet" href="/activity.css"><link rel="stylesheet" href="/run-media-frame.css"><style>${pageStyle}${publicStyle}${projectStyle}${shareStyle}${shareTail}${shareSecond}${shareCardStyle}${shareFooterStyle}${shareMakeStyle}${wholePhotoStyle}</style><link rel="icon" href="/favicon.svg" type="image/svg+xml">`;
// The same footer the site's own pages carry.
const siteFoot='<footer class="site-foot"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/Morkeeth/strive/issues">Contact</a><a href="/privacy#deletion">Delete your data</a></footer>';
const shareFoot='<footer class="site-foot share-foot"><details><summary>Info</summary><nav aria-label="Information and policies"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/Morkeeth/strive/issues">Contact</a><a href="/privacy#deletion">Delete your data</a></nav></details></footer>';
// How many XUDOS a public run has. The acks policy lets anyone read the acks of a run they can
// read, and this is only called for a row that came back public. A failed read returns null and
// the heart is drawn without a number rather than with a zero nobody measured.
export async function readKudos(id,fetcher=fetch){
 if(!validId(id))return null;
 try{
  const query=new URLSearchParams({run_id:'eq.'+id,select:'run_id'});
  const response=await fetcher(config.SB_URL+'/rest/v1/acks?'+query,{headers:{apikey:config.SB_KEY,"Accept-Profile":config.SB_SCHEMA},cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(!response.ok)return null;const rows=await response.json();
  return Array.isArray(rows)?rows.filter(row=>row&&row.run_id===id).length:null;
 }catch(_){return null}
}
// Public photo metadata is read with the configured anonymous key. Database RLS is the first
// access check; the public run passed here is the second. The page receives only identifiers and
// dimensions, then loads bytes through /api/run-photos so no Storage URL can escape into HTML.
export async function readPublicPhotos(run,fetcher=fetch){
 if(!run||run.visibility!=='public'||!validId(run.id))return [];
 try{
  const query=new URLSearchParams({run_id:'eq.'+run.id,is_selected:'eq.true',is_private:'eq.false',select:'id,run_id,width,height,byte_size,created_at,is_cover,role,is_selected,is_private,sort_position,personal_public_selected',order:'sort_position.asc,created_at.asc,id.asc',limit:'6'});
  const response=await fetcher(config.SB_URL+'/rest/v1/run_photos?'+query,{headers:{apikey:config.SB_KEY,"Accept-Profile":config.SB_SCHEMA},cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(!response.ok)return [];
  const rows=await response.json();
  if(!Array.isArray(rows))return [];
  return rows.filter(photo=>validId(photo?.id)&&photo?.run_id===run.id&&photo.is_selected!==false&&photo.is_private!==true&&(photo.role!=='personal'||photo.personal_public_selected===true)).slice(0,6).map(photo=>({
   id:photo.id,run_id:photo.run_id,role:photo.role,is_cover:photo.is_cover===true,is_selected:photo.is_selected!==false,sort_position:photo.sort_position,personal_public_selected:photo.personal_public_selected===true,
   width:Number.isInteger(photo.width)&&photo.width>0?photo.width:null,
   height:Number.isInteger(photo.height)&&photo.height>0?photo.height:null
  }));
 }catch(_){return []}
}
// A stored row is untrusted input: it was written by an agent through the upload endpoint. Every
// link is re-checked here before it reaches a signed-out page, with the same rule the database and
// the browser contract use.
const safeUrl=u=>typeof u==='string'&&u.length>=12&&u.length<=300&&/^https:\/\//.test(u)&&!/[\s<>"'\\]/.test(u)&&!/javascript:/i.test(u);
const outcomeLink=(href,text)=>safeUrl(href)?`<a href="${esc(href)}" rel="noopener noreferrer nofollow">${esc(text)}</a>`:'';
// Declared by the uploader, never measured, so this block sits under its own heading and never
// joins the counts. No remote image is embedded: an arbitrary third party host would learn the IP
// and user agent of every visitor to a public page, and a dead link would show a broken box. The
// screenshot is offered as a link the reader chooses to open.
const pageOutcome=run=>{
 const parts=[];
 if(safeUrl(run.repo_url))parts.push(`<p class="outcome-repo">${outcomeLink(run.repo_url,String(run.repo_url).replace(/^https:\/\//,''))}</p>`);
 const shipped=Array.isArray(run.shipped)?run.shipped.filter(l=>typeof l==='string'&&l.trim()).slice(0,5):[];
 if(shipped.length)parts.push(`<ul class="outcome-shipped">${shipped.map(l=>`<li>${esc(l.trim().slice(0,120))}</li>`).join('')}</ul>`);
 const links=(Array.isArray(run.receipts)?run.receipts:[]).filter(r=>r&&typeof r.label==='string'&&safeUrl(r.url)).slice(0,5)
  .map(r=>outcomeLink(r.url,r.label.trim().slice(0,60)));
 if(safeUrl(run.artifact_url))links.push(outcomeLink(run.artifact_url,'Open the demo'));
 if(safeUrl(run.image_url)&&/\.(png|jpe?g|webp)([?#].*)?$/i.test(run.image_url))links.push(outcomeLink(run.image_url,'Open the screenshot'));
 if(links.length)parts.push(`<p class="outcome-links">${links.join(' · ')}</p>`);
 return parts.length?`<section class="outcome"><h2>Said by the uploader, not measured</h2>${parts.join('')}</section>`:'';
};

const pagePhotos=(run,photos)=>{
 if(run?.visibility!=='public')return '';
 const projectFigures=run.id===FAVOUR_SHOWCASE?[
  ['/media/favour-public-page-20261010.webp','Public FAVOUR page · 10 Oct'],
  ['/media/favour-campaign-builder-20261010.webp','FAVOUR campaign builder · 10 Oct']
 ].map(([src,label])=>`<figure><a href="${src}" aria-label="Open full ${esc(label)} image"><img src="${src}" alt="${esc(label)}" loading="lazy"></a><figcaption>${esc(label)} · project context, not proof of this session</figcaption></figure>`).join(''):'';
 const all=(Array.isArray(photos)?photos:[]).filter(photo=>validId(photo?.id)&&photo?.run_id===run.id&&photo.is_selected!==false&&photo.is_private!==true&&(photo.role!=='personal'||photo.personal_public_selected===true)).slice(0,6);
 const before=all.find(p=>p.role==='before'),after=all.find(p=>p.role==='after');
 const cover=all.find(p=>p.is_cover)||(all.length===1?all[0]:null);
 const chosen=run.photo_layout==='before_after'&&before&&after?[before,after]:[run.photo_layout==='result'?(all.find(p=>p.role==='result')||cover):cover].filter(Boolean);
 // A candid photo is an author's deliberate cover choice. Keep supporting images,
 // but do not turn older multi-photo uploads into a gallery of personal photos.
 const personal=all.find(p=>p.role==='personal'&&p.personal_public_selected===true);
 const projectFirst=run.photo_layout==='result'&&run.capture_metadata?.estimates?.v===1;
 const allowed=[...chosen,...all.filter(p=>!chosen.includes(p))].filter(p=>p.role!=='personal'||p===personal);
 const ordered=all.every(p=>Number.isInteger(p.sort_position));
 const safe=ordered?[...all].sort((a,b)=>a.sort_position-b.sort_position):projectFirst?[...allowed.filter(p=>p.role!=='personal'),...allowed.filter(p=>p.role==='personal')]:allowed;
 const visible=ordered?safe.slice(0,3):safe.length>3?(personal?[...safe.filter(p=>p!==personal).slice(0,2),personal]:safe.slice(0,3)):safe;
 const missingProject=!ordered&&projectFirst&&!safe.some(p=>p.role!=='personal')?`<figure class="run-project-missing">${Placeholders.render('screenshot',{story:run.caption||run.title})}</figure>`:'';
 if(!safe.length&&!projectFigures)return `<div class="run-detail-story">${Placeholders.render('image',{story:run.caption||run.title,harness:run.harness,model:run.model||(run.capture_metadata?.models||[]).join(', '),seed:run.id,width:640,height:280})}</div>`;
 return `<section class="public-run-photos${projectFigures?' public-project-shots':''}" aria-labelledby="public-run-photos-title"><h2 id="public-run-photos-title">Images from this run</h2><div class="public-run-photo-grid" data-media-count="${Math.min(3,visible.length+(missingProject?1:0)+(projectFigures?2:0))}">${missingProject}${visible.map((photo,index)=>{const caption=({result:"Result",before:"Before",after:"After"})[photo.role];const src=`/api/run-photos?id=${encodeURIComponent(photo.id)}&run_id=${encodeURIComponent(run.id)}&w=960`;const size=Number.isInteger(photo.width)&&photo.width>0&&Number.isInteger(photo.height)&&photo.height>0?` width="${photo.width}" height="${photo.height}"`:'';return `<figure data-photo-role="${esc(photo.role)}" data-image-shape="${PhotoFrame.rule(photo.width,photo.height).shape}" style="--image-aspect:${PhotoFrame.rule(photo.width,photo.height).aspect}"><a href="#image-${esc(photo.id)}" aria-label="Open full image"><img src="${esc(src)}" alt="${esc(({result:'Result',before:'Before',after:'After',personal:'Personal photo'})[photo.role]||'Run photo')}"${size} loading="${index===0?'eager':'lazy'}" fetchpriority="${index===0?'high':'low'}">${index===2&&safe.length>3?`<span class="media-more-count">+${safe.length-3}</span>`:''}</a>${caption?`<figcaption>${caption}</figcaption>`:""}</figure>`;}).join('')}${projectFigures}</div></section>${safe.map((p,i)=>`<aside class="public-image-lightbox" id="image-${esc(p.id)}" aria-label="Full image"><nav><a href="#image-${esc(safe[(i-1+safe.length)%safe.length].id)}">← Previous</a><a href="#public-run-photos-title">Close ×</a><a href="#image-${esc(safe[(i+1)%safe.length].id)}">Next →</a></nav><img src="/api/run-photos?id=${encodeURIComponent(p.id)}&run_id=${encodeURIComponent(run.id)}" alt="${esc(p.role==='personal'?'Selected personal photo':'Project image')}" loading="lazy"></aside>`).join('')}`;
};

const routeInsight=route=>{
 if(!route||typeof route!=='object'||Array.isArray(route)||route.v!==1||route.unavailable)return '';
 const projects=Array.isArray(route.projects)?route.projects:[];
 const stops=Array.isArray(route.stops)?route.stops:[];
 if(!projects.length||!stops.length)return '';
 const connectors=Array.isArray(route.connectors)?route.connectors:[];
 const handoffs=connectors.filter(c=>c&&c.kind==='handoff');
 const measured=stops.filter(s=>s&&s.basis==='measured').length;
 const declared=stops.filter(s=>s&&s.basis==='declared').length;
 const counts=Object.create(null);
 for(const stop of stops){if(!stop||!stop.project)continue;counts[stop.project]=(counts[stop.project]||0)+1;}
 let densest=null,densestN=0,ties=0;
 for(const project of projects){const n=counts[project.id]||0;if(n>densestN){densest=project;densestN=n;ties=1;}else if(n===densestN&&n>0)ties+=1;}
 const finishStop=route.finish&&stops.find(s=>s.id===route.finish.stop);
 const finishProject=finishStop&&projects.find(p=>p.id===finishStop.project);
 const parts=[];
 if(densest&&ties===1&&densestN>0&&densestN<stops.length)parts.push(densest.label+' held the densest stretch ('+densestN+' of '+stops.length+' stops)');
 if(handoffs.length){
  if(finishProject&&densest&&finishProject.id!==densest.id)parts.push(handoffs.length+(handoffs.length===1?' handoff carried the work to ':' handoffs carried the work to ')+finishProject.label);
  else parts.push(handoffs.length+(handoffs.length===1?' handoff across the route':' handoffs across the route'));
 }
 if(measured+declared===stops.length){
  if(declared===0&&measured===stops.length)parts.push('every stop is measured');
  else if(declared>0)parts.push(measured+' measured, '+declared+' declared');
 }
 if(route.finish&&route.finish.kind==='artifact'&&route.finish.label&&parts.length<2)parts.push('finish '+route.finish.label);
 if(!parts.length)return '';
 return parts[0]+parts.slice(1).map(part=>'. '+part.charAt(0).toUpperCase()+part.slice(1)).join('')+'.';
};

const pageCodeRoute=run=>{
 if(Checkpoints.claimed(run))return ""; // The shared card contains the same inspected checkpoint view as the app.
 const route=run&&run.code_route;
 if(!route||route.v!==1)return '';
 if(route.unavailable){
  const harness=route.harnesses?`<p class="code-route-harnesses">Harness populations · basis ${esc(route.harnesses.basis)} · observed: ${(route.harnesses.observed||[]).map(esc).join(', ')||'none'} · absent: ${(route.harnesses.absent||[]).map(esc).join(', ')||'none'}</p>`:'';
  return `<section class="code-route"><h2>Code Route</h2><p class="code-route-why">${esc(route.unavailable.why||'')}</p>${harness}</section>`;
 }
 const projects=Array.isArray(route.projects)?route.projects:[];
 const stops=Array.isArray(route.stops)?route.stops:[];
 if(!projects.length||!stops.length)return '';
 const idx=Object.fromEntries(projects.map((p,i)=>[p.id,i]));
 const left=28,width=360,rowH=28,top=18,height=top+projects.length*rowH+12;
 const finishId=route.finish&&route.finish.stop;
 const handoffTo=new Set((Array.isArray(route.connectors)?route.connectors:[]).filter(c=>c&&c.kind==='handoff'&&c.to).map(c=>c.to));
 const insight=routeInsight(route);
 const counts=Object.create(null);for(const stop of stops){if(stop&&stop.project)counts[stop.project]=(counts[stop.project]||0)+1;}
 let dense=null,denseN=0,ties=0;for(const p of projects){const n=counts[p.id]||0;if(n>denseN){dense=p;denseN=n;ties=1;}else if(n===denseN&&n>0)ties+=1;}
 const denseId=ties===1&&denseN>0?dense.id:null;
 const points=stops.map((stop,i)=>{const row=idx[stop.project]??0;const x=left+(i*(width-left-16))/Math.max(1,stops.length-1);const y=top+row*rowH+rowH/2;return {stop,x,y,finish:stop.id===finishId,handoff:handoffTo.has(stop.id)};});
 const line=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
 const dots=points.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.finish?5.5:p.handoff?4.5:3.5}" fill="${p.finish?'#111':'#123cff'}" ${p.handoff&&!p.finish?'stroke="#111" stroke-width="1.5"':''}/>`).join('');
 const lanes=projects.map((p,i)=>{const y=top+i*rowH+rowH/2+4;return `<text x="0" y="${y}" fill="#596174" font-size="11">${i+1}</text>`;}).join('');
 const projectList=projects.map((p,i)=>`<li${denseId===p.id?' data-dense="1"':''}><span class="code-route-lane-mark" aria-hidden="true">${i+1}</span><span class="code-route-project-name">${esc(p.label)}</span></li>`).join('');
 const names=projects.map(p=>p.label).join(', ');
 const measured=stops.filter(s=>s.basis==='measured').length,declared=stops.filter(s=>s.basis==='declared').length;
 const aria=`Code Route across ${projects.length} projects: ${names}. ${stops.length} ordered checkpoints · ${measured} measured · ${declared} declared${insight?' · '+insight:''}`;
 const stopList=stops.map(stop=>{const project=projects.find(p=>p.id===stop.project);const lane=project?(idx[project.id]??0)+1:null;const evidence=Array.isArray(stop.evidence)&&stop.evidence.length?`<ul>${stop.evidence.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:'';return `<details class="code-route-point"${stop.id===finishId?' data-finish="1"':''}><summary><span class="code-route-kind">${esc(stop.kind)}</span><span class="code-route-stop-label">${esc(stop.label)}</span><span class="code-route-basis">${esc(stop.basis)}</span>${project?`<span class="code-route-stop-project">${lane!=null?`${lane} · `:''}${esc(project.label)}</span>`:''}</summary>${evidence}</details>`;}).join('');
 const harness=route.harnesses?`<p class="code-route-harnesses">Harness populations · basis ${esc(route.harnesses.basis)} · observed: ${(route.harnesses.observed||[]).map(esc).join(', ')||'none'} · absent: ${(route.harnesses.absent||[]).map(esc).join(', ')||'none'}</p>`:'';
 return `<section class="code-route" aria-label="${esc(aria)}"><h2>Code Route</h2><svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true"><path class="code-route-line" pathLength="1" d="${line}" fill="none" stroke="#123cff" stroke-width="2.5"/>${dots}${lanes}</svg><ol class="code-route-projects">${projectList}</ol>${insight?`<p class="code-route-insight">${esc(insight)}</p>`:''}<div class="code-route-stops">${stopList}</div>${harness}</section>`;
};

const shareStats=run=>{
 const values=[['Commits',run.commits],['Files changed',run.files_touched],['Elapsed',shareDuration(run.wall_time_s??run.duration_s)],['Typed turns',run.prompts],['Tool calls',toolCallCount(run)]];
 const shown=values.filter(([,value])=>typeof value==='string'?value.length>0:Number.isFinite(value)&&value>=0).slice(0,3);
 return shown.length?`<dl class="share-stats" aria-label="Recorded facts">${shown.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(typeof value==='number'?value.toLocaleString('en-US'):value)}</dd></div>`).join('')}</dl>`:'';
};
const shareRoute=run=>{
 const trace=series(run);if(!trace||trace.values.length<8)return '';
 const peak=Math.max(...trace.values,1);
 const bars=trace.values.map(value=>`<i style="height:${Math.max(3,Math.round(value/peak*100))}%" aria-hidden="true"></i>`).join('');
 const fact=Number.isInteger(run.commits)&&run.commits>0?`${run.commits} recorded ${run.commits===1?'commit':'commits'}${Number.isInteger(run.files_touched)&&run.files_touched>0?` across ${run.files_touched} ${run.files_touched===1?'file':'files'}`:''}.`:null;
 return `<section class="share-route" aria-label="${esc(trace.label)}"><div class="share-route-head"><h2>Activity along the route</h2><span>${esc(trace.label)}</span></div><div class="share-route-bars" role="img" aria-label="${esc(trace.label)} across ${trace.values.length} recorded intervals">${bars}</div>${fact?`<p class="share-route-fact">${esc(fact)}</p>`:''}</section>`;
};
const shareMore=run=>{
 const rows=(Array.isArray(run)?run:[]).filter(item=>item?.visibility==='public'&&validId(item.id)&&runPath(item)).slice(0,3);
 return rows.length?`<aside class="share-side"><h2>More from this builder</h2><ul>${rows.map(item=>`<li><a href="${esc(runPath(item))}">${esc(Feed.titleOf(item))}</a><small>${esc(item.project||'Public run')}</small></li>`).join('')}</ul></aside>`:'';
};
// A stranger who opened a shared run has no way in except this. Same words as the README.
const makeYourOwn=`<aside class="share-make" aria-labelledby="share-make-title"><h2 id="share-make-title">Make a card like this</h2><p>Turn a Claude Code, Cursor or Codex session on your own computer into a private run. The capture stays on your machine until you deliberately save it.</p><a class="open" href="/?post">Add your run</a></aside>`;
// What the link image shows, for readers who cannot see it: title, builder, facts and agent.
const imageAlt=run=>{const who=Feed.profileOf(run),facts=LinkPreview.previewMetrics(run).map(([label,value])=>`${value} ${label.toLowerCase()}`),agent=run.harness?Agents.agentName(run.harness):'';
 return `${BRAND} run card: ${wholeWords(Feed.titleOf(run),90)} by ${who.name||'a builder'}${facts.length?' · '+facts.join(' · '):''}${agent?' · '+agent:''}`;};
export function html(run,opts={}){const title=esc(Feed.titleOf(run)),insight=Checkpoints.claimed(run)?'':routeInsight(run&&run.code_route),summary=String(run.caption||'').split(/\r?\n/).find(Boolean)||Feed.cardSummary(run)||insight||'See the work and its recorded activity.',description=esc(wholeWords(summary.match(/^[^.!?]+[.!?]/)?.[0]||summary,105)),shareTitle=esc(wholeWords(Feed.titleOf(run),70)),id=encodeURIComponent(run.id),image=shareOrigin+'/api/og?run='+id+'&v=5',url=shareOrigin+(runPath(run)||'/r/'+id),alt=esc(imageAlt(run));
 const handle=run.profiles?.handle||run.profiles?.github_handle;
 const profileHref=profilePath(handle)||'';
 // opts.kudos is the count readKudos returned: a number, or null when it could not be read.
 // The stride line is selectable text. The shared page stays script-free; its action links
 // use the explicit app route, while its canonical URL and sharing address stay clean.
 const appRun='/?legacy=1&run='+id;
 const output=outputKind(run)&&safeUrl(run.output_url)?`<a class="output" href="${esc(run.output_url)}" rel="noopener noreferrer">View linked output</a>`:'';
 const name=run.profiles?.display_name||handle||'A builder',initial=String(name).trim().charAt(0).toUpperCase()||'S';
 const avatar=typeof opts.avatar==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(opts.avatar)?`<img src="${opts.avatar}" alt="" width="52" height="52">`:esc(initial);
 const created=Date.parse(run.started_at||run.created_at),day=Number.isFinite(created)?new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric'}).format(created):'';
 // The agent and its models by the names a person reads, each with its maker's mark.
 const who=Agents.agent(run.harness),label=run.model?Agents.model(run.model):null;
 const chips=[who&&{name:who.name,maker:who.maker},...Agents.recordedModels(run),label].filter(Boolean);
 const uniqueChips=chips.filter((chip,i)=>chips.findIndex(other=>other.name===chip.name)===i).slice(0,3);
 const photos=pagePhotos(run,opts.photos),hasPhotos=photos.includes('public-run-photos'),hero=hasPhotos?photos:`<div class="share-quote"><span aria-hidden="true">“</span><p>${esc(wholeWords(run.caption||Feed.titleOf(run),220))}</p></div>`;
 const story=String(run.story_result||'').trim(),caption=String(run.caption||'').trim();
 const provenanceAt=caption.search(/\b(?:the )?project screenshots (?:show|are)\b/i);
 const captionLead=provenanceAt>0?caption.slice(0,provenanceAt).trim():caption;
 const captionProvenance=provenanceAt>0?caption.slice(provenanceAt).trim():'';
 const displayDescription=captionLead||story;
 const storySection=run.story_next?`<section class="share-story"><h2>What’s next</h2><p>${esc(run.story_next)}</p></section>`:'';
 const storyProvenance=story.match(/Project screenshots:[\s\S]*/i)?.[0]||'';
 const sourceText=storyProvenance||captionProvenance||(caption&&story&&story!==caption?story:'');
 const sourceNote=sourceText?`<section class="share-source-note"><h2>Builder’s note</h2><p>${esc(sourceText)}</p></section>`:'';
 const kudos=Number.isInteger(opts.kudos)&&opts.kudos>=0?` ${opts.kudos}`:'';
 const more=shareMore(opts.moreRuns);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${BRAND}</title><meta property="og:type" content="article"><meta property="og:site_name" content="${BRAND}"><meta property="og:title" content="${shareTitle}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${alt}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${shareTitle}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="${alt}"><link rel="canonical" href="${url}">${pageHead}</head><body class="share-page"><main><nav class="public-nav" aria-label="STRIVE"><a class="home" href="/" aria-label="${BRAND} home">${BRAND}</a><a class="open" href="${appRun}">Open in STRIVE →</a></nav><div class="share-shell"><article class="share-main"><header class="share-author"><span class="share-avatar" aria-hidden="true">${avatar}</span><div><div class="share-name">${profileHref?`<a href="${esc(profileHref)}">${esc(name)}</a>`:esc(name)}</div><div class="share-meta">${esc(day)}${run.harness?` · ${esc(Agents.agentName(run.harness))}`:''}</div></div></header>${hero}<div class="share-copy"><span class="share-type">Agent run${run.project?` · ${esc(run.project)}`:''}</span><h1>${title}</h1>${displayDescription&&hasPhotos?`<p class="share-caption">${esc(displayDescription)}</p>`:''}${shareStats(run)}${shareRoute(run)}${uniqueChips.length?`<div class="share-chips" aria-label="Tools and models">${uniqueChips.map(chip=>`<span${chip.id&&chip.id!==chip.name?` title="${esc(chip.id)}"`:''}>${Agents.markSvg(chip.maker,{size:14})}${esc(chip.name)}</span>`).join('')}</div>`:''}${storySection}<div class="share-actions"><a class="share-social" href="${appRun}#grind-thread">♥ XUDOS${kudos}</a><a class="share-social" href="${appRun}#grind-thread">Comments</a><a class="open" href="${appRun}">Open in STRIVE →</a></div></div><details class="share-extra"><summary>Recorded details and sources</summary><div class="share-extra-inner">${sourceNote}${pageCodeRoute(run)}${pageOutcome(run)}${output}${Context.headlineHtml(run)}${Context.measurementDetails(run)}${Context.setup(run)}${Context.metrics(run)}${Evidence.detail(run)}</div></details></article>${more}${makeYourOwn}</div></main>${shareFoot}</body></html>`;
}
// The page for a run that is missing or not public. Same words as privateCard, same neutral
// image, and nothing from a row, because there is no row: the public-only query returns
// nothing for a close friends, link or only-me run exactly as it does for an id that never
// existed, and the page must not tell those apart. The run link goes to /?run=id, where a
// signed-in reader who was given access can open it.
export function neutralHtml(id){const safe=encodeURIComponent(id),image=origin+'/api/run?id='+safe+'&image=1',url=origin+'/r/'+safe,title=esc(`This run is private on ${BRAND}`),description='Sign in and open the shared run link to check your access.';
 // Crawlers and strangers keep this neutral card. A signed-in permitted reader is sent to
 // /?run=<id>, where the SPA enforces follow or close-friends before showing the truthful card.
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="robots" content="noindex"><meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}">${pageHead}</head><body><main><a class="home" href="/" aria-label="${BRAND} home">${BRAND}</a><article class="private-card"><h1>${title}</h1><p>${description}</p><a class="open" href="/?run=${safe}">Sign in and open the run</a></article></main>${siteFoot}<script>try{var id=${JSON.stringify(String(id||''))};if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))location.replace("/?run="+encodeURIComponent(id))}catch(e){}</script></body></html>`;
}
const el=(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}});
// The persisted ridge wins when the run carries one. It is the same 40 to 60 bins the run page
// draws (site/run-contract.js, function ridge), so the share image and the page agree. A run
// saved before migration 003 has no bins and keeps its rhythm polyline.
// A workspace name is a flattened absolute path, so it arrives with the account name in front of
// it: `Users-morkeeth-code-app`, or a bare `Users-morkeeth` when the session was opened on the
// home directory. Production 7858535 printed that slug as "Project touched" on the share image a
// stranger meets first. Same rule as site/run-contract.js projectLabel and ingest.project_label;
// tests/fixtures/project_label_probe.mjs runs one table of cases through all three.
const HOME_SLUG=/^-?(?:Users|home)-[^-]+(?:-|$)/;
const projectName=run=>{
 let value=typeof run.project==='string'?run.project.trim():'';
 if(!value||['session','unknown','project unknown'].includes(value.toLowerCase()))return null;
 const unslugged=value.replace(HOME_SLUG,'');
 if(unslugged!==value)value=unslugged;
 if(!value)return null;
 // `CODE-` is one author's worktree convention and is matched as written. It was
 // case-insensitive, which was harmless while a home slug hid what followed it and wrong the
 // moment the slug came off: `Users-alice-code-myapp` cleaned to `code-myapp`, and a lowercase
 // `code-` is a directory somebody named, not a convention to strip.
 const cleaned=value.replace(/^CODE-(?:worktrees-)?/,'').replace(/-\d{8}$/,'');
 // Only turn dashes into spaces when we stripped a worktree prefix or date stamp.
 if(cleaned!==value)value=cleaned.replace(/-/g,' ').replace(/\s+/g,' ').trim();
 else value=cleaned;
 return value||null;
};
// Exported for tests/fixtures/project_label_probe.mjs, which runs one table of workspace names
// through this reader, the browser contract and the Python one, so the three cannot drift.
export const projectNameForTest=projectName;
const outputKind=run=>{
 try{
  const url=new URL(run.output_url);
  if(!/^https?:$/.test(url.protocol))return null;
  if(/github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(url.href))return'PR linked';
  if(/\.(png|jpe?g|webp)(?:[?#]|$)/i.test(url.href))return'Screenshot linked';
  return'Output linked';
 }catch(_){return null}
};
const codeRoutePlot=run=>{
 const measured=Checkpoints.model(run);
 if(Checkpoints.claimed(run))return null; // Sparse checkpoint counts are a receipt, not a route diagram.
 const route=measured||run&&run.code_route;
 if(!route||(!measured&&route.v!==1)||route.unavailable||!Array.isArray(route.projects)||!Array.isArray(route.stops)||!route.projects.length||!route.stops.length)return null;
 const idx=Object.fromEntries(route.projects.map((p,i)=>[p.id,i]));
 const n=Math.max(1,route.projects.length);
 return {measured:!!measured,connectors:route.connectors||[],projects:route.projects,stops:route.stops,idx,n,finish:route.finish&&route.finish.stop,stats:route.stats||{},label:measured?'Code Route · observed checkpoint order':(route.stats&&route.stats.projects_touched!=null)?`${route.stats.projects_touched} projects touched · Code Route`:'Code Route'};
};
// THE SHARE IMAGE is the feed card at 1200x630. The numbers come from the same functions the feed
// and /r/<id> use (Feed.headline, Feed.stats), so the image, the page and the feed cannot print
// different figures for one run. The image route may pass a bounded provider photo; otherwise
// the STRIVE route mark is drawn directly, with no guessed face.
const INK='#0a0a0a',SOFT='#6f6f6b',BLUE='#0047ff',WASH='#f2f5ff',BLUE_SOFT='#c4d2ff',RULE='#e3e3df',PAPER='#f7f7f5',ORANGE='#fc4c02';
export async function readAvatar(run,fetcher=fetch){
 if(run?.visibility!=='public')return null;
 const source=Feed.profileOf(run).avatar;
 const hosts=new Set(['github.com','avatars.githubusercontent.com','pbs.twimg.com']);
 const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&hosts.has(u.hostname)&&!u.username&&!u.password&&(u.port===''||u.port==='443')?u.href:null}catch(_){return null}};
 let url=allowed(source);
 if(!url)return null;
 try{
  let response;
  for(let hop=0;hop<4;hop++){
   response=await fetcher(url,{signal:AbortSignal.timeout(4000),redirect:'manual',headers:{Accept:'image/png,image/jpeg,image/webp'}});
   if(response.status<300||response.status>=400)break;
   const location=response.headers.get('location');
   if(!location||hop===3)return null;
   url=allowed(new URL(location,url).href);
   if(!url)return null;
  }
  if(!response.ok)return null;
  if(response.url&&!allowed(response.url))return null;
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!['image/png','image/jpeg','image/webp'].includes(type))return null;
  if(Number(response.headers.get('content-length')||0)>1_000_000)return null;
  const bytes=Buffer.from(await response.arrayBuffer());
  return bytes.length&&bytes.length<=1_000_000?`data:${type};base64,${bytes.toString('base64')}`:null;
 }catch(_){return null}
}
export function card(run,opts={}){
 const availableRoutePlot=codeRoutePlot(run);
 const availableSeries=series(run);
 const availableGeo=Feed.routeGeometry(run);
 const requested=run.hero_visual;
 const selected=requested==='activity_terrain'&&availableSeries?'activity_terrain'
  :requested==='change_atlas'&&(availableGeo||availableRoutePlot)?'change_atlas'
  :requested==='proof_route'&&availableRoutePlot?'proof_route'
  :requested==='result'?'result'
  :availableRoutePlot?'proof_route':availableSeries?'activity_terrain':availableGeo?'change_atlas':'result';
 const routePlot=selected==='proof_route'||(selected==='change_atlas'&&!availableGeo)?availableRoutePlot:null;
 const insight=routePlot&&!routePlot.measured?routeInsight(run.code_route):'';
 const plotted=selected==='activity_terrain'?availableSeries:null;
 const lead=null,facts=[];
 const who=Feed.profileOf(run);
 const name=run.visibility==='public'?who.name:run.visibility==='anonymous'?'Anonymous builder':'Builder';
 const badge=Feed.achievement(run);
 const avatar=run.visibility==='public'&&typeof opts.avatar==='string'&&opts.avatar.startsWith('data:image/')?opts.avatar:null;
 // The same line the page's card prints under the name: the agent and when.
 const meta=[Agents.agentName(run.harness),Feed.when(run.created_at||run.started_at)].filter(Boolean).join(' · ');
 const output=safeUrl(run.output_url)?'Work linked':'';
 const drawn=!!(plotted||routePlot);
 const W=1044;
 // THE RUN MAP, the same geometry the card draws (Feed.routeGeometry), scaled to the image.
 // The card's 300 by 44 drawing, scaled to the image: x by the width, y by a flatter 2.2 so the
 // map stays a strip, and every station still a circle.
 const geo=selected==='change_atlas'?availableGeo:null;
 const SX=W/300,SY=2.2,MAP_H=Math.round((geo?geo.h:44)*SY),RAIL_Y=(geo?geo.rail:30)*SY;
 const hop=d=>{const n=d.match(/-?[\d.]+/g).map(Number);return `M${(n[0]*SX).toFixed(1)},${(n[1]*SY).toFixed(1)} Q${(n[2]*SX).toFixed(1)},${(n[3]*SY).toFixed(1)} ${(n[4]*SX).toFixed(1)},${(n[5]*SY).toFixed(1)}`;};
 const map=geo?el('div',{style:{display:'flex',flexDirection:'column',marginTop:6}},
  el('svg',{width:W,height:MAP_H,viewBox:`0 0 ${W} ${MAP_H}`},
   el('line',{x1:12*SX,y1:RAIL_Y,x2:288*SX,y2:RAIL_Y,stroke:BLUE_SOFT,strokeWidth:2}),
   ...geo.hops.map(d=>el('path',{d:hop(d),fill:'none',stroke:BLUE,strokeWidth:2.4,strokeOpacity:0.4,strokeLinecap:'round'})),
   ...geo.stations.map(([cx,r])=>el('circle',{cx:cx*SX,cy:RAIL_Y,r:r*2,fill:'#fff',stroke:BLUE,strokeWidth:3}))),
  el('div',{style:{display:'flex',fontSize:17,color:SOFT,marginTop:0}},geo.label)):null;
 let drawing=null;
 if(plotted){
  // The page's rule for a short sitting (Feed.settle): a comb of ones and zeros is not a shape.
  const values=Feed.settle(plotted.values),max=Math.max(...values)||1,h=geo?52:110,top=10;
  const x=i=>i*W/(values.length-1),y=v=>h-v/max*(h-top);
  const points=values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const peak=values.indexOf(Math.max(...values));
  drawing=el('div',{style:{display:'flex',flexDirection:'column',marginTop:geo?8:18}},
   el('svg',{width:W,height:h,viewBox:`0 0 ${W} ${h}`},...(plotted.filled?[
    el('polygon',{points:`0,${h} ${points} ${W},${h}`,fill:WASH}),
    el('polyline',{points,stroke:BLUE,strokeWidth:4,strokeLinejoin:'round',strokeLinecap:'round',fill:'none'}),
    el('circle',{cx:x(peak),cy:y(values[peak]),r:9,fill:ORANGE,stroke:'#fff',strokeWidth:3})]:[
    el('polyline',{points,stroke:BLUE,strokeWidth:5,strokeLinejoin:'round',strokeLinecap:'round',fill:'none'})])));
 }else if(routePlot){
  const h=Math.max(70,routePlot.n*22+16);
  const at=(stop,i)=>({x:24+i/Math.max(1,routePlot.stops.length-1)*(W-48),y:12+(routePlot.idx[stop.project]||0)*22+11});
  drawing=el('div',{style:{display:'flex',flexDirection:'column',marginTop:14}},
   el('svg',{width:W,height:h,viewBox:`0 0 ${W} ${h}`},
    el('path',{d:routePlot.measured?routePlot.connectors.map(c=>{const ai=routePlot.stops.findIndex(s=>s.id===c.from),bi=routePlot.stops.findIndex(s=>s.id===c.to),a=at(routePlot.stops[ai],ai),b=at(routePlot.stops[bi],bi);return `M${a.x} ${a.y} L${b.x} ${b.y}`;}).join(' '):routePlot.stops.map((stop,i)=>{const p=at(stop,i);return `${i?'L':'M'}${p.x} ${p.y}`;}).join(' '),stroke:BLUE,strokeWidth:4,fill:'none'}),
    ...routePlot.stops.map((stop,i)=>{const p=at(stop,i),finish=!routePlot.measured&&routePlot.finish===stop.id;if(routePlot.measured&&stop.kind==='commit')return el('path',{d:`M${p.x} ${p.y-7} l7 7 -7 7 -7 -7Z`,fill:BLUE});return el('circle',{cx:p.x,cy:p.y,r:finish?8:5,fill:finish?ORANGE:BLUE});})),
   el('div',{style:{display:'flex',flexWrap:'wrap',fontSize:17,color:INK,marginTop:4}},
    ...routePlot.projects.map((p,i)=>el('div',{style:{display:'flex',marginRight:22}},`${i+1} · ${p.label}`))),
   insight?el('div',{style:{display:'flex',fontSize:18,color:INK,fontWeight:600,marginTop:6,height:26,overflow:'hidden'}},insight):el('div',{style:{display:'flex',fontSize:16,color:SOFT,marginTop:4}},routePlot.label));
 }
 return el('div',{style:{width:'100%',height:'100%',background:PAPER,color:INK,display:'flex',padding:'28px',fontFamily:'sans-serif'}},
  el('div',{style:{width:'100%',height:'100%',background:'#fff',border:`1px solid ${RULE}`,display:'flex',flexDirection:'column',padding:'32px 48px 28px'}},
   el('div',{style:{display:'flex',alignItems:'center'}},
    avatar?el('img',{src:avatar,width:64,height:64,style:{width:64,height:64,borderRadius:32,border:`2px solid ${BLUE_SOFT}`}}):
    el('div',{style:{display:'flex',width:64,height:64,borderRadius:32,background:BLUE,border:`2px solid ${BLUE}`,alignItems:'center',justifyContent:'center'}},
     el('svg',{width:44,height:44,viewBox:'0 0 64 64'},el('polyline',{points:'10,44 20,36 28,40 36,20 44,30 54,16',fill:'none',stroke:'#fff',strokeWidth:6,strokeLinecap:'round',strokeLinejoin:'round'}),el('circle',{cx:36,cy:20,r:5,fill:ORANGE,stroke:'#fff',strokeWidth:2}))),
    el('div',{style:{display:'flex',flexDirection:'column',marginLeft:18,flexGrow:1,minWidth:0}},
     el('div',{style:{display:'flex',fontSize:26,fontWeight:700}},String(name).slice(0,60)),
     meta?el('div',{style:{display:'flex',fontSize:19,color:SOFT,marginTop:2,height:26,overflow:'hidden'}},meta):null),
    output?el('div',{style:{display:'flex',fontSize:18,color:BLUE,background:WASH,border:`1px solid ${BLUE_SOFT}`,borderRadius:999,padding:'4px 14px',marginRight:18}},output):null,
    el('div',{style:{display:'flex',color:BLUE,fontSize:24,fontWeight:700,letterSpacing:4}},BRAND)),
   el('div',{style:{display:'flex',fontSize:geo?38:drawn?44:56,fontWeight:700,letterSpacing:-1,marginTop:geo?16:22,height:geo?50:drawn?56:140,lineHeight:1.2,overflow:'hidden'}},String(Feed.titleOf(run)).slice(0,120)),
   Feed.cardSummary(run)?el('div',{style:{display:'flex',fontSize:25,color:INK,marginTop:14,height:100,lineHeight:1.25,overflow:'hidden'}},Feed.cardSummary(run)):null,
   lead||facts.length?el('div',{style:{display:'flex',alignItems:'flex-end',marginTop:geo?12:drawn?14:28}},
    lead?el('div',{style:{display:'flex',flexDirection:'column',marginRight:56}},
     el('div',{style:{display:'flex',fontSize:geo?64:drawn?84:120,fontWeight:700,letterSpacing:-3,lineHeight:1}},lead.n),
     el('div',{style:{display:'flex',fontSize:20,color:SOFT,marginTop:6}},lead.unit)):null,
    ...facts.map(([label,value])=>el('div',{style:{display:'flex',flexDirection:'column',marginRight:44,paddingBottom:4}},
     el('div',{style:{display:'flex',fontSize:17,color:SOFT}},label),
     el('div',{style:{display:'flex',fontSize:32,fontWeight:500,marginTop:2}},String(value))))):null,
   // The badge, as on the card: blue label, soft detail. Same function, so the image cannot award
   // a badge the page does not.
   badge?el('div',{style:{display:'flex',alignItems:'center',fontSize:22,marginTop:geo?8:drawn?12:22}},
    el('div',{style:{display:'flex',width:14,height:14,borderRadius:7,border:`3px solid ${BLUE}`,marginRight:10}}),
    el('div',{style:{display:'flex',color:BLUE,fontWeight:700,marginRight:10}},badge.label),
    el('div',{style:{display:'flex',color:SOFT}},badge.detail)):null,
   map,
   drawing,
   el('div',{style:{display:'flex',fontSize:15,color:SOFT,marginTop:'auto'}},Evidence.basis(run).label+' · '+(run.trace_basis==='observed native events; timestamps unavailable'?'Counts are a lower bound.':'Not independently verified.'))));
}
// THE HOME PAGE'S OWN CARD. Until now `/` carried no og: or twitter: tags at all, so a post that
// sent a thousand people to the address showed them a bare link with no title, no description and
// no image — the first impression of the product was the URL. This reuses the run image pipeline
// (@vercel/og at 1200x630, served by api/og.js) rather than committing a static PNG, so the
// brand and tagline come from server/brand.mjs like every other name on the site.
export function homeCard(run=null){
 const bins=run?.visibility==='public'&&Array.isArray(run.rhythm)&&run.rhythm.length>1&&run.rhythm.every(v=>Number.isFinite(v)&&v>=0)&&run.rhythm.some(v=>v>0)?run.rhythm:null;
 const points=bins?bins.map((v,i)=>(24+984*i/(bins.length-1)).toFixed(1)+','+(150-v/Math.max(...bins)*125).toFixed(1)).join(' '):null;
 return el('div',{style:{width:'100%',height:'100%',background:'#0047ff',display:'flex',flexDirection:'column',padding:'40px 54px',fontFamily:'sans-serif',color:'#fff'}},
  el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
   el('div',{style:{display:'flex',fontSize:132,fontWeight:800,letterSpacing:-7,lineHeight:1}},BRAND),
   el('div',{style:{display:'flex',fontSize:37,fontWeight:500,maxWidth:330,lineHeight:1.2}},TAGLINE)),
  el('div',{style:{display:'flex',flexDirection:'column',background:'#fff',color:'#111',borderRadius:18,padding:'28px 32px',marginTop:34,flex:1}},
   el('div',{style:{display:'flex',fontSize:41,fontWeight:700,lineHeight:1.1}},bins?String(run.title||'One public run').slice(0,110):'Show what you made.'),
   bins?el('svg',{width:1030,height:170,viewBox:'0 0 1030 170',style:{marginTop:20}},el('polyline',{points,stroke:'#0047ff',strokeWidth:5,strokeLinejoin:'round',strokeLinecap:'round',fill:'none'})):null,
   el('div',{style:{display:'flex',fontSize:25,color:'#666',marginTop:'auto'}},bins?'Recorded activity · one public run on STRIVE':'Real sessions. The work behind them. The people building next.')));
}

// A profile link unfurls in the run cards' design (site/link-preview-card.js): the builder, their
// public totals, the agents they post with and their latest public runs.
export const profileCard=(profile,opts={})=>LinkPreview.profileLinkCard(profile,{...opts,brand:BRAND});

// The neutral image for a run that is missing or not public, in any share format.
export function privateCard(format='link'){
 return LinkPreview.privateLinkCard({brand:BRAND,title:`This run is private on ${BRAND}`,detail:'Sign in and open the shared run link to check your access',format});
}
