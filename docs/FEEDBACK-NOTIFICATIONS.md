# Private feedback notifications

Feedback remains in `strava.alpha_feedback`. Migration `022_feedback_notifications.sql` adds a private transactional delivery queue. No client gains read access to feedback or the queue. A ping contains category, timestamp/reference and an owner-only inbox link, never the message, route, profile or email.

## Immediate wake and recovery

After the existing feedback insert succeeds, the browser can call `POST /api/feedback-notifications` with its session bearer token and no body. The server derives the caller's profile through the JWT-authorized profile RPC, then claims at most one due notice for that profile. Request fields cannot choose a destination, another owner or notification text. A failed wake must not turn a successful feedback save into a failed submission or trigger a duplicate insert.

`GET /api/feedback-notifications` requires `Authorization: Bearer <CRON_SECRET>` and drains a bounded batch for recovery. No new cron schedule is installed in this change. Choose a supported schedule or worker only after checking the deployment plan and function timeout. A cron-only daily schedule does not provide immediate notification. If the immediate browser wake is lost, delivery waits for the configured recovery worker. Without a recovery worker, queued items persist but delivery is not guaranteed to resume.

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
node scripts/test-feedback-notification-queue.mjs
node scripts/test-alpha-feedback.mjs
```

All transports in these checks are mocked or disposable local PostgreSQL. No notification is sent. SQL checks cover client denials, stored feedback surviving failed delivery, owner scoping, lease exclusion, retry delay, stale acknowledgements, crash recovery, reapplication and delete cascades.

## Release evidence still required

Apply the reviewed migration on the intended schema, configure the chosen destination and private inbox URL, wire the best-effort browser wake and a supported recovery worker. Then submit an authorized test message, observe its private persistence and actual ping, exercise a controlled failed delivery/retry, and verify the final delivery state. The local implementation alone proves none of those hosted actions.
