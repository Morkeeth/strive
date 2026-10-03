# Where a run's numbers come from

Local CLI, browser and bot captures are imported, client-reported measurements. A source hash identifies submitted data and helps with repeat imports. It does not independently prove that events happened or that the task succeeded. A photo or output link does not change this basis.

The activity board remains a comparison of reported sessions. It deduplicates exact run IDs and same-account capture references within its bounded public sample. Matching counters and overlapping windows do not establish duplicate identity: legitimate parallel sessions remain separate. Duration comparisons require an explicit timestamp-based source and a valid session span. Complete tool counts can rank without a duration when a source date is available. Unknown dates and incomplete observed counts stay outside weekly comparisons. Session spans can include idle time; they are not human work hours. No upload date substitutes for a session date. Changed source claims can evade these checks. There is no independently verified category or anti-cheat guarantee.

## Recovering an older build

Add a run → Other import methods → Recover an older build accepts a `local-historical-recovery-v1` source-indexed manifest. It reads the file locally and previews only a bounded summary: original observed dates, prompt-history entry count, repository commit count and opaque source references. Local paths, raw prompts, individual source rows and commit prose are not sent.

The first save is private. Repeated imports under the same account reuse the historical source reference. Titles, photos and audience can be changed; evidence cannot be rewritten into a measured session. The history entry count is not a full turn count; repository commits are not attributed to one agent. Tool calls, duration, tokens, cost and model stay unknown. Historical reconstructions have no activity ranking or inferred achievement.

Current support is the signed-in website. The existing agent-token upload contract does not accept historical evidence. No new provider verification or raw transcript upload is introduced.

## Local release requirements

Apply only the dedicated `strava` migrations `026_photo_cover_choice.sql` and `027_historical_reconstruction.sql` before promoting the matching site/API. Do not apply them to `public`. Readiness checks the new fields and owner-only cover RPC. Review migration and independent acceptance before any coordinated promotion.

Local checks: `node scripts/test-cover-choice.mjs`, `node scripts/test-historical-import.mjs`, `node scripts/test-run-evidence.mjs`, and `npm run test:launch`. Local preview servers in `scripts/preview-*-journey.mjs` use disposable test accounts and do not prove hosted account acceptance.
