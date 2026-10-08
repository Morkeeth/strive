"""AGENTGRINDER CLI — turn a coding-agent session into a shareable run card.

Usage:
  python3 -m agentgrinder demo                 # render the bundled sample
  python3 -m agentgrinder card RUN.json [-o out.html]
"""
from __future__ import annotations
import argparse, json, sys, webbrowser
from pathlib import Path
from .metrics import build_activity


class _Browser:
    """The one door to a browser. A run with no terminal (an agent, a script, a scheduler) does
    not get a window popped in front of the person: it prints the card path and the hosted
    preview URL, and opens nothing unless it was asked to with --open."""
    allowed = False

    def open(self, url):
        return webbrowser.open(url) if self.allowed else False


_BROWSER = _Browser()


def _plain(text: str) -> str:
    """A card sentence for the terminal: its <b> marks removed."""
    import re as _re
    return _re.sub(r"</?b>", "", text)


def _browser_allowed(args) -> bool:
    # A browser opens only when the person asked for one with --open. An interactive terminal is
    # not consent: a surprise window is a request the person did not make. --no-open is kept as
    # an accepted no-op so older scripts and docs still run.
    return bool(getattr(args, "open", False)) and not getattr(args, "no_open", False)
from .render import render_card
from .ingest import parse_session, latest_session, parse_cursor_session, latest_cursor_session, best_recent_session, coach_lines
from .profile import build_profile
from .render import render_profile

SAMPLE = Path(__file__).resolve().parent / "data" / "sample_run.json"


# --coach ON A HARNESS THAT CANNOT FEED IT.
#
# The README says the tool "never degrades quietly". It did, in exactly one place: on a Cursor
# run, `grind --coach` was accepted, printed no coach block, no verdict and no warning, and exited
# 0. Measured 3 Sep 2026 in a 3.12 venv with the Strands SDK installed, so this was not a missing
# dependency — the coach simply had no inputs and said nothing about it.
#
# The coach's five tools need what a Cursor or Codex transcript does not carry: claim lines to
# check against their own turn, written file paths to test against the disk, and commits to ask
# git about. Nothing here invents any of them. The banner names the fields that harness cannot
# supply, read off the parsed run itself so the list cannot drift from the parser, and the command
# exits non-zero because the thing that was asked for did not happen.
COACH_NEEDS = ("files_touched", "commits", "claims", "claims_verified", "artifacts_produced")


def coach_degraded_banner(harness: str, run: dict) -> str:
    missing = [k for k in COACH_NEEDS if run.get(k) is None]
    bar = "!" * 72
    lines = [
        "", bar,
        f"!! DEGRADED: --coach was asked for and the coach cannot run on a {harness} transcript.",
        f"!! {harness} sessions do not carry: {', '.join(missing)}.",
        "!! The coach checks every claim against the evidence in its own turn, every written file",
        "!! against the disk, and every file against git. None of those three has an input here,",
        "!! and nothing was invented to fill them. Available activity is still shown on the card.",
        "!!",
        "!! The v1 card with the real prompt and tool counts was still written.",
        "!! For a coached run:  python3 -m agentgrinder grind --harness claude --coach",
        bar, "",
    ]
    return "\n".join(lines)


# Nothing found, and where we looked.
#
# The old auto message said "no Claude or Cursor session found on this machine" and named no
# path — while `_pick` right beside it already handled Codex. A stranger cannot check a claim
# that names no object, so the message lists every location, every time.
#
# AND IT HAS TO SAY WHAT TO DO NEXT. A harness-specific miss printed one line — "no Cursor
# session under ~/.cursor/projects/*/agent-transcripts" — and exited 1. The site promises four
# tools, so the person who hit that line was usually a Claude Code, Codex or Grok Bot user who
# had just copied the wrong command: the tool knew the answer and did not say it. Every miss now
# names the four tools this reader supports and shows how to point at one file.
def no_session_message(harness: str | None = None) -> str:
    from .ingest import HARNESSES, searched_paths
    named = HARNESSES.get(harness or "", "")
    head = (f"  no {named} session found on this machine. Searched:" if named
            else "  no agent session found on this machine. Searched:")
    lines = ["", head, ""]
    lines += [f"      {g}" for g in searched_paths()]
    lines += ["",
              "  This reader supports " + ", ".join(HARNESSES.values()) + ".",
              "  It only reads transcripts you already have. Next step:",
              "",
              "      python3 -m agentgrinder grind --harness auto",
              "          the freshest session of any of those four on this machine",
              "",
              "      python3 -m agentgrinder grind /path/to/session.jsonl --harness "
              + (harness or "claude"),
              "          one exact transcript, when it is somewhere else",
              "",
              "      python3 -m agentgrinder demo",
              "          the bundled sample, to see what a card looks like",
              ""]
    return "\n".join(lines)


# The coach hint, in one place, because it was wrong in four.
#
# Until 3 Sep 2026 every coach-missing message said `pip install -e ".[coach]"`. On the python the
# site and the README name — macOS `/usr/bin/python3`, 3.9.6 — that command cannot succeed twice
# over: the bundled pip is 21.2.4, which predates PEP 660 and refuses an editable install of a
# pyproject-only project, and `strands-agents` requires 3.10 or newer anyway. So the remedy the
# tool printed was the command that had just failed. The hint now names a venv on a 3.10+
# interpreter, and prints the version it is actually running under so the reason is on screen.
def coach_install_hint() -> str:
    v = f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}"
    return (
        f"\n  the coach needs the Strands SDK, which needs Python 3.10 or newer."
        f"\n  This is Python {v}. From the repo root, with a 3.10+ interpreter:"
        f"\n"
        f"\n      python3.12 -m venv .venv          # any python3.10+ on your machine"
        f'\n      .venv/bin/pip install -e ".[coach]"'
        f"\n      .venv/bin/agentgrinder grind --coach"
        f"\n"
    )


ATHLETE_HELP = ("name on the card. Default: the GitHub account this machine is already signed in "
                "as (the gh CLI login, or github.user in this repository), otherwise a neutral "
                "label. Write @handle to claim an account; a bare name is a display name only.")


def _stamp_identity(run: dict, explicit=None) -> dict:
    """Put the account this machine is signed in as on the run, or a neutral label.

    Local reads only (identity.py): no network, no application, no change to sign-in. The card
    said "you" over a "Y" avatar until 22 Sep 2026 because `--athlete` defaulted to the word.
    """
    from .identity import resolve
    who = resolve(explicit if explicit is not None else run.get("athlete"))
    run["athlete_handle"] = who.handle
    run["athlete"] = who.display
    return run


def _render(run: dict, out: Path, open_it: bool) -> None:
    a = build_activity(_stamp_identity(run))
    out.write_text(render_card(a), encoding="utf-8")
    # terminal summary (Oscar reads the terminal too): the card's own lines, in the card's order,
    # then the outcome and the ratio. A figure the run did not measure is left out, not dashed.
    from .feedcard import terminal_lines
    for line in terminal_lines(a.card_row):
        print(line)
    print(f"\n  {a.outcome} ({a.outcome_basis})")
    if a.headline not in ("", "—"):
        print(f"  {a.headline_label}: {a.headline}, {a.headline_formula}")
    print(f"\n  card -> {out}\n")
    if open_it:
        _BROWSER.open(out.resolve().as_uri())


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="agentgrinder")
    sub = p.add_subparsers(dest="cmd", required=True)
    from .connect import add_parser as add_connect_parser
    add_connect_parser(sub)
    from .practices import add_parser as add_practice_parser
    add_practice_parser(sub)
    from .agent_api import add_parser as add_agent_parser
    add_agent_parser(sub)
    from .capture import add_parser as add_capture_parser
    add_capture_parser(sub)
    from .hook import add_parser as add_hook_parser
    from .sync import add_parser as add_sync_parser
    add_hook_parser(sub)
    add_sync_parser(sub)
    from .rig_config import add_parser as add_rig_parser
    add_rig_parser(sub)
    from .route_capture import add_parser as add_route_parser
    add_route_parser(sub)
    rv = sub.add_parser("return-view",
                        help="after a later run: show practice, comparable change, unknowns, next practice")
    rv.add_argument("--practice", required=True, help="practice.json from practice accept")
    rv.add_argument("--before", required=True, help="earlier run JSON")
    rv.add_argument("--after", required=True, help="later run JSON")
    rv.add_argument("--review", default=None, help="optional practice review JSON")
    rv.add_argument("-o", "--out", default="return-view.html")
    rv.add_argument("--no-open", action="store_true"); rv.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    d = sub.add_parser("demo", help="render the bundled sample run")
    d.add_argument("--no-open", action="store_true"); d.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    c = sub.add_parser("card", help="render a run JSON to a card")
    c.add_argument("run"); c.add_argument("-o", "--out", default="card.html")
    c.add_argument("--no-open", action="store_true"); c.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    g = sub.add_parser(
        "grind",
        aliases=["run"],
        help="select one local agent session, render its card, and optionally open a private web preview",
    )
    g.add_argument(
        "session",
        nargs="?",
        help="explicit transcript/export .jsonl (Cursor requires a selected path; use --list first)",
    )
    g.add_argument("--pick", type=int, default=None,
                   help="which sitting in that transcript (-1 = the last, 1 = the first)")
    g.add_argument(
        "--list",
        action="store_true",
        help="list Cursor transcript candidates when no path is given, otherwise list that transcript's sittings; no render or upload",
    )
    g.add_argument("--list-limit", type=int, default=20,
                   help="Cursor discovery page size, 1 to 100 (default 20)")
    g.add_argument("--list-offset", type=int, default=0,
                   help="Cursor discovery offset (default 0); capture always uses an exact path")
    g.add_argument("--gap", type=int, default=30,
                   help="minutes of total idle that end a grind (default 30)")
    # The name on the card. Default None: identity.resolve reads the account this machine is
    # already signed in as, and prints a neutral label when there is none. It never prints "you".
    g.add_argument("--athlete", default=None, help=ATHLETE_HELP)
    g.add_argument("-o", "--out", default="grind.html")
    g.add_argument("--json", dest="as_json", action="store_true")
    # AUTO IS THE DEFAULT. It was `claude` until 3 Sep 2026, so a Cursor or Codex user running the
    # advertised one-liner got "no Claude Code session with a human turn" — a wall, with no hint
    # that either of the other two harnesses was supported at all. The site promises three.
    g.add_argument("--harness", choices=["claude", "cursor", "codex", "grokbot", "auto"], default="auto",
                   help="which agent's transcript (default auto = freshest Claude, Cursor, Codex or imported Grok Bot export)")
    g.add_argument("--no-rank", action="store_true",
                   help="skip the pass over your history (faster; drops the progression line)")
    g.add_argument("--show-paths", action="store_true",
                   help="OPT IN to printing paths outside this repo and the sentence you typed. "
                        "Off by default: see agentgrinder/privacy.py. Even on, a home path, a "
                        "synced-notes path or a memory filename is still refused.")
    g.add_argument("--no-open", action="store_true"); g.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    g.add_argument(
        "--push",
        action="store_true",
        help="open a private import preview; it is not saved until you choose an audience and Save run",
    )
    g.add_argument("--share-rig-names", action="store_true",
                   help="with --push, include MCP server names in your shared rig (opt-in)")
    g.add_argument(
        "--push-url",
        default=None,
        help="preview origin for --push (default: AGENTGRINDER_URL or https://striverun.app; "
             "a local UI is http://localhost:8000)",
    )
    g.add_argument("--no-series", action="store_true",
                   help="do not record this grind in the local per-project series (~/.agentgrinder/series.db)")
    g.add_argument("--photo", default=None, metavar="JPEG_OR_PNG",
                   help="put your own photo at the top of the LOCAL card. Location, camera and time "
                        "data are removed first. The photo is never in --json or --push.")
    g.add_argument("--coach", nargs="?", const="local", choices=["local", "bedrock", "none"], default=None,
                   help="run the grind coach on this sitting before drawing the card. Default mode "
                        "local: a real Strands agent loop over a scripted model, keyless, nothing "
                        "leaves the machine. bedrock: a real model on Amazon Bedrock (AWS creds, "
                        "costs money, sends claim lines off the machine). none: no agent.")
    co = sub.add_parser("coach", help="the grind coach: an agent that checks every claim and file, then writes the verdict")
    co.add_argument("session", nargs="?", help="path to a .jsonl transcript (default: your most recent grind)")
    co.add_argument("--pick", type=int, default=None, help="which sitting (-1 = the last, 1 = the first)")
    co.add_argument("--gap", type=int, default=30, help="minutes of total idle that end a grind (default 30)")
    co.add_argument("--model", choices=["local", "bedrock", "none"], default="local",
                    help="local (default, keyless, scripted model through the real Strands loop) · "
                         "bedrock (real model, AWS creds, costs money, opt-in) · none (no agent)")
    co.add_argument("--athlete", default=None, help=ATHLETE_HELP)
    co.add_argument("--json", dest="as_json", action="store_true",
                    help="print the run with the verdict attached, as JSON (counts only, no prompt text)")
    co.add_argument("--live-status", action="store_true",
                    help="print whether Amazon Bedrock live coaching is configured; never prints credentials")
    pd = sub.add_parser("predict", help="write down what your next grind on a project will do, before it happens")
    pd.add_argument("text", help="the prediction, in your words, e.g. 'ships 2 files, every claim verified'")
    pd.add_argument("--project", default=None, help="project name (default: the git repository of the current directory)")
    fl = sub.add_parser("flex", help="compare your real runs across agents on this machine")
    fl.add_argument("--json", dest="as_json", action="store_true")
    sh = sub.add_parser("share", help="fun share card — claim-your-handle vibe, screenshot-ready")
    sh.add_argument("session", nargs="?", help="run JSON path (default: latest grind)")
    sh.add_argument("--claim", action="store_true", help="invite card — open handle slot")
    sh.add_argument("--profile", action="store_true", help="scrapbook card from local stats")
    sh.add_argument("--handle", default="you", help="GitHub handle on the card")
    sh.add_argument("--harness", choices=["claude", "cursor", "codex", "grokbot", "auto"], default="auto")
    sh.add_argument("-o", "--out", default="share.html")
    sh.add_argument("--no-open", action="store_true"); sh.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    sh.add_argument("--push-url", default=None, help="base URL printed on the claim stub")
    sh.add_argument("--vibe", action="store_true", help="stamp meme vibe on the card")
    sh.add_argument("--roast", action="store_true", help="add roast-shape lines to the card")
    vb = sub.add_parser("vibe", help="meme label for a grind — real numbers, no streaks")
    vb.add_argument("session", nargs="?", help="run JSON (default: latest grind)")
    vb.add_argument("--harness", choices=["claude", "cursor", "codex", "grokbot", "auto"], default="auto")
    vb.add_argument("--json", dest="as_json", action="store_true")
    rb = sub.add_parser("roast", help="roast your grind shape — receipts only, no streaks")
    rb.add_argument("session", nargs="?", help="run JSON (default: latest grind)")
    rb.add_argument("--json", dest="as_json", action="store_true")
    rg = sub.add_parser("rig", help="share your stack — MCPs, skills, harnesses")
    rg.add_argument("--handle", default="you")
    rg.add_argument("--share-names", action="store_true", help="print MCP server names on the card")
    rg.add_argument("--anon", action="store_true", help="ghost rig card — no handle")
    rg.add_argument("-o", "--out", default="rig.html")
    rg.add_argument("--no-open", action="store_true"); rg.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    hs = sub.add_parser("heist", help="rig heist card — someone ACKed your stack")
    hs.add_argument("victim", help="whose rig was ACKed (@handle)")
    hs.add_argument("--thief", default="friend", help="who ACKed")
    hs.add_argument("--harness", default="Claude Code")
    hs.add_argument("-o", "--out", default="heist.html")
    hs.add_argument("--no-open", action="store_true"); hs.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    hi = sub.add_parser("history", help="every grind on this machine, ranked (local only)")
    hi.add_argument("--top", type=int, default=15)
    lg = sub.add_parser("login", help="print the web app link to sign in with GitHub (--open opens it)")
    lg.add_argument("--url", default=None, help="web app base URL")
    lg.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    a2 = sub.add_parser("a2a", help="Agent Activity protocol — export, feed, onboarding")
    a2sub = a2.add_subparsers(dest="a2cmd", required=True)
    a2sub.add_parser("onboard", help="print A2A agent onboarding (for MCP agents)")
    ex = a2sub.add_parser("export", help="export latest grind as A2A JSON")
    ex.add_argument("--harness", choices=["claude", "cursor", "codex", "grokbot"], default="claude")
    ex.add_argument("--handle", default="you")
    fd = a2sub.add_parser("feed", help="fetch public grinds (network)")
    fd.add_argument("--handle", default=None, help="athlete GitHub handle")
    fd.add_argument("--limit", type=int, default=10)
    ak = a2sub.add_parser("ack", help="open web to ACK a grind (human confirms)")
    ak.add_argument("run_id")
    ak.add_argument("--reason", default="shipped",
                    choices=["shipped", "focus", "pace", "rig", "comeback", "handoff"])
    ak.add_argument("--url", default=None, help="web app base URL")
    ak.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    akls = a2sub.add_parser("acks", help="list ACKs on a grind (network)")
    akls.add_argument("run_id")
    r = sub.add_parser("v1card", help="the v1 sparkline card (kept for the bundled sample)")
    r.add_argument("session", nargs="?")
    r.add_argument("--harness", choices=["claude", "cursor", "codex", "grokbot"], default="claude")
    r.add_argument("--athlete", default=None, help=ATHLETE_HELP)
    r.add_argument("-o", "--out", default="card.html")
    r.add_argument("--no-open", action="store_true"); r.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    nr = sub.add_parser("nightrun", help="aggregate a multi-agent fleet run (orchestrator + lanes) into one card")
    nr.add_argument("--since", help="ISO start of the window (default: --hours ago)")
    nr.add_argument("--hours", type=float, default=12.0)
    nr.add_argument("--gap", type=int, default=30,
                    help="minutes of total idle (no human turn, no open lane) that end the run")
    nr.add_argument("--athlete", default=None, help=ATHLETE_HELP)
    nr.add_argument("--title", help="card title (default: derived from the lane + repo counts)")
    nr.add_argument("-o", "--out", default="nightrun.html")
    nr.add_argument("--json", dest="as_json", action="store_true")
    nr.add_argument("--public", action="store_true",
                    help="redact repo and lane names for a card you can show a stranger "
                         "(shape and every number unchanged)")
    nr.add_argument("--no-open", action="store_true"); nr.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    au = sub.add_parser("authorship",
                        help="who wrote every type:user record in a window (the card's honest paragraph, as a table)")
    au.add_argument("--since", help="ISO start of the window (default: --hours ago)")
    au.add_argument("--hours", type=float, default=12.0)
    au.add_argument("--gap", type=int, default=30)
    pc = sub.add_parser("privacycheck",
                        help="fail if a rendered card prints a home path, a vault/.claude path, "
                             "an email, or a memory filename (the control; see agentgrinder/privacy.py)")
    pc.add_argument("paths", nargs="+", help="rendered .html cards (or any text file) to scan")
    pr = sub.add_parser("profile", help="build a builder profile + run feed from a GitHub user + local runs")
    pr.add_argument("username"); pr.add_argument("--runs", default="samples")
    pr.add_argument("-o", "--out", default="profile.html"); pr.add_argument("--no-open", action="store_true"); pr.add_argument("--open", action="store_true", help="open the result in a browser (default: print the path or link, open nothing)")
    args = p.parse_args(argv)
    _BROWSER.allowed = _browser_allowed(args)

    if args.cmd == "code-route":
        from .route_capture import run_cli
        return run_cli(args)

    if args.cmd == "connect":
        from .connect import run_cli
        return run_cli(args)

    if args.cmd == "rig-config":
        from .rig_config import run_cli
        return run_cli(args)
    if args.cmd == "capture":
        from .capture import run_cli
        return run_cli(args)
    if args.cmd == "sync":
        from .sync import run_cli
        return run_cli(args)
    if args.cmd == "hook":
        from .hook import run_cli
        return run_cli(args)
    if args.cmd == "practice":
        from .practices import run_cli
        return run_cli(args)
    if args.cmd == "return-view":
        from .return_view import write_return_view
        model = write_return_view(args.practice, args.before, args.after, args.out, args.review)
        print(f"  return view -> {args.out}")
        print(f"  practice: {model['practice'].get('title','')[:80]}")
        print(f"  comparable: {model['metric']['comparable']} "
              f"({model['metric']['before_id']} → {model['metric']['after_id']})")
        if not args.no_open:
            _BROWSER.open(Path(args.out).resolve().as_uri())
        return 0
    if args.cmd == "agent":
        from .agent_api import run_cli
        return run_cli(args)

    if args.cmd == "privacycheck":
        from .privacy import check_files
        return 1 if check_files(args.paths) else 0
    if args.cmd == "flex":
        from .flex import format_flex, local_flex
        rows = local_flex()
        if args.as_json:
            print(json.dumps(rows, indent=2))
        else:
            print(format_flex(rows))
        return 0
    if args.cmd == "share":
        from .sharecard import from_run_dict, render_share_card
        from .push import DEFAULT_URL
        base = args.push_url or DEFAULT_URL
        if args.claim:
            html = render_share_card(handle=args.handle, mode="claim", base_url=base)
        elif args.profile:
            from .flex import local_flex
            rows = local_flex()
            prompts = sum(r["prompts"] for r in rows)
            mins = sum(r["moving_s"] for r in rows)
            harness = " · ".join(r["harness"] for r in rows) or None
            html = render_share_card(
                handle=args.handle,
                mode="profile",
                runs=sum(r["grinds"] for r in rows),
                prompts=prompts,
                hours=round(mins / 60, 1),
                commits=None,
                harness=harness,
                headline="Local grinds — push one to make it public.",
                base_url=base,
            )
        elif args.session:
            run = json.loads(Path(args.session).read_text())
            html = from_run_dict(run, handle=args.handle, base_url=base, vibe=args.vibe, roast=args.roast)
        else:
            run = _load_latest_run()
            if not run:
                print("no session found. Try: agentgrinder share --claim"); return 1
            html = from_run_dict(run, handle=args.handle, base_url=base, vibe=args.vibe, roast=args.roast)
        out = Path(args.out)
        out.write_text(html, encoding="utf-8")
        print(f"\n  share card -> {out}")
        print("  screenshot it · the stub says claim your handle\n")
        if not args.no_open:
            _BROWSER.open(out.resolve().as_uri())
        return 0
    if args.cmd == "vibe":
        from .meme import format_vibe, vibe_or_default
        run = _load_latest_run(getattr(args, "session", None))
        if not run:
            print(no_session_message()); return 1
        label, line = vibe_or_default(run)
        if args.as_json:
            print(json.dumps({"vibe": label, "line": line}, indent=2))
        else:
            print(format_vibe(run))
        return 0
    if args.cmd == "roast":
        from .meme import format_roast, roast_shape
        run = _load_latest_run(getattr(args, "session", None))
        if run is None:
            print(no_session_message()); return 1
        if args.as_json:
            print(json.dumps({"roast": roast_shape(run)}, indent=2))
        else:
            print(format_roast(run))
        return 0
    if args.cmd == "rig":
        from .flex import local_flex
        from .rigcard import render_rig_card, rig_from_local
        rig = rig_from_local()
        harnesses = [r["harness"] for r in local_flex()]
        html = render_rig_card(
            handle=args.handle,
            harnesses=harnesses,
            rig=rig,
            share_names=args.share_names,
            anonymous=args.anon,
        )
        out = Path(args.out)
        out.write_text(html, encoding="utf-8")
        print(f"\n  rig card -> {out}")
        if args.share_names and rig.get("mcp_names"):
            print(f"  MCP names on card: {', '.join(rig['mcp_names'][:8])}")
        print("  screenshot it · friends steal your stack\n")
        if not args.no_open:
            _BROWSER.open(out.resolve().as_uri())
        return 0
    if args.cmd == "heist":
        from .ingest import detect_rig
        from .rigcard import render_heist_card
        rig = detect_rig()
        html = render_heist_card(
            victim_handle=args.victim.lstrip("@"),
            thief_handle=args.thief.lstrip("@"),
            rig=rig,
            harness=args.harness,
        )
        out = Path(args.out)
        out.write_text(html, encoding="utf-8")
        print(f"\n  rig heist card -> {out}\n")
        if not args.no_open:
            _BROWSER.open(out.resolve().as_uri())
        return 0
    if args.cmd == "login":
        from .push import DEFAULT_URL
        base = args.url or DEFAULT_URL
        print(f"  sign in -> {base.rstrip('/')}/?onboard")
        if _BROWSER.open(f"{base.rstrip('/')}/?onboard"):
            print(f"\n  opened {base.rstrip('/')}/?onboard: sign in with GitHub\n")
        else:
            print(f"\n  open that link in a browser and sign in with GitHub (or rerun with --open)\n")
        return 0
    if args.cmd == "a2a":
        from .a2a import export_grind, onboarding_text
        from .ingest import detect_rig, latest_cursor_session, latest_session, parse_cursor_session, parse_session
        if args.a2cmd == "onboard":
            print(onboarding_text())
            return 0
        if args.a2cmd == "feed":
            from .a2a_client import athlete_feed, format_feed, public_feed
            if args.handle:
                rows = athlete_feed(args.handle, args.limit)
                if not rows:
                    print(f"No public grinds for @{args.handle}.")
                    return 0
                lines = [f"# @{args.handle} — public grinds\n"]
                for r in rows:
                    mins = round((r.get("duration_s") or 0) / 60)
                    lines.append(
                        f"- {r.get('title') or r.get('project')} · {r.get('prompts')} prompts · "
                        f"{mins}m · id={r.get('id')}"
                    )
                print("\n".join(lines))
            else:
                print(format_feed(public_feed(args.limit)))
            return 0
        if args.a2cmd == "export":
            from .ingest import latest_codex_session, latest_grokbot_session
            from .native_sittings import read_sitting
            p = {'claude': latest_session, 'cursor': latest_cursor_session,
                 'codex': latest_codex_session,
                 'grokbot': latest_grokbot_session}[args.harness]()
            if not p:
                print(f"No {args.harness} session"); return 1
            try:
                run = read_sitting(p, args.harness)
            except ValueError as error:
                print(str(error)); return 1
            run["rig"] = detect_rig()
            print(json.dumps(export_grind(run, athlete_handle=args.handle, session_path=p), indent=2))
            return 0
        if args.a2cmd == "acks":
            from .a2a_client import format_acks, list_acks
            print(format_acks(list_acks(args.run_id)))
            return 0
        if args.a2cmd == "ack":
            from .ack import ack_url
            from .push import DEFAULT_URL
            url = ack_url(args.run_id, args.reason, args.url or DEFAULT_URL)
            print(f"\n  ACK -> {url}\n  open, sign in, confirm reason: {args.reason}\n")
            _BROWSER.open(url)
            return 0
    if args.cmd in ("grind", "run"):
        return _grind(args)
    if args.cmd == "coach":
        return _coach(args)
    if args.cmd == "predict":
        from . import gitwork
        from .engine import log as series_log
        import os as _os
        project = args.project
        if not project:
            repo = gitwork.repo_of(_os.getcwd())
            project = repo[0] if repo else _os.path.basename(_os.getcwd())
        conn = series_log.connect()
        from .project_identity import identity
        row = series_log.predict(conn, project, args.text, identity(_os.getcwd()) if not args.project else None)
        conn.close()
        print(f"\n  predicted for {project}: {row['text']}"
              f"\n  the next grind on {project} shows it beside its verdict\n")
        return 0
    if args.cmd == "history":
        from .history import load, MEASURES
        h = load()
        print(f"\n  {len(h):,} grinds on this machine "
              f"(every sitting in ~/.claude/projects with a human turn, 30-minute idle rule)\n")
        if not h:
            # Five empty section headings under an honest "0 grinds" reads like a broken command.
            print("  Nothing to rank yet. Run a session, then:  python3 -m agentgrinder grind\n")
            return 0
        for key, label in MEASURES:
            col = {"stretch": "stretch_s", "moving": "moving_s", "tools": "tools",
                   "edits": "edits", "prompts": "typed"}[key]
            top = sorted(h, key=lambda z: -z[col])[:args.top]
            print(f"  by {label}:")
            for i, g_ in enumerate(top[:5], 1):
                v = g_[col]
                shown = f"{v // 60}m" if col.endswith("_s") else str(v)
                print(f"    #{i:<2} {g_['at'][:16].replace('T', ' ')}  {shown:>7}  "
                      f"({g_['typed']} prompts, {g_['tools']} tool calls)")
            print()
        return 0
    if args.cmd == "v1card":
        # the pre-trace sparkline card. Kept because `demo`/`card` render the bundled sample,
        # which has no per-event data, and because the Cursor path still lands here.
        if args.harness in ("cursor", "grokbot"):
            from .ingest import latest_grokbot_session, parse_grokbot_session
            path = args.session or (
                latest_cursor_session() if args.harness == "cursor" else latest_grokbot_session()
            )
            if not path:
                print(f"no {args.harness} session found"); return 1
            parser = parse_cursor_session if args.harness == "cursor" else parse_grokbot_session
            run = parser(path, athlete=args.athlete)
        else:
            path = args.session or best_recent_session() or latest_session()
            if not path:
                print("no Claude Code session found under ~/.claude/projects"); return 1
            run = parse_session(path, athlete=args.athlete)
        _render(run, Path(args.out), not args.no_open)
        return 0
    if args.cmd == "demo":
        run = json.loads(SAMPLE.read_text())
        _render(run, Path("card.html"), not args.no_open)
    elif args.cmd == "card":
        run = json.loads(Path(args.run).read_text())
        _render(run, Path(args.out), not args.no_open)
    elif args.cmd == "profile":
        prof = build_profile(args.username, args.runs)
        out = Path(args.out); out.write_text(render_profile(prof), encoding="utf-8")
        g=prof["gh"]; t=prof["totals"]
        print(f"\n  {g.get('name')} (@{g.get('login')}) — {t['runs']} runs, "
              f"{t['verified_per_turn']} verified per turn, {t['prompts']} prompts (cost), "
              f"{g.get('public_repos')} repos")
        print(f"  profile -> {out}\n")
        if not args.no_open:
            _BROWSER.open(out.resolve().as_uri())   # module-level import (line 8); a LOCAL
            # `import webbrowser` here made the name local to all of main(), so `nightrun` at
            # line ~191 died with UnboundLocalError on every run that was not --no-open.
    elif args.cmd == "authorship":
        # The card's honest paragraph, printed as its own command so the claim is checkable
        # without opening the HTML. Same window resolution, same classifier, same numbers.
        from .authorship import CATEGORIES, LABELS
        from .fleet import collect, parse_window
        since, until = parse_window(args.since, args.hours)
        # burst=False, and it is the whole point of this command. `collect` defaults to narrowing
        # the window to the last contiguous burst, which is right for a night-run card and wrong
        # for a statement about a machine. With the default, a 336 hour window on a machine with
        # 1,534 transcripts reported one session and 62 records while printing a span, because the
        # span it printed was the burst's and not the caller's.
        run = collect(since, until, burst_gap=args.gap, burst=False)
        a = run["authorship"]
        tot = a["user_records_total"]
        print(f"\n  type:user records in the window you asked for, "
              f"{since.strftime('%Y-%m-%dT%H:%M:%S')} -> {until.strftime('%Y-%m-%dT%H:%M:%S')}")
        print(f"  earliest and latest record actually found: {run['started'][:19]} -> {run['ended'][:19]}"
              f"   ({len(run['lanes'])} lane transcripts + {len(run['sessions'])} sessions)")
        print(f"  gate: {a['gate']}\n")
        if tot == 0:
            # A CHECK THAT SAYS OK ABOUT NOTHING. Until 4 Sep 2026 an empty machine got the full
            # table of zeros and then "parts sum to the total: 0 + 0 + 0 + 0 + 0 = 0  OK". The sum
            # is real and the OK is meaningless: an identity over an empty population passes
            # whatever the classifier does, so a reader is shown a green check that cannot go red.
            # This tool's whole subject is a number that is correct about the wrong object, and it
            # was printing one. Found by running the CLI with an empty HOME, which is the only way
            # anyone was ever going to see it.
            print("  no type:user records in this window, so there is nothing to check."
                  "\n  The category table and its sum are printed only when there is a population"
                  "\n  to sum: an identity over zero passes whatever the classifier does, so"
                  "\n  a pass printed here would be a check that cannot go red.\n")
            return 0
        w = max(len(c) for c in CATEGORIES)
        for c in CATEGORIES:
            n = a["by_category"][c]
            print(f"  {n:>7,}  {100*n/tot if tot else 0:>5.1f}%  {c:<{w}}  {LABELS[c]}")
        print(f"  {'-'*7}")
        print(f"  {tot:>7,}  100.0%  total     every type:user record in the window")
        assert sum(a["by_category"].values()) == tot
        print(f"\n  parts sum to the total: {' + '.join(str(a['by_category'][c]) for c in CATEGORIES)}"
              f" = {tot:,}  OK")
        print(f"  keystroke check, sidechain rule OFF: {a['keystrokes_in_lane_transcripts']} of the"
              f" records in {len(run['lanes'])} lane transcripts carried promptSource typed|queued\n")
        return 0
    elif args.cmd == "nightrun":
        from .fleet import collect, parse_window
        from .fleetcard import render_fleet_card
        since, until = parse_window(args.since, args.hours)
        run = collect(since, until, athlete=args.athlete, burst_gap=args.gap)
        if args.public:
            from .fleet import redact
            run = redact(run)
        if not run["lanes"] and not run["turns_typed"]:
            print(f"\n  no agent activity between {since:%Y-%m-%d %H:%M} and {until:%H:%M}."
                  f"\n  Widen it with --hours or --since, or try   python3 -m agentgrinder demo\n")
            return 1
        if args.as_json:
            print(json.dumps(run, indent=2)); return 0
        out = Path(args.out)
        out.write_text(render_fleet_card(run, title=args.title), encoding="utf-8")
        # the population the next line names: repositories a LANE landed in, not every repo touched
        dests = {l["repo"] for l in run["lanes"] if l["repo"]}
        print(f"\n  {run['athlete']} · night run · {since:%a %d %b %H:%M} -> {until:%H:%M}")
        _a = run["authorship"]
        print(f"  {run['turns_typed']:>5} human prompts   (promptSource typed|queued, of "
              f"{_a['user_records_total']:,} type:user records; {_a['by_category']['tool_result']:,} "
              f"of those are tool results)")
        print(f"  {len(run['lanes']):>5} agent lanes     landing in {len(dests)} repos "
              f"(of {len(run['repos'])} touched)")
        print(f"  {run['tool_calls']:>5} tool calls")
        print(f"  {run['commits_verified']:>5} commits         (git log --since, window-bounded)")
        if run.get("redacted"):
            print("   redacted: repo and lane names replaced; counts and shape unchanged")
        print(f"\n  card -> {out}")
        print("  nothing was uploaded or posted; sharing it is your click\n")
        if not args.no_open:
            _BROWSER.open(out.resolve().as_uri())
    return 0


def _load_latest_run(session: str | None = None) -> dict | None:
    """Latest grind dict from JSON path or local transcripts."""
    if session:
        try:
            return json.loads(Path(session).read_text())
        except (OSError, ValueError, json.JSONDecodeError):
            return None
    from .flex import latest_any
    from .solo import parse_solo, latest_grind
    from .ingest import parse_cursor_session, parse_codex_session, parse_grokbot_session, parse_session
    picked = latest_any()
    if not picked:
        return None
    harness, path = picked
    if harness in ("cursor", "codex", "grokbot"):
        from .native_sittings import read_sitting
        return read_sitting(path, harness)
    found = latest_grind()
    if found:
        path, pick = found
        return parse_solo(path, pick=pick)
    return parse_session(path)


def _grind(args) -> int:
    """`agentgrinder grind` — one ordinary session, the wide door.

    `grind` and `run` are compatible names for the same local reader.
    """
    from .solo import parse_solo, latest_grind, human_sittings
    from .solocard import render_solo_card
    explicit_source = bool(args.session)

    if args.harness == "cursor" and not explicit_source and args.list:
        return _list_cursor_sources(args.list_limit, args.list_offset, args.show_paths)

    if args.session and not Path(args.session).exists():
        print(f"no such transcript: {args.session}"); return 1

    harness = args.harness
    if harness == "auto" and args.session:
        from .native_sittings import records
        first = next(records(args.session), {})
        harness = 'codex' if first.get('type') in ('session_meta','event_msg','response_item') else 'cursor' if first.get('role') in ('user','assistant') else 'claude'

    if harness == "auto" and not args.session:
        from .flex import latest_any
        picked = latest_any()
        if not picked:
            print(no_session_message()); return 1
        harness, auto_path = picked
        print(f"  auto -> {harness} ({Path(auto_path).name})",file=sys.stderr)
        # For Claude, leave args.session unset: latest_grind() below picks the SITTING inside the
        # transcript, and pinning the path here would silently switch every Claude user's default
        # card to the last sitting (pick=-1) instead of the one that rule chooses.
        if harness != "claude":
            args.session = auto_path

    if harness == "cursor":
        from .ingest import parse_cursor_session, latest_cursor_session
        if not explicit_source:
            if args.list:
                return _list_cursor_sources(args.list_limit, args.list_offset, args.show_paths)
            if not latest_cursor_session():
                print(no_session_message("cursor")); return 1
            print("Select your Cursor transcript explicitly. Run grind --harness cursor --list --show-paths, "
                  "then grind /exact/selected-session.jsonl --harness cursor --list to choose its sitting.", file=sys.stderr)
            return 1
        path = args.session
        if not path:
            print(no_session_message("cursor")); return 1
        from .contract import capture_digest
        source_digest=capture_digest(path)
        try:
            from .native_sittings import sittings, choose
            groups=sittings(path,'cursor',args.gap*60)
            if args.list:
                return _list_native_selection(
                    path, "cursor", groups, parse_cursor_session, args.show_paths
                )
            selected = len(groups) if args.pick in (None, -1) else args.pick
            run = parse_cursor_session(path, athlete=args.athlete, records=choose(groups,args.pick))
        except ValueError as e:
            print(str(e),file=sys.stderr);return 1
        return _native_grind(run, args, path, source_digest, selected, len(groups))

    if harness == "codex":
        from .ingest import parse_codex_session, latest_codex_session
        from .metrics import build_activity
        from .render import render_card
        path = args.session or latest_codex_session()
        if not path:
            print(no_session_message("codex")); return 1
        from .contract import capture_digest
        source_digest=capture_digest(path)
        try:
            from .native_sittings import sittings, choose
            groups=sittings(path,'codex',args.gap*60)
            if args.list:
                return _list_native_selection(
                    path, "codex", groups, parse_codex_session, args.show_paths
                )
            selected = len(groups) if args.pick in (None, -1) else args.pick
            run = parse_codex_session(path, athlete=args.athlete, records=choose(groups,args.pick))
        except ValueError as e:
            # A named --session with no typed turn used to reach the user as a raw traceback.
            print(f"\n  {e}"
                  "\n  A rollout with no human turn has no cost to divide by, so there is no"
                  "\n  card to draw. Run without --session to take the newest one you typed in.\n")
            return 1
        return _native_grind(run, args, path, source_digest, selected, len(groups))

    if harness == "grokbot":
        from .ingest import latest_grokbot_session, parse_grokbot_session
        path = args.session or latest_grokbot_session()
        if not path:
            print(no_session_message("grokbot")); return 1
        from .contract import capture_digest
        source_digest = capture_digest(path)
        try:
            from .native_sittings import sittings, choose
            groups = sittings(path, "grokbot", args.gap * 60)
            if args.list:
                return _list_native_selection(
                    path, "grokbot", groups, parse_grokbot_session, args.show_paths
                )
            selected = len(groups) if args.pick in (None, -1) else args.pick
            run = parse_grokbot_session(
                path,
                athlete=args.athlete,
                records=choose(groups, args.pick),
            )
        except ValueError as error:
            print(str(error), file=sys.stderr)
            return 1
        return _native_grind(run, args, path, source_digest, selected, len(groups))

    pick = args.pick
    if args.session:
        path = args.session
        if pick is None:
            pick = -1
    else:
        found = latest_grind()
        if not found:
            # A JUDGE WITH NO CLAUDE CODE HITS THIS FIRST. Until 31 Aug it was a dead end: one
            # sentence naming a directory, exit 1, no next step. Measured by running the whole
            # CLI with HOME pointed at an empty directory.
            print(no_session_message("claude")); return 1
        path, auto = found
        pick = auto if pick is None else pick

    if args.list:
        sits = human_sittings(path, gap=args.gap * 60)
        print(f"\n  {len(sits)} sitting{'' if len(sits) == 1 else 's'} you sat through in "
              f"{Path(path).name}   (gap {args.gap}m)\n")
        for i, s in enumerate(sits, 1):
            print(f"   --pick {i:<3} {s['start']:%a %d %b %H:%M} -> {s['end']:%H:%M}  "
                  f"{s['typed']:>3} prompts  {s['minutes']:>6.0f}m  {s['events']:>5} records")
        if not sits:
            # An unattended SDK run or a subagent transcript has no typed turns, so it has no
            # sitting. It is still a run: `agent capture` measures it without a human turn.
            print("  No typed turns: this looks like an unattended or subagent run. Measure it with\n"
                  f"      agentgrinder agent capture /path/to/{Path(path).name} > run.json")
        print()
        return 0

    from .contract import capture_digest
    source_digest = capture_digest(path)
    try:
        run = parse_solo(path, athlete=args.athlete, pick=pick, gap=args.gap * 60,
                         show_paths=getattr(args, "show_paths", False))
    except ValueError as e:
        print(f"  {e}"); return 1
    _stamp_identity(run, args.athlete)
    coach_text = None
    if getattr(args, "coach", None):
        coach_text = _run_coach_into(run, path, pick, args.gap * 60, args.coach, args.athlete)
    # the series: this grind recorded locally against your previous grind on the same project
    # (~/.agentgrinder/series.db, counts only). Baseline under two; helped/hurt after.
    if not getattr(args, "no_series", False):
        from .engine.series import record_and_attach
        from .contract import capture_digest
        if source_digest != capture_digest(path):
            print("  The transcript changed during analysis. Run again to measure a stable session.")
            return 1
        run["input_digest"] = source_digest
        record_and_attach(run)
    if args.as_json:
        from .coach.experiment import public_run_view
        print(json.dumps(public_run_view(run), indent=2)); return 0

    ranks = None
    if not args.no_rank:
        from .history import load, rank
        ranks = rank(run, load())

    photo_src = None
    if getattr(args, "photo", None):
        from .photo import load_photo
        try:
            ph = load_photo(args.photo)
        except (OSError, ValueError) as e:
            print(f"  {e}"); return 1
        photo_src = ph.data_uri()
        print(f"  photo: removed {', '.join(ph.removed) if ph.removed else 'nothing (none found)'}; "
              f"it stays on this card only")

    out = Path(args.out)
    out.write_text(render_solo_card(run, ranks=ranks, photo_src=photo_src), encoding="utf-8")

    from .solocard import headline, card_row
    from .feedcard import terminal_lines
    h, _ = headline(run)
    a = run["authorship"]
    for line in terminal_lines(card_row(run)):
        print(line)
    print(f"  sitting {run['sitting']['index']} of {run['sitting']['of']}")
    print(f"\n  {_plain(h)}")
    from .metrics import headline_of
    hl = headline_of(run)
    if hl.text not in ("", "—"):
        print(f"  {hl.label}: {hl.text}, {hl.formula}")
    measured = [c for c in hl.five if c.value and "—" not in c.value]
    if measured:
        print("  " + " · ".join(f"{c.label} {c.value}" for c in measured))
    print(f"  {a['user_records_total']:,} type:user records, {run['turns_typed']} typed by you "
          f"(promptSource typed|queued)")
    print(f"  {run['files_touched']} files opened, {run['files_edited']} changed, "
          f"{len(run['deadends'])} not committed since")
    if ranks and ranks.get("enough"):
        from .history import best_rank
        br = best_rank(ranks)
        print(f"\n  #{br[0]} of {br[1]:,} grinds on this machine by {br[2]}")
    if run.get("progress_line"):
        print(f"\n  {run['progress_line']}")
        if (run.get("progress") or {}).get("prediction"):
            print(f"  you predicted: {run['progress']['prediction']}")
    if coach_text:
        print()
        print(coach_text)
    print(f"\n  card -> {out}")
    if getattr(args, "coach", None) is not None and coach_text is None:
        # --coach was asked for and did not happen. The card is written, because the counts on it
        # are real, but the exit code says the verdict is not there and the run is not pushed.
        # Same rule as the Cursor and Codex branches: a run the person asked to have coached,
        # published uncoached, is a quiet degrade. The reason was printed above by
        # _run_coach_into, and on a stock Mac it names the venv that fixes it.
        print("  --coach did not run, so this grind has no verdict and was not pushed.\n")
        return 1
    if args.push:
        from .push import import_url
        from .ingest import detect_rig
        if "rig" not in run:
            run["rig"] = detect_rig()
        if getattr(args, "share_rig_names", False) and run.get("rig"):
            run["rig"]["share_names"] = True
        url = import_url(run, args.push_url)
        print(f"  preview -> {url}")
        print("  sign in on the web page to publish. Metrics only, nothing uploaded yet.\n")
        _BROWSER.open(url)
    else:
        print("  nothing was uploaded or posted; sharing it is your click\n")
        if not args.no_open:
            _BROWSER.open(out.resolve().as_uri())
    return 0



def _list_cursor_sources(limit, offset, show_paths=False):
    """Discover files only: no transcript bodies, SQLite stores or inferred ownership."""
    import glob
    import os
    from datetime import datetime, timezone
    from .ingest import CURSOR_GLOB, project_label
    if not 1 <= limit <= 100 or offset < 0:
        print("Use --list-limit 1..100 and --list-offset 0 or greater.", file=sys.stderr)
        return 1
    candidates = []
    for raw in glob.glob(os.path.expanduser(CURSOR_GLOB)):
        path = Path(raw)
        if path.is_symlink():
            continue
        try:
            stat = path.stat()
        except OSError:
            continue  # A transcript may disappear while Cursor cleans up.
        if path.is_file():
            candidates.append((stat.st_mtime, str(path.resolve()), stat.st_size, path.parents[2].name))
    candidates.sort(key=lambda row: (-row[0], row[1]))
    rows = [{
        "harness": "cursor",
        "project": project_label(project) or None,
        "source": source if show_paths else Path(source).name,
        "source_path_hidden": not show_paths,
        "modified": datetime.fromtimestamp(mtime, timezone.utc).isoformat(),
        "bytes": size,
    } for mtime, source, size, project in candidates[offset:offset + limit]]
    print(json.dumps({
        "basis": "Filesystem metadata only. Modified time is not session start or active workspace. Source content has not been validated.",
        "candidates": rows, "total": len(candidates), "offset": offset,
        "limit": limit, "next_offset": offset + limit if offset + limit < len(candidates) else None,
        "next": "Confirm your project and exact transcript path; rerun that path with --harness cursor --list "
                "to choose a sitting. Use --show-paths to reveal local paths. Modified time is not session ownership.",
    }, indent=2))
    return 0


def _list_native_selection(path, harness, groups, parser, show_paths=False):
    """Print enough local provenance to deliberately choose a sitting."""
    project = parser(path, records=groups[-1]).get("project") if groups else None
    selection = {
        "harness": harness,
        "project": project,
        "source": str(Path(path).resolve()) if show_paths else Path(path).name,
        "source_path_hidden": not show_paths,
    }
    rows = []
    for index, group in enumerate(groups, 1):
        run = parser(path, records=group)
        rows.append({
            "selected_session": selection,
            "sitting": index,
            "started": run.get("started"),
            "typed_turns": run.get("turns_typed"),
            "tool_calls": run.get("tool_calls"),
            "next": "rerun with --pick N after confirming the project and sitting",
        })
    print(json.dumps(rows, indent=2))
    return 0


def _native_grind(run, args, path, source_digest, selected=None, total=None):
    from .contract import capture_digest
    from .engine.series import record_and_attach
    _stamp_identity(run, getattr(args, "athlete", None))
    if source_digest != capture_digest(path):
        print('The transcript changed during analysis. Try again.',file=sys.stderr);return 1
    run['input_digest']=source_digest
    if not args.no_series and run.get('started'):
        record_and_attach(run)
    requested=getattr(args,'coach',None) not in (None,'none')
    coach_text=None
    if requested:
        try:
            from .coach.native import review_activity
            if args.coach=='bedrock':print('Bedrock receives activity counts for this review. Accepted private practices stay local.',file=sys.stderr)
            coach_text=review_activity(run,args.coach)
        except ImportError:
            print(coach_install_hint(),file=sys.stderr);return 1
        except Exception as error:
            print('Activity coach failed: '+str(error),file=sys.stderr);return 1
    if args.as_json:
        from .coach.experiment import public_run_view
        print(json.dumps(public_run_view(run), indent=2)); return 0
    selection = (
        f" · sitting {selected} of {total}"
        if selected is not None and total is not None else ""
    )
    print(
        f"  selected session -> {run.get('harness', 'agent')} · "
        f"{run.get('project') or 'Unknown project'} · {Path(path).name}{selection}"
    )
    _render(run,Path(args.out),False)
    print('  '+run.get('trace_basis','Trace timing unavailable'))
    if coach_text:print(coach_text)
    if args.push:
        from .push import import_url
        from .ingest import detect_rig
        run['rig']=detect_rig()
        if args.share_rig_names:run['rig']['share_names']=True
        url=import_url(run,args.push_url)
        # Printed, not only opened: when no browser opens, this line is the only way to the preview.
        print(f'  preview -> {url}')
        print('  Private preview; not saved. Review it, choose an audience deliberately, then Save run.')
        print('  Nothing has been uploaded by this command.')
        _BROWSER.open(url)
    elif not args.no_open:
        _BROWSER.open(Path(args.out).resolve().as_uri())
    return 0

def _run_coach_into(run: dict, path: str, pick: int, gap_s: int, mode: str, athlete: str) -> str | None:
    """Run the coach on the same sitting and copy its verdict fields into `run`.

    The coach re-parses the sitting (same window rule, same counts), so the card and the
    verdict cannot disagree about what they measured; `matches_card` in the verdict says so.
    """
    try:
        from .coach.agent import run_coach
    except ImportError as e:
        print(f"  coach unavailable: {e}"); return None
    try:
        ctx, text = run_coach(path, pick=pick, gap=gap_s, mode=mode, athlete=athlete)
    except ImportError as e:
        print(coach_install_hint() + f"  ({e})\n")
        return None
    except Exception as e:
        from .coach.live_config import LiveConfigError
        if isinstance(e, LiveConfigError):
            print(str(e)); return None
        raise
    for k in ("coach_mode", "coach_tool_calls", "coach_verdict", "coach_plan",
              "coach_numbers", "coach_experiment"):
        run[k] = ctx.run.get(k)
    return text


def _coach(args) -> int:
    """`agentgrinder coach` : the verdict, on its own, for one sitting."""
    from .coach.live_config import LiveConfigError, live_status_text, missing_live_config
    if getattr(args, "live_status", False):
        print(live_status_text())
        return 0 if not missing_live_config() else 2
    from .solo import latest_grind
    if args.session and not Path(args.session).exists():
        print(f"no such transcript: {args.session}"); return 1
    pick = args.pick
    if args.session:
        path = args.session
        pick = -1 if pick is None else pick
    else:
        found = latest_grind()
        if not found:
            print("\n  no Claude Code session with a human turn under ~/.claude/projects."
                  "\n  try the bundled fixture, from the repo root:"
                  "\n\n      python3 -m agentgrinder coach samples/sample_session.jsonl\n")
            return 1
        path, auto = found
        pick = auto if pick is None else pick
    try:
        from .coach.agent import run_coach
    except ImportError as e:
        print(coach_install_hint() + f"  ({e})\n"); return 1
    try:
        ctx, text = run_coach(path, pick=pick, gap=args.gap * 60, mode=args.model, athlete=args.athlete)
    except LiveConfigError as e:
        print(str(e)); return 2
    except ValueError as e:
        print(f"  {e}"); return 1
    except ImportError as e:
        print(coach_install_hint() + f"  ({e})\n")
        return 1
    if args.as_json:
        from .coach.experiment import public_run_view
        print(json.dumps(public_run_view(ctx.run), indent=2, default=str)); return 0
    print()
    print(text)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
