"""Early-alpha status, feedback delivery, and Coach roadmap copy stay honest."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
INDEX = (SITE / "index.html").read_text()
READING = [
    (SITE / name).read_text()
    for name in ("about.html", "methodology.html", "privacy.html", "terms.html", "404.html")
]


def test_early_alpha_is_visible_in_the_app_and_reading_pages():
    assert '<span class="alpha-label">Early alpha</span>' in INDEX
    for page in READING:
        assert '<span class="alpha-label">Early alpha</span>' in page


def test_reachable_coach_copy_says_planned_and_not_live():
    about = (SITE / "about.html").read_text()
    methodology = (SITE / "methodology.html").read_text()
    setup = INDEX[INDEX.index("function sidePanels(") : INDEX.index("function skeletonCard(")]
    assert "Coach is on the roadmap" in about
    assert "It is not available" in about
    assert "Coach is on the roadmap" in methodology
    assert "does not generate a Coach review" in methodology
    assert "Planned · not live" in setup
    assert "Bedrock coach" not in setup
    assert "optional network mode" not in setup


def test_send_feedback_uses_the_authenticated_persisted_delivery_contract():
    pages = [INDEX, *READING]
    for page in pages:
        assert 'href="/?feedback">Send feedback</a>' in page
    feedback = INDEX[INDEX.index("function viewFeedback()") : INDEX.index("function wireComposer()")]
    assert "sb.from('alpha_feedback').insert({profile_id:ME.id,category:$('feedback-category').value,message:trimmedText,page:location.pathname})" in feedback
    assert ".select(" not in feedback
    assert 'maxlength="2000"' in feedback
    assert 'value="bug"' in feedback and 'value="idea"' in feedback and 'value="other"' in feedback
    assert "Feedback saved. Thank you." in feedback
    assert "Your message is still here" in feedback
    assert "setTimeout" not in feedback


def test_active_interface_uses_plain_social_and_account_labels():
    social = (SITE / "social.js").read_text()
    people = (SITE / "people.js").read_text()
    account = (SITE / "account.js").read_text()
    privacy = (SITE / "privacy.html").read_text()
    terms = (SITE / "terms.html").read_text()
    for source in (INDEX, social, people, account, privacy, terms):
        for retired in ("Back to Responses", ">Discuss<", "ACKs recognise", "Your account"):
            assert retired not in source
    assert ">Reply</a>" in INDEX
    assert "Back to Notifications" in social and "Back to Notifications" in people
    assert "<h1>Settings</h1>" in account
    assert "XUDOS recognise real contributions" in terms
