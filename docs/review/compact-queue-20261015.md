# Compact private review queue

Local proposal for Oscar's 15 October request. No schema changes. Release waits for his word.

- Newest **uploads** first (`created_at` descending, capture start only as fallback, ID breaks ties). The visible date is the recording start, in the reader's local time.
- Each closed row shows title, project / capture source, date, recorded tokens, estimated dollars, elapsed span and captured model names. Open a row for the note, tool calls, files, commits and measurement explanations.
- Native details controls work with the keyboard. Collapse all closes rows. Next run closes the current row, opens the following one and moves focus. These actions do not write review decisions or change visibility.
- Tokens include cached input once. Cost comes only from stored, validated per-model usage and prices. An absent or inconsistent cost is **Not recorded**, never zero or a guessed rate. It is not the owner's subscription bill.
- Elapsed includes waiting. Missing fields remain **Not recorded**. An author's model label is not substituted for recorded model names.
- Existing owner/private RLS, the review-window cutoff, review link and scoped discard remain in use. Posting remains on the existing review screen.

Rollback: revert this commit. It changes only queue rendering, ordering and its selected existing columns; no data conversion or migration is needed.
