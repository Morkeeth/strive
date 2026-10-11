"""THE GRIND CARD — one ordinary session, made postable.

Runs are the product noun; grind remains the compatible CLI command. The trace is the signature visual across local cards and the network.

THE NUMBER AT THE TOP IS VERIFIED PER TURN, never the prompt count. Prompts are the cost of a
grind (the denominator); a card whose first big number is "47 prompts" crowns the person who
typed the most (METR 2025: developers believed +20%, measured -19%). The Strava-shaped numbers --
prompts, moving time, commits -- are all still here, grouped under COST. Where the run has
no verified-claims count (an old `--json` dump), the headline is an em-dash whose tooltip names
what is missing, not a zero. `metrics.headline_of` is the one definition every surface reads.

Every sentence here names what it counted and over which population, or prints an em-dash.
"""
from __future__ import annotations
from .brand import BRAND, CARD_THEME

import os
from datetime import datetime

from .authorship import CATEGORIES, COMMAND
from . import privacy
from .metrics import ARTIFACTS_PER_TURN_TIP, HEADLINE_TIP, headline_of
from .render import GRID_CSS, _five_block, _has_value, _unmeasured_note
from .soloroute import render_route_svg, render_phone_svg, _esc, span_minutes


def _dur(s) -> str:
    if not s:
        return "—"
    h, r = divmod(int(s), 3600)
    m, sec = divmod(r, 60)
    return f"{h}h {m:02d}m" if h else f"{m}m {sec:02d}s"


def headline(run: dict) -> tuple[str, str]:
    """(title, callout). A LADDER, and each rung states the population it measured.

    Rung 1 is the fact the fleet card puts at the top of a night run, measured the same way at
    one-session scale: the longest span nobody typed through. It is only allowed to be the
    headline when the agent was demonstrably working through it -- 8 minutes of ACTIVE time and
    at least 12 tool calls -- because "you left the room for an hour" is a gap, not a stretch,
    and a card that crowned it would be inflating in the flattering direction.

    The GATE is `active_s` (the agent's moving time). The NUMBER printed is `wall_s`, because the
    noun is "minutes without touching the keyboard" and that is a fact about the person, not about
    the agent's moving time. Printing `active_s` under that noun was a correct count of the wrong
    thing: the callout right below it prints both boundary timestamps, so on `grind-deep` the card
    said "52 minutes" over "14:40 ... 15:37", which is 57. Two correct numbers, adjacent, asserting
    a relation that does not hold -- caught 31 Aug by subtracting the two stamps the card itself
    prints. The trace band label is the same number, from the same field, for the same reason.

    And the number is computed from the two stamps AS PRINTED (`span_minutes` floors both to the
    minute, exactly as `%H:%M` does), not from raw seconds: rounding raw `wall_s` put "14 minutes"
    over "16:29 ... 16:44" on `grind-ordinary`, a one-minute version of the same defect. The rule
    is that the reader's own subtraction is the definition.
    """
    st = run.get("stretch")
    proj = run["project"]
    typed = run["turns_typed"]
    wall_m = max(span_minutes(run["started"], run["ended"]), 1)
    never = run["ship_states"]["never"]

    def _n(k, word):
        return f'{k} {word}' + ("" if k == 1 else "s")

    # RUNG 1 — the hands-off stretch. Two gates, not one. The second was added 31 Aug after
    # looking at six real grinds side by side: on an 11-minute oscar-site sitting the stretch was
    # 11 of 11 minutes, so "11 minutes without touching the keyboard" was a true sentence that
    # said only how long the session was. A headline has to distinguish this grind from the
    # session's own duration, so the stretch has to be a PART of the grind, not the whole of it.
    if st and st["active_s"] >= 480 and st["tool_calls"] >= 12:
        mins = span_minutes(st["start"], st["end"])
        if mins <= 0.85 * wall_m:
            t0 = datetime.fromisoformat(st["start"]).strftime("%H:%M")
            t1 = datetime.fromisoformat(st["end"]).strftime("%H:%M")
            bits = [f'<b>{st["tool_calls"]}</b> tool calls']
            if st["edits"]:
                bits.append(f'<b>{st["edits"]}</b> file edits')
            if st["commits"]:
                bits.append(f'<b>{st["commits"]}</b> commit{"" if st["commits"] == 1 else "s"} landed')
            return (f'{mins} minutes without touching the keyboard',
                    f'You typed at <b>{t0}</b> and did not type again until <b>{t1}</b>. In between: '
                    + ", ".join(bits) + ", and <b>0</b> prompts from you.")

    # RUNG 2 — LEVERAGE. One or two sentences typed, and the machine did a hundred things. This
    # is the sentence a short grind actually has and the old ladder threw away: a 10-minute
    # a one-prompt sitting was headlined "1 prompts, 4 files changed" (sic) when what
    # happened was one prompt and 104 tool calls.
    if typed and typed <= 3 and run["tool_calls"] >= 40 * typed:
        tail = ""
        if run["files_edited"]:
            tail = f' and changed {_n(run["files_edited"], "file")}'
        return (f'{_n(typed, "prompt")} → {run["tool_calls"]} tool calls',
                f'You typed <b>{typed}</b> time{"" if typed == 1 else "s"} in '
                f'<b>{wall_m}</b> minutes. The agent made <b>{run["tool_calls"]}</b> tool calls'
                + tail + '.')

    # RUNG 3 — the DNF. Files changed that nothing has committed since is the state Strava has no
    # word for and every builder recognises. It outranks a commit count because it is the rarer
    # fact: 1 sitting of the 625 on this machine has three or more of them
    # (`python3 scratchpad/shapes2.py`, 31 Aug 06:0x).
    if never >= 2 and never >= run["files_edited"] - 1:
        return (f'{_n(never, "file")} changed, nothing has committed {"it" if never == 1 else "them"} since',
                f'Asked of git file by file. <b>{run["commits"]}</b> commits were made during this '
                f'grind, and <b>{never}</b> of the <b>{run["files_edited"]}</b> files it changed '
                f'{"is" if never == 1 else "are"} in none of them, nor in any commit since.')

    # The plain fallbacks lead with the OUTCOME. Until 3 Sep they read "47 prompts → 3 commits",
    # "47 prompts, 12 files changed", "47 prompts on proj": the largest text on the card opened
    # with the cost. The prompt count is on the card, under COST, where a denominator belongs.
    if run["commits"]:
        return (f'{_n(run["commits"], "commit")} landed on {proj}',
                f'From <b>{typed}</b> typed prompt{"" if typed == 1 else "s"} in <b>{wall_m}</b> minutes.')
    if run["files_edited"]:
        return (f'{_n(run["files_edited"], "file")} changed in {proj}, no commit yet',
                f'From <b>{typed}</b> typed prompt{"" if typed == 1 else "s"} in <b>{wall_m}</b> minutes.')
    if run["files_touched"]:
        return (f'A reading grind: {run["files_touched"]} files opened, none changed', "")
    return (f'A grind on {proj}: no files opened, nothing committed',
            f'<b>{typed}</b> typed prompt{"" if typed == 1 else "s"} in <b>{wall_m}</b> minutes.')


def _practice_block(run: dict) -> str:
    items = run.get("practice_context") or []
    if not items:
        return ""
    parts = ['<section class="verdict"><div class="who">Your chosen practices · private</div>']
    for practice in items:
        parts.append(f'<p><b>{_esc(practice["title"])}</b></p>')
        if practice.get("expected"):
            parts.append(f'<p>What you expected: {_esc(practice["expected"])}</p>')
        attempts = practice.get("attempts") or []
        if attempts:
            latest = attempts[0]
            parts.append(f'<p>Last review: {_esc(latest.get("outcome") or "not reviewed yet")} · tried: {_esc(latest["tried"])}</p>')
        else:
            parts.append('<p>No attempt recorded yet.</p>')
    parts.append('</section>')
    return "".join(parts)


def _verdict_block(run: dict) -> str:
    """The coach's verdict and the series line. Null-safe: a run with neither draws nothing,
    a run with one draws that one. Every sentence here was written from tool results or from
    the local series, never from the transcript's prose. Paths never leave this block."""
    from .coach.experiment import public_text
    v = public_text(run.get("coach_verdict"))
    plan = public_text(run.get("coach_plan"))
    n = run.get("coach_tool_calls")
    prog = run.get("progress") or {}
    line = run.get("progress_line") or ""
    if not v and not line:
        return ""
    parts = ['<div class="verdict">']
    if v:
        by = (f"verdict produced by <b>{n}</b> tool call{'' if n == 1 else 's'}" if n
              else "verdict")
        mode = (run.get("coach_mode") or "").split(" (")[0]
        parts.append(f'<div class="who">The coach: {by}' + (f' · {_esc(mode)}' if mode else '') + '</div>')
        parts.append(f'<div>{_esc(v)}</div>')
        if plan:
            items = "".join(f"<li>{_esc(p)}</li>" for p in str(plan).splitlines() if p.strip())
            parts.append(f'<ul>{items}</ul>')
    if line:
        pred = prog.get("prediction")
        # the line already leads with its verdict word; bold that word instead of repeating it
        head, _, rest = line.partition(" ")
        parts.append(f'<div class="prog"><b>{_esc(head)}</b> {_esc(rest)}'
                     + (f'<div class="pred">you predicted: {_esc(pred)}</div>' if pred else '') + '</div>')
    parts.append('</div>')
    return "".join(parts)


def _photo_hero(photo_src: str | None) -> str:
    """The author's photo, above the card, and a line saying what it is: added by the author, not
    measured, location and camera data removed."""
    if not photo_src:
        return ""
    return (f'<figure class="photo"><img src="{photo_src}" alt="Photo added by the author"></figure>'
            '<p class="note">Photo added by you, not measured. '
            'Location and camera data removed before this card was drawn.</p>')


def card_row(run: dict, title: str | None = None) -> dict:
    """The grind as the web feed stores it, so feedcard draws it by the feed's rules.

    The first typed prompt (run["title"]) is a keystroke log and is never the title unless the run
    says it was opted in; the card falls back to "<harness> session, 24 Sep"."""
    from .identity import of_run
    from .feedcard import local_hour
    who = of_run(run)
    shown = title or (run.get("title") if run.get("prompt_shown") else "")
    changed = run.get("files_edited")
    return {
        "title": shown or "",
        "harness": run.get("harness") or "Claude Code",
        "started": run.get("started"),
        "started_hour": local_hour(run.get("started")),
        "created_at": run.get("started"),
        "prompts": run.get("turns_typed"),
        "duration_s": run.get("duration_s"),
        "tool_calls": run.get("tool_calls"),
        # the card's "files changed" is files this grind wrote, not files it only opened
        "files_touched": changed if changed is not None else run.get("files_touched"),
        "commits": run.get("commits"),
        "rhythm": run.get("line") or run.get("rhythm") or run.get("series") or None,
        "ridge": run.get("ridge") or None,
        "route": run.get("route") or None,
        "visibility": "private",
        "profiles": {"handle": who.handle or "", "github_handle": who.handle or None,
                     "display_name": who.display, "avatar_url": who.avatar_url or None},
    }


def render_solo_card(run: dict, title: str | None = None, ranks: dict | None = None,
                     photo_src: str | None = None) -> str:
    """The grind card is the feed card (feedcard.py). Beneath it: what the grind did to files, the
    coach and the series line, the practices you chose, and this machine's ranking, each only when
    the run carries it."""
    from .feedcard import esc, page, title_of
    from .identity import of_run
    row = card_row(run, title)
    what, detail = headline(run)
    below = [f'<section class="below"><h2>What the grind did</h2><p class="lead">{what}</p>'
             + (f'<p>{detail}</p>' if detail else '') + '</section>']
    verdict = _verdict_block(run)
    if verdict:
        below.append(verdict.replace('<div class="verdict">', '<section class="below verdict">', 1)[:-len('</div>')] + '</section>')
    practice = _practice_block(run)
    if practice:
        below.append(practice.replace('<section class="verdict">', '<section class="below verdict">', 1))
    if ranks:
        from .history import best_rank
        br = best_rank(ranks)
        if br:
            below.append(f'<section class="below"><h2>On this machine</h2><p>Your <b>#{br[0]}</b> grind of '
                         f'<b>{br[1]:,}</b> by {esc(br[2])}.</p></section>')
    who = of_run(run)
    notes = []
    if who.note:
        notes.append(f"{who.display} · {who.note}.")
    notes.append(f"Private preview on this computer. Nothing is on {BRAND} until you choose to save it.")
    notes.append("Counts describe activity, not result quality.")
    return page(row, title=f"{title_of(row)} · {BRAND}", below="".join(below),
                notes=notes, brand=BRAND, above=_photo_hero(photo_src))


# ---------------------------------------------------------------------------------------------
# THE CONTROL, ON THE WAY OUT
#
# Every card this module produces is scanned before it is returned. Not the source it was built
# from -- the finished HTML, which is the artefact a person opens and a screenshot is taken of.
# A leak that survives the renderer therefore cannot reach a file: the call raises.
#
# This wrapper exists because the previous privacy pass fixed the wrong object. It did not change
# the renderer at all; it CHOSE six sessions whose row labels happened to be repo-relative
# (scratchpad/clean.py filters 625 sittings down to the 169 that were already safe) and re-shot
# those. The product was unchanged, and any user grinding on a seventh session got the old
# behaviour. A control that runs on the output cannot be satisfied by picking nicer input.
# ---------------------------------------------------------------------------------------------

_render_unchecked = render_solo_card


def render_solo_card(*a, photo_src: str | None = None, **kw) -> str:
    # The privacy control reads every character of the card. A base64 image is bytes, not text a
    # reader sees, and random base64 can spell a pattern by chance, so the control runs on the card
    # with a placeholder where the image goes, and the image is put in after it passes. The photo
    # itself was cleaned in photo.load_photo, which is where its own private data lives.
    token = "agentgrinder-photo-placeholder" if photo_src else None
    html = _render_unchecked(*a, photo_src=token, **kw)
    privacy.assert_clean(html, where="render_solo_card")
    return html.replace(token, photo_src) if token else html
