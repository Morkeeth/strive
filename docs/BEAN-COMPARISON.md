# Bean comparison, local only

Branch: codex/strive-bean-outcomes-20261004. Base: accepted local 0ab3e52, not current hosted 1b5579f. Accepted release archives were not changed.

Actual app changes: optional bounded author story fields; outcome image preview for an explicit HTTPS image output link; quiet activity evidence; no duration award on cards; feedback question on feed; story and conversation on detail. An ordinary output URL is labelled Work linked, never automatically Shipped. No new scoring or ranking algorithm. Existing leaderboard remains unchanged.

Migration 030 follows 026-029 before a coordinated site/server release. Story fields use existing runs RLS and audience. No hosted migration or release performed. Existing posts have no story until the owner adds one; no automatic transcript extraction.

Verification: test-run-story.mjs exercises the disposable Postgres schema, owner save/reread, cross-owner denied update, anonymous private read, oversized input, escaping and omitted unknown story. check-flow.py exercises the actual built SPA with local exact Supabase SDK 2.57.4, fixture auth and disposable REST/database. It saves/reloads a private story, explicitly changes fixture audience, posts a separate fixture-account reply and returns as author. Mobile scroll width 390; no page errors. See result.json. Photo API/upload is not exercised. Output image is the prior local feedback proof screenshot; example.test URL is intercepted only in the test browser. It is not a live artefact URL.

The flipbook is an annotated still sequence, not a continuous recording. Baseline uses the pinned 0ab3e52 feed renderer on the same fixture. Screenshots are actual app rendering, not mockup drawings. Fixture counts and people are not real usage claims.

Review: http://127.0.0.1:58610/strive-bean/
Interactive local fixture: http://127.0.0.1:64699/fixture
Review media stored outside the source checkout in weekly-review-2026-10-04/web/strive-bean. No deploy, hosted writes, Bean response or retention claimed.
