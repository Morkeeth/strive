"""Upload a Grok Bot run to STRIVE as a private run, with only the Python standard library.

Needs STRIVE_AGENT_TOKEN, the token the owner created with Connect on STRIVE. The token can
only publish private runs. Only allowlisted metrics travel: no prompt, reply or file text.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview import DEFAULT_URL, public_metrics  # noqa: E402

# The fields the STRIVE upload endpoint accepts from this adapter. Anything else stays local.
UPLOAD_FIELDS = ("schema_version", "measurement_revision", "harness", "project", "turns_typed", "tool_calls", "started", "rhythm", "ridge",
                 "ridge_basis", "worker_bins", "commit_bins", "trace_basis")


VISIBILITIES = ("private", "close_friends", "link", "public", "crew", "anonymous")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # A redirect would resend the bearer token to wherever it points. Never follow one.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def stored_result(result):
    # Success means the server named a real run and its stored audience. Anything else is not.
    if not isinstance(result, dict) or not isinstance(result.get("existing"), bool):
        return None
    if result.get("visibility") not in VISIBILITIES:
        return None
    try:
        return str(uuid.UUID(str(result.get("id"))))
    except ValueError:
        return None


def upload_payload(export, title=None, caption=None):
    metrics = public_metrics(export)
    if metrics.get("is_sample"):
        raise ValueError("This is the bundled sample. Upload a real export only.")
    payload = {k: metrics[k] for k in UPLOAD_FIELDS if k in metrics}
    # Preview and direct upload share the exact selected-source revision.
    payload["title"] = title or "Grok Bot run"
    if caption:
        payload["caption"] = caption
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="explicitly selected JSONL export on this bot computer")
    parser.add_argument("--title", help="owner-written title (default: Grok Bot run)")
    parser.add_argument("--caption", help="owner-written caption, up to 280 characters")
    parser.add_argument("--base-url", default=DEFAULT_URL)
    parser.add_argument("--dry-run", action="store_true", help="print the exact payload and send nothing")
    args = parser.parse_args()
    url = urlsplit(args.base_url)
    local = url.hostname in ("localhost", "127.0.0.1", "::1")
    if not (url.scheme == "https" or (local and url.scheme == "http")) or url.path not in ("", "/") or url.query:
        parser.error("Use an HTTPS product origin, or HTTP localhost.")
    try:
        payload = upload_payload(args.export, args.title, args.caption)
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "not uploaded", "error": str(error)}))
        return 1
    if args.dry_run:
        print(json.dumps({"status": "dry run; nothing sent", "payload": payload}, indent=2))
        return 0
    token = os.environ.get("STRIVE_AGENT_TOKEN", "")
    if not token.startswith("ag_"):
        print(json.dumps({"status": "not uploaded", "error": "Set STRIVE_AGENT_TOKEN to the token from Connect on STRIVE."}))
        return 1
    request = urllib.request.Request(
        args.base_url.rstrip("/") + "/api/agent/runs",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            print(json.dumps({"status": "not uploaded", "error": f"STRIVE answered with a redirect (HTTP {error.code}). Check --base-url; the token was not resent."}))
            return 1
        try:
            detail = json.load(error).get("error")
        except ValueError:
            detail = None
        print(json.dumps({"status": "refused", "http": error.code, "error": detail}))
        return 1
    except ValueError:
        print(json.dumps({"status": "unknown", "error": "STRIVE returned an unreadable response. Run the same command again."}))
        return 1
    except urllib.error.URLError:
        print(json.dumps({"status": "unknown", "error": "STRIVE unreachable. Run the same command again; a saved run is returned, not duplicated."}))
        return 1
    run_id = stored_result(result)
    if run_id is None:
        print(json.dumps({"status": "unknown", "error": "STRIVE returned no run id or stored audience. Run the same command again."}))
        return 1
    # Report what the server stored, not what was asked for.
    print(json.dumps({
        "status": "already saved" if result["existing"] else "saved",
        "run_id": run_id,
        "visibility": result.get("visibility"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
