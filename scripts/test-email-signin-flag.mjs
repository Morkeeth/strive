import assert from 'node:assert/strict';
import {emailSigninEnabled,ignoredLegacyEmailFlag} from './email-signin-flag.mjs';
assert.equal(emailSigninEnabled({}),false);
assert.equal(emailSigninEnabled({STRIVE_EMAIL_SIGNIN:'1'}),false);
assert.equal(ignoredLegacyEmailFlag({STRIVE_EMAIL_SIGNIN:'1'}),true);
assert.equal(emailSigninEnabled({STRIVE_EMAIL_SIGNIN_SMTP_VERIFIED:'1'}),true);
assert.equal(emailSigninEnabled({STRIVE_EMAIL_SIGNIN_SMTP_VERIFIED:'true'}),false);
assert.equal(ignoredLegacyEmailFlag({STRIVE_EMAIL_SIGNIN:'1',STRIVE_EMAIL_SIGNIN_SMTP_VERIFIED:'1'}),false);
console.log('PASS: email sign-in needs STRIVE_EMAIL_SIGNIN_SMTP_VERIFIED=1; the legacy production variable alone keeps it hidden');
