"""X sign-in: offered the moment Supabase reports the provider on, handles shown on the profile.

The switch lives in the Supabase dashboard (an X developer app plus the provider toggle), which
is a human's click. The site must not need a redeploy when that click happens, and it must never
show a Continue with X button that leads to a provider that is off.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
AUTH = (ROOT / "site" / "auth.js").read_text()
ACCOUNT = (ROOT / "site" / "account.js").read_text()
MIGRATION = (ROOT / "supabase" / "strava" / "013_x_handle.sql").read_text()


def test_providers_are_read_from_auth_settings_at_load():
    assert 'const PROVIDERS_ENABLED=["github"];' in INDEX
    assert "async function loadProviders()" in INDEX
    assert "'/auth/v1/settings'" in INDEX
    # Run the real loader against stubbed Auth settings. de00245 keeps the identifier Supabase
    # reports (x or legacy twitter) instead of always pushing 'x'.
    script = r"""
const fs=require('fs'),vm=require('vm');const s=fs.readFileSync('site/index.html','utf8');
const src=s.slice(s.indexOf('const PROVIDERS_ENABLED='),s.indexOf('const profileHandle='));
const out={};
async function run(name,replies,{url='https://project.supabase.co',baked=false}={}){
  const requests=[];let n=0;
  const ctx={SB_URL:url,SB_KEY:'anon-key',AbortSignal,fetch:async(u,o)=>{requests.push([u,o.headers.apikey]);const r=replies[Math.min(n++,replies.length-1)];if(r==='throw')throw new Error('offline');if(r==='500')return{ok:false,json:async()=>({})};return{ok:true,json:async()=>r}}};
  vm.createContext(ctx);
  vm.runInContext(baked?src.replace('const PROVIDERS_ENABLED=["github"];','const PROVIDERS_ENABLED=["github","x"];'):src,ctx);
  const first=vm.runInContext('PROVIDERS_ENABLED',ctx),steps=[];
  for(let i=0;i<replies.length;i++){const got=await vm.runInContext('loadProviders()',ctx);steps.push({list:[...got],same:got===first,label:vm.runInContext('signInLabel()',ctx)})}
  out[name]={steps,requests};
}
(async()=>{
  await run('x',[{external:{github:true,x:true}}]);
  await run('twitter',[{external:{github:true,twitter:true}}]);
  await run('off',[{external:{github:true,x:false,twitter:false}}]);
  await run('onThenOff',[{external:{x:true}},{external:{x:false}}]);
  await run('repeat',[{external:{x:true}},{external:{x:true}}]);
  await run('bakedButOff',[{external:{x:false}}],{baked:true});
  await run('bakedUnknown',['throw'],{baked:true});
  await run('emailNotReady',[{external:{email:true}}]);
  await run('throws',['throw']);
  await run('serverError',['500']);
  await run('noExternal',[{}]);
  await run('local',[{external:{x:true}}],{url:'http://127.0.0.1:54321'});
  process.stdout.write(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exit(1)});
"""
    got = json.loads(subprocess.check_output(["node", "-e", script], cwd=ROOT, text=True))
    lists = {name: [step["list"] for step in case["steps"]] for name, case in got.items()}
    assert lists == {
        "x": [["github", "x"]],
        "twitter": [["github", "twitter"]],
        "off": [["github"]],
        "onThenOff": [["github", "x"], ["github"]],  # switched off again: the button goes away
        "repeat": [["github", "x"], ["github", "x"]],  # never listed twice
        "bakedButOff": [["github"]],  # a build-time X switch never outlives a provider that is off
        "bakedUnknown": [["github", "x"]],
        "emailNotReady": [["github"]],  # email needs the delivery-ready build flag as well
        "throws": [["github"]],
        "serverError": [["github"]],
        "noExternal": [["github"]],
        "local": [["github"]],
    }
    # The list is changed in place: the account panel and sign-in dialog hold this same array.
    assert all(step["same"] for case in got.values() for step in case["steps"])
    assert got["x"]["requests"] == [["https://project.supabase.co/auth/v1/settings", "anon-key"]]
    assert got["local"]["requests"] == []
    assert got["x"]["steps"][0]["label"] == "Sign in with GitHub or X"
    assert got["twitter"]["steps"][0]["label"] == "Sign in with GitHub or X"
    assert got["off"]["steps"][0]["label"] == "Sign in with GitHub"
    assert "providersEnabled:PROVIDERS_ENABLED," in INDEX
    # 814dc93: the first route no longer waits for the settings call, so a slow or failed call can
    # neither delay nor remount the page. GitHub is the only offer until the call confirms X.
    boot = INDEX[INDEX.index("const refreshAndRoute=StriveStartup.coordinator("):INDEX.index("sb.auth.onAuthStateChange(")]
    assert "void loadProviders(); // Provider availability never remounts the current feed.\n    void refreshAndRoute();" in boot
    assert "loadProviders().then(" not in INDEX


def test_sign_in_dialog_offers_each_enabled_oauth_provider():
    dialog = INDEX[INDEX.index("function showSignIn(") : INDEX.index("function viewIdentitySetup()")]
    assert "p==='github'||p==='x'" in dialog
    assert "Continue with '+providerLabel(p)+'" in dialog
    assert "Sign in with GitHub or X" in INDEX


def test_x_handle_is_provider_owned_like_github_handle():
    assert "function xHandleOf(user)" in AUTH
    assert 'i.provider === "x" || i.provider === "twitter"' in AUTH
    assert "/^[a-z0-9_]{1,15}$/i" in AUTH
    assert "async function syncProviderHandles()" in AUTH
    assert "if (x && !p.x_handle) patch.x_handle = x;" in AUTH
    assert "syncGithubHandle: syncProviderHandles" in AUTH
    assert "auth.syncProviderHandles || auth.syncGithubHandle" in ACCOUNT


def test_profile_shows_proved_links_only():
    assert "function profileLinksHtml(prof,mine)" in INDEX
    assert "GrinderAuth.linksOf(prof)" in INDEX
    assert "${profileLinksHtml(prof,mine)}" in INDEX
    # Render the real profile header for each reader.
    out = subprocess.run(["node", "tests/fixtures/profile_view_probe.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, (out.stdout + out.stderr)[-3000:]
    seen = json.loads(out.stdout)
    # GitHub is provider-backed. Since 18fc66f the stored X handle is shown as an unverified social
    # link and never as a connected identity, for every reader including the owner.
    stored = [["GitHub @ada-gh", "https://github.com/ada-gh"], ["X @ada_x (unverified)", "https://x.com/ada_x"]]
    for reader in ("owner", "ownerPreview", "other", "anonymous"):
        assert seen[reader]["links"] == stored, reader
    links = json.loads(subprocess.check_output(["node", "-e", "const A=require('./site/auth.js');process.stdout.write(JSON.stringify([A.linksOf({github_handle:'ada-gh',x_handle:'ada_x'}),A.linksOf({handle:'typed',display_name:'@typed',name:'typed'})]))"], cwd=ROOT, text=True))
    assert links[0]["github"]["verified"] is True and links[0]["x"]["verified"] is False
    assert links[1] == {"github": None, "x": None}  # a typed STRIVE handle or name is never a link
    # Nothing stored: only the owner is offered linking, and Link X only while Auth reports X on
    # under either identifier (de00245). Other readers see no link row at all.
    assert seen["ownerNoLinksGithubOnly"]["links"] == [["Link GitHub", "/?account"]]
    assert seen["ownerNoLinksX"]["links"] == [["Link GitHub", "/?account"], ["Link X", "/?account"]]
    assert seen["ownerNoLinksTwitter"]["links"] == [["Link GitHub", "/?account"], ["Link X", "/?account"]]
    assert seen["otherNoLinksX"]["links"] == []


def test_migration_is_additive_and_checked():
    assert "add column if not exists x_handle text" in MIGRATION
    assert "'^[A-Za-z0-9_]{1,15}$'" in MIGRATION
    assert "create unique index if not exists profiles_x_handle_key" in MIGRATION
    for word in ("drop ", "grant ", "policy", "trigger"):
        assert word not in MIGRATION.lower().replace("no policy, grant, function or\n-- trigger changes", "")


def test_build_can_switch_x_on_without_a_commit():
    build = (ROOT / "scripts" / "build-site.mjs").read_text()
    assert "process.env.AGENTGRINDER_X_SIGNIN==='1'" in build
    assert "'const PROVIDERS_ENABLED=[\"github\",\"x\"];'" in build
