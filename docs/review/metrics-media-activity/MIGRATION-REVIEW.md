# Photo order and personal consent — review only

037 adds `sort_position` (visual order) and `personal_public_selected` (at most one personal photo per run). Backfill preserves the existing Result-first arrangement for estimate-backed Result layouts; other runs retain cover-first order. Backfill grants consent only to existing personal `is_cover=true` rows. Public readers need the run audience, `is_selected`, and personal consent. Reorder never edits consent; `is_cover` remains a first-image compatibility field. The legacy cover RPC also only changes order.

No production SQL has been applied by this branch. Fable read the deployed policy and functions on 11 October. The generated rollback definitions match BOTH live pg_get_functiondef md5/length pairs: choose_run_cover aa0bb69b6514a24b279397ee94fd1a6e / 710; set_run_photo_role 2fbfb321e14941c822229c70f2baf3f0 / 722. The live policy matches036. The private receipt is ~/.local/state/strive-photo-order-20261011/LIVE-READBACK-2026-10-11.txt. Recheck the SELECT below if release state changes. The expected existing `run_photos_read` expression is owner access OR `is_selected AND (role <> 'personal' OR is_cover) AND grinder_can_read_run(run_id)`. A source file is not proof of live state.

```sql
select policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='strava' and tablename='run_photos';
select pg_get_functiondef('strava.choose_run_cover(uuid,uuid)'::regprocedure),
       pg_get_functiondef('strava.set_run_photo_role(uuid,uuid,text)'::regprocedure);
```

Apply migration before deploying the matching API. Old clients remain fail-closed when personal cover/order differs. After deploy, verify owner reorder/save/reload; anonymous and signed-in-other list/detail/feed/public page and known-id bytes; then revoke consent and verify 404 before conditional 304. Restore with `rollback-photo-order.sql` and the saved live functions before old application deployment. Keep new columns and bytes so changes remain recoverable.

Local permission proof: `node scripts/test-photo-order-consent.mjs` uses disposable PostgreSQL (PGlite), never production. Covers both reorder directions, owner/other/anonymous, one-personal constraint, cover without consent, explicit revoke, malformed order, and role change. API/editor parity tests follow separately.
