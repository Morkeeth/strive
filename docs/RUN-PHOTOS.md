# Captured sessions and run photos

New sessions must start private. After saving, the owner can change the audience. Migration
`017_capture_guard.sql` requires a supported capture source, measurement reference, format and
nonempty measured trace. It freezes recorded facts on UPDATE, including through agent RPCs.
The existing unique measurement index prevents duplicate imports for one owner. Old rows remain.

This is an imported-measurement contract, not independent verification of execution: a person
who controls their local logs can fabricate a syntactically valid capture. Do not describe
these records as unforgeable or award competitive scores from them. Source timestamps may be
unknown; they must not be manufactured. Titles, descriptions, project labels, audience and
photo selection remain the owner's choices.

## Deploy

Apply `supabase/strava/017_capture_guard.sql`, then `018_run_photos.sql`, after the previous
strava migrations. Apply `supabase/storage/strive_run_photos.sql` separately in the same project.
It creates only the dedicated `strive-run-photos` private bucket and its restrictive policy.
It does not alter another bucket or any public app table. The bucket must never be public.

Set `STRIVE_STORAGE_SERVICE_ROLE_KEY` on the server to that project's service-role key.
Never put it in `public-config.json`, the client bundle, a `VITE_`/`NEXT_PUBLIC_` variable or a log.
The photo handler uses the caller's JWT for all run and metadata checks. Its code confines use
of the service credential to object upload/read/delete in this bucket and re-queuing an
interrupted object's erasure obligation. The credential itself has broader project privileges;
it is not a bucket-scoped token. It never elevates a run/metadata read. All direct anonymous/authenticated
Storage access is denied, including signing URLs. Missing configuration fails closed.

## Browser contract

- `GET /api/run-photos?run_id=UUID` → `{photos:[{id,run_id,width,height,byte_size,created_at,url}]}`.
- `POST /api/run-photos` with Supabase JWT in `Authorization: Bearer …`, JSON
  `{run_id,image_base64}` (plain base64, no data URI prefix) → status 201, `{photo:{…}}`.
- `GET /api/run-photos?id=UUID&run_id=UUID` returns JPEG bytes after live audience checks.
- `DELETE /api/run-photos?id=UUID&run_id=UUID` with owner JWT → `{removed:true}`.

Save the run privately before uploading. Offer up to six photos. Resize/crop client-side to
under 3 MiB before encoding. Server decoding accepts still JPEG, PNG or WebP under 40 megapixels,
applies orientation, limits each side to 2048 pixels and re-encodes to JPEG without metadata.
It rejects SVG, animation, corrupt images and unknown formats. Originals are unchanged.

For private/friends images, fetch the provided URL with Authorization and display a local
`URL.createObjectURL(blob)`; revoke object URLs when the view closes. An `<img>` cannot send
the JWT. Never put tokens in query strings. Public images work through the same URL signed out.
Include `run_id` so relationship-gated Link reads can set the run bearer header correctly.
No response (including errors) is cacheable. Do not use a signed Storage URL or cache private
bytes in an OG image. Revocation cannot retract bytes a previously authorized reader saved.

Removing a photo through this endpoint deletes the object, then its metadata. Before deleting
a run, remove its photos through the endpoint, then delete the run. A raw database run/metadata
delete immediately revokes API access and queues bucket-object erasure. Run
`node scripts/cleanup-run-photos.mjs` in the server environment after deletion, or schedule it.
It removes up to 100 queued objects and acknowledges only successful Storage deletes; failed
operations retain the entry for retry. Physical deletion is only confirmed after this worker runs.
Production schedules `/api/photo-cleanup` daily at 03:00 UTC. Set a random server-only
`CRON_SECRET` so the scheduled request can authenticate. Requests without that exact Bearer
secret are denied. For the ten-person launch this drains up to 100 pending photos per day;
monitor `remaining_unknown` and drain again when true. This is deferred erasure, not instant
physical removal after a raw database deletion. Access is revoked immediately by parent RLS.
Failed uploads attempt to remove both the object and reservation; an interrupted request can
leave an inaccessible object or an empty reservation, which the owner can remove.

## Verification

`node scripts/test-launch-backend.mjs` exercises PostgreSQL triggers/RLS in disposable PGlite
and mocks only external Storage HTTP transport. To additionally exercise the actual parser,
measurement store and public export against a selected local Claude sitting:

```sh
STRIVE_CAPTURE_SOURCE=/absolute/path/to/session.jsonl STRIVE_CAPTURE_SITTING=3 node scripts/test-launch-backend.mjs
```

The session stays local; measurement state is in an in-memory SQLite database. Tests do not
contact production. Hosted acceptance must separately exercise actual Storage bytes with owner,
friend, unrelated signed-in reader and anonymous contexts, then revoke access and remove the photo.
