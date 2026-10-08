# STRIVE

Your work, in good company. Real agent sessions, on cards you choose to share.

**Capture → preview → post → browse.**

## The app

Latest card decision, 8 October evening: each deliberately selected run is one post in a vertically scrolling feed. Sort by actual start time, descending, with unknown times last and ID as a deterministic tie. Import, publication and XUDOS never move a run up. Day and project summaries are separate views. A post leads with authored work and at most three meaningful recorded facts: commits, labelled elapsed span, files touched or real project count. Tool-call totals and single-run counts are not hero facts. The activity trail uses the stored trace's own axis; missing traces get no invented map. One chosen candid photo may accompany supporting screenshots. Existing audience and media choices remain in force.

- Feed: public run cards from builders.
- Post a run: import a real session, review the card and choose to publish.
- My runs: your session history.
- Profile: your public runs and identity.
- Follow, Thanks and reply: one reaction (cheer this run), then discussion.

Audience: **Public** is listed and open to anyone signed out at `/r/<id>`. **Only me** is owner-only. **Followers** is relationship-gated: a signed-in reader must follow the author or be on the author's Close friends list. **Close friends** is the author's selected private list. Strangers see the neutral private page. Followers is stored under the legacy `link` enum, but the URL alone grants no access. Browser and database agree: migration `supabase/strava/010_link_relationship.sql` must ship with deploy.

Activity is available from the Discover dropdown in the shared primary menu. It ranks measured public session activity, not quality or human effort. Weekly rows come from the latest 300 public uploads; long sessions use a capped 100-row sample. Each row opens its source run. Zero commits or changed files do not mean failure. The single primary menu is Feed, My runs, Discover and People on every route. Each whole item opens its dropdown: Following under Feed; Today, My projects, recovery, connection and My profile under My runs; public projects and Activity under Discover; Find people and Close friends under People. Desktop and phone share one DOM menu, in the header on desktop and at the bottom on phones. Exact destinations have page selection; the active parent has location selection. There are no duplicate rail or page tabs. One global Add run opens the composer.

Cursor first. Keep the white card and blue activity trace. Prefer a clean, minimal card: one visual plane, a short route, two or three measured facts, identity, and Share, Thanks and Follow. Tool-call totals use one source across `/r/`, the SPA strip, Explore and share (`tool_calls`, else `ridge_tool_calls`); map scrub labels say "in this slice" so a peak bin is never read as the run total. Code Route appears when the run stored route data; Cursor and Codex capture attach a compact measured route from files and commits when those counts exist, without inventing output links. A measured edit+commit route draws the Code Route map (same label as `/r/`), even on one project; a lonely declared stop stays a short work path. An optional author-selected lifestyle scene may sit beside a genuine output image; the scene is atmosphere, not proof, and photos are never auto-published from a camera roll. Day runs use a multi-project route; a quick fix is before → change → result; one agent lane is action → output. Provenance and raw metrics stay under Explore this run. Unknown measurements stay unknown. Clubs, Events and external community directories are hidden, including old routes, until their journeys are complete.

Card ruling, 22 September: a run card opens with an OUTCOME, not a metric identity. One sentence taken from the run — an author-declared outcome with a receipt, the subject of a commit git recorded in the window, the commits counted, or a declared link — and `No shipped output recorded` with the reason when the run shipped nothing. Under it, one number the run can prove (checks passing, commits landed, files changed, else tool calls) and no hero at all when it can prove none. A measurement the run does not have is left out of the card and named in one sentence of prose; an em-dash is never a row. The title is the repository and the work, never a filesystem path, and no home directory or account name reaches a card. Identity is the GitHub account this machine already holds (read locally, sign-in unchanged) or a neutral label — never "you". The brand string on every card is STRIVE.

One selected insight, 22 September: a card may carry ONE line the author chose — the verified outcome, or the correction that mattered — at the head of the Code Route group. It is absent by default, it is shown only while it is bound to a receipt the same run already carries, and it is never read out of a transcript: no parser writes it. The scope sentence says what the line is a fact about, so a night run over many sessions is never called "this run". It renders with no account at 390 px and says on its face that a local card is not published. It stays local until the hosted runs table has a column for it.

Free posting and browsing. Recognition comes from real people seeing and responding to work. No mandatory model calls, coaching flow, practice programme, score dashboard or challenges in the main app. Clubs and Events do not ship as incomplete destinations.

## First useful test

Two people each post a safe real run to the hosted app. Each can open the other’s profile, follow and respond. A stranger understands the card without a tour. The service exists; this test still needs two people who are not the owner.

## Two repositories

This repository is the public product. Morkeeth/agentgrinder remains the hackathon build. Historical code and docs are retained under `archive/hackathon-2026-09/` for reference; they do not define this product’s scope.

## What exists · 15 September

- Hosted at [agentic-strava.vercel.app](https://agentic-strava.vercel.app) on Vercel. App data lives in a dedicated `strava` schema in a Supabase project whose Auth is shared with the hackathon build; app data and profiles are separate. `/api/health` reports the database state.
- Sign-in with GitHub. One profile per account, with a handle and display name you can edit.
- Feed, post a run, My runs, profiles, follow, Following, Thanks, reply and a Responses inbox. The public feed is new and mostly empty.
- Local capture: `python3 -m agentgrinder grind --harness cursor` reads a real Cursor session with no keys and writes a card to `./grind.html`.
- Private Cursor hook: `python3 -m agentgrinder hook install --harness cursor` watches completed local composers, dedupes by composer id and opens a loopback STRIVE preview without posting.
- STRIVE ridge: Cursor bubble timestamps draw tool calls over wall time with worker activity behind one blue line. Captures without that clock use call order and say so.
- A Grok Bot post-run template in `templates/grokbot/`. It is source to install; no second bot has been observed using it.

## Open

- X sign-in. Built 25 September: the site reads the enabled providers from Supabase Auth at load, offers Continue with X when the provider is on, and writes x_handle from the X identity. Not live until the X developer app and the provider toggle are set in the Supabase dashboard, and manual identity linking is enabled there so a GitHub account can add X.
- Origin (Cursor’s code forge) repository linking. No app is registered and no button is enabled.
- Close friends: privately mark people and post to a selected Close friends audience. Access and revocation are enforced by database policies; no contact upload or automatic following is implied.
- Grok Bot verification: a second bot installing the kit and previewing its own export.
- A verified first useful test with two people who are not the owner.
- Official community and competition directories appear in Discover. They are outbound references only, with no registration, joining or calendar integration.

Brand decision, 16 September: the public product is STRIVE, tagline "Post your strides". The earlier name Pacecard is rejected. Keep the white cards and blue activity trace. The address remains `agentic-strava.vercel.app`. The name and tagline are held in one place, `server/brand.mjs`; internal identifiers, the package name, the CLI command and the `strava` schema are unchanged.

## Local comparison: Bean feedback, 4 October

Candidate only. Feed leads with author title, caption, optional linked output image and feedback question. Long-session awards and metric heroes leave the feed; source labels and the blue map remain. Detail adds optional author-written What changed / Still open / A question for you. These are declarations, not inferred or independently verified results. Existing owner-only editing and run audience cover these bounded fields. Any working attempt, design, research or unfinished question can be shared. No shipped-per-token score.

Migration 030 adds these optional fields. The comparison uses fixture accounts and a disposable database. It does not prove Bean participation, hosted authentication or retention.
