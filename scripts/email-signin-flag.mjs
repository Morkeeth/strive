// Email sign-in shows only when the build sets STRIVE_EMAIL_SIGNIN_SMTP_VERIFIED=1.
// Set it only after a real non-team address has received a sign-in link from the custom SMTP sender.
// The older STRIVE_EMAIL_SIGNIN variable is still set in Vercel Production from October and is
// ignored on purpose (14 Nov 2026), so that stale value cannot show a link that may not arrive.
// To turn email back on: set the new variable in Vercel and redeploy, or revert this commit.
export const EMAIL_SIGNIN_FLAG='STRIVE_EMAIL_SIGNIN_SMTP_VERIFIED';
export function emailSigninEnabled(env=process.env){
 return env[EMAIL_SIGNIN_FLAG]==='1';
}
export function ignoredLegacyEmailFlag(env=process.env){
 return env.STRIVE_EMAIL_SIGNIN==='1'&&!emailSigninEnabled(env);
}
