"""THE SESSION ROUTE, SOLO — the same drawing, one scale down.

The night-run route has four moving parts. Every one of them survives on a single session with
one substitution, `a place is a FILE` instead of `a place is a REPOSITORY` (see solo.py for the
measurement that forces it):

    the trunk    your typed turns, as ticks on your own line
    the trail    one row per place, ordered by FIRST ARRIVAL, marks where you worked there
    the flags    commits, on the row of what they contain -- git's attribution, not a guess
    the profile  one line that is a real maximum: tool calls per minute, bucketed

and it gains one part the fleet card could not have, because a fleet's parallel lanes hide it:

    the stretch  the longest span with nobody at the keyboard, shaded across the whole drawing.
                 On a night run the longest stretch IS the final handoff, so the fleet card's
                 headline and this one are the same measurement seen at two scales.

Two mark classes, because 32% of real sittings edit nothing at all (200 of 625 probed) and a
drawing that only knows about edits would tell a third of its users their afternoon did not
happen: a READ visit is a thin mark, an EDIT visit is a solid one. Both are read from the tool
name in the transcript, which is as provable as a fact on this card gets.
"""
from __future__ import annotations

from datetime import datetime, timedelta

W = 1000
PAD_L = 26           # NO left gutter. The axis labels used to live there and the trace scrolls
                     # horizontally on a phone, so the first thing off the screen was the label
                     # that says what the line IS -- "tool calls" rendered as "ool calls" the
                     # moment the focus script scrolled the drawing to where the work was. Every
                     # label now rides inside the drawing, left-aligned on its own line, which is
                     # the rule the night-run card already reached for its destination names.
PAD_R = 24
TRUNK_Y = 46
ROW_H = 28
LABEL_H = 13
HAIR = 1.0
PROFILE_H = 74
AXIS_H = 30
MIN_MARK = 9.0            # a single visit still has to be visible


class Geo:
    """The drawing's geometry. Two of these exist, because ONE of them cannot be responsive.

    The desktop trace is 1000 units wide with every label riding on the row's first arrival --
    which is what makes it a drawing rather than a table, and which is exactly why it cannot
    survive a phone. Measured on the four committed cards at a real 390px viewport (a 390px
    IFRAME, `scratchpad/measure2.py`, not `--window-size=390`, which lies): the SVG is held at
    `min-width:700px` inside an `overflow-x:auto` box, so 14, 11, 12 and 6 file-path labels were
    clipped by the scroller at the card's own opening scroll position. Scaling the same SVG down
    instead would put 11.5px type at 4px.

    So the phone gets a DIFFERENT LAYOUT of the SAME NUMBERS: 360 units wide, no scroller, and
    every label pinned to the left edge on its own line above its row. Nothing can be clipped by
    a scroll position that no longer exists.
    """
    __slots__ = ("w", "pad_l", "pad_r", "trunk_y", "row_h", "label_h", "profile_h", "axis_h",
                 "head_room")

    def __init__(self, w, pad_l, pad_r, trunk_y, row_h, label_h, profile_h, axis_h, head_room):
        self.w, self.pad_l, self.pad_r = w, pad_l, pad_r
        self.trunk_y, self.row_h, self.label_h = trunk_y, row_h, label_h
        self.profile_h, self.axis_h = profile_h, axis_h
        # HEAD_ROOM is the band at the top of the profile the curve may not enter, because the
        # profile's own label lives there. Without it a tall spike near the left edge is drawn
        # straight through the words `tool calls · peak 16/min` -- visible on the wave-4
        # `grind-nothing-shipped` desktop shot (in git history; that shot set left the working
        # tree the same night) and on a one-row grind at 390.
        # Found by looking at the picture; no test would have said anything.
        self.head_room = head_room


DESKTOP = Geo(W, PAD_L, PAD_R, TRUNK_Y, ROW_H, LABEL_H, PROFILE_H, AXIS_H, 22)
PHONE = Geo(360, 4, 4, 30, 20, 12, 56, 24, 18)


def _t(v) -> datetime:
    return datetime.fromisoformat(v) if isinstance(v, str) else v


def span_minutes(start, end) -> int:
    """Minutes between two instants AS A READER WOULD SUBTRACT THEM from the printed `%H:%M`.

    The card prints the two boundary stamps next to the number. Rounding raw seconds put "52
    minutes" over "14:40 ... 15:37" (that one was `active_s` under a wall-time noun) and then
    "14 minutes" over "16:29 ... 16:44" (that one was rounding 847s down while both stamps
    truncate). Flooring both ends to the minute makes the printed number equal to the reader's
    own subtraction on every input, which is the only version of this that cannot drift again.
    """
    a, b = _t(start).replace(second=0, microsecond=0), _t(end).replace(second=0, microsecond=0)
    return int((b - a).total_seconds() // 60)


def build(run: dict, geo: "Geo | None" = None) -> dict:
    g = geo or DESKTOP
    W, PAD_L, PAD_R = g.w, g.pad_l, g.pad_r
    TRUNK_Y, ROW_H, LABEL_H = g.trunk_y, g.row_h, g.label_h
    PROFILE_H, AXIS_H = g.profile_h, g.axis_h
    t0, t1 = _t(run["started"]), _t(run["ended"])
    span = max((t1 - t0).total_seconds(), 1)

    def x(v) -> float:
        f = (_t(v) - t0).total_seconds() / span
        return PAD_L + max(0.0, min(1.0, f)) * (W - PAD_L - PAD_R)

    # commits are placed on the row of every file they contain; a commit whose files this run
    # never opened still happened, and lands on the summary row rather than being dropped.
    by_path: dict[str, list[dict]] = {}
    for c in run["commits_list"]:
        for f in c["files"]:
            by_path.setdefault(f, []).append(c)

    # A GRIND WITH ONE FILE STILL HAS A SHAPE, and it is not the trail. Six real sittings looked
    # at side by side (scratchpad/sheet.py, 31 Aug 05:4x): a one-file grind drew a
    # two-line stub -- one hairline and a 74-unit profile -- under a headline about 54 minutes of
    # hands-off work, and it was the weakest of the six by a distance. The measurement it does
    # have is WHEN the work happened, so the fewer places there are, the more of the drawing goes
    # to the elevation. Nothing is invented and no number moves; the same series gets more room.
    n_places = len(run["rows"]) + (1 if (run.get("more") or {}).get("files") else 0)
    PROFILE_H = PROFILE_H + max(0, 6 - n_places) * (22 if W > 500 else 16)
    if n_places <= 3:
        ROW_H = int(ROW_H * 1.4)

    rows, y = [], TRUNK_Y + 30
    for r in run["rows"]:
        marks = []
        for m in r["marks"]:
            mx0, mx1 = x(m["start"]), x(m["end"])
            marks.append(dict(x0=mx0, x1=max(mx1, mx0 + MIN_MARK), kind=m["kind"], n=m["n"],
                              t0=_t(m["start"]).strftime("%H:%M"), t1=_t(m["end"]).strftime("%H:%M")))
        flags = [dict(x=x(c["at"]), hash=c["hash"], at=_t(c["at"]).strftime("%H:%M"),
                      subject=c["subject"]) for c in by_path.get(r["key"], [])
                 if t0 <= _t(c["at"]) <= t1]
        rows.append(dict(y=y + LABEL_H, label_y=y + LABEL_H - 6, rel=r["rel"],
                         x0=x(r["first"]), x1=max(x(r["last"]), x(r["first"]) + MIN_MARK),
                         marks=marks, flags=flags, edits=r["edits"], reads=r["reads"],
                         shipped=r["shipped"], deadend=r["deadend"], ignored=r["ignored"],
                         later=r.get("later"), in_repo=r["in_repo"]))
        y += LABEL_H + ROW_H - 8

    more = run.get("more") or {}
    more_row = None
    if more.get("files"):
        mk = []
        for m in more["marks"]:
            mx0, mx1 = x(m["start"]), x(m["end"])
            mk.append(dict(x0=mx0, x1=max(mx1, mx0 + MIN_MARK), kind=m["kind"], n=m["n"]))
        seen = {r["key"] for r in run["rows"]}
        fl = [dict(x=x(c["at"]), hash=c["hash"], at=_t(c["at"]).strftime("%H:%M"), subject=c["subject"])
              for c in run["commits_list"]
              if t0 <= _t(c["at"]) <= t1 and not (set(c["files"]) & seen)]
        more_row = dict(y=y + LABEL_H, label_y=y + LABEL_H - 6, marks=mk, flags=fl, **{
            k: more[k] for k in ("files", "edits", "reads", "deadends")})
        y += LABEL_H + ROW_H - 8

    trail_bottom = y
    prof_y0 = trail_bottom + 10
    prof_y1 = prof_y0 + PROFILE_H
    height = prof_y1 + AXIS_H

    # ---- THE PATH: one continuous line stepping from file to file in the order the work
    # actually moved between them. Without it the drawing is fourteen parallel lanes; with it,
    # it is one journey through a codebase, which is what a GPS trace of a run looks like.
    # Built from the merged marks only (not every tool call), so it says "the work moved here",
    # never "the agent made 90 separate trips".
    steps = sorted(((mk["x0"], mk["x1"], r["y"]) for r in rows for mk in r["marks"]),
                   key=lambda z: z[0])
    path = []
    for sx0, sx1, sy in steps:
        path.append((sx0, sy))
        path.append((sx1, sy))

    # the profile: tool calls per bucket, a real maximum. A step, never a smoothed curve.
    ser = run["series"]
    bs = run["bucket_s"]
    pmax = max(ser) or 1
    per_min = pmax / (bs / 60) if bs else 0
    pts = []
    for i, v in enumerate(ser):
        px0 = x(t0 + timedelta(seconds=i * bs))
        px1 = x(t0 + timedelta(seconds=(i + 1) * bs))
        py = prof_y1 - (v / pmax) * (PROFILE_H - g.head_room)
        pts.append((px0, py))
        pts.append((px1, py))

    st = run.get("stretch")
    band = None
    if st:
        band = dict(x0=x(st["start"]), x1=x(st["end"]),
                    t0=_t(st["start"]).strftime("%H:%M"), t1=_t(st["end"]).strftime("%H:%M"),
                    # WALL, not active: the band is DRAWN from start to end, so a label carrying
                    # the agent's moving time would stamp "52m" on a box 57 minutes wide. Same
                    # `span_minutes` the headline uses, so the two surfaces cannot disagree.
                    mins=span_minutes(st["start"], st["end"]), tools=st["tool_calls"])
        # A SHADE THAT COVERS EVERYTHING SHADES NOTHING. On a 10-minute grind the longest
        # no-typing span was the whole 10 minutes, so the band washed the entire drawing pale
        # orange and the reader had nothing to compare it against. Above 90% of the width the
        # rectangle is dropped and only its label is kept -- the fact survives, the mark that
        # cannot carry it does not.
        band["full"] = (band["x1"] - band["x0"]) >= 0.90 * (W - PAD_L - PAD_R)

    # where the drawing is worth opening on a narrow screen: the stretch if there is one,
    # else the first mark. A wide trace scrolled to its own left edge opens on empty time.
    first_mark = min([mk["x0"] for r in rows for mk in r["marks"]] or [PAD_L])
    focus = band["x0"] if band else first_mark

    return dict(x=x, t0=t0, t1=t1, rows=rows, more_row=more_row, band=band, focus=focus, geo=g,
                path=path,
                trunk=[x(t) for t in run["typed_stamps"] if t0 <= _t(t) <= t1],
                profile=pts, prof_y0=prof_y0, prof_y1=prof_y1,
                peak_per_min=per_min, peak=pmax, height=height, trail_bottom=trail_bottom)


def _grid(t0: datetime, t1: datetime) -> list[datetime]:
    total = (t1 - t0).total_seconds() / 3600
    step_m = 10 if total <= 1 else (15 if total <= 2 else (30 if total <= 4 else 60))
    out, h = [], t0.replace(second=0, microsecond=0)
    while h.minute % step_m:
        h += timedelta(minutes=1)
    while h < t1:
        if h > t0:
            out.append(h)
        h += timedelta(minutes=step_m)
    return out


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_route_svg(run: dict):
    m = build(run)
    x, t0, t1, H = m["x"], m["t0"], m["t1"], m["height"]
    p = []

    # --- the stretch: the span nobody typed through, shaded behind everything
    b = m["band"]
    if b and not b["full"] and (b["x1"] - b["x0"]) > 4:
        p.append(f'<rect class="stretch" x="{b["x0"]:.1f}" y="{TRUNK_Y - 18:.0f}" '
                 f'width="{b["x1"] - b["x0"]:.1f}" height="{m["prof_y1"] - TRUNK_Y + 24:.0f}">'
                 f'<title>{b["t0"]}–{b["t1"]} · nobody typed · {b["mins"]}m of agent work · '
                 f'{b["tools"]} tool calls</title></rect>')

    for h in _grid(t0, t1):
        hx = x(h)
        p.append(f'<line class="grid" x1="{hx:.1f}" y1="{TRUNK_Y - 12:.0f}" x2="{hx:.1f}" y2="{m["prof_y1"] + 5:.0f}"/>')
        p.append(f'<text class="gl" x="{hx:.1f}" y="{H - 10:.0f}" text-anchor="middle">{h.strftime("%H:%M")}</text>')

    # --- the trunk: you, and every turn authorship.py graded as yours
    p.append(f'<line class="trunk" x1="{PAD_L}" y1="{TRUNK_Y}" x2="{W - PAD_R}" y2="{TRUNK_Y}"/>')
    p.append(f'<text class="tlabel" x="{PAD_L}" y="{TRUNK_Y - 9}">you</text>')
    for tx in m["trunk"]:
        p.append(f'<line class="tick" x1="{tx:.1f}" y1="{TRUNK_Y - 7}" x2="{tx:.1f}" y2="{TRUNK_Y + 7}"/>')
    if b and (b["x1"] - b["x0"]) > 60:
        # centred in the band, unless that would sit on top of the "you" label at the left edge
        cx = (b["x0"] + b["x1"]) / 2
        if cx < PAD_L + 118:
            p.append(f'<text class="slabel" x="{b["x1"] + 7:.1f}" y="{TRUNK_Y - 9:.0f}">'
                     f'{b["mins"]}m · nobody typing</text>')
        else:
            p.append(f'<text class="slabel" x="{cx:.1f}" y="{TRUNK_Y - 9:.0f}" text-anchor="middle">'
                     f'{b["mins"]}m · nobody typing</text>')

    # --- the trail: one row per file. The label rides on the row's first arrival, never in a
    # left gutter -- the same rule as the night-run card, for the same reason: a wide drawing is
    # scrolled on a phone and a gutter label is the first thing off the screen.
    def draw_row(y, x0, x1, marks, flags, label, note, faint=False, cap=None):
        # the hairline runs the FULL width of the drawing, not first-visit to last-visit. A row
        # is a place that existed for the whole grind; the marks say when you were there. Drawn
        # the short way, a three-file sitting -- the median, per the probe -- was three dashes
        # in the right-hand third of an empty box, which is what looking at it showed.
        cls = " faint" if faint else ""
        p.append(f'<line class="hair{cls}" x1="{PAD_L:.0f}" y1="{y:.1f}" x2="{W - PAD_R:.0f}" y2="{y:.1f}"/>')
        for mk in marks:
            k = "edit" if mk["kind"] == "edit" else "read"
            tip = f'<title>{k} · {mk.get("t0","")}{"–" + mk["t1"] if mk.get("t1") and mk.get("t1") != mk.get("t0") else ""} · {mk["n"]} call{"" if mk["n"] == 1 else "s"}</title>' if not faint else ""
            p.append(f'<line class="mark {k}{cls}" x1="{mk["x0"]:.1f}" y1="{y:.1f}" '
                     f'x2="{mk["x1"]:.1f}" y2="{y:.1f}">{tip}</line>')
        if cap:
            p.append(f'<circle class="cap {cap}" cx="{x1:.1f}" cy="{y:.1f}" r="3.6"/>')
        for f in flags:
            p.append(f'<g class="flagg"><line class="flag" x1="{f["x"]:.1f}" y1="{y - 11:.1f}" '
                     f'x2="{f["x"]:.1f}" y2="{y + 5:.1f}"/>'
                     f'<path class="pennant" d="M{f["x"]:.1f},{y - 11:.1f} l8,3 l-8,3 z"/>'
                     f'<title>commit {f["hash"]} · {f["at"]} · {_esc(f["subject"])[:70]}</title></g>')
        # a label that would run off the right edge flips its anchor rather than being clipped
        wide = (len(label) + len(note) + 3) * 6.2
        if x0 + wide > W - PAD_R:
            p.append(f'<text class="rtag{cls}" x="{W - PAD_R:.0f}" y="{y - 9.5:.1f}" text-anchor="end">'
                     f'{_esc(label)}<tspan class="rnote"> · {_esc(note)}</tspan></text>')
        else:
            p.append(f'<text class="rtag{cls}" x="{x0:.1f}" y="{y - 9.5:.1f}">{_esc(label)}'
                     f'<tspan class="rnote"> · {_esc(note)}</tspan></text>')

    # the path is drawn under the marks so the marks stay the loudest thing on the row
    if len(m["path"]) > 3:
        pp = " ".join(f"{px:.1f},{py:.1f}" for px, py in m["path"])
        p.append(f'<polyline class="path" points="{pp}"/>')

    for r in m["rows"]:
        bits = []
        if r["edits"]:
            bits.append(f'{r["edits"]} edit{"" if r["edits"] == 1 else "s"}')
        if r["reads"]:
            bits.append(f'{r["reads"]} read{"" if r["reads"] == 1 else "s"}')
        # THREE ship states, and each one names the commit or the absence of one. "1 commit" on
        # six rows of a grind whose headline says "1 commit" is two correct numbers sitting next
        # to each other asserting a relation nobody checked; the hash says which commit it is.
        if r["flags"]:
            bits.append("in " + " ".join(f["hash"] for f in r["flags"][:2])
                        + (f' +{len(r["flags"]) - 2}' if len(r["flags"]) > 2 else ""))
        elif r["later"]:
            # the cap and the legend already say "after the grind closed"; repeating it on
            # twelve rows turned the drawing into a table with the same sentence twelve times
            bits.append(f'committed {_t(r["later"]).strftime("%H:%M")}')
        elif r["deadend"]:
            bits.append("nothing has committed it since")
        elif r["edits"] and not r["in_repo"]:
            bits.append("outside the repo")
        elif r["edits"] and r["ignored"]:
            bits.append("git-ignored")
        cap = ("ship" if r["shipped"] else
               ("late" if r["later"] else ("spur" if r["deadend"] else None)))
        draw_row(r["y"], r["x0"], r["x1"], r["marks"], r["flags"], r["rel"], " · ".join(bits), cap=cap)

    mr = m["more_row"]
    if mr:
        note = " · ".join(filter(None, [
            f'{mr["edits"]} edit{"" if mr["edits"] == 1 else "s"}' if mr["edits"] else "",
            f'{mr["reads"]} read{"" if mr["reads"] == 1 else "s"}' if mr["reads"] else "",
            f'{mr["later"]} committed after' if mr.get("later") else "",
            f'{mr["deadends"]} nothing has committed since' if mr["deadends"] else ""]))
        draw_row(mr["y"], min([k["x0"] for k in mr["marks"]] + [PAD_L]),
                 max([k["x1"] for k in mr["marks"]] + [PAD_L]), mr["marks"], mr["flags"],
                 f'+{mr["files"]} more file{"" if mr["files"] == 1 else "s"}', note, faint=True)

    # --- the profile: tool calls per minute
    pl = " ".join(f"{px:.1f},{py:.1f}" for px, py in m["profile"])
    if m["profile"]:
        xa, xb = m["profile"][0][0], m["profile"][-1][0]
        p.append(f'<polygon class="profill" points="{xa:.1f},{m["prof_y1"]:.0f} {pl} {xb:.1f},{m["prof_y1"]:.0f}"/>')
        p.append(f'<polyline class="profline" points="{pl}"/>')
    p.append(f'<line class="base" x1="{PAD_L}" y1="{m["prof_y1"]:.0f}" x2="{W - PAD_R}" y2="{m["prof_y1"]:.0f}"/>')
    p.append(f'<text class="plabel" x="{PAD_L}" y="{m["prof_y0"] + 10:.0f}">tool calls<tspan '
             f'class="pmax"> · peak {m["peak_per_min"]:.0f}/min</tspan></text>')

    n_rows = len(m["rows"]) + (1 if mr else 0)
    body = "\n  ".join(p)
    return f'''<svg class="routemap" viewBox="0 0 {W} {H}" role="img"
   aria-label="Session route: {run["turns_typed"]} typed prompts and {n_rows} rows of files between {t0.strftime("%H:%M")} and {t1.strftime("%H:%M")}; peak {m["peak_per_min"]:.0f} tool calls per minute">
  {body}
</svg>''', m


# ---------------------------------------------------------------------------
# THE PHONE TRACE — the same numbers, a layout that cannot be clipped
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# THE EDGE CLAMP — an SVG clips to its OWN viewport, not to the page's
# ---------------------------------------------------------------------------
# Found 31 Aug ~06:3x by adversarial verification of wave 5/5b. `clipcheck.py` asks whether a
# <text> escapes `document.documentElement.clientWidth` (390) and answered CLIPPED=0 on every
# card. It was measuring the wrong box. The phone trace is 360 user units painted into 344 CSS
# px, so a stamp centred at 350 has its right half OUTSIDE the svg and is cut by the svg's own
# viewport at x=360 -- 30 units before the page edge the check was watching. It is visible in
# the committed shot `archive/hackathon-2026-09/docs/shots/nightrun-card-phone-light.png`, which prints "06:0".
#
# Character widths are MEASURED, not assumed: at .gl (9px monospace) one character is 5.41 user
# units on this machine (routemap) and 5.50 (soloroute); .slabel (9.5px) is 6.19. The constants
# below round UP, so the clamp fires slightly early and never late.
GL_CH = 5.7      # user units per character at the .gl font size (measured 5.41-5.50, rounded up)

def _edge_stamp(px: float, text: str, left: float, right: float, ch: float = GL_CH):
    """Where to put a centred stamp so its BOX stays inside [left, right].

    Returns (x, anchor). A stamp that would hang off an edge is pinned to that edge instead of
    being centred; the grid step keeps stamps at least ~70 units apart, so a shift of at most
    half a label cannot make two of them collide.
    """
    half = len(text) * ch / 2
    if px + half > right:
        return right, "end"
    if px - half < left:
        return left, "start"
    return px, "middle"

def _phone_grid(t0: datetime, t1: datetime) -> list[datetime]:
    """At most four interior stamps. 360 units holds five `%H:%M` labels before they collide."""
    total_m = max((t1 - t0).total_seconds() / 60, 1)
    for step in (5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 720):
        if total_m / step <= 5:
            break
    out, h = [], t0.replace(second=0, microsecond=0)
    while h.minute % step:
        h += timedelta(minutes=1)
    while h < t1:
        if h > t0:
            out.append(h)
        h += timedelta(minutes=step)
    return out


def phone_labels(rows: list[dict]) -> list[str]:
    """Basenames, and only as much path as it takes to keep them distinct.

    `attack/algorithm.py` becomes `algorithm.py`. Where two rows share a basename the parent
    directory comes back, because two rows labelled `page.tsx` would be a drawing that lies
    about which file was edited.

    NO LEADING ELISION MARKER. It used to print one, to say on the card's own surface that part
    of the path had been dropped. That shape is now RESERVED: `privacy.py` treats a leading
    elision anywhere in a card as a leak, because the retired `_shorten` used exactly this shape
    to print out-of-repo files, and the form carries no home marker and no tilde — the privacy
    control passed a synced-notes path in that shape while failing a memory path on the row
    above it, purely because the second one happened to be a memory filename.

    Dropping the marker costs nothing and is safe by construction: every `rel` reaching this
    function has already been cleared WHOLE by `privacy.safe_label`, and the control matches
    substrings, so a tail of a clean label is itself clean.
    """
    bases = [r["rel"].rsplit("/", 1)[-1] for r in rows]
    out = []
    for r, b in zip(rows, bases):
        rel = r["rel"]
        out.append(b if bases.count(b) == 1 else "/".join(rel.split("/")[-2:]))
    return out


def _fit(label: str, note: str, avail: float, lab_px: float, note_px: float) -> tuple[str, str]:
    """Elide the NOTE, never the label. A truncated filename is a wrong filename."""
    if not note:
        return label, ""
    room = avail - len(label) * lab_px - 3 * note_px
    n = int(room // note_px)
    if n >= len(note):
        return label, note
    if n < 6:
        return label, ""
    return label, note[:n - 1] + "…"


def render_phone_svg(run: dict):
    """The trace at 360 units, laid out for a screen that cannot scroll sideways.

    Three differences from the desktop trace, and each one is forced by a measurement rather than
    chosen: labels are pinned to the left edge on their own line (they were clipped by the
    horizontal scroller — 14 of them on `grind-deep`); paths are shortened to the shortest form
    that stays distinct (a 40-character path does not fit in 352 units at a legible size); and
    the time axis carries at most four interior stamps (five collide).

    Everything the reader COUNTS is the same object: the same `build()`, the same marks, the same
    commit flags on the same rows, the same stretch band, the same profile maximum.
    """
    m = build(run, PHONE)
    g = m["geo"]
    W_, PL, PR = g.w, g.pad_l, g.pad_r
    x, t0, t1, H = m["x"], m["t0"], m["t1"], m["height"]
    avail = W_ - PL - PR
    p = []

    b = m["band"]
    if b and not b["full"] and (b["x1"] - b["x0"]) > 2:
        p.append(f'<rect class="stretch" x="{b["x0"]:.1f}" y="{g.trunk_y - 14:.0f}" '
                 f'width="{b["x1"] - b["x0"]:.1f}" height="{m["prof_y1"] - g.trunk_y + 20:.0f}"/>')

    for h in _phone_grid(t0, t1):
        hx = x(h)
        p.append(f'<line class="grid" x1="{hx:.1f}" y1="{g.trunk_y - 9:.0f}" x2="{hx:.1f}" '
                 f'y2="{m["prof_y1"] + 4:.0f}"/>')
        _lab = h.strftime("%H:%M")
        _sx, _sa = _edge_stamp(hx, _lab, PL, W_ - PR)
        p.append(f'<text class="gl" x="{_sx:.1f}" y="{H - 8:.0f}" text-anchor="{_sa}">'
                 f'{_lab}</text>')
    # the two boundary stamps, but only where they will not sit on top of a grid stamp: at 360
    # units `17:01` next to `17:00` printed `17:0117:00`, which is how it looked in the shot.
    gx = [x(h) for h in _phone_grid(t0, t1)]
    if all(abs(g_ - PL) > 34 for g_ in gx):
        p.append(f'<text class="gl" x="{PL:.0f}" y="{H - 8:.0f}">{t0.strftime("%H:%M")}</text>')
    if all(abs(g_ - (W_ - PR)) > 34 for g_ in gx):
        p.append(f'<text class="gl" x="{W_ - PR:.0f}" y="{H - 8:.0f}" text-anchor="end">'
                 f'{t1.strftime("%H:%M")}</text>')

    # the trunk
    p.append(f'<line class="trunk" x1="{PL}" y1="{g.trunk_y}" x2="{W_ - PR}" y2="{g.trunk_y}"/>')
    p.append(f'<text class="tlabel" x="{PL}" y="{g.trunk_y - 8}">you</text>')
    for tx in m["trunk"]:
        p.append(f'<line class="tick" x1="{tx:.1f}" y1="{g.trunk_y - 5}" x2="{tx:.1f}" y2="{g.trunk_y + 5}"/>')
    if b and (b["x1"] - b["x0"]) > 30:
        cx = (b["x0"] + b["x1"]) / 2
        _sl = f'{b["mins"]}m · nobody typing'
        if cx > PL + 68:
            # .slabel is 9.5px: 6.19 user units per character measured, 6.5 used so the clamp
            # rounds the wrong way on purpose. `28m · nobody typing` on `tonight` was 8px past
            # the svg edge while clipcheck.py, watching the page edge, reported CLIPPED=0.
            lx, anchor = _edge_stamp(cx, _sl, PL, W_ - PR, ch=6.5)
        else:
            lx, anchor = b["x1"] + 5, "start"
        p.append(f'<text class="slabel" x="{lx:.1f}" y="{g.trunk_y - 8:.0f}" '
                 f'text-anchor="{anchor}">{_sl}</text>')

    if len(m["path"]) > 3:
        pp = " ".join(f"{px:.1f},{py:.1f}" for px, py in m["path"])
        p.append(f'<polyline class="path" points="{pp}"/>')

    def row(y, label_y, marks, flags, label, note, faint=False, cap=None, x1=None):
        cls = " faint" if faint else ""
        lab, nt = _fit(label, note, avail, 6.0, 5.3)
        p.append(f'<text class="rtag{cls}" x="{PL:.0f}" y="{label_y:.1f}">{_esc(lab)}'
                 + (f'<tspan class="rnote"> · {_esc(nt)}</tspan>' if nt else "") + '</text>')
        p.append(f'<line class="hair{cls}" x1="{PL:.0f}" y1="{y:.1f}" x2="{W_ - PR:.0f}" y2="{y:.1f}"/>')
        for mk in marks:
            k = "edit" if mk["kind"] == "edit" else "read"
            p.append(f'<line class="mark {k}{cls}" x1="{mk["x0"]:.1f}" y1="{y:.1f}" '
                     f'x2="{mk["x1"]:.1f}" y2="{y:.1f}"/>')
        if cap and x1 is not None:
            p.append(f'<circle class="cap {cap}" cx="{x1:.1f}" cy="{y:.1f}" r="2.9"/>')
        for f in flags:
            p.append(f'<g class="flagg"><line class="flag" x1="{f["x"]:.1f}" y1="{y - 9:.1f}" '
                     f'x2="{f["x"]:.1f}" y2="{y + 4:.1f}"/>'
                     f'<path class="pennant" d="M{f["x"]:.1f},{y - 9:.1f} l6.5,2.5 l-6.5,2.5 z"/></g>')

    labels = phone_labels(m["rows"])
    for r, lab in zip(m["rows"], labels):
        bits = []
        if r["edits"]:
            bits.append(f'{r["edits"]} edit{"" if r["edits"] == 1 else "s"}')
        if r["reads"]:
            bits.append(f'{r["reads"]} read{"" if r["reads"] == 1 else "s"}')
        if r["flags"]:
            bits.append("in " + " ".join(f["hash"] for f in r["flags"][:2])
                        + (f' +{len(r["flags"]) - 2}' if len(r["flags"]) > 2 else ""))
        elif r["later"]:
            bits.append(f'committed {_t(r["later"]).strftime("%H:%M")}')
        elif r["deadend"]:
            bits.append("nothing has committed it since")
        elif r["edits"] and not r["in_repo"]:
            bits.append("outside the repo")
        elif r["edits"] and r["ignored"]:
            bits.append("git-ignored")
        cap = ("ship" if r["shipped"] else
               ("late" if r["later"] else ("spur" if r["deadend"] else None)))
        # -2: the pennant spans y-9..y+4 and the label baseline sat at y-6, so on a row with
        # a commit the flag crossed the text's descenders (visible on the aistrava card).
        row(r["y"], r["label_y"] - 2, r["marks"], r["flags"], lab, " · ".join(bits), cap=cap, x1=r["x1"])

    mr = m["more_row"]
    if mr:
        note = " · ".join(filter(None, [
            f'{mr["edits"]} edit{"" if mr["edits"] == 1 else "s"}' if mr["edits"] else "",
            f'{mr["reads"]} read{"" if mr["reads"] == 1 else "s"}' if mr["reads"] else "",
            f'{mr["deadends"]} nothing has committed since' if mr["deadends"] else ""]))
        row(mr["y"], mr["label_y"] - 2, mr["marks"], mr["flags"],
            f'+{mr["files"]} more file{"" if mr["files"] == 1 else "s"}', note, faint=True)

    pl = " ".join(f"{px:.1f},{py:.1f}" for px, py in m["profile"])
    if m["profile"]:
        xa, xb = m["profile"][0][0], m["profile"][-1][0]
        p.append(f'<polygon class="profill" points="{xa:.1f},{m["prof_y1"]:.0f} {pl} '
                 f'{xb:.1f},{m["prof_y1"]:.0f}"/>')
        p.append(f'<polyline class="profline" points="{pl}"/>')
    p.append(f'<line class="base" x1="{PL}" y1="{m["prof_y1"]:.0f}" x2="{W_ - PR}" y2="{m["prof_y1"]:.0f}"/>')
    p.append(f'<text class="plabel" x="{PL}" y="{m["prof_y0"] + 9:.0f}">tool calls<tspan '
             f'class="pmax"> · peak {m["peak_per_min"]:.0f}/min</tspan></text>')

    body = "\n  ".join(p)
    return f'''<svg class="routemap phone" viewBox="0 0 {W_} {H}" role="img" aria-hidden="true">
  {body}
</svg>''', m
