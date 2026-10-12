"""Three things a stranger sees (26 Sep night): the card's share link at 390 px, sign-in docs that
match the live site, and decision stories that refuse malformed routes."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_the_share_link_is_never_cut_off_in_the_card():
    # A run address is longer than a 390 px card; nowrap clipped it (flipbook 26 Sep, screen 04).
    for path in ("site/feed.css",):
        rule = re.search(r"\.fc-where\{([^}]*)\}", (ROOT / path).read_text()).group(1)
        assert "nowrap" not in rule and "overflow-wrap:anywhere" in rule
    assert "white-space:nowrap}" not in re.search(r"\.fc-where\{[^}]*\}", (ROOT / "agentgrinder/feedcard.py").read_text()).group(0)


def test_docs_offer_only_the_sign_in_the_site_offers():
    index = (ROOT / "site/index.html").read_text()
    providers = json.loads(re.search(r"const PROVIDERS_ENABLED=(\[[^\]]*\]);", index).group(1))
    email_ready = re.search(r"const EMAIL_SIGNIN_READY=(true|false);", index).group(1) == "true"
    assert providers == ["github"] and email_ready is False  # what a stranger is offered by default
    names = {"github": "github", "x": "x", "twitter": "x", "email": "email"}
    offered = {names[p] for p in providers} | ({"email"} if email_ready else set())
    docs = {doc: " ".join((ROOT / doc).read_text().split()) for doc in ("README.md", "PRODUCT.md")}
    for doc, text in docs.items():
        if "email" not in offered:
            for promise in ("email link", "magic link", "sign in with email", "sign-in with email", "sign in by email"):
                assert promise not in text.lower(), f"{doc} promises email sign-in the site does not offer"
        # Every provider a doc names as a way in is one the site offers by default. A provider that
        # is built but switched off (X) must say so on the same line.
        way_in = r"(?:[Ss]ign(?:ing)?[- ]in (?:with|using|via|through)|Continue with) (GitHub|X|Twitter|Google|Apple|Cursor|Origin|email)\b"
        for line in (ROOT / doc).read_text().splitlines():
            for provider in re.findall(way_in, line):
                if names.get(provider.lower()) in offered:
                    continue
                assert provider == "X" and "when the provider is on" in line and "Not live until" in line, \
                    f"{doc} offers {provider} sign-in the site does not offer"
            if re.search(r"\bX sign-in\b", line) and "x" not in offered:
                assert "Not live until" in line, f"{doc} presents X sign-in as available"
    # Since 9e0dfc9 (3 Oct) the README's first-run steps say when to sign in and leave the provider
    # to what the site shows. Naming an offered provider there is still fine (checked above).
    assert "3. **Save as Only me.** Sign in, choose **Only me**, save, then open the run again" in docs["README.md"]
    # PRODUCT.md is where the offered provider is named.
    assert "- Sign-in with GitHub. One profile per account, with a handle and display name you can edit." in docs["PRODUCT.md"]
    assert "offers Continue with X when the provider is on" in docs["PRODUCT.md"]


def test_malformed_routes_tell_no_decision_story():
    js = r"""
const m=await import('./server/decision-story.mjs');
const id='ffffffff-0000-4111-8222-333333333333';
const run=r=>({id,title:'T',code_route:{v:1,...r}});
const S=[{id:'1',project:'a',kind:'edit',label:'One',basis:'measured'},{id:'2',project:'a',kind:'edit',label:'Two',basis:'measured'},{id:'3',project:'b',kind:'edit',label:'Fin',basis:'measured'}];
const P=[{id:'a',label:'alpha'},{id:'b',label:'beta'}];
const out={
 inherited: m.hasDecisionStory(run({projects:P,stops:S,connectors:[{from:'toString',to:'3',kind:'handoff'}],finish:{stop:'3'}})),
 duplicate: m.hasDecisionStory(run({projects:[{id:'a',label:'alpha'},{id:'a',label:'beta'}],stops:S.slice(0,2),connectors:[]})),
 kindObject: m.hasDecisionStory(run({projects:P,stops:[{...S[0],kind:{}},S[2]],connectors:[]})),
 kindMissing: m.hasDecisionStory(run({projects:P,stops:[{id:'1',project:'a',label:'One',basis:'measured'},S[2]],connectors:[]})),
 good: m.hasDecisionStory(run({projects:P,stops:S,connectors:[{from:'2',to:'3',kind:'handoff'}],finish:{stop:'3'}})),
};
process.stdout.write(JSON.stringify(out));
"""
    out = json.loads(subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    assert out["good"] is True
    assert out["inherited"] is False, "a handoff from an inherited name counts"
    assert out["duplicate"] is False, "duplicate project ids are kept"
    assert out["kindObject"] is False and out["kindMissing"] is False, "a stop kind that is not a string is printed"
