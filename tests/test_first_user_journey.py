"""Zero-run, Connect, My runs and deliberate-share contracts for the first-user journey."""
from pathlib import Path
import json
import subprocess


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
PROGRESS = (ROOT / "site" / "progress.js").read_text()
CONNECT = (ROOT / "site" / "connect.js").read_text()
POSTFLOW = (ROOT / "site" / "post-flow.js").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
HOSTED = (ROOT / "docs" / "HOSTED-CUTOVER.md").read_text()
GROK = (ROOT / "docs" / "GROK-PUSH.md").read_text()
DRY_RUN = (ROOT / "scripts" / "check-hosted-config.mjs").read_text()


def test_signed_in_builder_lands_on_the_feed_not_a_tour():
    # 25 Sep 2026 evening: home is the feed. d716f23 (8 Oct 2026) made that one feed for everybody:
    # home starts with real public work, and Following is an explicit filter, not the signed-in home.
    # Adding a run is /?post, and a /l/ "Drop yours" ask still lands on the drop zone.
    route = INDEX[INDEX.index("async function route(){") :]
    route = route[: route.index("return viewLanding(); }") + len("return viewLanding(); }")]
    assert "if(ME&&(await runCount())===0) return viewPost();" not in route
    assert "runCount()" not in route and "social.following({home:true})" not in INDEX
    assert "if(q.has('following')){setPrimarySection('feed');return social.following();}" in route
    # The last statement of the route, for everybody, is the home feed.
    assert route.rstrip().splitlines()[-1].strip() == "return viewLanding(); }"
    assert "if(location.hash==='#drop-zone') return viewPost();" in route
    # No tour: the only way into onboarding is an explicit /?onboard address, never a run count.
    assert route.count("viewOnboard()") == 1 and "if(await shouldOnboard()) return viewOnboard();" in route
    assert "async function viewOnboard(){ return viewConnect(); }" in INDEX
    onboard = INDEX[INDEX.index("async function shouldOnboard(){") : INDEX.index("// THE ONE CONNECT PAGE")]
    assert "runCount()" not in onboard and "ME" not in onboard
    script = "const location={search:''};" + onboard + """
(async()=>{const out={};for(const search of ['','?post','?onboard','?onboard=agent','?onboard=later','?u=fixture-owner']){
  location.search=search;out[search]=await shouldOnboard()}process.stdout.write(JSON.stringify(out))})();"""
    asked = json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    assert asked == {"": False, "?post": False, "?onboard": True, "?onboard=agent": True, "?onboard=later": False, "?u=fixture-owner": False}
    # The Add run page leads with a deliberate per-agent session picker (b803b86 replaced the single
    # auto-detect lead). The auto-detect command and tool-specific setup are advanced, in Import setup.
    assert "function connectBodyHtml()" in INDEX
    assert "const capture=ONE_LINE('auto')" in INDEX
    assert "agentCommands:Object.fromEntries(['cursor','claude','codex'].map(h=>[h,picker(h)]))" in INDEX
    assert '<details class="post-setup" id="post-setup" data-mcp-spec="${esc(mcpSpec)}" data-cursor-mcp-link="${esc(cursorMcpLink)}"><summary><span>Import setup</span>' in POSTFLOW
    assert POSTFLOW.index('class="post-source-grid"') < POSTFLOW.index('id="post-setup"') < POSTFLOW.index('<code class="c">${esc(capture)}</code>')
    # ba3cf50 moved the Grok Bot guide link from the page to the My runs empty state.
    assert "docs/GROK-PUSH.md" in PROGRESS


def test_zero_run_surfaces_connect_and_deliberate_save():
    assert "Preview stays private on this device" not in INDEX
    assert "Sign in to save the run and choose who can read it." in INDEX
    assert "Your first run starts private" in PROGRESS
    assert 'href="/?connect">Connect an agent</a>' in PROGRESS
    assert "Private uploads appear here" in PROGRESS
    assert "Choose Public to add one to the feed." in PROGRESS
    assert "Grok Bot push guide" in PROGRESS


def test_my_runs_hides_unknown_and_signs_in_with_github():
    assert "Unknown" not in PROGRESS
    assert "Sign in with GitHub" in PROGRESS
    assert "signInGitHub" in PROGRESS
    assert "signInGitHub:()=>signInWithGitHub()" in INDEX
    assert "countBits" in PROGRESS


def test_connect_primary_still_points_at_mine():
    assert 'href="/?mine">See my runs</a>' in CONNECT
    assert "Private uploads appear in" in CONNECT


def test_private_run_offers_deliberate_audience_cta():
    assert 'href="#run-audience">Choose who can see this</a>' in INDEX
    assert "Private uploads stay in My runs until you deliberately choose Followers or Public below." in INDEX


def test_responses_signed_out_uses_github():
    assert "Sign in with GitHub" in SOCIAL
    assert "signInGitHub" in SOCIAL
    assert "signInGitHub:()=>signInWithGitHub()" in INDEX


def test_manual_post_names_its_duplicate_limit():
    composer = INDEX[INDEX.index("function postComposerHtml(") : INDEX.index("async function viewPost()")]
    assert "Manual posts have no capture identifier." in composer
    assert "browser gives each save an identifier" in composer
    assert "Check and try again" in composer
    assert "never invents a measurement revision" in composer


def test_landing_featured_card_keeps_caption_and_output_primary():
    card = INDEX[INDEX.index("function featuredCard(") : INDEX.index("function howItWorks()")]
    assert "r.caption" in card
    assert "Open what was built" in card
    assert 'class="primary-output"' in card


def test_cutover_docs_and_dry_run_cover_schema_boundary():
    for value in (
        "AGENTGRINDER_URL",
        "AGENTGRINDER_SUPABASE_URL",
        "AGENTGRINDER_SUPABASE_ANON_KEY",
        "SB_URL",
        "SB_KEY",
        "SB_SCHEMA",
        'storageKey:"agentic-strava-auth"',
        "Auth Redirect URLs",
    ):
        assert value in HOSTED
    # 8f562a6 (11 Oct 2026) rewrote the Grok guide around the hosted companion. The boundary it must
    # still state: the preview is local, saving goes through the signed-in hosted site as Only me,
    # and a preview alone saves nothing.
    assert "The preview is local." in GROK
    assert "Save through the signed-in STRIVE site as **Only me**" in GROK
    assert "Public sharing and engagement are separate choices." in GROK
    assert "no run was saved by that test" in GROK
    assert "(https://striverun.app/agents.md)" in GROK and "(https://striverun.app/capture/grok/SKILL.md)" in GROK
    assert "localhost" not in GROK.lower()
    assert "Accept-Profile" in DRY_RUN and "Content-Profile" in DRY_RUN
    assert "No network request or production write was made." in DRY_RUN
