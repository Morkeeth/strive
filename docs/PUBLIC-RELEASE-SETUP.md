# Shared Supabase release setup

This product captures a run locally, previews it privately, then lets its owner choose whether to post. Browsing public runs does not require sign-in.

## Data boundary

All app data and functions use the dedicated `strava` schema. Auth is shared at the project level. Browser reads use `db.schema = strava`, server reads send `Accept-Profile: strava`, and writes send `Content-Profile: strava`. Never fall back to `public`.

Run `supabase/strava/preflight.sql` read-only before and after a release. Generate a first install with:

```sh
python3 scripts/prepare-strava-database.py > /tmp/strava-bootstrap.sql
```

Review the transaction before applying it. Keep later migrations schema-qualified with restricted function search paths. Do not change project-wide Auth triggers, defaults or exposed schemas except to add `strava`.

## Hosting and sign-in

Use the separate Vercel project. Configure the browser, server and CLI endpoints together, keep `SB_SCHEMA` fixed to `strava`, and put no privileged key in frontend assets.

GitHub sign-in (the only provider enabled, `PROVIDERS_ENABLED` in site/index.html) uses shared Auth but creates a profile in `strava`. Add the exact site callback to the allowlist without changing the project Site URL. Public handles are labels, not proof of account ownership.

Before release, run `python3 scripts/dev.py check`, `npm run build`, and the relevant disposable browser path. Hosted acceptance needs consenting accounts and must verify private-by-default capture, deliberate posting, public browsing, responses and deletion. Local tests, hosted checks and real use are separate evidence.

## Release order

- **PyPI before a version bump goes live.** `/install`, `/plugins/install.md` and the Cursor one-click link name `striverun==<pyproject version>`, and `strive sync --install` pins the installed release. Publish that version to PyPI before deploying a site build whose `pyproject.toml` carries it.
- **Migration 042 after the site.** `042_private_auth_uid.sql` stops readers selecting `profiles.auth_uid`. The site reads the owner's row through `strava.my_profile()` and falls back to the old owner read while that function is missing, so deploy the site first, then apply 042. Afterwards check a signed-out profile page (`/?u=<handle>`), sign-in, and one XUDOS. The rollback is `docs/review/private-auth-uid/rollback-042-private-auth-uid.sql`; it is complete and tested.
