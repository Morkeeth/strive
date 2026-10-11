"""THE SESSION ROUTE — the signature device.

Strava draws two things: the MAP of where you ran, and the ELEVATION PROFILE of how hard it was.
This draws the agent equivalents of both, from one night's transcripts.

  THE TRAIL   one row per DESTINATION -- a repository where a lane ran or a commit landed --
              ordered by first arrival. An agent lane is a segment on its destination's row;
              a commit is a tick on that row's own hairline. So a repo the fleet returned to
              in four separate waves reads as four marks on ONE trail, which is what a GPS trace
              of a night's work looks like, instead of four unrelated rows that happen to repeat
              a name. Revisits are the whole point: a night run is not 24 errands, it is 10 places.
  THE WAVES   the orchestrator fans out in bursts, not continuously. Every cluster of lane starts
              inside two minutes is one wave, ruled and numbered. On this machine, seven of them.
  THE PROFILE how many lanes were open at every instant. A step function of a real maximum, not a
              smoothed decoration -- a different night draws a different mountain.

Every element traces to a record:
  trunk tick   = one turn that cleared `authorship.is_human_turn` (promptSource typed|queued,
                 with injected and sidechain records dropped), at its timestamp
  human bar    = one of YOUR sessions, first human turn -> last record
  lane segment = a subagent transcript, first record -> last record
  segment weight = tool calls per minute in that lane (a real ratio, not a rank)
  hollow cap   = the lane closed with no commit landing in its repository while it was open
  commit tick  = a `git log --pretty=%cI` time, on the row of the repository git logged it in

A commit tick is placed by REPOSITORY, never by lane, and it sits on its own hairline below the
lane segments rather than on one. Git proves which repository a commit landed in; nothing in a
transcript proves which lane wrote it, so the drawing says only what is provable. Two lanes open
in the same repository at the same time get their own sub-rows inside that destination's band --
overlapping work is never collapsed onto one line, because that would draw a lie about capacity.
"""
from __future__ import annotations

from datetime import datetime, timedelta

W = 1000
PAD_L = 96
PAD_R = 26
ROW_H = 21
TRUNK_Y = 58
FAN_GAP = 30
WAVE_H = 16           # the wave numbers get their own strip too
BAND_GAP = 8
LABEL_H = 15          # every destination label gets its own line, never a neighbour's
COMMIT_DROP = 11
PROFILE_H = 92
AXIS_H = 34
WAVE_CLUSTER_S = 120          # lane starts within this many seconds are one fan-out


def _t(iso) -> datetime:
    return datetime.fromisoformat(iso) if isinstance(iso, str) else iso


def concurrency(lanes: list[dict]) -> list[tuple[datetime, int]]:
    """The step function: how many lanes were open at each change point. A real maximum."""
    edges: list[tuple[datetime, int]] = []
    for l in lanes:
        edges.append((_t(l["started_iso"]), 1))
        edges.append((_t(l["ended_iso"]), -1))
    edges.sort()
    out, cur = [], 0
    for ts, d in edges:
        cur += d
        if out and out[-1][0] == ts:
            out[-1] = (ts, cur)
        else:
            out.append((ts, cur))
    return out


def waves(lanes: list[dict]) -> list[dict]:
    """Fan-outs: clusters of lane starts. Measured from the starts, never declared by a config."""
    starts = sorted(_t(l["started_iso"]) for l in lanes)
    out: list[dict] = []
    for s in starts:
        if out and (s - out[-1]["last"]).total_seconds() <= WAVE_CLUSTER_S:
            out[-1]["n"] += 1
            out[-1]["last"] = s
        else:
            out.append(dict(at=s, last=s, n=1))
    return out


def _pack(items: list[tuple[float, float]]) -> list[int]:
    """Greedy sub-row assignment: index i gets the first sub-row whose last segment ended before
    it starts. Returns one row index per item, in the order given. Keeps a destination on ONE
    line whenever its lanes did not actually overlap, and only splits when they did."""
    ends: list[float] = []
    out = []
    for x0, x1 in items:
        for r, e in enumerate(ends):
            if x0 >= e:
                ends[r] = x1
                out.append(r)
                break
        else:
            ends.append(x1)
            out.append(len(ends) - 1)
    return out


class Geo:
    """Two geometries, because one drawing cannot be both. Same argument as `soloroute.Geo`.

    The night-run route is 1000 units wide and holds its destination labels at each row's first
    arrival. Measured in a real 390px iframe on the card regenerated 31 Aug 07:0x:

        clipcheck.py nightrun.html -> clientWidth=390 traceW=720 texts=41 CLIPPED=12

    Twelve of its labels are cut, and this is the card the entry leads with. The phone therefore
    gets the same treatment the solo trace got: a narrow re-layout of the SAME `build_map`, every
    label pinned to the left edge on its own line, and no horizontal scroller to cut anything.
    Dropped at 360 units, deliberately: the `wN·k` wave markers and the `L1..L7` lane codes, which
    are two more text layers than 360 units can hold. Both are still on the card -- the waves in
    the caption above the drawing, the codes in the Lanes table.
    """
    __slots__ = ("w", "pad_l", "pad_r", "trunk_y", "row_h", "label_h", "fan_gap", "wave_h",
                 "band_gap", "commit_drop", "profile_h", "axis_h", "hrow_h", "head_room")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw[k])


DESKTOP = Geo(w=W, pad_l=PAD_L, pad_r=PAD_R, trunk_y=TRUNK_Y, row_h=ROW_H, label_h=LABEL_H,
              fan_gap=FAN_GAP, wave_h=WAVE_H, band_gap=BAND_GAP, commit_drop=COMMIT_DROP,
              profile_h=PROFILE_H, axis_h=AXIS_H, hrow_h=ROW_H, head_room=8)
# hrow_h: the human sessions carry a left-pinned label on the phone, which the desktop draws at
# the session's own start; four of them at 13 units apart printed four labels on top of each
# other. head_room: the band the lanes-open curve may not enter, because its own label lives
# there -- `lanes open · peak 4` was painted over by the mountain. Both seen in the picture.
PHONE = Geo(w=360, pad_l=4, pad_r=4, trunk_y=42, row_h=13, label_h=13,
            fan_gap=22, wave_h=0, band_gap=7, commit_drop=8, profile_h=70, axis_h=24,
            hrow_h=17, head_room=20)


def build_map(run: dict, geo: "Geo | None" = None) -> dict:
    g = geo or DESKTOP
    W, PAD_L, PAD_R = g.w, g.pad_l, g.pad_r
    TRUNK_Y, ROW_H, LABEL_H = g.trunk_y, g.row_h, g.label_h
    FAN_GAP, WAVE_H, BAND_GAP, COMMIT_DROP = g.fan_gap, g.wave_h, g.band_gap, g.commit_drop
    PROFILE_H, AXIS_H = g.profile_h, g.axis_h
    t0, t1 = _t(run["started"]), _t(run["ended"])
    span = max((t1 - t0).total_seconds(), 1)

    def x(v) -> float:
        f = (_t(v) - t0).total_seconds() / span
        return PAD_L + max(0.0, min(1.0, f)) * (W - PAD_L - PAD_R)

    # ---- destinations: every repository the night reached, whether by a lane or by a commit.
    # Ordered by FIRST ARRIVAL, so the rows read top-to-bottom as the order the run got there.
    lanes_by_repo: dict[str, list[dict]] = {}
    for l in sorted(run["lanes"], key=lambda z: z["started_iso"]):
        lanes_by_repo.setdefault(l["repo"] or "recon", []).append(l)

    commits_by_repo: dict[str, list[str]] = {}
    untracked = set(run.get("repos_untracked") or [])
    for r in run["repos"]:
        commits_by_repo[r["name"]] = [c for c in (r.get("stamps") or []) if t0 <= _t(c) <= t1]

    def arrival(repo: str):
        cand = [_t(lanes_by_repo[repo][0]["started_iso"])] if lanes_by_repo.get(repo) else []
        cand += [_t(commits_by_repo[repo][0])] if commits_by_repo.get(repo) else []
        return min(cand) if cand else t1

    names = set(lanes_by_repo) | set(commits_by_repo)
    # ONE rule for what earns a row: a lane ran there, or a commit landed there. A repository a
    # lane merely touched (`recall`, 0 commits, no lane of its own) and one with no work tree to
    # ask (a research chip) both fail it, and both are still named in the chips and the honest
    # line -- dropped from the drawing, never from the account.
    order = sorted([n for n in names if lanes_by_repo.get(n) or commits_by_repo.get(n)],
                   key=lambda n: (arrival(n), n))

    paces = [l["pace"] for l in run["lanes"] if l["pace"]] or [1.0]
    pmax = max(paces)

    # ---- the human's own sessions, directly under the trunk: before the handoff this is where
    # the work was, and leaving the band empty drew a map that looked idle for half the night.
    hrows = []
    y = TRUNK_Y + FAN_GAP
    hpaces = [z.get("pace") or 0 for z in run.get("sessions", [])] or [1.0]
    hmax = max(hpaces) or 1.0
    for sess in run.get("sessions", []):
        x0, x1 = x(sess["started_iso"]), x(sess["ended_iso"])
        hrows.append(dict(
            y=y, x0=x0, x1=max(x1, x0 + 6),
            w=round(2.0 + 3.5 * ((sess.get("pace") or 0) / hmax), 2),
            label=sess["label"], typed=sess["typed"], tools=sess["tools"],
            t0=sess["started_iso"][11:16], t1=sess["ended_iso"][11:16]))
        y += g.hrow_h
    human_bottom = y
    y += WAVE_H + (6 if hrows else 0)

    # ---- the trail: one band per destination, sub-rows only where lanes really overlapped
    bands, segs, ticks = [], [], []
    for i, repo in enumerate(order):
        group = lanes_by_repo.get(repo, [])
        spans = [(x(l["started_iso"]), max(x(l["ended_iso"]), x(l["started_iso"]) + 6))
                 for l in group]
        sub = _pack(spans) if spans else []
        n_sub = (max(sub) + 1) if sub else 1
        y0 = y + LABEL_H          # the label owns the line above the band; nothing else draws there
        # first ARRIVAL, which is whichever came first -- a lane opening or a commit landing.
        # Taking it from the lanes alone put aistrava's name 3h42m to the right of the commit
        # that actually got there first, on top of another row's label.
        cand = [sx for sx, _ in spans] + [x(c) for c in (commits_by_repo.get(repo) or [])]
        first_x = min(cand) if cand else PAD_L
        for l, (sx0, sx1), r in zip(group, spans, sub):
            sy = y0 + r * ROW_H
            segs.append(dict(
                y=sy, x0=sx0, x1=sx1,
                w=round(2.2 + 5.0 * (l["pace"] / pmax), 2),
                shipped=bool(l.get("overlapping_commits")),
                code=l["code"], label=l["label"], repo=repo,
                tools=l["tools"], mins=l["duration_s"] // 60, pace=l["pace"],
                t0=l["started_iso"][11:16], t1=l["ended_iso"][11:16]))
        cy = y0 + (n_sub - 1) * ROW_H + COMMIT_DROP
        cts = commits_by_repo.get(repo) or []
        for c in cts:
            ticks.append(dict(x=x(c), y=cy, repo=repo, at=_t(c).strftime("%H:%M")))
        bands.append(dict(
            repo=repo, y0=y0, y1=cy, rows=n_sub, cy=cy, alt=(i % 2 == 1),
            top=y0 - LABEL_H - 2, bot=cy + 7,
            lanes=len(group), commits=(None if repo in untracked else len(cts)),
            label_x=first_x, label_y=y0 - 6, untracked=repo in untracked))
        y = cy + 7 + BAND_GAP

    trail_bottom = y
    prof_y0 = trail_bottom + 12
    prof_y1 = prof_y0 + PROFILE_H
    height = prof_y1 + AXIS_H

    conc = concurrency(run["lanes"])
    cmax = max([c for _, c in conc] + [1])

    pts = []
    for ts, c in conc:
        px = x(ts)
        py = prof_y1 - (c / cmax) * (PROFILE_H - g.head_room)
        if pts:
            pts.append((px, pts[-1][1]))   # step, not a smoothed lie
        pts.append((px, py))
    if pts:
        pts.append((x(t1), pts[-1][1]))

    # `iso` as well as the clock label: an HH:MM string comparison put every post-midnight lane
    # in no wave at all, because "23:49" <= "00:48" is false and the night crosses midnight.
    wv = [dict(x=x(w["at"]), n=w["n"], at=w["at"].strftime("%H:%M"), iso=w["at"].isoformat(), i=i + 1)
          for i, w in enumerate(waves(run["lanes"]))]

    ho = run.get("handoff")
    handoff_x = x(ho["at"]) if ho and t0 <= _t(ho["at"]) <= t1 else None

    return dict(x=x, t0=t0, t1=t1, rows=segs, hrows=hrows, bands=bands, order=order,
                ticks=ticks, waves=wv, handoff_x=handoff_x, handoff=ho,
                trunk_ticks=[x(t) for t in run["typed_stamps"] if t0 <= _t(t) <= t1],
                profile=pts, prof_y0=prof_y0, prof_y1=prof_y1, cmax=cmax,
                peak=cmax, peak_at=next((ts for ts, c in conc if c == cmax), t0),
                height=height, human_bottom=human_bottom, trail_bottom=trail_bottom, geo=g)


def _grid(t0: datetime, t1: datetime) -> list[datetime]:
    total = (t1 - t0).total_seconds() / 3600
    step = 1 if total <= 8 else (2 if total <= 16 else 4)
    h = t0.replace(minute=0, second=0, microsecond=0)
    while h < t0:
        h += timedelta(hours=1)
    while h.hour % step:
        h += timedelta(hours=1)
    out = []
    while h < t1:
        out.append(h)
        h += timedelta(hours=step)
    return out


def render_route_svg(run: dict):
    m = build_map(run)
    x, t0, t1, H = m["x"], m["t0"], m["t1"], m["height"]
    p = []

    # --- alternating destination bands: the only background in the drawing, so a row can be
    # followed across five hours of width without a ruler
    for b in m["bands"]:
        if b["alt"]:
            p.append(f'<rect class="band" x="{PAD_L - 8:.0f}" y="{b["top"]:.1f}" '
                     f'width="{W - PAD_L - PAD_R + 8:.0f}" height="{b["bot"] - b["top"]:.1f}"/>')

    for h in _grid(t0, t1):
        hx = x(h)
        p.append(f'<line class="grid" x1="{hx:.1f}" y1="{TRUNK_Y - 14:.0f}" x2="{hx:.1f}" y2="{m["prof_y1"] + 6:.0f}"/>')
        p.append(f'<text class="gl" x="{hx:.1f}" y="{H - 12:.0f}" text-anchor="middle">{h.strftime("%H:%M")}</text>')

    # --- the waves: the orchestrator fans out in bursts. Ruled from the lane starts themselves.
    for w in m["waves"]:
        p.append(f'<line class="wave" x1="{w["x"]:.1f}" y1="{TRUNK_Y + 12:.0f}" '
                 f'x2="{w["x"]:.1f}" y2="{m["trail_bottom"]:.0f}"><title>wave {w["i"]} · '
                 f'{w["at"]} · {w["n"]} lanes opened</title></line>')
        p.append(f'<text class="wl" x="{w["x"]:.1f}" y="{m["human_bottom"] + 11:.0f}" '
                 f'text-anchor="middle">w{w["i"]}·{w["n"]}</text>')

    # --- the handoff: after the last human turn the trunk is drawn as an absence, not a line
    hx = m["handoff_x"]
    if hx is not None:
        p.append(f'<line class="hline" x1="{hx:.1f}" y1="{TRUNK_Y - 20:.0f}" x2="{hx:.1f}" y2="{m["prof_y1"] + 6:.0f}"/>')
        anchor = "end" if hx > W * 0.72 else "start"
        dx = -7 if anchor == "end" else 7
        p.append(f'<text class="hlabel" x="{hx + dx:.1f}" y="{TRUNK_Y - 24:.0f}" text-anchor="{anchor}">'
                 f'handoff {_t(m["handoff"]["at"]).strftime("%H:%M")}</text>')

    # --- the trunk: the human's own line, and every turn `authorship` graded as theirs
    p.append(f'<text class="tlabel" x="{PAD_L - 14}" y="{TRUNK_Y + 4}" text-anchor="end">you</text>')
    end_solid = hx if hx is not None else (W - PAD_R)
    p.append(f'<line class="trunk" x1="{PAD_L}" y1="{TRUNK_Y}" x2="{end_solid:.1f}" y2="{TRUNK_Y}"/>')
    if hx is not None and hx < W - PAD_R:
        p.append(f'<line class="trunk gone" x1="{hx:.1f}" y1="{TRUNK_Y}" x2="{W - PAD_R}" y2="{TRUNK_Y}"/>')
    for tx in m["trunk_ticks"]:
        p.append(f'<line class="tick" x1="{tx:.1f}" y1="{TRUNK_Y - 8}" x2="{tx:.1f}" y2="{TRUNK_Y + 8}"/>')

    # --- your own sessions, drawn in ink: you at the keyboard, not an agent
    for r in m["hrows"]:
        p.append(f'<line class="seg human" x1="{r["x0"]:.1f}" y1="{r["y"]:.0f}" x2="{r["x1"]:.1f}" y2="{r["y"]:.0f}" '
                 f'stroke-width="{r["w"]}"><title>{r["label"]} · {r["t0"]}-{r["t1"]} · '
                 f'{r["typed"]} human prompt{"" if r["typed"] == 1 else "s"} · {r["tools"]} tool calls</title></line>')
        p.append(f'<text class="ltag human" x="{r["x0"]:.1f}" y="{r["y"] - 5.5:.0f}">'
                 f'{r["label"]} · {r["typed"]} prompt{"" if r["typed"] == 1 else "s"}</text>')

    # --- the trail: destination rows. The label rides on the row's first arrival, never in a
    # left gutter -- a wide map is scrolled on a phone and a gutter label leaves the screen first.
    for b in m["bands"]:
        p.append(f'<line class="crail" x1="{PAD_L:.0f}" y1="{b["cy"]:.1f}" x2="{W - PAD_R:.0f}" y2="{b["cy"]:.1f}"/>')
        n = b["commits"]
        tag = f'{b["repo"]}'
        if b["repo"] == "recon":
            # not a repository: the lanes that edited nothing inside a work tree. Printing
            # "0 commits" here would answer a question the row never asked.
            note = f'{b["lanes"]} lane{"" if b["lanes"] == 1 else "s"} · landed in no repository'
        else:
            # "no lane HERE" and nothing more. The first draft said "your own commits", which the
            # row's own timestamps contradict: repo D' single commit landed at 01:54, two
            # hours after the last human turn. A lane is placed at its DOMINANT repository, so a
            # lane can commit somewhere it is not drawn -- which makes the author of a laneless
            # commit exactly the thing this card refuses to guess.
            note = (f'{n} commit{"" if n == 1 else "s"}'
                    + (f' · {b["lanes"]} lane{"" if b["lanes"] == 1 else "s"}'
                       if b["lanes"] else " · no lane drawn here"))
        # a long label starting near the right edge ran off the drawing entirely (repo D,
        # arriving at 01:54, lost half its note). Flip the anchor rather than clip the text.
        wide = (len(b["repo"]) + len(note) + 3) * 6.55
        if b["label_x"] + wide > W - PAD_R:
            p.append(f'<text class="rtag" x="{W - PAD_R:.0f}" y="{b["label_y"]:.0f}" text-anchor="end">'
                     f'{b["repo"]}<tspan class="rnote"> · {note}</tspan></text>')
            continue
        p.append(f'<text class="rtag" x="{b["label_x"]:.1f}" y="{b["label_y"]:.0f}">{tag}'
                 f'<tspan class="rnote"> · {note}</tspan></text>')

    for s in m["rows"]:
        who = s["label"] if (not s["code"] or s["label"] == s["code"]) else f'{s["code"]} · {s["label"]}'
        tip = f'{who} · {s["t0"]}-{s["t1"]} · {s["mins"]}m · {s["tools"]} tool calls · {s["pace"]}/min'
        p.append(f'<line class="seg" x1="{s["x0"]:.1f}" y1="{s["y"]:.0f}" x2="{s["x1"]:.1f}" y2="{s["y"]:.0f}" '
                 f'stroke-width="{s["w"]}"><title>{tip}</title></line>')
        cap = "ship" if s["shipped"] else "spur"
        p.append(f'<circle class="cap {cap}" cx="{s["x1"]:.1f}" cy="{s["y"]:.0f}" r="3.2"/>')
        if s["code"]:
            p.append(f'<text class="lcode" x="{s["x0"]:.1f}" y="{s["y"] + 3.6:.0f}" text-anchor="end">{s["code"]} </text>')

    for tk in m["ticks"]:
        p.append(f'<line class="flag" x1="{tk["x"]:.1f}" y1="{tk["y"] - 5:.1f}" x2="{tk["x"]:.1f}" y2="{tk["y"] + 5:.1f}">'
                 f'<title>{tk["repo"]} · commit {tk["at"]}</title></line>')

    # --- the profile: lanes open at once, as a step mountain
    pl = " ".join(f"{px:.1f},{py:.1f}" for px, py in m["profile"])
    if m["profile"]:
        x_first, x_last = m["profile"][0][0], m["profile"][-1][0]
        p.append(f'<polygon class="profill" points="{x_first:.1f},{m["prof_y1"]:.0f} {pl} {x_last:.1f},{m["prof_y1"]:.0f}"/>')
        p.append(f'<polyline class="profline" points="{pl}"/>')
    p.append(f'<line class="base" x1="{PAD_L}" y1="{m["prof_y1"]:.0f}" x2="{W - PAD_R}" y2="{m["prof_y1"]:.0f}"/>')
    p.append(f'<text class="plabel" x="{PAD_L - 14}" y="{m["prof_y0"] + 11:.0f}" text-anchor="end">lanes open</text>')
    p.append(f'<text class="pmax" x="{PAD_L - 14}" y="{m["prof_y0"] + 26:.0f}" text-anchor="end">peak {m["cmax"]}</text>')

    body = "\n  ".join(p)
    return f'''<svg class="routemap" viewBox="0 0 {W} {H}" role="img"
   aria-label="Session route: {len(m["rows"])} agent lanes across {len([o for o in m["order"] if o != "recon"])} repositories between {t0.strftime("%H:%M")} and {t1.strftime("%H:%M")}, in {len(m["waves"])} fan-out waves, peak {m["cmax"]} lanes open at once">
  {body}
</svg>''', m


# ---------------------------------------------------------------------------
# THE NIGHT-RUN ROUTE AT 360 UNITS — same map, a layout a phone can hold
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
    """At most four interior stamps; 360 units holds five `%H:%M` labels before they collide."""
    total_h = max((t1 - t0).total_seconds() / 3600, 0.1)
    for step in (1, 2, 3, 4, 6, 8, 12, 24):
        if total_h / step <= 5:
            break
    h = t0.replace(minute=0, second=0, microsecond=0)
    while h < t0:
        h += timedelta(hours=1)
    while h.hour % step:
        h += timedelta(hours=1)
    out = []
    while h < t1:
        out.append(h)
        h += timedelta(hours=step)
    return out


def _fit(label: str, note: str, avail: float, lab_px: float, note_px: float):
    """Elide the NOTE, never the destination. A truncated repository name is a wrong one."""
    if not note:
        return label, ""
    room = avail - len(label) * lab_px - 3 * note_px
    n = int(room // note_px)
    if n >= len(note):
        return label, note
    return (label, "") if n < 6 else (label, note[:n - 1] + "…")


def render_phone_route_svg(run: dict):
    """The night run at 360 units. Every number is the same object the desktop map draws."""
    m = build_map(run, PHONE)
    g = m["geo"]
    W_, PL, PR = g.w, g.pad_l, g.pad_r
    x, t0, t1, H = m["x"], m["t0"], m["t1"], m["height"]
    avail = W_ - PL - PR
    TY = g.trunk_y
    p = []

    for b in m["bands"]:
        if b["alt"]:
            p.append(f'<rect class="band" x="{PL:.0f}" y="{b["top"]:.1f}" '
                     f'width="{W_ - PL - PR:.0f}" height="{b["bot"] - b["top"]:.1f}"/>')

    for h in _phone_grid(t0, t1):
        hx = x(h)
        p.append(f'<line class="grid" x1="{hx:.1f}" y1="{TY - 10:.0f}" x2="{hx:.1f}" '
                 f'y2="{m["prof_y1"] + 5:.0f}"/>')
        _lab = h.strftime("%H:%M")
        _sx, _sa = _edge_stamp(hx, _lab, PL, W_ - PR)
        p.append(f'<text class="gl" x="{_sx:.1f}" y="{H - 9:.0f}" text-anchor="{_sa}">'
                 f'{_lab}</text>')

    # the handoff: the one vertical the phone keeps, because it is the card's headline
    hx = m["handoff_x"]
    if hx is not None:
        p.append(f'<line class="hline" x1="{hx:.1f}" y1="{TY - 16:.0f}" x2="{hx:.1f}" '
                 f'y2="{m["prof_y1"] + 5:.0f}"/>')
        anchor = "end" if hx > W_ * 0.62 else "start"
        dx = -5 if anchor == "end" else 5
        p.append(f'<text class="hlabel" x="{hx + dx:.1f}" y="{TY - 19:.0f}" text-anchor="{anchor}">'
                 f'handoff {_t(m["handoff"]["at"]).strftime("%H:%M")}</text>')

    p.append(f'<text class="tlabel" x="{PL:.0f}" y="{TY - 7:.0f}">you</text>')
    end_solid = hx if hx is not None else (W_ - PR)
    p.append(f'<line class="trunk" x1="{PL}" y1="{TY}" x2="{end_solid:.1f}" y2="{TY}"/>')
    if hx is not None and hx < W_ - PR:
        p.append(f'<line class="trunk gone" x1="{hx:.1f}" y1="{TY}" x2="{W_ - PR}" y2="{TY}"/>')
    for tx in m["trunk_ticks"]:
        p.append(f'<line class="tick" x1="{tx:.1f}" y1="{TY - 5}" x2="{tx:.1f}" y2="{TY + 5}"/>')

    for r in m["hrows"]:
        lab, nt = _fit(r["label"], f'{r["typed"]} prompt{"" if r["typed"] == 1 else "s"}',
                       avail, 5.6, 5.0)
        p.append(f'<text class="ltag human" x="{PL:.0f}" y="{r["y"] - 4.5:.0f}">{lab}'
                 + (f'<tspan class="rnote"> · {nt}</tspan>' if nt else "") + '</text>')
        p.append(f'<line class="seg human" x1="{r["x0"]:.1f}" y1="{r["y"]:.0f}" '
                 f'x2="{r["x1"]:.1f}" y2="{r["y"]:.0f}" stroke-width="{r["w"]}"/>')

    for b in m["bands"]:
        n = b["commits"]
        if b["repo"] == "recon":
            note = f'{b["lanes"]} lane{"" if b["lanes"] == 1 else "s"} · in no repository'
        else:
            note = (f'{n} commit{"" if n == 1 else "s"}'
                    + (f' · {b["lanes"]} lane{"" if b["lanes"] == 1 else "s"}'
                       if b["lanes"] else " · no lane drawn here"))
        lab, nt = _fit(b["repo"], note, avail, 5.6, 5.0)
        p.append(f'<text class="rtag" x="{PL:.0f}" y="{b["label_y"]:.0f}">{lab}'
                 + (f'<tspan class="rnote"> · {nt}</tspan>' if nt else "") + '</text>')
        p.append(f'<line class="crail" x1="{PL:.0f}" y1="{b["cy"]:.1f}" x2="{W_ - PR:.0f}" '
                 f'y2="{b["cy"]:.1f}"/>')

    for s in m["rows"]:
        p.append(f'<line class="seg" x1="{s["x0"]:.1f}" y1="{s["y"]:.0f}" x2="{s["x1"]:.1f}" '
                 f'y2="{s["y"]:.0f}" stroke-width="{s["w"]}"/>')
        cap = "ship" if s["shipped"] else "spur"
        p.append(f'<circle class="cap {cap}" cx="{s["x1"]:.1f}" cy="{s["y"]:.0f}" r="2.4"/>')

    for tk in m["ticks"]:
        p.append(f'<line class="flag" x1="{tk["x"]:.1f}" y1="{tk["y"] - 4:.1f}" x2="{tk["x"]:.1f}" '
                 f'y2="{tk["y"] + 4:.1f}"/>')

    pl = " ".join(f"{px:.1f},{py:.1f}" for px, py in m["profile"])
    if m["profile"]:
        xa, xb = m["profile"][0][0], m["profile"][-1][0]
        p.append(f'<polygon class="profill" points="{xa:.1f},{m["prof_y1"]:.0f} {pl} '
                 f'{xb:.1f},{m["prof_y1"]:.0f}"/>')
        p.append(f'<polyline class="profline" points="{pl}"/>')
    p.append(f'<line class="base" x1="{PL}" y1="{m["prof_y1"]:.0f}" x2="{W_ - PR}" '
             f'y2="{m["prof_y1"]:.0f}"/>')
    p.append(f'<text class="plabel" x="{PL:.0f}" y="{m["prof_y0"] + 9:.0f}">lanes open'
             f'<tspan class="pmax"> · peak {m["cmax"]}</tspan></text>')

    body = "\n  ".join(p)
    return f'''<svg class="routemap phone" viewBox="0 0 {W_} {H}" role="img" aria-hidden="true">
  {body}
</svg>''', m
