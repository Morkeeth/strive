# STRIVE architecture

The product path is capture → preview → save privately → choose an audience → read and respond. Capture, save and publication are separate actions.

## What lives where

| Location | Responsibility |
| --- | --- |
| `agentgrinder/` | Python CLI and companion: read a selected local session, derive recorded facts, and prepare a preview. Package metadata is in `pyproject.toml`. |
| `site/` | Browser app. `index.html` contains routes and the shell; separate scripts handle identity, cards, photos, social controls and sharing. `design.css` holds shared card tokens. |
| `api/` | Vercel HTTP entry points. Handlers delegate validation, access checks and rendering to `server/`. |
| `server/` | Server access checks, public run/profile metadata, image rendering and runtime configuration. |
| `supabase/strava/` | Ordered app migrations. App tables, functions and policies use the `strava` schema. |
| `scripts/` and `tests/` | Build, contributor commands, isolated database harnesses and labelled fixtures. |
| `archive/` | Historical hackathon material; it does not define the current product. |

The public app uses Vercel and Supabase. Authentication shares a Supabase project with a separate service; the app's data is in `strava`. An app change must not modify shared Auth triggers or the other service's public-schema records.

## Capture and deployment

`python3 scripts/dev.py setup` installs the capture package and Python test dependencies in a local virtual environment. `npm ci --ignore-scripts` installs locked website and database-test dependencies. `npm run build` copies the site into `dist/`, applies runtime configuration and builds the capture archive served with that release. `scripts/build-site.mjs` owns that build. Its last step writes a Content-Security-Policy into `dist/index.html` (`scripts/csp.mjs`) that allows each inline script by hash; the Supabase SDK is pinned with Subresource Integrity.

The checked-in browser configuration targets a local database and uses a placeholder key. A contributor checkout cannot sign in to production from those constants. `server/runtime-config.mjs` validates deployment configuration; privileged keys must never reach browser output.

## Database changes

`python3 scripts/prepare-strava-database.py` prints the schema-qualified installation SQL; it does not apply it. A maintainer reviews migrations and runs them against an isolated database first. `npm run test:shared-schema` checks app isolation alongside the separate service's schema. `scripts/disposable-supabase.mjs` builds an in-memory PostgreSQL-compatible database from the app migrations for local tests.

A migration, a deployed client and an observed user action are separate checks. A release that depends on new schema needs the schema applied and verified before its client path is accepted. Follow [release setup](PUBLIC-RELEASE-SETUP.md); do not run the historical public-schema installer against the shared project.

## Access and test boundaries

Run audience is enforced through database policies and server checks. Photo access follows the live run audience and explicit personal-photo selection. The browser's hidden controls are not an access boundary. Readers cannot select `profiles.auth_uid` (`042_private_auth_uid.sql`); the signed-in owner reads their own row through `strava.my_profile()`. Preserve owner/other-account/anonymous cases and revocation when changing these paths.

Fork CI uses repository fixtures and disposable data without production credentials. It verifies local behavior and builds; it does not prove hosted sign-in or real participation. Browser tests must state whether they used a fixture, a disposable database or the hosted service. See [security](../SECURITY.md), [contributor setup](../CONTRIBUTING.md) and [card rules](design/CARD-SYSTEM.md).

The earlier coach diagram is preserved in [technical history](../archive/hackathon-2026-09/docs/coach-architecture.md).
