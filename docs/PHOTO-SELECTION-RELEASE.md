# Reversible image selection

`strava.run_photos.is_selected` defaults to true, preserving existing selections. False keeps the saved row and storage object for the owner while excluding the image from every reader audience. A selected personal image still requires `is_cover=true`; selecting several personal images never shares several personal photos.

The owner editor stages **Selected · Hide** / **Not selected · Show** with the existing Save. Cancel makes no requests. Hiding a cover preserves its cover flag, so restoring the same saved image restores the prior choice. A hidden image never leads a feed card or project thumbnail.

## Review and release order

1. Record the current release, exact `run_photos_read` policy, function grants and the target rows' `id,run_id,is_cover,role`. Do not modify rows at this step.
2. Review `supabase/strava/036_photo_selection.sql` and its hash. It adds one boolean, replaces only the photo SELECT policy, and adds an owner-only RPC. No rows or objects are deleted. Test with `node scripts/test-photo-selection.mjs`, including anonymous/other-owner reads, known IDs, owner restore and grants.
3. After approval, apply that exact migration as the database owner. Read back the boolean type/default/nullability, policy, RPC grants and row count. Existing rows must all retain true unless a separate authorized writer deliberately changes them.
4. Merge the green reviewed application release and deploy. The new server explicitly selects the new column, so migration precedes application deployment. Missing migration must be fixed before releasing this application.
5. Use a private test run to hide and restore a project image in the editor. Save/reload must retain the setting; Cancel must not. Check signed-out list, feed, native detail, `/r/`, direct original and 64/320/480/960-byte routes; hidden image must return 404 even with its old ETag. Owner must still see and restore it. Check selected personal cover and unchosen personal images separately.
6. Only after image/caption approval, apply a separately reviewed exact per-run selection list. Retain before-state receipt. Never infer the list by role, age or filename. Upload approved replacement media before hiding the only project images if an empty project tile is not wanted.
7. Capture the actual live 390/1440 cards and gallery. Current-interface screenshots must be captioned with their capture date; they are not historical session output evidence.

## Readback

```sql
select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='strava' and table_name='run_photos' and column_name='is_selected';
select policyname,qual from pg_policies
where schemaname='strava' and tablename='run_photos' and policyname='run_photos_read';
select pg_get_functiondef('strava.set_run_photo_selected(uuid,uuid,boolean)'::regprocedure);
select r,has_function_privilege(r,'strava.set_run_photo_selected(uuid,uuid,boolean)','execute')
from unnest(array['anon','authenticated']) r;
```

## Rollback

- Application: return to the recorded prior application release. Keep the selection column and stricter read policy; older application readers still receive only authorized metadata through RLS.
- Selection mistake: the owner restores the same image, or the release owner restores the exact approved before-state booleans by ID. Recheck signed-out bytes and all card surfaces. Do not delete/reupload.
- Do **not** drop the field or restore the permissive old read policy as an automatic rollback: that would make deliberately hidden images readable again. A database rollback that broadens visibility needs explicit review of every hidden row first. Keep the stronger policy while investigating; it preserves owner access.
- Storage bytes and photo rows are unchanged by selection and need no restoration.
