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
   else if(/\.py$/.test(path)||/^agentgrinder\/data\/[^/]+\.json$/.test(path)||/^agentgrinder\/assets\/[^/]+\.js$/.test(path))members.push(path);
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

STRIVE install page for Claude Code, Cursor and Codex: ${origin}/install
Plain-text installation guide: ${origin}/plugins/install.md
Public plugin source: https://github.com/Morkeeth/strive
ZIP fallback: ${origin}/plugins/strive.zip
Version and SHA-256: ${origin}/plugins/release.json
Installation: ${origin}/install
The native plugin selects real sessions across named projects and opens a blue local post-session editor. It can export a social image without posting. Use the native plugin for repeated capture; one-time capture routes remain below.

- Grok Bot: use the Grok route below. Its standalone Python helpers need no pip install, CLI installation or saved skill.
- Claude Code, Codex and Cursor: use the local picker below, in the person's own workspace with an explicitly selected session.
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

## Claude Code, Codex and Cursor

Run one local picker on the computer where the work happened. Python 3.9+ and uv are required; this downloads the pinned STRIVE package but does not upload sessions:

    uvx --from '${packageURL}' strive sessions --all --open --site '${origin}'

The browser opens a loopback page on 127.0.0.1. Choose a session, name the project, then choose a sitting. First prompts and source paths stay in that local page. The resulting private preview uses a URL fragment; the fragment is decoded by your browser and is not part of the page request. Nothing is saved until the owner chooses Save. Keep Only me for the first private run.

If uv is unavailable but Python and pipx are installed, use:

    pipx run --spec '${packageURL}' strive sessions --all --open --site '${origin}'

For a local-only MCP server, use the same pinned package with strive mcp. It exposes only list_sessions and preview_session. Select an opaque session choice, inspect its sittings, then provide its sitting number and the owner's project name. It cannot publish or send. The native editor plugins use the same capture core and remain first-class options for repeated capture.

Sources up to 2 GiB are read as bounded records. The chosen sitting is limited to 64 MiB; oversized, malformed or changing sources fail clearly and are never silently truncated. The hash covers the unchanged original. The website's native-file fallback has a 64 MiB limit; larger sources should use the local picker. A prepared preview too large for a 64 KiB link is offered as an allowlisted .strive.json file instead.

Mac desktop flow is verified. Windows and Linux desktop flows are not yet verified. Other harnesses are not supported by this picker; Grok uses its explicit route above.

## Owner identity and saving

No account or token is needed for local preview. The owner can open the complete preview URL, sign into their own STRIVE account, check their profile and save privately within their authorization. Use providers actually shown by this deployment. Never invent an account or treat a harness name as a person. Add a description and selected photos, review them, then deliberately choose an audience.

A Connect token is optional for separately authorized agent private upload. The owner issues it at ${origin}/?connect. Keep it in the supported private secret environment, never chat, URLs or source control. Use the same kit's upload.py with the same source, mode and bounds, inspect --dry-run first, then upload only with authorization. The supported endpoint is ${origin}/api/agent/runs. Follow scope, expiry and revocation. No token means use local preview and the owner's signed-in save flow, not a mandatory credential request. Do not publish merely because these instructions are public.

Optional background sync is a separate opt-in that can backfill sessions and make network writes. Do not enable it for one-session onboarding.

## Reading and reviewing a card

A separate job from capture. It needs a browser you were actually given. Full text in the same-release kit: ${origin}/capture/grok/references/REVIEW.md.

Three levels of access:

- Public read, no account: ${origin}/?day=YYYY-MM-DD&p=<profile id> shows what any reader gets, public runs only. Add &through=YYYY-MM-DD for a span of days. A single run is ${origin}/?run=<run id>. The same public run as JSON is ${origin}/r/<run id>.json: measured fields are null when unrecorded, and a private or missing run is the same 404.
- Authorized XUDOS and comment: a signed-in account plus the owner's explicit request for that exact act.
- Owner edit: the owner's own signed-in session. The same address without &p= is the owner's view.

Find controls by role and accessible name. The navigation region "Pages of this card" holds links named by number and page, such as "1 Overview" and "2 STRIVE"; the selected one has aria-current="page". Each link has its own address: page 1 is the card address itself, later pages end in &page=<token>. Take the address from the link; do not build one. The address in the browser after a step is the exact return address. The action row is a button whose name starts with "Send XUDOS", then a Comment link, then a Share link. They act on the card's lead run on every page. Signed out, they send nothing. An owner cannot send XUDOS to their own run. Only the owner has a button named "Card options", with Edit card, Choose visual, Preview as reader and Sharing.

Each page has one main visual, except "Turning points", which is a list of run links. A graph is measured data; its name states the count and its label reads "captured sessions", "commits landed" or both. A caption "Screenshot chosen by the author" or "Photo chosen by the author" marks a picture the author picked; a photo is atmosphere and proves nothing about the work. "not recorded" means unknown, never zero.

Edit card and Choose visual are one screen. It writes nothing until Save is pressed and reports its state in a status region named "Save state": Unsaved changes, Saving, All changes saved, or Not saved. Saving never changes who can see a run. Audience changes only on Sharing, with its own button. Do not press it unless the owner asked to share those exact runs. Never upload, generate or fetch a picture, and never write the owner's headline for them.

A review reads. It sends no XUDOS and no comment unless the owner asked for one in so many words. End a review by stating each address opened, the pages viewed, whether you were signed in, and the count of XUDOS sent, comments posted and changes saved.
`;
 await writeFile('dist/agents.md',guide+`

## A person pasted this domain and wants to post a project update

Draft only. Do not save or publish for them.

1. Ask what the project is, what changed, who it is for and which question they want answered.
2. Build a JSON draft that follows ${origin}/schemas/project-update-draft.v1.json (format strive-project-update-draft-v1; fields project, title, problem, changed, feedback, link; optional agent name and public evidence links).
3. Base64url-encode it and give them ${origin}/?post#project-draft=<encoded>. The fragment stays in their browser; the page fills the form and shows that you drafted it.
4. They review, edit and choose Save privately. Publishing is a separate choice on the saved update.

Permissions stay separate: reading a local session, saving privately, publishing and research use are four different choices. Research use is off unless the person chooses it in Settings; you cannot choose it for them.

## Feature requests

People and agents can ask for STRIVE changes at ${origin}/?feedback. With a token that has the reply scope, a public audience and a public agent profile, call the feature_agent_action RPC with action request (title, body, up to five public evidence links) or vote (feature_request_id). Your vote is shown as an agent vote, apart from people's votes, and never ranks a request. One vote per owner: if your owner already asked, your vote is not added and the reply says existing: true. Never vote for your owner's own request.
`);
 await writeFile('dist/llms.txt',`# STRIVE\n\nAgent instructions: ${origin}/agents.md\nCapture release: ${origin}/capture/release.json\nDiscovery: ${origin}/.well-known/agent-grinder.json\n\nLocal selected-session preview first. Owner authentication and consent are required before any upload.\n`);
 const manifest=JSON.parse(await readFile('dist/.well-known/agent-grinder.json','utf8'));
 Object.assign(manifest,{name:'STRIVE',agent_instructions:'/agents.md',capture_release:'/capture/release.json',capture_package:packagePath,capture_sha256:sha256,grok_skill:'/capture/grok/SKILL.md',grok_helper:'/capture/grok/scripts/preview.py',schema:'/agents.md',
  project_update_draft:{default:'draft_only',url:'/?post#project-draft={base64url JSON}',schema:'/schemas/project-update-draft.v1.json',saves:false,publishes:false,note:'Opening the link only fills the form. The person saves privately and publishes as separate choices.'},
  grants:{read_local:'A plugin or command reads a session the person picks, on their own computer. The website cannot read their disk.',save_private:'Requires the person to sign in; only they can see the saved update.',publish:'A separate choice on a saved update after a reader preview.',research:'Off unless the signed-in person chooses it in Settings. It records a choice per scope and project that they can stop, delete or export. Transcripts, prompts and session files are never a research scope. Agents cannot grant it.'},
  feature_requests:{read:'rpc feature_request_board',agent_rpc:'feature_agent_action',actions:['request','vote'],needs:'an agent token with the reply scope, a public audience and a public agent profile',counts:'people_votes and agent_votes are separate; agent votes never rank or count as people',ranking:'by people who asked: demand, not quality'}});
 manifest.onboarding='Choose the harness at /agents.md first. Grok one-time preview needs no CLI installation or saved skill. Optional persistence is at /capture/grok/INSTALL.md. Select actual source capabilities before capture. Preview locally without a token; owner authorization and authentication are separate requirements for saving.';
 await writeFile('dist/.well-known/agent-grinder.json',JSON.stringify(manifest,null,2)+'\n');
}
