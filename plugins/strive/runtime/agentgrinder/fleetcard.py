"""The night-run card. The map is the hero; the numbers are its caption.

Every printed sentence on this surface is a claim, so each one names what it counted and over
which population. Where a number cannot be traced it prints an em-dash, never a guess.
"""
from __future__ import annotations
from .brand import BRAND, CARD_THEME

from datetime import datetime

from .routemap import render_route_svg, render_phone_route_svg
from . import privacy


def _dur(s: int) -> str:
    h, r = divmod(int(s), 3600)
    m, _ = divmod(r, 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def _n(v):
    return "—" if v is None else f"{v:,}"


def render_fleet_card(run: dict, title: str | None = None) -> str:
    svg, m = render_route_svg(run)
    # the SAME map at 360 units; see routemap.Geo for the 12-clipped-labels
    # measurement that forced two layouts rather than one responsive drawing
    psvg, _pm = render_phone_route_svg(run)
    t0 = datetime.fromisoformat(run["started"])
    t1 = datetime.fromisoformat(run["ended"])
    a = run["authorship"]
    lanes = run["lanes"]
    dests = [r for r in m["order"] if r != "recon"]
    coded = [l for l in lanes if l["code"]]
    # m["rows"] is ONE ROW PER LANE (routemap.build_map), so this numerator and the len(lanes)
    # denominator it is printed over are the same population. Checked, not assumed.
    assert len(m["rows"]) == len(lanes), (len(m["rows"]), len(lanes))
    shipped = len([r for r in m["rows"] if r["shipped"]])
    # The honest paragraph is the one place a card can lie about itself, so its parts are checked
    # here before they are printed: five DISJOINT categories that must add up to the raw total
    # they are correcting. The version this replaced printed "tool results, injected context, and
    # the 1,357 lane briefs" as three things, when the third was 1,324 of the first -- it called
    # harness-written tool output human-authored briefs, inside the paragraph whose whole job is
    # to prove the card does not inflate a count. Categories that must sum cannot drift like that.
    cats = a["by_category"]
    naive = a["user_records_total"]
    assert sum(cats.values()) == naive, (cats, naive)
    assert cats["human"] == run["turns_typed"], (cats["human"], run["turns_typed"])
    not_human = naive - cats["human"]
    pct = 100 * run["turns_typed"] / naive if naive else 0
    untracked = run.get("repos_untracked") or []

    # THE ATTRIBUTION CAVEAT, ON THE CARD'S OWN SURFACE. A lane is drawn at ONE destination: the
    # repository most of its edits landed in. A lane that worked across two is therefore drawn at
    # the busier one and the other one is not on its row. That was in NIGHTRUN-2026-08-31.md's
    # UNVERIFIED list and nowhere a reader could see it, which is the exact shape of defect this
    # repo exists to catch: a true caveat that lives only in the builder's notes. It is now a
    # counted sentence — the card says how many of its own lanes it is approximating.
    _multi = [l for l in run["lanes"] if len(l.get("repos") or []) > 1]


    # one lane == one subagent transcript, which is the population the keystroke check ran over
    n_lane_files = len(lanes)
    # The headline is the HANDOFF, not the inventory. "24 agent lanes, 9 repositories" is a
    # true sentence nobody reads twice; the fact worth the top of the card is that a person
    # stopped typing at a named minute and the work kept going -- and it is the one fact here
    # that survived an adversarial re-run (0 typed and 0 queued turns after 23:48:41, across
    # every session in the window). Inventory drops to the sub-line, where it belongs.
    ho = run.get("handoff")
    if title is None and ho and ho["lanes_opened"]:
        _hm = int(round(ho["hours"] * 60))
        title = (f'Handed off {datetime.fromisoformat(ho["at"]).strftime("%H:%M")} · '
                 f'{_hm // 60}h {_hm % 60:02d}m with nobody at the keyboard')
    title = title or f"Night run · {len(lanes)} agent lanes, {len(dests)} repositories"
    multi_note = (f' · {len(_multi)} of {len(lanes)} lanes touched more than one repository and '
                  f'{"is" if len(_multi) == 1 else "are"} drawn at the busiest'
                  if _multi else "")

    handoff_line = ""
    if ho and ho["lanes_opened"]:
        hm = int(round(ho["hours"] * 60))
        # the title already says WHEN; this says what it cost and what it bought, and ends on
        # the measurement that makes the whole card falsifiable: nobody typed again.
        handoff_line = (
            f'<div class="handoff">After <b>{datetime.fromisoformat(ho["at"]).strftime("%H:%M")}</b>, in'
            f' <b>{hm // 60}h {hm % 60:02d}m</b>: <b>{ho["lanes_opened"]}</b> lanes opened across'
            f' <b>{len(m["waves"])}</b> fan-out waves, <b>{ho["tool_calls"]:,}</b> tool calls,'
            f' <b>{ho["commits"]}</b> commits landed — and <b>0</b> prompts typed or queued,'
            f' in any of the {len(run["sessions"])} sessions.</div>')

    per_prompt = run["tool_calls"] / run["turns_typed"] if run["turns_typed"] else None
    # where along the drawing the story starts, so a narrow viewport can open there
    focus_frac = (m["handoff_x"] / 1000.0) if m.get("handoff_x") else 0.0
    date_line = f'{t0.strftime("%a %d %b %Y")} · {t0.strftime("%H:%M")} → {t1.strftime("%H:%M")}'

    # tie every table row back to the drawing: a lane with no LANE header still belongs to a
    # numbered fan-out, and "·" told you nothing about which one.
    wave_of = {}
    for l in lanes:
        w = [wv for wv in m["waves"] if wv["iso"] <= l["started_iso"]]
        wave_of[id(l)] = f'w{w[-1]["i"]}' if w else ""

    # ONE thing per column: the wave column holds a wave, always. The lane's own code, when the
    # brief carried one, rides in front of its name where it reads as an identifier instead of
    # sitting under a heading that says Wave.
    lane_rows = "".join(
        f'''<tr><td class="c w">{wave_of[id(l)]}</td>
        <td class="l">{f'<b>{l["code"]}</b> ' if l["code"] and l["code"] != l["label"] else ""}{l["label"]}</td>
        <td class="m">{l["started_iso"][11:16]}</td><td class="m">{l["duration_s"]//60}m</td>
        <td class="m">{l["tools"]}</td><td class="m">{l["pace"]}</td>
        <td class="d">{l["repo"] or "—"}</td></tr>'''
        for l in lanes)

    ranked = sorted(run["repos"], key=lambda r: (-(r["count"] or 0), r["name"]))
    repo_chips = "".join(
        f'<span class="chip{"" if r["count"] else " quiet"}{" untracked" if r["count"] is None else ""}">'
        f'{r["name"]}<b>{"—" if r["count"] is None else r["count"]}</b></span>'
        for r in ranked)

    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — {BRAND}</title>
<style>
  {CARD_THEME}

  *{{box-sizing:border-box}}
  html,body{{max-width:100%;overflow-x:hidden}}
  body{{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.5 "IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    display:flex;justify-content:center;padding:26px 14px}}
  .card{{width:100%;min-width:0;max-width:1040px;background:var(--card);border:1px solid var(--line);
    border-radius:6px;overflow:hidden}}
  .scroller{{overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0;max-width:100%}}
  .mapwrap{{min-width:0;max-width:100%}}
  section,.honest,.foot,.top{{min-width:0}}
  .top{{display:flex;align-items:center;gap:12px;padding:20px 22px 14px}}
  .av{{width:40px;height:40px;border-radius:3px;background:var(--accent);color:#fff;
    display:grid;place-items:center;font-weight:800;font-size:17px}}
  .who b{{font-weight:700;letter-spacing:-.01em}}
  .who small{{color:var(--muted);display:block;font-size:12.5px;overflow-wrap:anywhere;
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  .handoff{{overflow-wrap:anywhere}}
  .brand{{margin-left:auto;font-weight:800;letter-spacing:.14em;color:var(--faint);font-size:11px}}
  h1{{margin:0;padding:0 22px 2px;font-size:21px;font-weight:700;letter-spacing:-.015em}}
  .sub{{padding:2px 22px 16px;color:var(--muted);font-size:13px;overflow-wrap:anywhere;
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  .stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);
    border-top:1px solid var(--line);border-bottom:1px solid var(--line)}}
  /* a grid item's default min-width is min-content, so one long mono source line under a stat
     pushed the whole card wider than a 390px screen and clipped the wordmark clean off. */
  .stat{{background:var(--card);padding:15px 18px;min-width:0;overflow-wrap:anywhere}}
  .stat .v{{font-size:25px;font-weight:700;letter-spacing:-.02em;
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  .stat .k{{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;margin-top:2px}}
  .stat .src{{font-size:10.5px;color:var(--faint);margin-top:5px;
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  .handoff{{margin:16px 22px 0;padding:12px 15px;border-left:3px solid var(--accent);
    background:var(--bg);font-size:13.5px;line-height:1.6;color:var(--muted)}}
  .handoff b{{color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;font-weight:700}}
  .maphead{{display:flex;align-items:baseline;gap:14px;padding:18px 22px 0}}
  .maphead h2{{margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted)}}
  .maphead .note{{font-size:11.5px;color:var(--faint);
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  .mapwrap{{padding:6px 22px 4px;overflow-x:auto}}
  svg.routemap{{display:block;width:100%;min-width:660px;height:auto}}
  svg.routemap.phone{{min-width:0}}
  .mapwrap.phonewrap{{display:none;overflow:visible}}
  .grid{{stroke:var(--grid);stroke-width:1}}
  .band{{fill:var(--bg);opacity:.62}}
  .wave{{stroke:var(--accent);stroke-width:1;opacity:.16}}
  .wl{{fill:var(--faint);font:9.5px "IBM Plex Sans",system-ui,sans-serif;letter-spacing:.02em}}
  .crail{{stroke:var(--line);stroke-width:1;opacity:.75}}
  .rtag{{fill:var(--ink);font:700 11.5px "IBM Plex Sans",system-ui,sans-serif}}
  .rnote{{fill:var(--faint);font-weight:400}}
  .lcode{{fill:var(--accent);font:700 10px "IBM Plex Sans",system-ui,sans-serif}}
  .gl{{fill:var(--faint);font:10px "IBM Plex Sans",system-ui,sans-serif}}
  .rlabel{{fill:var(--muted);font:11.5px "IBM Plex Sans",system-ui,sans-serif}}
  .rlabel.recon{{fill:var(--faint);font-style:italic}}
  .rlabel2{{fill:var(--muted);font:11px "IBM Plex Sans",system-ui,sans-serif}}
  .brk{{fill:none;stroke:var(--line);stroke-width:1.2}}
  .trunk{{stroke:var(--ink);stroke-width:1.6}}
  .trunk.gone{{stroke:var(--faint);stroke-width:1.2;stroke-dasharray:2 5}}
  .hline{{stroke:var(--accent);stroke-width:1.1;stroke-dasharray:3 4;opacity:.7}}
  .hlabel{{fill:var(--accent);font:700 11px "IBM Plex Sans",system-ui,sans-serif;
    letter-spacing:.04em}}
  .tick{{stroke:var(--ink);stroke-width:1.7;opacity:.8}}
  .tlabel{{fill:var(--ink);font:700 13px "IBM Plex Sans",system-ui,sans-serif}}
  .fork{{fill:none;stroke:var(--accent);stroke-width:1.1;opacity:.34}}
  .hfork{{fill:none;stroke:var(--ink);stroke-width:1;opacity:.22}}
  .seg.human{{stroke:var(--ink);opacity:.55}}
  .ltag.human{{fill:var(--faint)}}
  .seg{{stroke:var(--accent);stroke-linecap:round;opacity:.92}}
  .ltag{{fill:var(--muted);font:10px "IBM Plex Sans",system-ui,sans-serif}}
  .cap.ship{{fill:var(--accent)}}
  .cap.spur{{fill:var(--card);stroke:var(--accent);stroke-width:1.4;opacity:.8}}
  .profill{{fill:var(--accent);opacity:.13}}
  .profline{{fill:none;stroke:var(--accent);stroke-width:1.8;stroke-linejoin:round}}
  .base{{stroke:var(--line);stroke-width:1}}
  .plabel{{fill:var(--muted);font:11px "IBM Plex Sans",system-ui,sans-serif}}
  .pmax{{fill:var(--faint);font:10px "IBM Plex Sans",system-ui,sans-serif}}
  .rail{{stroke:var(--line);stroke-width:1}}
  .flag{{stroke:var(--ship);stroke-width:1.7;opacity:.85}}
  .legend{{display:flex;flex-wrap:wrap;gap:16px;padding:4px 22px 16px;font-size:11.5px;
    color:var(--muted);font-family:"IBM Plex Sans",system-ui,sans-serif}}
  .legend i{{display:inline-block;vertical-align:middle;margin-right:6px;font-style:normal}}
  .cav{{font-weight:400;color:var(--faint);text-transform:none;letter-spacing:0;font-size:11px;
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  .sw{{width:22px;height:0;border-top:3px solid var(--accent);display:inline-block;vertical-align:middle}}
  .sh{{width:22px;height:0;border-top:3px solid var(--ink);opacity:.55;display:inline-block;vertical-align:middle}}
  .sf{{width:2px;height:13px;background:var(--ship);display:inline-block;vertical-align:middle}}
  .sd{{width:8px;height:8px;border:1.5px solid var(--accent);border-radius:50%;display:inline-block;
    vertical-align:middle;background:var(--card)}}
  .st{{width:2px;height:13px;background:var(--ink);display:inline-block;vertical-align:middle}}
  .sv{{width:0;height:13px;border-left:1px solid var(--accent);opacity:.5;display:inline-block;
    vertical-align:middle}}
  section{{border-top:1px solid var(--line);padding:16px 22px}}
  section h3{{margin:0 0 10px;font-size:10.5px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted)}}
  .chips{{display:flex;flex-wrap:wrap;gap:7px}}
  .chip{{border:1px solid var(--line);border-radius:3px;padding:4px 9px;font-size:12px;
    font-family:"IBM Plex Sans",system-ui,sans-serif;color:var(--muted)}}
  .chip b{{color:var(--ink);margin-left:7px}}
  .chip.untracked b{{color:var(--faint)}}
  .chip.quiet{{opacity:.5}}
  table{{width:100%;border-collapse:collapse;font-size:12.5px;
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  td{{padding:5px 8px 5px 0;border-bottom:1px solid var(--line);white-space:nowrap}}
  td.l{{white-space:normal;color:var(--ink);font-family:"IBM Plex Sans",-apple-system,sans-serif;width:99%}}
  td.c{{width:38px}}
  td.c.w{{color:var(--faint);font-weight:400;
    font-family:"IBM Plex Sans",system-ui,sans-serif}}
  td.l b{{color:var(--accent);font-family:"IBM Plex Sans",system-ui,sans-serif;
    font-weight:700;margin-right:2px}}
  td.m{{color:var(--muted);text-align:right}}
  td.d{{color:var(--faint);padding-left:12px}}
  th{{padding:0 8px 6px 0;border-bottom:1px solid var(--line);font-size:10px;font-weight:600;
    text-transform:uppercase;letter-spacing:.09em;color:var(--faint);text-align:left;white-space:nowrap}}
  th.m{{text-align:right}} th.d{{padding-left:12px}}
  .honest{{background:var(--bg);border-top:1px solid var(--line);padding:15px 22px;
    font-size:12px;color:var(--muted);line-height:1.65}}
  .honest b{{color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;font-weight:700}}
  .honest .mono{{font-family:"IBM Plex Sans",system-ui,sans-serif}}
  ul.tally{{margin:8px 0 8px;padding-left:0;list-style:none}}
  ul.tally li{{padding:2px 0 2px 14px;border-left:2px solid var(--line);margin-bottom:3px}}
  .repro{{display:block;margin-top:9px;color:var(--faint);font-size:11px;
    font-family:"IBM Plex Sans",system-ui,sans-serif;word-break:break-all}}
  .foot{{display:flex;align-items:center;gap:8px;padding:13px 22px;border-top:1px solid var(--line);
    color:var(--muted);font-size:12.5px}}
  .foot .tag{{margin-left:auto;font-family:"IBM Plex Sans",system-ui,sans-serif;color:var(--faint)}}
  @media (max-width:760px){{
    .gl{{font-size:15px}} .rlabel{{font-size:16px}} .rlabel2{{font-size:15px}}
    .tlabel{{font-size:18px}} .ltag{{font-size:14px}} .plabel{{font-size:15px}}
    .pmax{{font-size:14px}} .hlabel{{font-size:16px}}
    #mapwrap{{display:none}}
    .mapwrap.phonewrap{{display:block}}
    /* the phone layout does not draw the wave rules -- two more text layers than 360 units
       holds -- so the legend stops explaining a mark that is not on this drawing. The waves
       are still counted in the caption above it and in the Lanes table's WAVE column. */
    .legend .wideonly{{display:none}}
    svg.routemap.phone .rtag{{font-size:10px}}
    svg.routemap.phone .ltag{{font-size:9.5px}}
    svg.routemap.phone .rnote{{font-size:9px}}
    svg.routemap.phone .tlabel{{font-size:11px}}
    svg.routemap.phone .hlabel{{font-size:9.5px}}
    svg.routemap.phone .gl{{font-size:9px}}
    svg.routemap.phone .plabel{{font-size:9.5px}}
    svg.routemap.phone .pmax{{font-size:9px}}
  }}
  @media (max-width:640px){{
    /* the header row overflowed the viewport: a nowrap mono date plus the wordmark measured
       ~392px inside a 390px screen, which clipped the wordmark off the card entirely */
    .av{{flex:0 0 auto;width:34px;height:34px;font-size:15px}}
    .who{{min-width:0}} .who small{{font-size:10.5px}}
    .brand{{flex:0 0 auto;font-size:9.5px;letter-spacing:.1em}}
    .top{{gap:9px}}
    .stats{{grid-template-columns:repeat(2,1fr)}}
    h1{{font-size:18px}} .stat .v{{font-size:21px}}
    body{{padding:12px 8px}} .top,.sub,h1,.mapwrap,.maphead,section,.honest,.foot{{padding-left:14px;padding-right:14px}}
  }}
</style></head>
<body>
  <div class="card">
    <div class="top">
      <div class="av">{(run["athlete"] or "?")[0].upper()}</div>
      <div class="who"><b>{run["athlete"]}</b><small>{date_line}</small></div>
      <div class="brand">{BRAND}</div>
    </div>
    <h1>{title}</h1>
    <div class="sub">{run["harness"]} · {len(run["sessions"])} sessions · {len(lanes)} agent lanes ·
      {len(dests)} of the {len(run["repos"])} repositories touched are on the route</div>

    <div class="stats">
      <div class="stat"><div class="v">{run["turns_typed"]}</div><div class="k">Human prompts</div>
        <div class="src">promptSource typed|queued</div></div>
      <div class="stat"><div class="v">{_dur(run["duration_s"])}</div><div class="k">Elapsed</div>
        <div class="src">{"start → now, run open" if run.get("run_open") else "first→last record"}</div></div>
      <div class="stat"><div class="v">{_n(run["tool_calls"])}</div><div class="k">Tool calls</div>
        <div class="src">{"%.0f per human prompt" % per_prompt if per_prompt else "assistant tool_use"}</div></div>
      <div class="stat"><div class="v">{_n(run["commits_verified"])}</div><div class="k">Commits</div>
        <div class="src">git log --all, window-bounded</div></div>
    </div>

    {handoff_line}
    <div class="maphead"><h2>The session route</h2>
      <span class="note">one row per destination · {len(m["waves"])} fan-out waves ·
        peak {m["cmax"]} lanes open at once, {m["peak_at"].strftime("%H:%M")}{multi_note}</span></div>
    <div class="mapwrap" id="mapwrap" data-focus="{focus_frac:.4f}">{svg}</div>
    <div class="mapwrap phonewrap">{psvg}</div>
    <div class="legend">
      <span><i class="st"></i>prompt a person typed</span>
      <span><i class="sh"></i>you at the keyboard</span>
      <span><i class="sw"></i>agent lane · thickness = tool calls/min</span>
      <span><i class="sd"></i>lane closed with no commit in its repo</span>
      <span><i class="sf"></i>commit, on the repo git logged it in — never on a lane</span>
      <span class="wideonly"><i class="sv"></i>fan-out wave · wN·k = k lanes opened at once</span>
    </div>

    <section><h3>Destinations · commits in window (git-verified)</h3>
      <div class="chips">{repo_chips}</div></section>

    <section><h3>Lanes <span class="cav">· Destination is the repository most of the lane\'s
      edits landed in, not the only one it opened</span></h3><div class="scroller"><table>
      <thead><tr><th class="c">Wave</th><th class="l">Lane</th><th class="m">Start</th><th class="m">Open</th>
        <th class="m">Tools</th><th class="m">/min</th><th class="d">Destination</th></tr></thead>
      <tbody>{lane_rows}</tbody></table></div></section>

    <div class="honest">
      <b>Authorship.</b> These transcripts hold <b>{naive:,}</b> records of
      <b>type:&#8203;user</b>. <b>{cats["human"]}</b> of them ({pct:.1f}%) were typed by a person —
      the gate is <span class="mono">promptSource</span> <b>typed</b> or <b>queued</b>, dropping
      injected and sidechain records, which is Transcripto's measured signal, not a rule invented
      here. The other <b>{not_human:,}</b> were sorted by what the record actually contains:
      <ul class="tally">
        <li><b>{cats["tool_result"]:,}</b> tool results — a tool's output returning to the agent
          that called it, written by the harness</li>
        <li><b>{cats["injected"]:,}</b> injected context — skill bodies, pasted-image notices</li>
        <li><b>{cats["orchestrator"]}</b> prompts the orchestrator wrote to its own subagents —
          the lane briefs and the steering sent mid-run. Asked without the sidechain rule, so the
          answer is measured rather than circular: <b>{a["keystrokes_in_lane_transcripts"]}</b>
          records in all {n_lane_files} lane transcripts carried a keystroke's
          <span class="mono">promptSource</span>.</li>
        <li><b>{cats["harness"]}</b> harness envelopes — slash-command expansions, task
          notifications, interrupts</li>
      </ul>
      Disjoint, and they add up — the only way you can check them:
      <b>{" + ".join(f"{cats[c]:,}" for c in ("human", "tool_result", "injected", "orchestrator", "harness"))}
      = {naive:,}</b>. A counter that trusted <b>type:&#8203;user</b> would have printed
      <b>{naive:,} prompts</b> where this card prints <b>{cats["human"]}</b>.
      <span class="repro">{a["command"]}</span>
      {"Commits exclude " + ", ".join(untracked) + " (no git work tree)." if untracked else ""}
    </div>

    <div class="foot"><span>Grind in public. Ship with proof.</span>
      <span class="tag">{shipped}/{len(lanes)} lanes had a commit land while open · {len(coded)} named lanes</span></div>
  </div>
<script>
  // A wide route on a narrow screen opens on its own left edge — which, on a night run, is the
  // quiet hours before the fleet starts. Open it on the handoff instead: the part worth seeing.
  (function () {{
    var w = document.getElementById("mapwrap");
    if (!w) return;
    var f = parseFloat(w.getAttribute("data-focus"));
    if (!(f > 0)) return;
    var over = w.scrollWidth - w.clientWidth;
    if (over > 8) w.scrollLeft = Math.max(0, f * w.scrollWidth - w.clientWidth * 0.42);
  }})();
</script>
</body></html>'''


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

_render_unchecked = render_fleet_card


def render_fleet_card(*a, **kw) -> str:
    html = _render_unchecked(*a, **kw)
    privacy.assert_clean(html, where="render_fleet_card")
    return html
