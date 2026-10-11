"""ONE SELECTED INSIGHT, promoted to the top of the card's hierarchy — or nothing at all.

A run card can show what happened. It cannot, on its own, know which line of it mattered: that
the correction on turn nine was the whole session, or that the verified outcome is the one thing
a reader should take away. That judgement is the author's, and it is worth one line at the head
of the Code Route group, above the route and beside the outcome.

Three rules hold this to the truth, and each one is a test:

  ABSENT BY DEFAULT.   A run with no selected insight shows no insight block, no heading and no
                       empty state. Absence is the normal condition of a run, not a gap to fill.
  BOUND, OR NOT SHOWN. The line is shown only when it is bound to a receipt this run already
                       carries (`contract.selected_insight`). Nothing here reads a transcript,
                       and no parser in this package writes the field: a sentence inferred from
                       what somebody typed is exactly the fabrication the card exists to avoid.
  A FLEET IS NOT A RUN. The scope sentence says what the line is a fact ABOUT. A night run over
                       many sessions and repositories is never called "this run".

The card that shows it needs no account and makes no request: it is a local file, and it says so
rather than implying that a private card has been published.
"""
from __future__ import annotations

from dataclasses import dataclass

PRIVATE_NOTE = "Private local card — nothing here is published."
SINGLE_RUN_SCOPE = "this run"


@dataclass(frozen=True)
class Insight:
    """The selected line, the receipt it is bound to, and what it is a fact about."""

    text: str
    receipt_url: str
    receipt_label: str
    scope: str

    @property
    def provenance(self) -> str:
        return (f"Selected by the author from {self.scope} and bound to the receipt below. "
                f"Not measured, and not taken from anything typed.")


def _count(value) -> int:
    return len(value) if isinstance(value, list) else 0


def is_fleet(run: dict) -> bool:
    """A night run aggregates many sittings across many repositories (fleet.collect)."""
    if not isinstance(run, dict):
        return False
    return str(run.get("kind") or "") == "fleet" or bool(
        _count(run.get("lanes")) or _count(run.get("sessions")) > 1)


def scope_of(run: dict) -> str:
    """The population the selected line speaks for. Never "this run" for a whole fleet."""
    if not is_fleet(run):
        return SINGLE_RUN_SCOPE
    sessions = _count(run.get("sessions")) or _count(run.get("lanes"))
    repos = _count(run.get("repos"))
    where = f" across {repos} repositories" if repos else ""
    if not sessions:
        return "this night run" + where
    return f"this night run — {sessions} session{'' if sessions == 1 else 's'}{where}"


def selected(run: dict):
    """The run's one selected insight, or None. Raises when a bound insight is malformed."""
    if not isinstance(run, dict):
        return None
    from .contract import selected_insight

    bound = selected_insight(run).get("insight")
    if not bound:
        return None
    label = bound["receipt"]
    for receipt in run.get("receipts") or []:
        if isinstance(receipt, dict) and receipt.get("url") == bound["receipt"]:
            label = receipt.get("label") or label
            break
    return Insight(text=bound["text"], receipt_url=bound["receipt"],
                   receipt_label=label, scope=scope_of(run))
