# Entry acceptance, 15 November 2026

Candidate is based on the current deployed privacy source (`05a2700`), with the existing SMTP gate and branded entry commits above it. No privacy implementation is repeated.

Node 22.22.3 reproduces the original 116 passing scripts, 8 inventoried failures and 33 uninventoried failures. The retained pre-styling baseline has the same failing names. Every failure below is pre-existing; none is labelled flaky or caused by the machine without evidence.

The entry-related browser compatibility check had an obsolete unversioned SDK URL regex. It now selects the exact SDK pathname in the built DOM, requires one script, validates SHA-384 format and anonymous CORS, and retains the existing content digest assertion. No integrity protection was removed.

The remaining 32 scripts are added to the existing failure inventory with a cause per row. The original 8 rows are retained. The full runner now reports 117 passed, 40 inventoried failures, and zero unlisted failures. Its success means the failure inventory is exact; it does not mean every test passes. Suspected product behavior conflicts remain explicitly unresolved.

## Individual causes

| Script | Classification / cause | Disposition |
| --- | --- | --- |
| test-ack-read-state.mjs | Pre-existing: feed-card.js renders a known zero count with the hidden attribute; exact class="num">0 regex rejects it. Unknown-count assertions pass before it. | inventoried, assertions unchanged |
| test-activity-bars.mjs | Pre-existing: activity-post.js now preserves empty timed bins at the leading and trailing boundary; test expects those bins removed (10 actual counts versus 6 expected). | inventoried, assertions unchanged |
| test-avatar-placeholder.mjs | Pre-existing: feed-card.js face() renders initial plus provider image instead of the historical inline SVG fallback. The failure occurs in that shared renderer, not the new profile form. | inventoried, assertions unchanged |
| test-browser-compat.mjs | Pre-existing: Cache-busted SDK src includes ?v=; exact unversioned URL regex fails. Replaced with DOM pathname, exactly-one SDK and crossorigin/integrity assertions; existing SHA-384 content check retained. | repaired |
| test-capture-drop.mjs | Pre-existing: Large-file safety guard refuses to read the 76 MiB source and says large-session options rather than local session picker. Guard and zero-network checks pass up to the obsolete wording assertion. | inventoried, assertions unchanged |
| test-clean-public-links.mjs | Pre-existing: public-run.mjs uses the current link-image endpoint/version; test requires the older /api/og?run=...&v=5 share image URL. | inventoried, assertions unchanged |
| test-compact-feed.mjs | Pre-existing: bindCompactCard() replaces the comment section with a fresh visible thread on slide change; test expects the new section hidden. Potential product regression in day/carousel comments; outside the entry change. Retained as a defect candidate, not waived as flaky. | inventoried, assertions unchanged |
| test-connected-agents.mjs | Pre-existing: Header test expects data-connected-agent nodes after extracting current connection functions; current connections.header() and fixture binding do not satisfy the old selector contract. Active token policy must be rebound and checked separately; no date/environment excuse asserted. | inventoried, assertions unchanged |
| test-current-avatar-settings.mjs | Pre-existing: Account markup no longer contains Origin repositories; Origin is currently an unavailable optional connection. Test asserts that retired heading. | inventoried, assertions unchanged |
| test-detail-headline.mjs | Pre-existing: Real detail card source label differs from the expected Manual · unmeasured substring. Existing metrics checks complete before the manual label assertion. | inventoried, assertions unchanged |
| test-dropin-usage.mjs | Pre-existing: Test clicks a removed drop-in usage control; querySelector returns null. Current connect setup is editor buttons plus an import dialog, not the former drop-in control. | inventoried, assertions unchanged |
| test-feature-forum-ui.mjs | Pre-existing: Board now says No public requests yet and mounts a private/public feedback message form; test expects No requests yet and the previous title/body/evidence form. Failure precedes writes. | inventoried, assertions unchanged |
| test-feed-auto-refresh.mjs | Pre-existing: Exact source regex requires feedCards(page,await ackData(page),{current,requireComplete}); current streaming feed builds/uses acknowledgment data through a different call shape. | inventoried, assertions unchanged |
| test-feed-pages.mjs | Pre-existing: Fresh feed issues two acknowledgment reads where test permits one. The first 20 cards render correctly before the request-count assertion. Duplicate-read efficiency regression candidate, outside sign-in. | inventoried, assertions unchanged |
| test-first-paint-review.mjs | Pre-existing: Isolated vm execution of feedCards references StriveRunPhotos, absent from the test context; real SPA loads run-photos.js. ReferenceError prevents the claimed paint assertion. | inventoried, assertions unchanged |
| test-manual-project-update.mjs | Pre-existing: project-update.row() now permits a text-only update with title/project/changed and no output link; test still expects that exact input to throw. Product UI labels project link optional. | inventoried, assertions unchanged |
| test-manual-recovery.mjs | Pre-existing: Extracted postComposerHtml() uses StriveUI.field/button; test window never loads ui-primitives.js. ReferenceError occurs before save/retry assertions. | inventoried, assertions unchanged |
| test-onboarding-polish.mjs | Pre-existing: connect_body_probe.mjs dereferences .post-file-entry.open after that element was replaced by #connect-alternatives dialog. Menu assertions pass first; no sign-in/profile function is under this failing probe. | inventoried, assertions unchanged |
| test-people-spotlight.mjs | Pre-existing: People page no longer renders #people-spotlight and #people-roll. Test dereferences the absent spotlight after its one-person case passes. | inventoried, assertions unchanged |
| test-photo-editor.mjs | Pre-existing: Nine of ten behaviors pass; bounded-square thumbnail expectation conflicts with current source-shape whole-image editor frame CSS. No entry stylesheet selector matches photo editor. | inventoried, assertions unchanged |
| test-photo-generation.mjs | Pre-existing: Successful empty photo list leaves the fixture placeholder hidden where test expects it visible. Denied/failed reads must remain distinct; keep the assertion and investigate in the photo renderer, outside entry. | inventoried, assertions unchanged |
| test-private-run-race.mjs | Pre-existing: Extracted viewRun() now calls typedOnlyRun; vm context omits it. Observed ReferenceError typedOnlyRun is not defined replaces the expected stop-after-render sentinel. | inventoried, assertions unchanged |
| test-project-draft-grants.mjs | Pre-existing: Composer now creates f_project through StriveUI.field rather than a literal id="f_project" in index.html. Source regex misses generated markup before grant assertions can complete. | inventoried, assertions unchanged |
| test-project-highlights.mjs | Pre-existing: Activity renderer no longer includes the old .project-source node; test dereferences textContent on it after manual no-metrics assertions. Shared story renderer, outside entry. | inventoried, assertions unchanged |
| test-public-activity.mjs | Pre-existing: Public page share image uses the current link-image route rather than the historical API URL/version expected by the test. | inventoried, assertions unchanged |
| test-run-queue.mjs | Pre-existing: run-queue.js now presents one update at a time with data-post/data-next; test expects twelve data-choose cards and a batch filter/review selector. Inventory retains the untested publishing assertions. | inventoried, assertions unchanged |
| test-saved-run-share.mjs | Pre-existing: Saved-run detail test looks for a removed share/preview control and reads getAttribute on null. Rendering code and detail controls predate the sign-in styling. | inventoried, assertions unchanged |
| test-share-cards.mjs | Pre-existing: Share image pixel and private-neutral assertions pass; HTML unfurl assertion at line 134 requires the old /api/og?run=...&v=5 URL while current renderer uses link-image. | inventoried, assertions unchanged |
| test-share-routes.mjs | Pre-existing: Public share HTML og:image now targets current link-image route, while test expects /api/og?run=...; canonical profile/run path assertions pass first. | inventoried, assertions unchanged |
| test-share-sheet.mjs | Pre-existing: Sharing dialog heading is Share your progress; test expects Share this run. This is shared run-sharing UI, not the sign-in dialog. | inventoried, assertions unchanged |
| test-sunday-card.mjs | Pre-existing: Posted feed card intentionally omits the detail activity trail; test still expects six .activity-bar elements on the posted card. The same test earlier explicitly asserts feed removes trail. | inventoried, assertions unchanged |
| test-visual-lead-profile.mjs | Pre-existing: Follow UI no longer has the details disclosure expected as More profile actions; test reads .open on null after signed-out sign-in/no-write and signed-in Follow checks. | inventoried, assertions unchanged |
| test-visual-sharing-review.mjs | Pre-existing: Review-card disabled destination transformation differs from saved card markup; strict full-markup equality fails. Shared preview/feed renderer predates entry and needs independent parity review. | inventoried, assertions unchanged |

## Source and release settings

Production root JS/CSS/SVG assets were read without authentication. All repository-controlled assets match the privacy build except run-estimates.js, whose only difference is the already enabled estimate-upload flag. The release candidate is rebuilt with STRIVE_ESTIMATE_UPLOADS_READY=1 to preserve production behavior. Vercel insights is platform-supplied, not repository source. The four privacy/auth/account assets match production exactly. Static asset equality does not establish the identity of all server-side code.

Keep STRIVE_EMAIL_SIGNIN_SMTP_VERIFIED absent or 0. STRIVE_EMAIL_SIGNIN=1 is ignored. Email also needs a successful provider probe; an unavailable/disabled probe never advertises it. Do not enable the verified flag before actual custom SMTP delivery has been verified.

## Local browser evidence and limits

Playwright uses the complete built SPA with the real Supabase browser SDK, disposable PostgreSQL/RLS, synthetic actors and a local OAuth adapter. Both phone (390x844) and desktop (1440x1000) walk cancellation, import of a repository test capture, optional story edit, private audience, sign-in callback, reserved-handle failure/retry, profile creation, preserved draft, private save, reload, and stranger denial. All screenshots include the entire viewport. Hosted OAuth and actual SMTP delivery are not claimed. No hosted writes occur.

Raw logs, request audit, whole-screen images, per-test triage and production asset comparisons are retained in the assigned factory acceptance evidence folder. No production configuration, account, deployment or remote git state changes are part of this acceptance.
