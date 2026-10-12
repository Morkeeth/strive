"""Account control and sign-in recovery lane contracts: honest providers, safe destructive copy."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = (ROOT / "site" / "account.js").read_text()
AUTH = (ROOT / "site" / "auth.js").read_text()
ORIGIN = (ROOT / "site" / "origin.js").read_text()
CSS = (ROOT / "site" / "account.css").read_text()
LOOP = (ROOT / "scripts" / "check-account-loop.py").read_text()
PACKAGE = (ROOT / "package.json").read_text()
INDEX = (ROOT / "site" / "index.html").read_text()


def test_account_module_owns_the_panel_and_recovery():
    assert "window.GrinderAccount" in ACCOUNT
    assert "async function view" in ACCOUNT
    assert "function recover" in ACCOUNT
    exported = ACCOUNT.rsplit("return {", 1)[1]
    assert "view" in exported and "recover" in exported


def test_no_cursor_or_origin_login_and_x_is_gated():
    assert "data-link=\"cursor\"" not in ACCOUNT and "Continue with Cursor" not in ACCOUNT and "Continue with Origin" not in ACCOUNT
    # Render the actual provider menu with X disabled, then enabled.
    subprocess.run(['node','-e',r"""
const fs=require('fs'),{JSDOM}=require('jsdom'),assert=require('node:assert/strict');
const w=new JSDOM('<main id="app"></main>',{runScripts:'outside-only'}).window;
for(const file of ['auth','account'])w.eval(fs.readFileSync('site/'+file+'.js','utf8'));
const render=providersEnabled=>w.GrinderAccount({providersEnabled}).identitiesHtml([]);
for(const providers of [['github','email'],['github','email','x']]){
 const doc=new JSDOM(render(providers)).window.document;
 assert.equal(doc.querySelector('[data-link="cursor"],[data-link="origin"]'),null);
 assert.equal(!!doc.querySelector('[data-link="x"]'),providers.includes('x'));
}
"""],cwd=ROOT,check=True)
    assert "is not available on this service yet" in ACCOUNT
    assert "providersEnabled" in ACCOUNT


def test_origin_is_a_post_sign_in_repository_connection_only():
    assert "not a sign-in method" in ORIGIN
    assert "Continue with Origin" not in ORIGIN and "Sign in with Origin" not in ORIGIN
    for state in ("hidden", "connect", "cancelled", "error", "connected", "disconnected"):
        assert f'"{state}"' in ORIGIN
    assert 'origin.html({ signedIn: true })' in ACCOUNT
    assert '{ id: "origin"' not in AUTH.lower(), "Origin must not become a Supabase Auth provider"


def test_destructive_action_explains_what_goes_and_stays_without_confirm_dialog():
    assert "Goes:" in ACCOUNT and "Stays:" in ACCOUNT
    assert "Agent Grinder profile" in ACCOUNT
    assert "cannot be restored" in ACCOUNT
    assert "Type your handle" in ACCOUNT
    assert "confirm(" not in ACCOUNT
    assert "deleteProfile" in ACCOUNT and "signOutLocal" in ACCOUNT


def test_last_identity_and_duplicate_handle_are_actionable():
    assert "only way to sign in" in ACCOUNT
    assert "handle_taken" in ACCOUNT and "freeVariant" in ACCOUNT
    assert 'aria-invalid' in ACCOUNT and 'role="status"' in ACCOUNT


def test_auth_recovery_reads_hash_and_query_and_remembers_pending():
    assert "parseAuthError" in AUTH and "recoverFromUrl" in AUTH
    assert "ag_auth_pending" in AUTH
    for code in ("cancelled", "link_expired", "provider_failed", "last_identity", "identity_taken", "linking_disabled"):
        assert '"' + code + '"' in AUTH


def test_profile_id_stays_stable_and_deletion_is_strava_only():
    assert 'eq("auth_uid", u.id)' in AUTH
    assert 'from("profiles").delete()' in AUTH
    assert "auth.admin" not in AUTH and "deleteUser" not in AUTH, "no Auth-user deletion from the client"
    assert 'scope: "local"' in AUTH


def test_phone_and_keyboard_surface():
    assert "min-height:44px" in CSS
    assert "@media(max-width:600px)" in CSS
    assert "aria-labelledby" in ACCOUNT and "aria-live" in ACCOUNT


def test_browser_walk_covers_the_assigned_checks_and_shell_hooks():
    for needle in ("access_denied", "last_identity", "grinder-snapshot", "test-riley-2", "scope=local"):
        assert needle in LOOP
    assert "HOOKS" not in LOOP and "HOOK_" not in LOOP, "the walk drives the real shell, it does not insert hooks"
    assert '"test:account"' in PACKAGE
    assert '"test:origin"' in PACKAGE


def test_shell_is_integrated_not_patched_in_memory():
    """Round 2: the eight account hooks live in site/index.html itself."""
    assert '<link rel="stylesheet" href="/account.css">' in INDEX
    assert '<script src="/account.js"></script>' in INDEX
    assert '<script src="/origin.js"></script>' in INDEX
    assert INDEX.index('<script src="/origin.js"></script>') < INDEX.index('<script src="/account.js"></script>')
    assert "const account=GrinderAccount({" in INDEX
    assert "const originConnection=GrinderOrigin.create();" in INDEX
    route = INDEX[INDEX.index("async function route(){"):INDEX.index("const q=new URLSearchParams(location.search);", INDEX.index("async function route(){"))]
    assert "account.recover();" in route
    assert "authErrorFromUrl" not in INDEX
    assert "if(q.has('account')){return account.view();}" in INDEX
    assert "people|account|connect|explore|boards|projects?|crews?)(=|&|$)" in INDEX
    # The avatar menu owns account settings; signed-in users without a profile can still sign out.
    you = INDEX[INDEX.index("function menuLinks(kind)"):INDEX.index("function syncAuthNav()")]
    assert '<a href="/?account" role="menuitem">Settings</a>' in you
    assert "AUTH_USER" in you and "Sign out" in you
    assert you.index("if(!ME)") < you.index('href="/?account"')
    assert 'href="/?account"' in INDEX and "profile deletion" in INDEX
    delete_path = INDEX[INDEX.index("document.addEventListener('DOMContentLoaded'"):]
    assert "$('delete').addEventListener" not in delete_path and "Delete your STRIVE profile and owned work?" not in delete_path
