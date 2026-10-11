# STRIVE auth email templates

`confirm-signup.html` is an unchanged export of the approved live Supabase Confirm signup template on 11 October 2026. `magic-link.html` uses the same design with sign-in copy.

Proposed magic-link subject: **Your STRIVE sign-in link**.

Both use Supabase's `{{ .ConfirmationURL }}` for the single primary button and copy-link fallback. Neither template contains a key or a real test link.

The provider owner must review the diff before pasting the magic-link HTML and subject into Supabase. Keep an exact copy of the prior subject/HTML for rollback. No other auth setting changes are part of this patch.

Keep `EMAIL_SIGNIN_READY=false` until a fresh sign-up reaches an explicitly created profile, sign-in and reload succeed, the designed sign-in email is delivered, and the disposable account is deleted with zero-row readback. Provider delivery, browser authentication and profile creation are separate checks.
