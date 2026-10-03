"""Versioned exchange contract. Private transcript metadata is never an export field."""
from __future__ import annotations

import hashlib
import math
import re
from urllib.parse import urlsplit

SCHEMA_VERSION = 1
COUNT_FIELDS = ("turns_typed", "tool_calls", "shell_calls", "files_touched", "commits", "claims",
                "claims_verified", "artifacts_produced")


def validate_run(run: dict) -> dict:
    if not isinstance(run, dict):
        raise ValueError("A grind must be a JSON object.")
    version = run.get("schema_version", 0)
    if type(version) is not int or version not in (0, SCHEMA_VERSION):
        raise ValueError("This grind uses an unsupported format. Update Agent Grinder to read it.")
    for name in COUNT_FIELDS:
        value = run.get(name)
        if value is not None and (type(value) is not int or value < 0):
            raise ValueError(f"{name} must be a non-negative whole number or unknown.")
    duration = run.get("duration_s")
    if duration is not None and (type(duration) not in (int, float) or not math.isfinite(duration) or duration < 0):
        raise ValueError("duration_s must be a finite non-negative number or unknown.")
    claims, verified = run.get("claims"), run.get("claims_verified")
    if verified is not None and claims is None:
        raise ValueError("Verified claims require a counted-claims total.")
    if claims is not None and verified is not None and verified > claims:
        raise ValueError("Verified claims cannot exceed the claims counted.")
    ridge = run.get("ridge")
    if ridge is not None:
        if (not isinstance(ridge, list) or not 40 <= len(ridge) <= 60
                or any(type(value) is not int or value < 0 for value in ridge)):
            raise ValueError("ridge must contain 40 to 60 non-negative whole-number bins.")
        workers = run.get("worker_bins")
        if workers is not None and (not isinstance(workers, list) or len(workers) != len(ridge)
                or any(type(value) is not int or value < 0 for value in workers)):
            raise ValueError("worker_bins must be unknown or non-negative whole-number bins matching ridge.")
        commits = run.get("commit_bins", [])
        if (not isinstance(commits, list)
                or any(type(value) is not int or value < 0 or value >= len(ridge)
                       for value in commits)):
            raise ValueError("commit_bins must contain valid ridge bin indexes.")
        if run.get("ridge_basis") not in ("wall-time", "call-index", "turn-order"):
            raise ValueError("ridge_basis must be wall-time, call-index, or turn-order.")
        wall = run.get("ridge_wall_seconds")
        if (wall is not None
                and (type(wall) not in (int, float) or not math.isfinite(wall) or wall < 0)):
            raise ValueError("ridge_wall_seconds must be a finite non-negative number or unknown.")
        # The store's own count. It is recorded next to tool_calls, never compared against it.
        store_calls = run.get("ridge_tool_calls")
        if store_calls is not None and (type(store_calls) is not int or store_calls < 0):
            raise ValueError("ridge_tool_calls must be a non-negative whole number or unknown.")
    public_outcome(run)
    selected_insight(run)
    if run.get("code_route") is not None:
        from .code_route import validate_code_route

        run["code_route"] = validate_code_route(run["code_route"])
    return run


OUTCOME_FIELDS = ("repo_url", "receipts", "shipped", "artifact_url", "image_url", "insight")
MAX_INSIGHT = 120
_REPO = re.compile(r"https://(github\.com|gitlab\.com|codeberg\.org)/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+", re.I)
_IMAGE = re.compile(r"\.(png|jpe?g|webp)([?#].*)?\Z", re.I | re.S)
_UNSAFE_URL = re.compile(r"[\s<>\"'\\]")


def _safe_url(value, field: str) -> str:
    """One https link. Same rule as strava.grinder_is_safe_url and site/run-contract.js safeUrl."""
    if (not isinstance(value, str) or not 12 <= len(value) <= 300 or _UNSAFE_URL.search(value)
            or "javascript:" in value.lower() or urlsplit(value).scheme != "https"):
        raise ValueError(f"{field} must be one https link under 300 characters.")
    return value


def public_outcome(run: dict) -> dict:
    """The declared outcome fields, validated and copied exactly as stated. Never measured.

    They are the uploader's own words and links, so nothing is trimmed, rewritten or invented. A
    value the hosted database would refuse raises here, so a bad field is a loud local error and
    never a silently weaker card. An absent or null field stays unknown and is left out. The rules
    repeat migration 008 and site/run-contract.js.
    """
    out = {}
    for field in ("repo_url", "artifact_url", "image_url"):
        value = run.get(field)
        if value is None:
            continue
        _safe_url(value, field)
        if field == "repo_url" and not _REPO.match(value):
            raise ValueError("repo_url must be a repository on github.com, gitlab.com or codeberg.org.")
        if field == "image_url" and not _IMAGE.search(value):
            raise ValueError("image_url must end in .png, .jpg, .jpeg or .webp.")
        out[field] = value
    shipped = run.get("shipped")
    if shipped is not None:
        if not isinstance(shipped, list) or len(shipped) > 5:
            raise ValueError("shipped holds at most 5 lines.")
        if any(not isinstance(line, str) or not 1 <= len(line.strip()) <= 120 for line in shipped):
            raise ValueError("each shipped line is text, 1 to 120 characters.")
        out["shipped"] = list(shipped)
    receipts = run.get("receipts")
    if receipts is not None:
        if not isinstance(receipts, list) or len(receipts) > 5:
            raise ValueError("receipts holds at most 5 links.")
        for receipt in receipts:
            if (not isinstance(receipt, dict) or set(receipt) - {"label", "url"}
                    or not isinstance(receipt.get("label"), str) or not 1 <= len(receipt["label"].strip()) <= 60):
                raise ValueError("each receipt is {label, url}: a label of 1 to 60 characters and one https link.")
            _safe_url(receipt.get("url"), "each receipt url")
        out["receipts"] = [{"label": receipt["label"], "url": receipt["url"]} for receipt in receipts]
    return out


def selected_insight(run: dict) -> dict:
    """The one selected insight, validated and BOUND to a receipt this same run carries.

    An insight is the single line a run is worth remembering for — the verified outcome, or the
    one correction that mattered. It is the author's, not the machine's: nothing here reads a
    transcript, and no parser in this package writes the field. It defaults to ABSENT, and an
    absent insight is the normal state of a run.

    BINDING IS THE WHOLE RULE. A line with no receipt behind it is an assertion, and an assertion
    printed in the card's hierarchy reads as a measurement. So the receipt must be one of the
    receipts already declared on this run: a URL that is not among them is a refusal, loud and
    local, never a card that quietly shows the sentence without the link.

    One insight, not a list. A card that can carry five "key" lines carries none.
    """
    value = run.get("insight")
    if value is None:
        return {}
    if not isinstance(value, dict) or set(value) - {"text", "receipt"}:
        raise ValueError("insight is {text, receipt}: one line, and the receipt it is bound to.")
    text = value.get("text")
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= MAX_INSIGHT:
        raise ValueError(f"insight.text is one line of 1 to {MAX_INSIGHT} characters.")
    line = " ".join(text.split())
    from . import privacy

    if privacy.scan(line):
        raise ValueError("insight.text must not carry a path, a home directory or an address.")
    url = _safe_url(value.get("receipt"), "insight.receipt")
    bound = {receipt["url"] for receipt in public_outcome(run).get("receipts") or []}
    if url not in bound:
        raise ValueError("insight.receipt must be one of this run's receipts. An insight is shown "
                         "only when a receipt on this run backs it.")
    return {"insight": {"text": line, "receipt": url}}


def public_code_route_fields(run: dict) -> dict:
    """Validated Code Route bytes for export. Absent stays absent."""
    from .code_route import public_code_route

    return public_code_route(run)


def public_revision(run: dict) -> dict:
    """Only opaque revision references travel; paths, source digests and commands stay local."""
    measurement = run.get("measurement") or {}
    out = {"schema_version": SCHEMA_VERSION}
    for source, target in (("revision_id", "measurement_revision"),
                           ("baseline_revision_id", "baseline_revision")):
        value = measurement.get(source, run.get(target))
        if value is not None:
            if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                raise ValueError("Invalid measurement revision reference.")
            out[target] = value
    return out


def capture_digest(path) -> str:
    """Hash the actual transcript bytes locally, without retaining a second transcript copy."""
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
