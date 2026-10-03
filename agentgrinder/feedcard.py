"""THE FEED CARD, drawn on this computer.

The web feed, the shared link page /r/<id> and the share image all draw a run with one function,
`card` in site/feed-card.js. The command line cannot run that file (it stays dependency-free
Python), so this module is a line-for-line port of it: the same face, name, agent, title, one big
number, up to three small figures, activity line, and heart, discuss and share row, from the same
rules. tests/test_feed_card_parity.py renders the same rows through both and compares the visible
text, and compares CARD_CSS with the card section of site/feed.css, so the two cannot drift.

Every value is a field of the run. A number the run did not measure is not drawn; nothing is
estimated and nothing is invented to fill a gap.
"""
from __future__ import annotations

import html as _html
import math
import re
import time
from datetime import datetime, timezone

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Copied from site/design.css (:root) and site/feed.css (the card section). The parity test fails
# the moment either file changes without this copy.
TOKENS_CSS = """:root{
  --paper:#f7f7f5;--box:#fff;--ink:#0a0a0a;--soft:#6f6f6b;--dim:#73736f;
  --rule:#e3e3df;--rule-2:#efefec;--blue:#0047ff;--blue-soft:#c4d2ff;--blue-wash:#f2f5ff;
  /* the old token names, aliased, so no inline style left in this file can bring the green back */
  --bg:#f7f7f5;--card:#fff;--line:#e3e3df;--muted:#6f6f6b;
  --accent:#0047ff;--accent-ink:#0047ff;--accent-soft:#f2f5ff;
}"""
CARD_CSS = """/* the card */
.fc{background:var(--box);border:1px solid var(--rule);margin:0 0 12px;padding:0;overflow:hidden}
.fc-top{display:flex;align-items:center;gap:12px;padding:16px 16px 0}
.fc-top>a{display:inline-flex}
.fc-who{min-width:0;display:flex;flex-direction:column;line-height:1.3}
.fc-name{font-size:15px;font-weight:600;color:var(--ink)}
.fc-who small{font-size:13px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fc-chip{margin-left:auto;align-self:flex-start;font-size:12px;font-weight:500;color:var(--blue);background:var(--blue-wash);border:1px solid var(--blue-soft);padding:3px 8px;border-radius:999px;white-space:nowrap}
.fc-face{--s:40px;width:var(--s);height:var(--s);flex:0 0 var(--s);border-radius:50%;overflow:hidden;display:inline-grid;place-items:center;background:var(--blue-wash);border:1px solid var(--blue-soft)}
.fc-face img{width:100%;height:100%;object-fit:cover;display:block}
.fc-mono{color:var(--blue);font-weight:600;font-size:calc(var(--s) * .42)}
.fc-body{display:block;padding:12px 16px 0;color:inherit}
.fc-body:hover{color:inherit}
.fc-body:hover .fc-title{color:var(--blue)}
.fc-title{font-size:20px;line-height:1.25;font-weight:600;letter-spacing:-.01em;margin:0}
.fc-cap{margin:4px 0 0;font-size:14px;color:var(--ink)}
.fc-numbers{display:flex;align-items:flex-end;gap:12px 28px;flex-wrap:wrap;margin:14px 0 0}
.fc-hero{display:flex;flex-direction:column;line-height:1}
.fc-n{font-size:44px;font-weight:600;letter-spacing:-.03em;color:var(--ink)}
.fc-u{font-size:13px;color:var(--soft);margin-top:6px}
.fc-stats{display:flex;gap:22px;margin:0;padding-bottom:2px}
.fc-stats div{display:flex;flex-direction:column}
.fc-stats dt{font-size:12px;color:var(--soft)}
.fc-stats dd{margin:2px 0 0;font-size:17px;font-weight:500}
.fc-spark{position:relative;height:56px;margin:14px 0 0}
.fc-spark svg{display:block;width:100%;height:100%}
.fc-area{fill:var(--blue-wash)}
.fc-line{fill:none;stroke:var(--blue);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.fc-peak{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:currentColor;box-shadow:0 0 0 2px var(--box)}
.fc-peak,.fc-bars b{color:var(--strive-orange)}
.fc-badge{display:flex;align-items:center;gap:6px;margin:12px 0 0;font-size:13px;line-height:1.3;color:var(--soft);min-width:0}
.fc-badge svg{flex:none;color:var(--blue)}
.fc-badge b{font-weight:600;color:var(--blue)}
.fc-badge span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-map{margin:14px 0 0}
.fc-map svg{display:block;width:100%;height:auto}
.fc-rail{stroke:var(--blue-soft);stroke-width:1}
.fc-hop{fill:none;stroke:var(--blue);stroke-width:1.3;opacity:.4;stroke-linecap:round}
.fc-stn{fill:var(--box);stroke:var(--blue);stroke-width:1.6}
.fc-map-k{margin:4px 0 0;font-size:12px;color:var(--soft)}
.fc-stride{display:flex;align-items:flex-start;gap:10px;margin:14px 0 0;min-width:0}
.fc-stride pre{flex:1 1 auto;min-width:0;margin:0;padding:10px 12px;font:inherit;font-size:13px;line-height:1.5;background:var(--paper);border:1px solid var(--rule-2);color:var(--soft);white-space:pre-wrap;overflow-wrap:anywhere}
.fc-bars{font:15px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:1px;color:var(--blue)}
.fc-where{white-space:normal;overflow-wrap:anywhere} /* a long run address wraps inside the card instead of being cut off at 390 px */
.fc-bars b{font-weight:inherit}
.fc-copy{flex:none;min-height:36px;padding:0 12px;font:500 13px/1 'IBM Plex Sans',system-ui,sans-serif;color:var(--blue);background:var(--blue-wash);border:1px solid var(--blue-soft);border-radius:2px;cursor:pointer;transition:transform .16s cubic-bezier(.23,1,.32,1)}
.fc-copy:active{transform:scale(.97)}
.fc-copy+.fc-copy{margin-left:-4px}
.fc .fc-foot{display:flex;border-top:1px solid var(--rule-2);margin:14px 0 0;padding:0;max-width:none;color:inherit;font-size:inherit}
.fc .fc-top{max-width:none;margin:0}
.landing-feature .fc{margin:0 0 12px}
.fc-act{flex:1 1 0;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 8px;font:500 14px/1 'IBM Plex Sans',system-ui,sans-serif;color:var(--soft);background:none;border:0;border-radius:0;cursor:pointer}
.fc-act+.fc-act{border-left:1px solid var(--rule-2)}
button.fc-act:hover,a.fc-act:hover{background:var(--blue-wash);color:var(--blue);border-color:var(--rule-2)}
.fc-act.kudo{color:var(--ink)}
.fc-act.kudo svg{color:var(--soft)}
.fc-act.kudo.on,.fc-act.kudo.on svg{color:var(--strive-orange)}
.fc-kudos-mine{cursor:default}
.fc .ack-picker{padding:14px 16px;border-top:1px solid var(--rule-2)}
@media (prefers-reduced-motion:no-preference){
  .fc-act.kudo svg{transition:transform .18s cubic-bezier(.23,1,.32,1),color .18s ease-out}
  .fc-act.kudo:active svg{transform:scale(.86)}
  .fc-act.kudo.on.pop svg{animation:fc-kudo .32s cubic-bezier(.23,1,.32,1)}
}
@keyframes fc-kudo{from{transform:scale(.72)}to{transform:scale(1)}}"""


def esc(s) -> str:
    return _html.escape("" if s is None else str(s), quote=True).replace("&#x27;", "&#39;")


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def whole(v):
    return int(math.floor(v + 0.5)) if _num(v) and v >= 0 else None   # Math.round, not banker's


def _thousands(n: int) -> str:
    return f"{n:,}"


def duration_label(seconds):
    if not _num(seconds) or seconds <= 0:
        return None
    m = int(math.floor(seconds / 60 + 0.5))
    if m < 1:
        return "<1m"
    return f"{m // 60}h {m % 60}m" if m >= 60 else f"{m}m"


def _parse(iso):
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.astimezone()
    return t


def when(iso, now: float | None = None) -> str:
    t = _parse(iso)
    if t is None:
        return ""
    now = time.time() if now is None else now
    days = math.floor((now - t.timestamp()) / 86400)
    if days <= 0:
        return "Today"
    if days == 1:
        return "Yesterday"
    if days < 7:
        return f"{days} days ago"
    local = t.astimezone()
    return f"{local.day} {MONTHS[local.month - 1]}"


def local_hour(iso):
    """The hour the run started, on this machine's clock: what the browser's uploadPayload sends
    as started_hour, so a local card and a drop-in card judge the night the same way."""
    t = _parse(iso)
    return t.astimezone().hour if t else None


def _day_of(iso) -> str:
    t = _parse(iso)
    if t is None:
        return ""
    local = t.astimezone()
    return f"{local.day} {MONTHS[local.month - 1]}"


def title_of(r: dict) -> str:
    """A folder name or a bare "<harness> sitting" becomes "<harness> session, 24 Sep"."""
    t = str(r.get("title") or "").strip()
    generic = (
        not t
        or re.search(r"(^|·\s*)-?Users-\S", t)
        or re.search(r"(^|·\s*)-?home-[a-z0-9_]+(\s*·|$)", t)
        or re.search(r"(^|·\s*)(Cursor|Claude Code|Claude|Codex|Grok Bot|Agent) sitting$", t, re.I)
        or re.fullmatch(r"(untitled run|a run|agent run)", t, re.I)
    )
    if not generic:
        return t
    day = _day_of(r.get("started_at") or r.get("started") or r.get("created_at"))
    return f"{harness_name(r) or 'Agent'} session" + (f", {day}" if day else "")


def harness_name(r: dict) -> str:
    """site/feed-card.js harnessName: a subagent capture's "claude-agent" reads Claude Code."""
    h = str(r["harness"]) if r.get("harness") else ""
    return "Claude Code" if h == "claude-agent" else h


def tool_call_count(r: dict):
    """site/run-contract.js toolCallCount."""
    recorded = r.get("tool_calls")
    from_ridge = r.get("ridge_tool_calls")
    if (recorded is None or recorded == 0) and _num(from_ridge) and from_ridge > 0:
        return from_ridge
    ridge = r.get("ridge") if isinstance(r.get("ridge"), list) else None
    live = bool(ridge) and all(_num(v) and v >= 0 for v in ridge) and any(v > 0 for v in ridge)
    if recorded == 0 and live and not (_num(from_ridge) and from_ridge > 0):
        return None
    return recorded


def _tools(r):
    return whole(tool_call_count(r))


def headline(r: dict):
    """The one number: the first measured, non-zero value of commits, files, tool calls, time."""
    commits, files, tools = whole(r.get("commits")), whole(r.get("files_touched")), _tools(r)
    t = duration_label(r.get("wall_time_s") if r.get("wall_time_s") is not None else r.get("duration_s"))
    if commits:
        return {"n": _thousands(commits), "unit": "commit" if commits == 1 else "commits", "key": "commits"}
    if files:
        return {"n": _thousands(files), "unit": "file changed" if files == 1 else "files changed", "key": "files"}
    if tools:
        return {"n": _thousands(tools), "unit": "tool calls", "key": "tools"}
    if t:
        return {"n": t, "unit": "session", "key": "time"}
    return None


def stats(r: dict, lead) -> list:
    out = []

    def add(key, label, value):
        if (len(out) >= 3 or value is None or value == "" or (lead and key in (lead["key"], lead.get("also")))
                or any(f[0] == label for f in out)):
            return
        out.append((label, value))

    add("time", "Time", duration_label(r.get("wall_time_s") if r.get("wall_time_s") is not None else r.get("duration_s")))
    tools = _tools(r)
    add("turns", "Turns", whole(r.get("prompts") if r.get("prompts") is not None else r.get("turns_typed")))
    add("tools", "Tool calls", _thousands(tools) if tools else None)
    add("commits", "Commits", whole(r.get("commits")) or None)
    add("files", "Files", whole(r.get("files_touched")) or None)
    return out


def _hour_of(r: dict):
    h = r.get("started_hour")
    return h if isinstance(h, int) and not isinstance(h, bool) and 0 <= h <= 23 else None


def achievement(r: dict):
    """site/feed-card.js achievement(): one badge from the run's own numbers, first rule wins."""
    if r.get("trace_basis") == "typed-by-author":
        return None
    secs = whole(r.get("wall_time_s") if r.get("wall_time_s") is not None else r.get("duration_s"))
    turns = whole(r.get("prompts") if r.get("prompts") is not None else r.get("turns_typed"))
    tools = _tools(r)
    commits, files = whole(r.get("commits")), whole(r.get("files_touched"))
    hour = _hour_of(r)
    if secs is not None and secs >= 10800:
        return {"key": "marathon", "label": "Marathon", "detail": f"{duration_label(secs)} in one session"}
    if turns == 1 and tools is not None and tools >= 60:
        return {"key": "one-shot", "label": "One-shot", "detail": f"1 prompt, {_thousands(tools)} tool calls"}
    if hour is not None and (hour >= 23 or hour < 5):
        return {"key": "night-owl", "label": "Night owl", "detail": "started after 23:00" if hour >= 23 else "started before 05:00"}
    if commits is not None and commits >= 5:
        return {"key": "shipper", "label": "Shipper", "detail": f"{_thousands(commits)} commits in one run"}
    if files is not None and files >= 25:
        return {"key": "wide-net", "label": "Wide net", "detail": f"{_thousands(files)} files changed"}
    if turns is not None and turns >= 2 and tools and tools / turns >= 30:
        return {"key": "delegator", "label": "Delegator", "detail": f"{_thousands(whole(tools / turns))} tool calls per prompt"}
    if secs and secs < 900 and commits is not None and commits >= 1:
        return {"key": "sprint", "label": "Sprint", "detail": "a commit in under 15 minutes"}
    if secs is not None and secs >= 3600:
        return {"key": "deep-focus", "label": "Long stretch", "detail": "over an hour between session timestamps"}
    if hour is not None and 5 <= hour < 7:
        return {"key": "early-bird", "label": "Early bird", "detail": "started before 07:00"}
    return None


BADGE_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 1.5h6l-1.6 4.2M5 1.5l1.6 4.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="10" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'


def badge(r: dict) -> str:
    a = achievement(r)
    if not a:
        return ""
    return (f'<p class="fc-badge" data-badge="{esc(a["key"])}">{BADGE_ICON}'
            f'<b>{esc(a["label"])}</b><span>{esc(a["detail"])}</span></p>')


def profile_of(r: dict) -> dict:
    p = r.get("profiles") or {}
    handle = p.get("handle") or p.get("github_handle") or ""
    name = p.get("display_name") or p.get("name") or handle or "Builder"
    return {"handle": handle, "name": name, "github": p.get("github_handle") or None,
            "avatar": p.get("avatar_url") or None}


def face(r: dict, size: int = 40, avatars: bool = False) -> str:
    """The builder's face. On a local card (avatars=False, the default) it is always the initial:
    a card on this computer loads nothing from the network, so opening it cannot tell GitHub who
    is looking or when. avatars=True draws the web's face (the profile avatar or the GitHub
    picture) and exists only so the parity test can compare against site/feed-card.js."""
    s = size
    if r.get("visibility") == "anonymous":
        return f'<span class="fc-face fc-mono" style="--s:{s}px" aria-hidden="true">?</span>'
    p = profile_of(r)
    initial = esc(((p["name"] or "?").strip()[:1].upper()) or "?")
    src = None
    if avatars:
        if re.match(r"^https://", p["avatar"] or "", re.I):
            src = p["avatar"]
        elif p["github"] and re.fullmatch(r"[A-Za-z0-9-]{1,39}", p["github"]):
            src = f"https://github.com/{p['github']}.png?size={s * 2}"
    if not src:
        return f'<span class="fc-face fc-mono" style="--s:{s}px" aria-hidden="true">{initial}</span>'
    return (f'<span class="fc-face" style="--s:{s}px" data-initial="{initial}" aria-hidden="true">'
            f'<img src="{esc(src)}" alt="" width="{s}" height="{s}" loading="lazy" referrerpolicy="no-referrer" '
            "onerror=\"this.parentNode.classList.add('fc-mono');this.parentNode.textContent=this.parentNode.dataset.initial\"></span>")


def _fixed(v: float, places: int) -> str:
    """Number.prototype.toFixed: the exact binary value, halves rounded up (not to even)."""
    from decimal import ROUND_HALF_UP, Decimal
    return str(Decimal(v).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def _fx(v: float) -> str:
    return _fixed(v, 1)


def settle(values: list) -> list:
    """A comb of ones and zeros is not a shape: with fewer than two calls per bin on average,
    neighbouring bins are added together until there are. The total is kept."""
    total = sum(values)
    if total >= 2 * len(values):
        return values
    n = max(2, min(len(values), int(total // 2)))
    if n >= len(values):
        return values
    out = [0] * n
    for i, v in enumerate(values):
        out[(i * n) // len(values)] += v
    return out


def spark(r: dict) -> str:
    src = None
    for key in ("ridge", "rhythm"):
        v = r.get(key)
        if isinstance(v, list) and len(v) > 1:
            src = v
            break
    if not src or any(not _num(v) or v < 0 for v in src):
        return ""
    src = settle(src)
    mx = max(src)
    if not mx:
        return ""
    w, h, top = 300, 56, 6
    x = lambda i: (i * w) / (len(src) - 1)
    y = lambda v: h - (v / mx) * (h - top)
    line = " ".join(f"{_fx(x(i))},{_fx(y(v))}" for i, v in enumerate(src))
    peak = src.index(mx)
    px = _fixed((peak / (len(src) - 1)) * 100, 2)
    py = _fixed((y(mx) / h) * 100, 2)
    return (f'<div class="fc-spark" aria-hidden="true"><svg viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'<polygon points="0,{h} {line} {w},{h}" class="fc-area"/><polyline points="{line}" class="fc-line"/></svg>'
            f'<span class="fc-peak" style="left:{px}%;top:{py}%"></span></div>')


# THE RUN MAP. site/feed-card.js routeGeometry and routeMap, the same numbers and the same rounding.
MAP_W, MAP_H, RAIL, MAP_X0, MAP_X1 = 300, 44, 30, 12, 288
MAP_SMALL = {"h": 26, "rail": 17, "up": 13, "down": 6}      # two folders: a short strip
MAP_FULL = {"h": MAP_H, "rail": RAIL, "up": 26, "down": 12}


def _plural(k: int, one: str, many: str) -> str:
    return f"{_thousands(k)} {one if k == 1 else many}"


def route_geometry(r: dict):
    raw = r.get("route") if isinstance(r.get("route"), list) else None
    if not raw or any(not isinstance(v, int) or isinstance(v, bool) or v < 0 or v > 15 for v in raw):
        return None
    order: dict = {}
    seq: list = []
    for v in raw:                      # a stay is one visit; stations numbered by first appearance
        i = order.setdefault(v, len(order))
        if not seq or seq[-1] != i:
            seq.append(i)
    if len(seq) < 2:
        return None
    n = len(order)
    box = MAP_SMALL if n <= 2 else MAP_FULL
    visits = [0] * n
    for v in seq:
        visits[v] += 1
    most = max(visits)
    x = lambda i: MAP_X0 + ((MAP_X1 - MAP_X0) * i) / (n - 1) if n > 1 else MAP_W / 2
    stations = [(x(i), 2.5 + 4.5 * math.sqrt(v / most) if v else 2) for i, v in enumerate(visits)]
    hops = []
    for k in range(1, len(seq)):
        a, b = seq[k - 1], seq[k]
        if a == b:
            continue
        xa, xb = x(a), x(b)
        span = abs(xb - xa) / (MAP_X1 - MAP_X0)
        cy = box["rail"] - box["up"] * span if b > a else box["rail"] + box["down"] * span
        hops.append(f"M{_fx(xa)},{box['rail']} Q{_fx((xa + xb) / 2)},{_fx(cy)} {_fx(xb)},{box['rail']}")
    moves, returns = len(hops), len(seq) - n
    label = f"{_plural(n, 'folder', 'folders')} · {_plural(moves, 'move', 'moves')} · {_plural(returns, 'return', 'returns')}"
    return {"n": n, "moves": moves, "returns": returns, "stations": stations, "hops": hops,
            "h": box["h"], "rail": box["rail"], "label": label}


def route_map(r: dict) -> str:
    g = route_geometry(r)
    if not g:
        return ""
    rail = f'<line class="fc-rail" x1="{MAP_X0}" y1="{g["rail"]}" x2="{MAP_X1}" y2="{g["rail"]}"/>'
    hops = "".join(f'<path class="fc-hop" d="{d}"/>' for d in g["hops"])
    stations = "".join(f'<circle class="fc-stn" cx="{_fx(cx)}" cy="{g["rail"]}" r="{_fx(cr)}"/>' for cx, cr in g["stations"])
    return (f'<div class="fc-map"><svg viewBox="0 0 {MAP_W} {g["h"]}" role="img" aria-label="Route: {esc(g["label"])}">'
            f'{rail}{hops}{stations}</svg><p class="fc-map-k">{esc(g["label"])}</p></div>')


def result_visual(r: dict) -> str:
    shipped = [x for x in (r.get("shipped") or []) if x] if isinstance(r.get("shipped"), list) else []
    commits = whole(r.get("commits")) or 0
    n = len(shipped) or commits
    label = shipped[0] if shipped else (f'{n} commit{"" if n == 1 else "s"} recorded' if n else "")
    return (f'<div class="fc-result" aria-label="Result"><b class="num">{n}</b>'
            f'<span>{esc(label)}</span></div>') if n and label else ""


def hero_visual(r: dict) -> str:
    """The web card's evidence-only chooser. Typed claims never earn a measured visual."""
    if r.get("trace_basis") == "typed-by-author":
        return ""
    choices = [("activity_terrain", spark(r)), ("change_atlas", route_map(r)),
               ("result", result_visual(r))]
    choices = [(key, markup) for key, markup in choices if markup]
    selected = next((markup for key, markup in choices if key == r.get("hero_visual")), None)
    return selected or (choices[0][1] if choices else "")


# THE STRIDE LINE. site/feed-card.js strideBars, strideText and stride: two lines of plain text.
BARS = "▁▂▃▄▅▆▇█"


def _stride_bins(r: dict):
    raw = None
    for key in ("ridge", "rhythm"):
        v = r.get(key)
        if isinstance(v, list) and len(v) > 1:
            raw = v
            break
    if not raw or any(not _num(v) or v < 0 for v in raw):
        return None
    src = settle(raw)
    n = min(12, len(src))
    bins = [0] * n
    for i, v in enumerate(src):
        bins[(i * n) // len(src)] += v
    mx = max(bins)
    if not mx:
        return None
    return {"bars": [BARS[int(math.floor(math.sqrt(v / mx) * 7 + 0.5))] for v in bins], "peak": bins.index(mx)}


def stride_bars(r: dict) -> str:
    b = _stride_bins(r)
    return "".join(b["bars"]) if b else ""


def _stride_first(r: dict) -> str:
    lead = headline(r)
    a = achievement(r)
    figures = []
    for k, v in stats(r, lead):
        if k == "Time":
            figures.append(str(v))
        elif k == "Turns":
            figures.append(f"{v} {'turn' if v == 1 else 'turns'}")
        else:
            figures.append(f"{v} {k.lower()}")
    lead_text = f"{lead['n']} {lead['unit']}" if lead else ""
    return " · ".join(x for x in ["STRIVE", harness_name(r), lead_text, *figures, a["label"] if a else ""] if x)


def _where(url) -> str:
    return re.sub(r"^https?://", "", str(url)) if url else ""


def stride_text(r: dict, url: str | None = None) -> str:
    first = _stride_first(r)
    second = "  ".join(x for x in [stride_bars(r), _where(url)] if x)
    return f"{first}\n{second}" if second else first


def stride_html(r: dict, url: str | None = None) -> str:
    """site/feed-card.js strideHtml: the bars in a monospace run, the tallest one the peak mark."""
    b = _stride_bins(r)
    bars = ('<span class="fc-bars">' + "".join(f"<b>{c}</b>" if i == b["peak"] else c for i, c in enumerate(b["bars"]))
            + "</span>") if b else ""
    at = f'<span class="fc-where">{esc(_where(url))}</span>' if _where(url) else ""
    second = "  ".join(x for x in [bars, at] if x)
    first = esc(_stride_first(r))
    return f"{first}\n{second}" if second else first


def stride(r: dict, url: str | None = None) -> str:
    """The block on the card. The local card carries no script, so it draws no Copy button."""
    return f'<div class="fc-stride"><pre>{stride_html(r, url)}</pre></div>'


KUDOS_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 17.2 3.3 10.6A4.1 4.1 0 0 1 9.1 4.8l.9.9.9-.9a4.1 4.1 0 0 1 5.8 5.8L10 17.2Z" fill="currentColor"/></svg>'
TALK_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3.5 4.5h13v9h-8l-3.5 3v-3H3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
SHARE_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3v10M6 7l4-4 4 4M4 11v5.5h12V11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def card(r: dict, meta_extra: str = "", avatars: bool = False, url: str | None = None) -> str:
    """The feed card in its preview form (site/feed-card.js card(r, {preview: true, heading:
    "h1"})): a run that is only on this computer. Nothing on it links anywhere, because there is
    no saved run to open, react to or share, and the heart carries no count because none exists.
    The markup is the JavaScript's, character for character; tests/test_feed_card_parity.py.
    One deliberate difference: the face is the initial unless avatars=True, so a local card makes
    no network request when it is opened."""
    p = profile_of(r)
    anon = r.get("visibility") == "anonymous"
    lead = headline(r)
    facts = stats(r, lead)
    who = '<span class="fc-name">Anonymous builder</span>' if anon else f'<span class="fc-name">{esc(p["name"])}</span>'
    meta = " · ".join(x for x in [esc(harness_name(r)),
                                  esc(when(r.get("started_at") or r.get("started")) or "Session date unknown"), esc(meta_extra) if meta_extra else ""] if x)
    shipped = ('<span class="fc-chip">Shipped</span>'
               if r.get("output_url") and re.match(r"^https://", str(r["output_url"]), re.I) else "")
    cap = r.get("caption") or r.get("note")
    hero = (f'<div class="fc-hero"><span class="fc-n num">{esc(lead["n"])}</span><span class="fc-u">{esc(lead["unit"])}</span></div>'
            if lead else "")
    dl = ('<dl class="fc-stats">' + "".join(f'<div><dt>{esc(k)}</dt><dd class="num">{esc(v)}</dd></div>' for k, v in facts) + "</dl>"
          if facts else "")
    cap_html = f'<p class="fc-cap">{esc(cap)}</p>' if cap else ""
    typed = r.get("trace_basis") == "typed-by-author"
    visual = '<p class="fc-source">Typed by the author. No capture.</p>' if typed else hero_visual(r)
    source_label = {"typed-by-author": "Author’s account", "historical-reconstruction": "Historical reconstruction · client-reported", "observed native events; timestamps unavailable": "Imported · client-reported · observed subset"}.get(r.get("trace_basis"), "Imported · client-reported")
    evidence = f'<p class="run-evidence-basis">{esc(source_label)}</p>'
    body = f"""
    <h1 class="fc-title">{esc(title_of(r))}</h1>
    {cap_html}
    <div class="fc-numbers">{hero}{dl}</div>
    {evidence}{badge(r)}{visual}{stride(r, url)}
  """
    return f"""<article class="card fc">
  <header class="fc-top">{face(r, avatars=avatars)}<div class="fc-who">{who}<small>{meta}</small></div>{shipped}</header>
  <div class="fc-body">{body}</div>
  <footer class="fc-foot"><span class="fc-act" aria-label="Send thanks">{KUDOS_ICON}</span><span class="fc-act" aria-label="Reply">{TALK_ICON}<span>Reply</span></span><span class="fc-act" aria-label="Share">{SHARE_ICON}<span>Share</span></span></footer>
</article>"""


def terminal_lines(r: dict) -> list:
    """The card, as terminal lines: who and what, then the one big number and the small figures.
    Same rules as the card, so the terminal and the card cannot disagree."""
    p = profile_of(r)
    lead = headline(r)
    facts = stats(r, lead)
    day = _day_of(r.get("started") or r.get("created_at"))
    out = [f"\n  {p['name']} · {title_of(r)}",
           "  " + " · ".join(x for x in [harness_name(r), day] if x)]
    figures = ([f"{lead['n']} {lead['unit']}"] if lead else []) + [f"{k} {v}" for k, v in facts]
    if figures:
        out.append("\n  " + " · ".join(figures))
    a = achievement(r)
    if a:
        out.append(f"  {a['label']} · {a['detail']}")
    # The stride line, to paste anywhere: the same two lines the card shows.
    out.append("")
    out.extend("  " + line for line in stride_text(r).split("\n"))
    return out


PAGE_CSS = """:root{--strive-orange:#fc4c02}
*{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}
body{background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;padding:0 16px 40px}
a{color:inherit;text-decoration:none}.num{font-variant-numeric:tabular-nums}
main{max-width:560px;margin:0 auto}
.brand{display:flex;align-items:center;min-height:48px;margin:8px 0;font-weight:600;letter-spacing:.08em;color:var(--blue)}
.fc{margin:0 0 16px}.fc h1.fc-title{font-size:24px}.fc-act{cursor:default}
.below{background:var(--box);border:1px solid var(--rule);padding:14px 16px;margin:0 0 16px;overflow-wrap:anywhere}
.below h2{font-size:13px;color:var(--soft);font-weight:500;margin:0 0 6px}
.below p,.below li{font-size:14px;margin:6px 0}.below ul,.below ol{margin:8px 0;padding-left:20px}
.below a{color:var(--blue)}.below .lead{font-size:16px;font-weight:600;line-height:1.35}
.note{color:var(--soft);font-size:13px;margin:0 0 6px}
.photo{display:block;margin:0 0 8px;border:1px solid var(--rule)}.photo img{display:block;width:100%;height:auto}"""


def page(row: dict, *, title: str, below: str = "", notes: list | None = None, meta_extra: str = "",
         brand: str = "STRIVE", above: str = "") -> str:
    """One whole local page: the card, then whatever the run says beyond the card, then notes."""
    note_html = "".join(f'<p class="note">{esc(n)}</p>' for n in (notes or []) if n)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>{esc(title)}</title>
<style>
{TOKENS_CSS}
{CARD_CSS}
{PAGE_CSS}
</style></head>
<body><main>
<div class="brand">{esc(brand)}</div>
{above}
{card(row, meta_extra=meta_extra)}
{below}
{note_html}
</main></body></html>"""
