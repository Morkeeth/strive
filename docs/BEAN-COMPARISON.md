# Bean comparison, local only

Branch codex/strive-bean-outcomes-20261004 starts from accepted local 0ab3e52, not hosted 1b5579f. Existing archives remain unchanged.

Feed leads with the author result. Run detail adds what changed, what remains open and a question for readers. Uploaded images can be marked Result, Before, After or Personal. The author chooses a selected cover, result image or before/after comparison. The product URL remains a separate Open the work link. Whole images fit without cropping. No productivity score is inferred.

Migration order: existing 026-029, then 030_run_story.sql, then 031_run_photo_roles.sql, before coordinated site/server promotion. Existing RLS and audience rules apply. No hosted migration or deploy performed.

Tests use the actual SPA with pinned local Supabase SDK, fixture authentication, disposable PostgreSQL and actual photo API/sanitizer. Only storage transport is an in-memory adapter. Browser file uploads, roles, duplicate pair-slot refusal, explicit cover selection, save/reload, image change/removal fallback and mobile layout passed. Scripts test-photo-roles.mjs, test-photo-generation.mjs and test-run-story.mjs cover database permissions, delayed render races and story limits. These do not prove hosted OAuth/storage or Bean usage.

Corrected review: http://127.0.0.1:58610/strive-bean/product/
Actual component screenshots illustrate the original crop and full-frame treatment; actual SPA screenshots show them uploaded as work output. TEST DATA people and run are synthetic. This is a recorded-stage flipbook, not continuous recording. Evidence lives outside this repo under weekly-review-2026-10-04/web/strive-bean/product.

Limits: shared-preview image now leads with the authored result and map but does not include uploaded images. Activity explorer is relabelled, not a new ranking algorithm. Bean identity/setup and whether he imported remain unknown. No outside adoption or productivity outcome claimed. The older feedback-form demo remains historical mechanical proof only.
