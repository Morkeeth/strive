# Private feedback notifications

Feedback remains in `strava.alpha_feedback`. Migration `022_feedback_notifications.sql` adds a private transactional delivery queue. No client gains read access to feedback or the queue. A ping contains category, timestamp/reference and an owner-only inbox link, never the message, route, profile or email.

## Immediate wake and recovery

After the existing feedback insert succeeds, the browser can call `POST /api/feedback-notifications` with its session bearer token and no body. The server derives the caller's profile through the JWT-authorized profile RPC, then claims at most one due notice for that profile. Request fields cannot choose a destination, another owner or notification text. A failed wake must not turn a successful feedback save into a failed submission or trigger a duplicate insert.

`GET /api/feedback-notifications` requires `Authorization: Bearer <CRON_SECRET>`. `vercel.json` schedules recovery daily at `0 4 * * *` (04:00 UTC). The signed-in browser wake remains the immediate best-effort path. A lost wake or failed delivery waits for a later successful recovery invocation. This is a daily fallback, not immediate retry or a delivery-time guarantee.

The daily expression supports Vercel Hobby as well as higher plans. Hobby can invoke during the scheduled hour rather than at the exact minute. The actual project plan was not read from an authenticated team API; no upgrade or paid service is assumed. Vercel schedules production deployments only, and automatically adds the bearer header when `CRON_SECRET` is configured. See [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [cron authentication and execution](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Recovery claims at most four due notices per invocation. Each claim, ping and acknowledgement has a five-second timeout in `server/feedback-notifications.mjs`: the recovery path therefore allows at most 45 seconds of network waits, inside the explicit 60-second `maxDuration` in `vercel.json`. The immediate path claims one and also has a five-second caller lookup. Malformed or oversized claim batches stop before sending. These are implementation bounds, not measured delivery latency. [Vercel duration configuration](https://vercel.com/docs/functions/configuring-functions/duration) documents per-function caps; this configured cap is below the documented Hobby maximum with Fluid Compute. Confirm the deployed function configuration during release.

Backlogs larger than that batch can take multiple daily invocations, and provider failures can delay delivery further. Review queue age and retry state in the owner-only database before promising a tighter response time. The existing photo-cleanup schedule remains separate. A local config entry does not prove that the cron is registered, enabled, authenticated or has executed on the hosted project.


Claims use row locks and a five-minute lease. A refused or timed-out ping backs off ten minutes; a crashed worker's lease expires. Acknowledgements require the current lease token. Delivery success is retained, and reapplying the migration preserves it. Existing feedback gets a pending notification when the migration first backfills the queue. Profile/feedback deletion cascades queue deletion.

This is at-least-once delivery. The webhook can accept a ping just before the worker crashes or its acknowledgement fails. A retry may then send the same reference again. Generic receivers should honor the stable `Idempotency-Key` header; Slack incoming webhooks may show a duplicate. No exactly-once claim is made.

## Server-only configuration

Set these only after the user chooses the destination and authorizes configuration:

- `STRIVE_FEEDBACK_SERVICE_ROLE_KEY`: server-only database service credential. Never put it in browser settings, the template, a payload or logs.
- `STRIVE_FEEDBACK_WEBHOOK_URL`: approved HTTPS endpoint. Credentials in URL userinfo, redirects, localhost and literal IP hosts are refused. The secret path of an incoming webhook stays server-side.
- `STRIVE_FEEDBACK_WEBHOOK_HOST`: exact approved hostname, separately pinned. Feedback content cannot change it.
- `STRIVE_FEEDBACK_WEBHOOK_FORMAT`: `generic` (default JSON event) or `slack` (incoming webhook text payload).
- `STRIVE_FEEDBACK_INBOX_URL`: verified owner-only `https://supabase.com/dashboard/project/.../editor` URL for the private feedback table. This is an authenticated operator view, not a public reader.
- `CRON_SECRET`: existing authenticated recovery-worker secret.

This adapter can target a user-approved Slack incoming webhook or a controlled generic receiver. It does not provision Slack, send email, or create an in-app inbox. Email needs a chosen provider adapter or an approved generic receiver that sends mail; do not call email enabled merely because this queue exists.

Missing configuration prevents claiming jobs. Webhook HTTP errors and transport exceptions never include response bodies or destination secrets in the API response. The service credential is used only against the configured Supabase origin; the recipient receives only the notification fields and stable idempotency reference.

## Local checks

Run with the repository's Node version and existing dependencies:

```sh
node scripts/test-feedback-notifications.mjs
node scripts/test-feedback-notification-auth.mjs
node scripts/test-feedback-recovery-schedule.mjs
node scripts/test-feedback-notification-queue.mjs
node scripts/test-alpha-feedback.mjs
```

All transports in these checks are mocked or disposable local PostgreSQL. No notification is sent. SQL checks cover client denials, stored feedback surviving failed delivery, owner scoping, lease exclusion, retry delay, stale acknowledgements, crash recovery, reapplication and delete cascades.

## Release evidence still required

Apply the reviewed migration on the intended schema, configure the chosen destination and private inbox URL, deploy the best-effort browser wake and the reviewed daily recovery config. Confirm Vercel registered the cron and that its authenticated invocation reaches this function. Then submit an authorized test message, observe its private persistence and actual ping, exercise a controlled failed delivery/retry, and verify the final delivery state. The local implementation alone proves none of those hosted actions.
