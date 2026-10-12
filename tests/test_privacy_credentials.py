"""Pasted credentials never reach a card, a title or an outcome line."""
import pytest

from agentgrinder import privacy
from agentgrinder.outcome import _clean


def _fake(prefix, body):
    # Built at run time so no credential-shaped literal is committed.
    return prefix + body


CREDENTIALS = {
    "private-key": _fake("-----BEG", "IN OPENSSH PRIVATE KEY-----"),
    "aws-access-key": _fake("AK", "IA" + "Q3EGRIB4NT2XMPLE"),
    "github-token": _fake("gh", "p_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"),
    "slack-token": _fake("xo", "xb-" + "1234567890-abcdefghijklmn"),
    "model-api-key": _fake("s", "k-proj-" + "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z"),
    "stripe-key": _fake("s", "k_live_" + "51HxYzAbCdEfGhIj"),
    "google-api-key": _fake("AI", "za" + "SyD3x4mpl3K3yW1thTh1rtyF1veCh4rsXYZ"),
    "jwt": _fake("ey", "JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl"),
    "strive-connect-token": _fake("ag", "_1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f9a8b7c6d"),
}


@pytest.mark.parametrize("rule,secret", sorted(CREDENTIALS.items()))
def test_each_credential_shape_is_refused(rule, secret):
    found = privacy.scan(f"Fix login: {secret} was in the config", memory=set())
    assert rule in {name for name, _ in found}


@pytest.mark.parametrize("text", [
    "Fix token refresh in the auth client",
    "Upgrade scikit-learn and pin sk-learn shim",
    "Document the JWT header and the AKIA prefix rule",
    "Add -----BEGIN CERTIFICATE----- parsing",
    "task-runner: retry the risk-assessment-for-staging job",
    "Rename ghp_ prefix constant",
])
def test_ordinary_work_descriptions_pass(text):
    assert privacy.scan(text, memory=set()) == []


def test_a_commit_subject_with_a_credential_never_becomes_the_card_line():
    secret = CREDENTIALS["github-token"]
    assert _clean(f"Rotate deploy key {secret}") == ""
    assert _clean("Rotate the deploy key") == "Rotate the deploy key"


def test_a_rendered_card_with_a_credential_fails_the_card_control():
    with pytest.raises(privacy.PrivacyLeak):
        privacy.assert_clean(f"<main><p>{CREDENTIALS['aws-access-key']}</p></main>")
