"""What a live Bedrock coach still needs. Never print a credential value.

A missing provider must not be papered over with a scripted loop labelled as live
reasoning. This module returns the exact missing configuration so the CLI and the
site can show it. No AWS call is made here; absence of config is enough to refuse
a live run.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path


class LiveConfigError(RuntimeError):
    """Live Bedrock was requested and this machine cannot start it honestly."""


def missing_live_config() -> list[dict[str, str]]:
    """Ordered list of {id, need}. Empty means this machine looks ready to attempt Bedrock.

    Ready is not a guarantee AWS will accept the call. A later provider error is still
    printed as DEGRADED, never rewritten into a live success.
    """
    missing: list[dict[str, str]] = []
    if importlib.util.find_spec("strands") is None:
        missing.append({
            "id": "strands-agents",
            "need": (
                "Install the coach extra in a Python 3.10+ venv: "
                'python3.12 -m venv .venv && .venv/bin/pip install -e ".[coach]"'
            ),
        })
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if not region:
        missing.append({
            "id": "aws-region",
            "need": "Set AWS_REGION or AWS_DEFAULT_REGION to a Bedrock-enabled region (for example us-east-1).",
        })
    has_key = bool(os.environ.get("AWS_ACCESS_KEY_ID"))
    has_profile = bool(os.environ.get("AWS_PROFILE"))
    cred_file = Path.home() / ".aws" / "credentials"
    has_file = cred_file.is_file()
    if not (has_key or has_profile or has_file):
        missing.append({
            "id": "aws-credentials",
            "need": (
                "Provide AWS credentials for Bedrock via AWS_ACCESS_KEY_ID and "
                "AWS_SECRET_ACCESS_KEY, or AWS_PROFILE, or ~/.aws/credentials. "
                "This product never stores those values and never prints them."
            ),
        })
    return missing


def live_status_text() -> str:
    missing = missing_live_config()
    lines = [
        "LIVE MODEL STATUS  [Amazon Bedrock]",
        "  This is the live provider path. The default local coach is a scripted Strands",
        "  loop, not autonomous reasoning, and it does not need these values.",
        "",
    ]
    if not missing:
        lines += [
            "  Configuration present on this machine: strands-agents importable;",
            "  a region is set; some form of AWS credential source exists.",
            "  Attempting Bedrock will send claim lines and tool-result snippets off this",
            "  machine and costs money. No credential values are printed here.",
        ]
        return "\n".join(lines)
    lines.append("  Live Bedrock coaching is not ready. Exact missing configuration:")
    for item in missing:
        lines.append(f"    - {item['id']}: {item['need']}")
    lines += [
        "",
        "  No live run was started. Use --model local for the scripted Strands loop,",
        "  or --model none for the deterministic function chain. Neither is a live model.",
    ]
    return "\n".join(lines)
