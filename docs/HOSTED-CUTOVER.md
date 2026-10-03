# Hosted cutover checklist

Owner: Codex production lane. This is a checklist, not evidence of deployment. Do not run it with production credentials from an unreviewed branch.

## 1. Database boundary

- [ ] Confirm the intended shared Supabase project with `supabase/strava/preflight.sql`.
- [ ] Inspect existing Auth triggers; do not edit them.
- [ ] Generate and review `python3 scripts/prepare-strava-database.py > /tmp/strava-bootstrap.sql`.
- [ ] Apply only the reviewed Strava bootstrap. It must create/use `strava`; never run the inherited public-schema migration against production.
- [ ] Add `strava` to Supabase Data API exposed schemas without removing existing entries.
- [ ] Run preflight again and retain the output. Do not drop an existing `strava` schema to retry.

The app shares project Auth only. It must not modify Grinder tables, functions, triggers, default search paths or default privileges.

## 2. Vercel configuration

Create a separate Vercel project for this repository and set all three production variables:

| Variable | Exact value |
|---|---|
| `AGENTGRINDER_SUPABASE_URL` | `https://<shared-project-ref>.supabase.co` |
| `AGENTGRINDER_SUPABASE_ANON_KEY` | The project's public anon/publishable key; never a secret or service-role key |
| `STRAVA_ORIGIN` | The approved HTTPS STRIVE origin, with no path, query or fragment |

`npm run build` writes the first two values into the browser's `SB_URL` and `SB_KEY` constants. `SB_SCHEMA` is deliberately not configurable: it must remain `strava`.

The same deployment surface is pinned in these files:

- `site/index.html`: `SB_URL`, `SB_KEY`, `SB_SCHEMA="strava"`, `db:{schema:SB_SCHEMA}`, auth `storageKey:"agentic-strava-auth"` and `redirectTo: location.origin + "/"`.
- `scripts/build-site.mjs`: replaces only `SB_URL` and `SB_KEY` from the production environment.
- `server/runtime-config.mjs` and `server/public-config.json`: server endpoint/key validation and `SB_SCHEMA`.
- `server/public-run.mjs` and `api/health.js`: server reads with `Accept-Profile: strava`.
- `agentgrinder/a2a_client.py`: CLI reads with `Accept-Profile: strava`.
- `agentgrinder/agent_api.py`: agent writes with `Content-Profile: strava`.

For a capture client pointed at the hosted app, set:

| Variable | Purpose |
|---|---|
| `AGENTGRINDER_URL` | Approved hosted STRIVE origin used to build the private import URL |
| `AGENTGRINDER_SUPABASE_URL` | Same shared-project URL as Vercel |
| `AGENTGRINDER_SUPABASE_ANON_KEY` | Same public key as Vercel |

Do not put any of these values in reusable Grok skills, prompts or committed files.

## 3. Auth callbacks

- [ ] Keep the shared Supabase project's existing Site URL unchanged.
- [ ] Append `https://<approved-strava-origin>/**` to Supabase Auth Redirect URLs. Keep localhost redirects needed for development.
- [ ] In the GitHub OAuth app used by the shared Supabase provider, retain the Supabase provider callback: `https://<shared-project-ref>.supabase.co/auth/v1/callback`.
- [ ] **Oscar only:** set that GitHub OAuth App's **Application name** to `STRIVE`. Strangers see "Sign in to GitHub to continue to …" from this field, not from STRIVE site copy. Cursor must not change GitHub Developer settings.
- [ ] Confirm GitHub is enabled before exposing sign-in. X and Origin remain outside this cutover unless their separately reviewed identity work is already present.
- [ ] Verify sign-in returns to the exact STRIVE path and draft and that signing out clears only `agentic-strava-auth`.

Do not change shared Auth triggers or merge accounts by a public handle.

## 4. Loud, write-free dry run

From the reviewed checkout:

```sh
npm run check:hosted-config
AGENTGRINDER_SUPABASE_URL=https://<shared-project-ref>.supabase.co \
AGENTGRINDER_SUPABASE_ANON_KEY='<public-key>' \
STRAVA_ORIGIN=https://<approved-strava-origin> \
VERCEL=1 npm run build
```

The first command fails if a browser/server/CLI/agent schema pin or required `Accept-Profile` / `Content-Profile` header is missing. It performs no network request and no production write. The build rejects missing production variables, privileged keys and invalid origins.

## 5. After deploy

- [ ] Open `/api/health`; require `{"service":"strive","database":"ready"}`.
- [ ] Signed out: open Feed, a public run, its builder profile and output link.
- [ ] Fresh GitHub account: create the STRIVE profile, confirm zero-run Post guidance, save Only me, then deliberately change/post Public.
- [ ] Two consenting accounts: share profile URL, search handle, follow, open Following, ACK, reply, open Responses and return to the exact reply.
- [ ] Confirm a private/link run is absent from signed-out reads and public link previews.
- [ ] Confirm one capture creates one run by opening the same `measurement_revision` import twice.
- [ ] Confirm Grinder still works and no Grinder data, function or Auth trigger changed.

Report local, tested, hosted and used separately. A green dry run is not a deployment or real-user receipt.

## Email sign-in and project scope (3 October)

After custom SMTP is configured and a real non-team address receives a sign-in link, set `STRIVE_EMAIL_SIGNIN=1` for the website build. The browser also checks that Supabase reports the email provider enabled. The default remains off; email-provider enablement alone is not delivery evidence. `AGENTGRINDER_X_SIGNIN=1` remains independent. Origin remains a repository connection, not a consumer sign-in provider.

`/?projects` now shows the authenticated account's own projects, including private runs. `/?projects&scope=public` is the shared public directory. Signed-out visitors only see public projects. A delayed personal response is discarded if the account changes before it arrives.
