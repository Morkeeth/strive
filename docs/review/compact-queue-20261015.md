# Compact private review queue

Local proposal for Oscar's 15 October request. No schema changes. Release waits for his word.

- Newest **uploads** first (`created_at` descending, capture start only as fallback, ID breaks ties). The visible date is the recording start, in the reader's local time.
- Each closed row shows title, project / capture source, date, recorded tokens, estimated dollars, elapsed span and captured model names. Open a row for the real preliminary share card and Approve and post / Edit / Discard. The first row starts open; the rest collapse. The open summary hides duplicate measurements.
- Native details controls work with the keyboard. Collapse all closes rows. Next run closes the current row, opens the following one and moves focus. These actions do not write review decisions or change visibility.
- Tokens include cached input once. Cost comes only from stored, validated per-model usage and prices. An absent or inconsistent cost is **Not recorded**, never zero or a guessed rate. It is not the owner's subscription bill.
- Elapsed includes waiting. Missing fields remain **Not recorded**. An author's model label is not substituted for recorded model names.
- Existing owner/private RLS, the review-window cutoff, review link and scoped discard remain in use. Posting remains on the existing review screen.

Rollback: revert this commit. It changes only queue rendering, ordering and its selected existing columns; no data conversion or migration is needed.

## Preliminary share cards, 15 October follow-up

The queue uses the same `feedCards` → `StrivePost.render` path as posted Feed/profile cards, with saved card choices and the existing photo renderer. Preview links/reactions are disabled; the queue actions remain outside the card. Public visibility is a render-only copy until the owner clicks Approve and post and confirms. No image is uploaded by viewing the preview.

The shared post renderer now shows recorded tokens, stored estimated dollars, elapsed and model, plus the existing measured activity chart. Both the preview and the posted card receive this change. Missing data stays Not recorded; a source without timed activity receives the existing honest activity fallback.

Approval requires the matching owner and a still-private row. Source-agent runs also require that owner's agent profile to be public, matching the existing review rule. Edit uses the existing owner editor; Discard retains its owner/private delete guard. A card-load failure leaves approval disabled.

Validation includes a real local queue approval followed by the profile's posted card: measurement text and activity chart match the preview. This uses a disposable test database only. No production visibility change, build, video or migration is part of this follow-up. Roll back this follow-up commit to restore the compact summaries; revert its parent too to restore public main.
