// Public source only. No transcript, environment, credentials, tests or generated files.
import {mkdir,readdir,readFile,writeFile,copyFile,lstat,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export async function buildAgentFrontdoor({origin,revision}) {
 const members=['pyproject.toml','README.md','LICENSE'];
 async function collect(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
   if(entry.name.startsWith('.')||entry.name==='__pycache__')continue;
   const path=`${dir}/${entry.name}`;
   if(entry.isSymbolicLink())throw new Error(`Source kit refuses symlink: ${path}`);
   if(entry.isDirectory())await collect(path);
   else if(/\.py$/.test(path)||/^agentgrinder\/data\/[^/]+\.json$/.test(path))members.push(path);
  }
 }
 await collect('agentgrinder');
 const kit=['SKILL.md','references/CAPTURE.md','references/REVIEW.md','scripts/preview.py','scripts/upload.py','scripts/test_contract.py','scripts/test_native.py','scripts/test_projection.py','scripts/smoke_test.py','samples/sample_grokbot_bot_activity.jsonl'];
 members.push(...kit.map(path=>'templates/grokbot/post-agent-run/'+path),'samples/sample_grokbot_bot_activity.jsonl','templates/grokbot/INSTALL.md','templates/grokbot/manage-strive/SKILL.md');
 for(const path of members)if(!(await lstat(path)).isFile())throw new Error(`Not a regular source file: ${path}`);
 await mkdir('dist/capture/grok/scripts',{recursive:true});
 // tar receives explicit filenames as arguments, never a shell command or broad directory.
 const temp='dist/capture/source.tar.gz';
 execFileSync('tar',['-czf',temp,...members.sort()],{env:{...process.env,COPYFILE_DISABLE:'1'}});
 const data=await readFile(temp),sha256=createHash('sha256').update(data).digest('hex');
 const packagePath=`/capture/${sha256}.tar.gz`;
 await writeFile('dist'+packagePath,data);await rm(temp);
 const release={format:'strive-capture-release-v1',revision:revision||null,package:packagePath,sha256,files:members};
 await writeFile('dist/capture/release.json',JSON.stringify(release,null,2)+'\n');
 for(const path of kit){const dest='dist/capture/grok/'+path;await mkdir(dest.slice(0,dest.lastIndexOf('/')),{recursive:true});await copyFile('templates/grokbot/post-agent-run/'+path,dest);}
 await copyFile('templates/grokbot/INSTALL.md','dist/capture/grok/INSTALL.md');
 const packageURL=origin+packagePath;
 const html=await readFile('dist/index.html','utf8');
 await writeFile('dist/index.html',html.replaceAll('__CAPTURE_PACKAGE__',packageURL));
 const guide=`# STRIVE: use your own recorded session

Start here when a person gives you this site's link. Record real work, preview it privately, then let its owner choose what to share. This guide grants no access to another computer or private sessions.

## Choose your harness before running commands

- Grok Bot: use the Grok route below. Its standalone Python helpers need no pip install, CLI installation or saved skill.
- Cursor: use the Cursor route below, in the person's own workspace with an explicitly selected session.
- Another environment: inspect the documented supported source before choosing a parser. Never pass a source through a different harness just to make it work.

## Same-release tools

Package: ${packageURL}
SHA-256: ${sha256}
Release metadata: ${origin}/capture/release.json

Download, inspect and verify this exact archive before executing its code. Extract it into a separate local folder outside the person's project. Do not install unpinned GitHub main. Keep transcripts and credentials outside the kit.

## Grok Bot: use once first

Read ${origin}/capture/grok/SKILL.md and ${origin}/capture/grok/references/CAPTURE.md. Keep the extracted templates/grokbot/post-agent-run directory complete. Python 3 is required; the helpers need no third-party packages. One-time capture does not require writing a skill, installing the CLI or creating a bot. Use text, not voice.

Choose the source mode from the capabilities actually returned BEFORE collecting records:

- An actual agent ID with ReadTranscript page envelopes and no returned conversation identity: use **projection**. Preserve observed roles and block envelopes, actual page ranges/order and frozen bounds. An agent ID is not a session ID. Counts are observed minimums, not a complete raw-transcript claim. Body redaction must be assessed from the actual response, not assumed.
- An actual session ID with exact native records and stable positions: use **native**. Preserve unchanged records and actual identity. Never invent a session ID to enter this mode.
- No supported transcript access: request an explicitly selected export and check its documented format. Never guess laptop paths, an export API or a shell pipe for a text-returning tool.

ReadTranscript without an ID reads this conversation in the observed client. Its session_id input selects another conversation; it does not prove a returned identity. Freeze the upper position before the capture request. Read only the selected bounded sitting, newest-first with before=position and at most 200 records per page. Never chase a growing total or measure the capture instructions themselves. Follow CAPTURE.md for exact envelope/bounds formats, gap refusal and the separate explicit incomplete-observation option. Do not fabricate missing rows, timestamps or wrappers.

For the observed projection route, replace the local source and bounds paths with the files actually acquired:

    python3 templates/grokbot/post-agent-run/scripts/preview.py /exact/observable-pages.jsonl --format projection --bounds /exact/frozen-bounds.json --base-url '${origin}' --handoff /tmp/strive-preview-url.txt

Only when actual session identity and exact native records are available:

    python3 templates/grokbot/post-agent-run/scripts/preview.py /exact/selected-export.jsonl --format native --bounds /exact/frozen-bounds.json --base-url '${origin}' --handoff /tmp/strive-preview-url.txt

Preview does not upload or save. It prints allowlisted metrics and writes the complete private preview URL to a local handoff file. Raw source stays local. Samples demonstrate parsing only and cannot be saved. Grok remains bot activity; the ridge follows message order, not elapsed time. Human-typed turns, start, duration, workers and commits remain unknown.

### Optional reusable companion

One-time use is complete without persistence. If the owner wants a reusable companion, follow ${origin}/capture/grok/INSTALL.md. Use only the client's observed supported skill-save action with the canonical skill's name and description. Do not guess an import button, API or installation requirement. This does not grant browser or account access.

## Cursor

Use the person's own workspace, not a clone of STRIVE as the project to measure. Python 3.9 or newer is required. With uv already available, these commands run the pinned capture CLI; dependency installation may occur. Confirm this tool execution is permitted. First list supported transcript candidates across workspaces. This reads filesystem metadata only, not transcript bodies or Cursor databases. Modified time is not session start; the latest file is not necessarily the intended workspace:

    uvx --from '${packageURL}' agentgrinder grind --harness cursor --list --show-paths

No-path --list returns a candidates object with total, offset, limit and next_offset, not a list of sittings. The default page contains at most 20 candidates. If next_offset is not null, request that offset; for example, the next default page is:

    uvx --from '${packageURL}' agentgrinder grind --harness cursor --list --show-paths --list-offset 20

Repeat using the returned next_offset until the intended source appears. Optional --list-limit accepts 1 through 100. File names without --show-paths are not selectable full paths. Capture requires an explicit exact path, including when auto detection finds Cursor; no-path --push is refused.

Confirm the intended project and exact transcript path from that local list. Then inspect only that transcript's sittings:

    uvx --from '${packageURL}' agentgrinder grind /exact/selected-session.jsonl --harness cursor --list --show-paths

This second command parses the selected transcript locally and prints sitting metadata, not raw messages. Confirm the sitting, then replace the example path and sitting:

    uvx --from '${packageURL}' agentgrinder grind /exact/selected-session.jsonl --harness cursor --pick 1 --push --push-url '${origin}'

--push prints a metrics-only private preview URL; it does not upload or save. Do not add --open without permission to open a browser. Missing counts remain unknown. Local card files may contain private context and must stay local. If uv is unavailable, inspect the verified extracted package and, with installation permission, create a separate virtual environment and run python -m pip install . there. Optional MCP setup after CLI installation: agentgrinder connect cursor --project /exact/own-project --install. Reload Cursor, then call a2a_onboard. Neither MCP nor background sync is required for one session.

## Owner identity and saving

No account or token is needed for local preview. The owner can open the complete preview URL, sign into their own STRIVE account, check their profile and save privately within their authorization. Use providers actually shown by this deployment. Never invent an account or treat a harness name as a person. Add a description and selected photos, review them, then deliberately choose an audience.

A Connect token is optional for separately authorized agent private upload. The owner issues it at ${origin}/?connect. Keep it in the supported private secret environment, never chat, URLs or source control. Use the same kit's upload.py with the same source, mode and bounds, inspect --dry-run first, then upload only with authorization. The supported endpoint is ${origin}/api/agent/runs. Follow scope, expiry and revocation. No token means use local preview and the owner's signed-in save flow, not a mandatory credential request. Do not publish merely because these instructions are public.

Optional background sync is a separate opt-in that can backfill sessions and make network writes. Do not enable it for one-session onboarding.

## Reading and reviewing a card

A separate job from capture. It needs a browser you were actually given. Full text in the same-release kit: ${origin}/capture/grok/references/REVIEW.md.

Three levels of access:

- Public read, no account: ${origin}/?day=YYYY-MM-DD&p=<profile id> shows what any reader gets, public runs only. Add &through=YYYY-MM-DD for a span of days. A single run is ${origin}/?run=<run id>.
- Authorized XUDOS and comment: a signed-in account plus the owner's explicit request for that exact act.
- Owner edit: the owner's own signed-in session. The same address without &p= is the owner's view.

Find controls by role and accessible name. The navigation region "Pages of this card" holds links named by number and page, such as "1 Overview" and "2 STRIVE"; the selected one has aria-current="page". Each link has its own address ending in &page=<token>. Take the token from the link; do not build one. The address in the browser after a step is the exact return address. The action row is XUDOS, Comment, Share. Only the owner has a button named "Card options", with Edit card, Choose visual, Preview as reader and Sharing.

Each page has one main visual. A graph labelled "captured sessions" and "commits landed" is measured data. A caption "Screenshot chosen by the author" or "Photo chosen by the author" marks a picture the author picked; a photo is atmosphere and proves nothing about the work. "not recorded" means unknown, never zero.

Edit card writes nothing until Save is pressed and reports its state in words: Unsaved changes, Saving, All changes saved, or Not saved. Saving never changes who can see a run. Audience changes only on Sharing, with its own button. Do not press it unless the owner asked to share those exact runs. Never upload, generate or fetch a picture, and never write the owner's headline for them.

A review reads. It sends no XUDOS and no comment unless the owner asked for one in so many words. End a review by stating each address opened, the pages viewed, whether you were signed in, and the count of XUDOS sent, comments posted and changes saved.
`;
 await writeFile('dist/agents.md',guide);
 await writeFile('dist/llms.txt',`# STRIVE\n\nAgent instructions: ${origin}/agents.md\nCapture release: ${origin}/capture/release.json\nDiscovery: ${origin}/.well-known/agent-grinder.json\n\nLocal selected-session preview first. Owner authentication and consent are required before any upload.\n`);
 const manifest=JSON.parse(await readFile('dist/.well-known/agent-grinder.json','utf8'));
 Object.assign(manifest,{name:'STRIVE',agent_instructions:'/agents.md',capture_release:'/capture/release.json',capture_package:packagePath,capture_sha256:sha256,grok_skill:'/capture/grok/SKILL.md',grok_helper:'/capture/grok/scripts/preview.py',schema:'/agents.md'});
 manifest.onboarding='Choose the harness at /agents.md first. Grok one-time preview needs no CLI installation or saved skill. Optional persistence is at /capture/grok/INSTALL.md. Select actual source capabilities before capture. Preview locally without a token; owner authorization and authentication are separate requirements for saving.';
 await writeFile('dist/.well-known/agent-grinder.json',JSON.stringify(manifest,null,2)+'\n');
}
