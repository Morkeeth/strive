"""WHO THE RUN BELONGS TO — a GitHub handle when this machine is signed in, never "you".

Every local card printed `you` over a `Y` avatar, because `--athlete` defaulted to the word and
nothing ever looked for a real name. "you" is the second person: a card with it on top reads, to
the only audience that matters (somebody who is not you), as a card about nobody.

Two states, and the card says which one it is in:

  signed in   the GitHub handle this machine already holds, and that account's avatar
  otherwise   a neutral label, no initial, no invented name

`resolve` reads the same LOCAL evidence `reach.author_identities` trusts as a strong identity —
the GitHub CLI's stored login and `git config github.user` — plus an explicit handle from the
command line or the environment. It makes no network call, registers no application and changes
no sign-in: it reads a login this machine is already holding.

`of_run` is the pure half. It reads the run dict only, so a card rendered from the same run JSON
on two machines is the same card.
"""
from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass

ENV_HANDLE = "AGENTGRINDER_GITHUB_HANDLE"

# The neutral label. It names what the card IS — one run captured on this machine — instead of
# addressing the reader or inventing a person.
NEUTRAL_LABEL = "Local run"
NOT_SIGNED_IN = "not signed in"

# Placeholder athlete names that shipped as defaults. None of them is a person, so none of them
# is allowed to reach a card as one.
PLACEHOLDERS = frozenset({"you", "me", "athlete", "anon", "anonymous", "unknown", "someone"})

_HANDLE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
_GH_USER = re.compile(r"^\s{4,}user:\s*([A-Za-z0-9-]+)\s*$", re.M)


@dataclass(frozen=True)
class Identity:
    """The name, avatar and provenance the card prints in its top-left corner."""

    handle: str | None = None
    source: str = ""
    name: str = ""          # a display name the author supplied; never treated as an account

    @property
    def signed_in(self) -> bool:
        return self.handle is not None

    @property
    def display(self) -> str:
        if self.handle:
            return f"@{self.handle}"
        return self.name or NEUTRAL_LABEL

    @property
    def avatar_url(self) -> str:
        # GitHub serves every account's avatar at this address. A card opened offline simply
        # shows the empty frame; nothing else on the card depends on it.
        return f"https://github.com/{self.handle}.png?size=96" if self.handle else ""

    @property
    def note(self) -> str:
        """The one thing the date line has to say. A signed-in card shows the handle and the
        avatar, which say it already; `source` stays available for the tooltip."""
        if self.handle or self.name:
            return ""
        return NOT_SIGNED_IN


def clean_handle(value) -> str | None:
    """A GitHub handle, or None. Placeholders and anything GitHub could not issue are refused."""
    if not isinstance(value, str):
        return None
    text = value.strip().lstrip("@")
    if not text or text.lower() in PLACEHOLDERS or not _HANDLE.match(text):
        return None
    return text


def _gh_cli_login() -> str | None:
    """The login the GitHub CLI has stored on this machine. Read from its config file: no
    network, and `gh` does not need to be installed for the read to be safe."""
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    try:
        with open(os.path.join(base, "gh", "hosts.yml"), encoding="utf-8", errors="ignore") as fh:
            found = _GH_USER.findall(fh.read())
    except OSError:
        return None
    for name in found:
        handle = clean_handle(name)
        if handle:
            return handle
    return None


def _git_github_user(root: str | None = None) -> str | None:
    try:
        out = subprocess.run(["git", "-C", root or ".", "config", "--get", "github.user"],
                             capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    return clean_handle(out.stdout) if out.returncode == 0 else None


def resolve(explicit=None, root: str | None = None) -> Identity:
    """The handle this machine is signed in as, or a neutral identity. Local reads only.

    A bare `--athlete Oscar` is a DISPLAY NAME, not an account: typing a word is not evidence
    that the GitHub account exists, and fetching an avatar for it would put a stranger's face on
    somebody else's card. Write `--athlete @oscar` to claim the account.
    """
    named = explicit.strip() if isinstance(explicit, str) else ""
    if named.startswith("@"):
        handle = clean_handle(named)
        if handle:
            return Identity(handle, "handle you named")
    if named and named.lower() not in PLACEHOLDERS:
        return Identity(name=named)
    handle = clean_handle(os.environ.get(ENV_HANDLE))
    if handle:
        return Identity(handle, f"handle from {ENV_HANDLE}")
    handle = _gh_cli_login()
    if handle:
        return Identity(handle, "signed in with the GitHub CLI on this machine")
    handle = _git_github_user(root)
    if handle:
        return Identity(handle, "github.user in this repository's git config")
    return Identity()


def of_run(run: dict) -> Identity:
    """The identity a run dict carries. Pure: the same run renders the same card anywhere.

    `athlete_handle` is an account. `athlete` is only ever a display name — a name typed after
    `--athlete` is not evidence that the account exists, so it never fetches an avatar — and the
    placeholders the defaults used to ship are dropped rather than printed.
    """
    if not isinstance(run, dict):
        return Identity()
    name = run.get("athlete")
    name = name.strip() if isinstance(name, str) else ""
    handle = clean_handle(run.get("athlete_handle"))
    if not handle and name.startswith("@"):
        handle = clean_handle(name)
    if handle:
        return Identity(handle, "GitHub handle recorded with this run")
    if name.lower() in PLACEHOLDERS:
        name = ""
    return Identity(name=name)
