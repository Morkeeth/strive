"""The five coach tools. Plain functions first, Strands `@tool` wrappers second.

Every tool works on a `CoachContext`: one sitting of one transcript, already cut to its window
by `solo.parse_solo` (the same window every other number on the card uses). The context also
remembers what each tool returned, because `write_verdict` accepts a number only when a tool in
this context produced it.

What leaves a tool, and what never does:
  read_run         counts, the claim LINES (assistant text that reads as a claim, paths in it
                   replaced by the same labels the card prints), how many tool results each
                   turn had, and one label per edited artifact. Never a typed prompt. Never an
                   absolute path. Never code.
  check_claim      verified or not, and the matching snippet of the tool result (200 chars).
  verify_artifact  exists, size, modified-when, and whether that instant is inside the window.
  git_evidence     the commits inside the window that contain the file, and the first commit
                   after the window that did (gitwork.touched_since), or the reason git could
                   not be asked.
  write_verdict    accepts five numbers, one paragraph and a plan; refuses any number that no
                   tool in this context returned, or that does not match what the tools said.

The claim rule is the calibrated rule from `claims.py`, lifted into a tool the agent calls per
claim: evidence is a tool result in the SAME human turn, before or after the claim, carrying a
successful test output matching every named test or file, without failed output. Generic suite
output supports only unnamed suite claims. Deployment and compound claims remain unknown. The claim side is measured (precision 0.63, recall 0.66 on a held-out set); the
evidence side is not. The coach adds per-claim judgement (which token, which turn) and a refusal
to write a number it did not check.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

from .. import gitwork, privacy
from ..claims import Claim, claims_in, evidence_matches
from ..metrics import verified_per_turn
from ..solo import SITTING_GAP, _scan, parse_solo

SNIPPET = 200
TOOL_NAMES = ("read_run", "check_claim", "verify_artifact", "git_evidence", "write_verdict")


def _iso(t: datetime) -> str:
    return t.isoformat()


def _scrub(line: str, repo_root: str | None) -> str:
    """A claim line with every path-shaped token replaced by the label the card would print.

    The card never prints a home path, a synced-notes path or a memory filename; a claim line
    the agent wrote can carry one. `privacy.safe_label` decides per token what a reader may be
    told: a repo-relative path inside this repo, the name of another repo, or a shape word.
    """
    out = []
    for tok in line.split():
        core = tok.strip(".,;:()[]{}'\"`")
        if "/" in core and (core.startswith("/") or core.startswith("~") or "." in core):
            label, _ = privacy.safe_label(os.path.expanduser(core), repo_root)
            tok = tok.replace(core, label)
        out.append(tok)
    return " ".join(out)[:SNIPPET]


class CoachContext:
    """One sitting, its evidence, and a record of what every tool returned."""

    def __init__(self, transcript: str, pick: int = -1, gap: int = SITTING_GAP,
                 athlete: str = "you") -> None:
        self.transcript = transcript
        self.run = parse_solo(transcript, athlete=athlete, pick=pick, gap=gap)
        self.t0 = datetime.fromisoformat(self.run["started"])
        self.t1 = datetime.fromisoformat(self.run["ended"])
        self.repo_root: str | None = None
        # parse_solo drops repo_root from the run unless paths were opted in; the coach needs
        # it locally (for git) and never returns it.
        cwd_counts: dict[str, int] = {}
        s = _scan(transcript)
        for ts, c in s["cwds"]:
            if self.t0 <= ts <= self.t1:
                cwd_counts[c] = cwd_counts.get(c, 0) + 1
        cwd = max(cwd_counts, key=cwd_counts.get) if cwd_counts else ""
        repo = gitwork.repo_of(cwd) if cwd else None
        self.repo_root = repo[1] if repo else None

        # ---- claims and results, per human turn, inside the window only
        self.claims: list[dict] = []          # id, turn, line (scrubbed), claim (Claim)
        self.results: dict[int, list[str]] = {}
        turn = 0
        for ts, kind, text in sorted(s["claim_ev"], key=lambda e: e[0]):
            if not (self.t0 <= ts <= self.t1):
                continue
            if kind == "typed":
                turn += 1
            elif kind == "text":
                for c in claims_in(text):
                    self.claims.append(dict(id=len(self.claims) + 1, turn=turn,
                                            line=_scrub(c.line, self.repo_root), claim=c))
            else:
                self.results.setdefault(turn, []).append(text)

        # ---- artifacts: every distinct path an Edit/Write named inside the window
        seen: dict[str, int] = {}
        self.artifacts: list[dict] = []
        for ts, p, kind in s["visits"]:
            if kind != "edit" or not (self.t0 <= ts <= self.t1) or p in seen:
                continue
            seen[p] = len(self.artifacts) + 1
            label, where = privacy.safe_label(p, self.repo_root)
            self.artifacts.append(dict(id=seen[p], path=p, label=label, where=where))

        # ---- what the tools said (write_verdict reads these, never the run dict)
        self.read = False
        self.checked: dict[int, bool] = {}
        self.exists: dict[int, bool] = {}
        self.git: dict[int, dict] = {}
        self.verdict: dict | None = None
        self.dispatch: list[dict] = []      # filled by the agent's AfterToolCallEvent hook

    # -- lookups ----------------------------------------------------------------------------
    def claim(self, claim_id: int) -> dict | None:
        return next((c for c in self.claims if c["id"] == claim_id), None)

    def artifact(self, artifact_id: int) -> dict | None:
        return next((a for a in self.artifacts if a["id"] == artifact_id), None)


# ---- the five tools, as plain functions -------------------------------------------------------

def read_run(ctx: CoachContext) -> dict:
    """Counts, claim lines, results-per-turn and artifact labels for one sitting. No prompt text."""
    r = ctx.run
    ctx.read = True
    return dict(
        project=r["project"], harness=r["harness"],
        window=dict(started=r["started"], ended=r["ended"], wall_s=r["wall_s"]),
        turns_typed=r["turns_typed"], tool_calls=r["tool_calls"],
        files_edited=r["files_edited"], files_read=r["files_read"], commits=r["commits"],
        in_git=bool(r["git"]["root"]),
        claims=[dict(id=c["id"], turn=c["turn"], line=c["line"]) for c in ctx.claims],
        results_per_turn={str(t): len(v) for t, v in sorted(ctx.results.items())},
        artifacts=[dict(id=a["id"], label=a["label"], where=a["where"]) for a in ctx.artifacts],
        rule="Same-turn successful test output must match each named target. Generic suite success "
             "supports only unnamed suite claims. The matcher has no measured accuracy yet.",
    )


def check_claim(ctx: CoachContext, claim_id: int) -> dict:
    """Is there evidence for this claim in its own human turn? Which result, which token?"""
    c = ctx.claim(int(claim_id))
    if c is None:
        return dict(claim_id=claim_id, error=f"no claim with id {claim_id}; read_run lists them")
    claim: Claim = c["claim"]
    for text in ctx.results.get(c["turn"], []):
        if evidence_matches(claim, text):
            tok = next((t for t in claim.tokens if t in text), None)
            at = text.find(tok) if tok else 0
            snippet = text[max(0, at - 60):at + SNIPPET - 60].strip()
            ctx.checked[c["id"]] = True
            return dict(claim_id=c["id"], turn=c["turn"], verified=True,
                        matched=tok or "generic success token",
                        evidence=_scrub(snippet, ctx.repo_root))
    ctx.checked[c["id"]] = False
    return dict(claim_id=c["id"], turn=c["turn"], verified=False, matched=None,
                evidence=None,
                results_in_turn=len(ctx.results.get(c["turn"], [])))


def verify_artifact(ctx: CoachContext, artifact_id: int) -> dict:
    """Does the file the run wrote exist now? How big, and was it last modified inside the window?"""
    a = ctx.artifact(int(artifact_id))
    if a is None:
        return dict(artifact_id=artifact_id, error=f"no artifact with id {artifact_id}")
    p = a["path"]
    if not os.path.exists(p):
        ctx.exists[a["id"]] = False
        return dict(artifact_id=a["id"], label=a["label"], exists=False)
    st = os.stat(p)
    mtime = datetime.fromtimestamp(st.st_mtime).astimezone()
    ctx.exists[a["id"]] = True
    return dict(artifact_id=a["id"], label=a["label"], exists=True, size=st.st_size,
                modified=_iso(mtime), modified_in_window=bool(ctx.t0 <= mtime <= ctx.t1))


def git_evidence(ctx: CoachContext, artifact_id: int) -> dict:
    """Which commits inside the window contain this file, and did any commit touch it since?"""
    a = ctx.artifact(int(artifact_id))
    if a is None:
        return dict(artifact_id=artifact_id, error=f"no artifact with id {artifact_id}")
    root = ctx.repo_root
    if not root:
        out = dict(artifact_id=a["id"], label=a["label"], asked=False,
                   reason="the sitting's working directory is not inside a git work tree")
    elif not a["path"].startswith(root + "/"):
        out = dict(artifact_id=a["id"], label=a["label"], asked=False,
                   reason="the file is outside the repository the sitting worked in")
    else:
        commits = [c for c in gitwork.commits_in(root, ctx.t0, ctx.t1) if a["path"] in c["files"]]
        later = gitwork.touched_since(root, [a["path"]], ctx.t1).get(a["path"])
        ignored = a["path"] in gitwork.ignored(root, [a["path"]])
        out = dict(artifact_id=a["id"], label=a["label"], asked=True, ignored=ignored,
                   in_window=[dict(hash=c["hash"], at=c["at"], subject=c["subject"][:80])
                              for c in commits],
                   committed_later=later)
    ctx.git[a["id"]] = out
    return out


def write_verdict(ctx: CoachContext, turns_typed: int, claims: int, claims_verified: int,
                  artifacts_produced: int, commits: int, paragraph: str,
                  plan: list[str] | str) -> dict:
    """Write the verdict block. Every number must equal what a tool in this context returned.

    Refuses when: read_run was never called; a claim was never checked; an artifact was never
    verified; a number differs from the tool results; the paragraph is empty. A refusal is a
    result, not an exception, so the agent sees the reason and can call the missing tool.
    """
    reasons = []
    if not ctx.read:
        reasons.append("read_run was not called; the counts have no tool result behind them")
    unchecked = [c["id"] for c in ctx.claims if c["id"] not in ctx.checked]
    if unchecked:
        reasons.append(f"{len(unchecked)} of {len(ctx.claims)} claims were never passed to "
                       f"check_claim: ids {unchecked[:12]}")
    unverified = [a["id"] for a in ctx.artifacts if a["id"] not in ctx.exists]
    if unverified:
        reasons.append(f"{len(unverified)} of {len(ctx.artifacts)} artifacts were never passed "
                       f"to verify_artifact: ids {unverified[:12]}")
    expected = dict(
        turns_typed=ctx.run["turns_typed"],
        claims=len(ctx.claims),
        claims_verified=sum(1 for v in ctx.checked.values() if v),
        artifacts_produced=sum(1 for v in ctx.exists.values() if v),
        commits=ctx.run["commits"],
    )
    given = dict(turns_typed=turns_typed, claims=claims, claims_verified=claims_verified,
                 artifacts_produced=artifacts_produced, commits=commits)
    for k, v in expected.items():
        if not unchecked and not unverified and int(given[k]) != v:
            reasons.append(f"{k}: you wrote {given[k]}, the tools returned {v}")
    if not (paragraph or "").strip():
        reasons.append("the paragraph is empty")
    if reasons:
        return dict(accepted=False, reasons=reasons, tools_said=expected)

    plan_lines = [plan] if isinstance(plan, str) else [str(p) for p in plan]
    plan_lines = [p.strip() for p in plan_lines if p and p.strip()][:5]
    # the same counts the card computed by rule; equal by construction, checked anyway so a
    # drift between the coach's rule and the card's rule cannot pass in silence
    matches_card = (ctx.run.get("claims") == expected["claims"]
                    and ctx.run.get("claims_verified") == expected["claims_verified"]
                    and ctx.run.get("artifacts_produced") == expected["artifacts_produced"])
    vpt = verified_per_turn(expected["claims_verified"], expected["artifacts_produced"],
                            expected["turns_typed"])
    ctx.verdict = dict(
        numbers=expected, verified_per_turn=(round(vpt, 2) if vpt is not None else None),
        paragraph=paragraph.strip()[:600], plan=plan_lines, matches_card=matches_card,
        unverified_claims=[c["id"] for c in ctx.claims if not ctx.checked.get(c["id"])],
        missing_artifacts=[a["id"] for a in ctx.artifacts if not ctx.exists.get(a["id"])],
    )
    return dict(accepted=True, verdict=ctx.verdict)


# ---- the Strands surface ----------------------------------------------------------------------

def build_coach_tools(ctx: CoachContext) -> list:
    """The five tools as Strands `@tool`s, bound to one context.

    The context is bound into the closures (the shape MAGNET uses for its four tools) so the
    agent's tool calls read and write one sitting's evidence, and `write_verdict` can check the
    agent's numbers against what the other four returned in the same run.
    """
    try:
        from strands import tool
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "the coach needs the Strands SDK, which needs Python 3.10 or newer: make a venv on a "
            '3.10+ interpreter, then `.venv/bin/pip install -e ".[coach]"`'
        ) from exc

    @tool
    def read_run() -> dict:
        """Read the sitting: counts, the claim lines with ids, results per turn, artifact labels.
        Call this first. It never returns prompt text or absolute paths."""
        return globals()["read_run"](ctx)

    @tool
    def check_claim(claim_id: int) -> dict:
        """Check ONE claim (by id from read_run) for evidence in its own human turn.
        Returns verified true/false, the matched token and a snippet of the evidence."""
        return globals()["check_claim"](ctx, claim_id)

    @tool
    def verify_artifact(artifact_id: int) -> dict:
        """Check ONE artifact (by id from read_run) on disk: exists, size, modified inside the
        window or not."""
        return globals()["verify_artifact"](ctx, artifact_id)

    @tool
    def git_evidence(artifact_id: int) -> dict:
        """Ask git about ONE artifact (by id): commits inside the window containing it, and the
        first commit after the window that touched it. Says why when git cannot be asked."""
        return globals()["git_evidence"](ctx, artifact_id)

    @tool
    def write_verdict(turns_typed: int, claims: int, claims_verified: int,
                      artifacts_produced: int, commits: int, paragraph: str,
                      plan: list[str]) -> dict:
        """Write the verdict: five numbers, one paragraph, a next-session plan (1 to 5 lines).
        Every number must be one a tool returned in this run; otherwise the verdict is refused
        with the reason, and you should call the missing tool and try again."""
        return globals()["write_verdict"](ctx, turns_typed, claims, claims_verified,
                                          artifacts_produced, commits, paragraph, plan)

    return [read_run, check_claim, verify_artifact, git_evidence, write_verdict]


def attach(ctx: CoachContext, mode_label: str) -> dict:
    """Copy the verdict into the run dict under the names the card, push and site read."""
    run = ctx.run
    v = ctx.verdict
    run["coach_mode"] = mode_label
    run["coach_tool_calls"] = len(ctx.dispatch) if ctx.dispatch else None
    if v is None:
        run["coach_verdict"] = None
        run["coach_plan"] = None
        run["coach_numbers"] = None
        return run
    run["coach_verdict"] = v["paragraph"]
    run["coach_plan"] = "\n".join(v["plan"])
    run["coach_numbers"] = v["numbers"]
    from .experiment import from_context, public_experiment, public_text
    local = from_context(ctx)
    run["coach_experiment_local"] = local
    run["coach_experiment"] = public_experiment(local)
    run["coach_plan"] = public_text(run["coach_plan"]) or run["coach_plan"]
    run["coach_verdict"] = public_text(run["coach_verdict"]) or run["coach_verdict"]
    return run


def to_json(obj) -> str:
    return json.dumps(obj, indent=2, default=str)
