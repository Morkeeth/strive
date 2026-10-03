# Feedback and saved-run acknowledgements

The floating “Impact the roadmap or whine” entry lives outside the SPA route container. It opens a native modal dialog with a labelled form, close button, keyboard focus management and live save status. Draft text stays in memory across route changes and retry failures. Signing out or switching accounts clears it. Ordinary unsent drafts remain in memory. Only choosing sign-in stages the anonymous draft in same-tab session storage for up to 30 minutes, so the supported OAuth round trip can restore it. It is removed when the signed-in profile claims it and never auto-submitted. Account switching clears drafts. Storage failure preserves text and asks the user to copy it before continuing.

`029_feedback_rewards.sql` adds authenticated `strava.save_feedback` to the existing private inbox. The server binds the owner to the caller, serializes their submissions, enforces the existing message/category/rate limits and returns a persisted UUID. A per-owner request ID makes a lost-response retry return the original row without another notification. Editing the message starts a new request. The compact form uses the existing other category without asking the user to categorize. Feedback and notification tables retain no client SELECT grants. Success is shown only after the RPC returns a saved ID. Best-effort notification failure cannot change that success into failure.

Owner retrieval means the product operator, not arbitrary signed-in users. Use the authorized database console for the intended project, with a read-only transaction and bounded query:

```sql
begin read only;
select id, created_at, category, message
from strava.alpha_feedback
order by created_at desc, id desc
limit 50;
rollback;
```

Do not expose service credentials or this inbox in browser code. Review locally; do not copy private messages to public issues. Existing notification setup and delivery limits remain in FEEDBACK-NOTIFICATIONS.md. This change does not configure or send a notification.

The owned saved-run editor queries `strava.saved_run_count()`. One currently saved row displays “First stride · 1 saved run”; larger exact counts display “N saved runs”. Unknown/failed counts show no acknowledgement. This counts current records, not lifetime achievements, distinct productive outcomes, kudos, PRs, cash or work quality. Existing import/source and manual retry deduplication remain unchanged. Opening, editing or reloading a saved run does not create another record or increment a browser counter.

Release: independently review this candidate, apply 029 after the accepted 026–028 migration sequence, reload PostgREST schema, then deploy matching complete API/site source only after approval. Exercise the signed-in hosted save/retry and operator inbox before claiming hosted persistence. Previous package remains frozen. Full SPA and hosted tests are separate from the disposable module rehearsal.
