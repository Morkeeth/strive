"""The grind coach: `create_coach`, the dispatch-log hook, and the three modes.

THREE MODES, AND THE MODE IS ALWAYS PRINTED (the shape is MAGNET's `agent_run.py`, disclosed):
  local     (default) a real `strands.Agent` event loop over the five `@tool`s, driven by
            `ScriptedLocalModel`. No network, no AWS credentials, no spend. The loop, the tool
            registry, the dispatch and the hook are genuine Strands machinery; the token
            generation is a deterministic policy, not a language model.
  bedrock   the same loop with the Strands default provider (Amazon Bedrock): a language model
            actually choosing the tools. Needs AWS credentials, costs money, and sends the claim
            lines and result snippets off the machine. Opt-in, and the command says so first.
  none      the five plain functions called in a fixed order, no Agent. The fallback.

If an agent mode fails, this module does NOT degrade quietly: it prints the failure and the
exact reason, says which mode it fell back to, and marks the result DEGRADED.

THE DISPATCH LOG. A Strands hook on `AfterToolCallEvent` appends one record per tool call the
SDK executed (name, status, duration). The card shows "verdict produced by N tool calls" from
that log, and the number is the SDK's, not the plan's and not a claim.
"""
from __future__ import annotations

import importlib.util
from datetime import datetime

from ..solo import SITTING_GAP
from .tools import (CoachContext, TOOL_NAMES, attach, build_coach_tools, check_claim,
                    git_evidence, read_run, verify_artifact, write_verdict)

MODES = ("local", "bedrock", "none")

NONE_LABEL = "deterministic fallback · no agent, no model (5 tools called in sequence)"
BEDROCK_LABEL = "strands agent loop · Amazon Bedrock (real model, needs AWS credentials, costs money)"

SYSTEM_PROMPT = (
    "You are the grind coach for AGENT GRINDER. A grind is one sitting with a coding agent, "
    "and its card must be a receipt, not a self-report. You referee it.\n"
    "Rules you never break:\n"
    "1. You never state a number that a tool did not return in this conversation. No estimate, "
    "no rounding, no 'about'. If you do not have a number, call the tool that owns it.\n"
    "2. Call read_run first. Then call check_claim for EVERY claim id it listed, and "
    "verify_artifact for EVERY artifact id. When the run is inside git, call git_evidence for "
    "every artifact too. Then call write_verdict exactly once with the numbers the tools "
    "returned, one paragraph of judgement, and a next-session plan of three to four lines: "
    "Friction (the single most specific unsupported claim or missing file, with the tool "
    "that said so), Consequence, Experiment (one concrete action for the next sitting), "
    "Look for (the observation that would change your mind). Do not list every unverified "
    "claim id. Missing evidence stays unknown, not zero.\n"
    "3. If write_verdict refuses, read its reasons, call the tool it names, and try again.\n"
    "4. Never quote or paraphrase anything the person typed. You work on counts, claim lines "
    "and git evidence only.\n"
    "5. Say what the evidence supports and no more: an unverified claim is 'no evidence in its "
    "turn', not 'false'."
)

COACH_TASK = ("Referee this sitting. Read it, check every claim against its own turn, verify "
              "every file it wrote, ask git what landed, then write the verdict.")

BEDROCK_BANNER = (
    "  BEDROCK: this sends the claim lines and tool-result snippets of this sitting to Amazon\n"
    "  Bedrock. Not the prompts you typed, not code, not file paths (paths are replaced by the\n"
    "  labels the card prints). It needs AWS credentials and it costs money."
)


# ---- the hook ---------------------------------------------------------------------------------

def _dispatch_log(ctx: CoachContext):
    """A HookProvider that appends one record per tool call the SDK executed."""
    from strands.hooks import AfterToolCallEvent, HookProvider, HookRegistry

    class DispatchLog(HookProvider):
        def register_hooks(self, registry: HookRegistry, **kwargs) -> None:
            registry.add_callback(AfterToolCallEvent, self.after_tool)

        def after_tool(self, event) -> None:
            tu = getattr(event, "tool_use", None) or {}
            res = getattr(event, "result", None) or {}
            dur = getattr(event, "duration", None)
            ctx.dispatch.append(dict(
                tool=tu.get("name"), status=res.get("status"),
                duration_ms=(round(dur.total_seconds() * 1000) if hasattr(dur, "total_seconds")
                             else (round(dur * 1000) if isinstance(dur, (int, float)) else None)),
                at=datetime.now().astimezone().isoformat(timespec="seconds"),
                source="strands AfterToolCallEvent"))

    return DispatchLog()


# ---- the agent --------------------------------------------------------------------------------

def create_coach(ctx: CoachContext, *, model=None, system_prompt: str | None = None):
    """A Strands Agent wired to the five coach tools on one sitting.

    `model` is any Strands model provider. Pass `ScriptedLocalModel()` for the keyless path.
    Leave it None for the Strands default (Amazon Bedrock), which REQUIRES AWS credentials and
    COSTS MONEY; callers make that choice explicit and visible on screen before this runs.
    """
    from strands import Agent

    return Agent(
        tools=build_coach_tools(ctx),
        system_prompt=system_prompt or SYSTEM_PROMPT,
        hooks=[_dispatch_log(ctx)],
        callback_handler=None,   # the report reads agent.messages back; no SDK printer
        **({"model": model} if model is not None else {}),
    )


def dispatched(agent) -> list[str]:
    """Tool names the SDK's event loop actually dispatched, from the message history."""
    return [b["toolUse"]["name"] for m in agent.messages for b in m.get("content", []) if "toolUse" in b]


def run_strands_coach(ctx: CoachContext, mode: str) -> tuple[str, list[str], str]:
    """(mode label, dispatched tool names, the agent's final text). Raises on failure."""
    if mode == "local":
        from .local_model import ScriptedLocalModel
        model = ScriptedLocalModel()
        label = model.MODE_LABEL
    elif mode == "bedrock":
        model, label = None, BEDROCK_LABEL
    else:
        raise ValueError(f"unknown agent mode: {mode!r}")
    agent = create_coach(ctx, model=model)
    result = agent(COACH_TASK)
    return label, dispatched(agent), str(result).strip()


def run_deterministic_coach(ctx: CoachContext) -> tuple[str, list[str], str]:
    """The five plain functions in a fixed order. No Agent. The fallback."""
    from .policy import History, coach_policy
    history: History = []
    calls = []
    fns = dict(read_run=lambda **k: read_run(ctx), check_claim=lambda **k: check_claim(ctx, **k),
               verify_artifact=lambda **k: verify_artifact(ctx, **k),
               git_evidence=lambda **k: git_evidence(ctx, **k),
               write_verdict=lambda **k: write_verdict(ctx, **k))
    while True:
        step = coach_policy(history)
        if step is None:
            break
        name, inp = step
        res = fns[name](**inp)
        history.append((name, inp, res))
        calls.append(name)
        ctx.dispatch.append(dict(tool=name, status="success", duration_ms=None,
                                 at=datetime.now().astimezone().isoformat(timespec="seconds"),
                                 source="direct call, no agent"))
    return NONE_LABEL, calls, "(no agent ran; the policy called the functions directly)"


def run_coach(transcript: str, *, pick: int = -1, gap: int = SITTING_GAP, mode: str = "local",
              athlete: str = "you", out=print) -> tuple[CoachContext, str]:
    """Run the coach on one sitting. Returns (context with verdict attached, report text).

    Never degrades silently: an agent-mode failure prints a banner, falls back to the
    deterministic chain, and the report ends with `status DEGRADED`.
    """
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
    if mode != "none" and importlib.util.find_spec("strands") is None:
        raise ImportError("strands-agents is not installed (it needs Python 3.10 or newer)")
    ctx = CoachContext(transcript, pick=pick, gap=gap, athlete=athlete)
    banner = ""
    if mode == "none":
        label, calls, said = run_deterministic_coach(ctx)
    else:
        if mode == "bedrock":
            from .live_config import LiveConfigError, live_status_text, missing_live_config
            missing = missing_live_config()
            if missing:
                raise LiveConfigError(live_status_text())
            out(BEDROCK_BANNER)
        try:
            label, calls, said = run_strands_coach(ctx, mode)
        except Exception as exc:  # noqa: BLE001  the reason is printed, never swallowed
            banner = "\n".join([
                "!" * 72,
                f"!! STRANDS AGENT MODE {mode!r} FAILED, FALLING BACK TO THE DETERMINISTIC CHAIN",
                f"!! {type(exc).__name__}: {exc}",
                "!! The verdict below did NOT come from an agent loop. It is DEGRADED.",
                "!" * 72, ""])
            ctx.dispatch.clear()
            label, calls, said = run_deterministic_coach(ctx)
    attach(ctx, label)
    text = banner + report(ctx, label, calls, said, mode)
    if banner:
        text += "\n\n  status               DEGRADED (agent mode failed; see banner above)"
    return ctx, text


def report(ctx: CoachContext, label: str, calls: list[str], said: str, mode: str) -> str:
    v = ctx.verdict
    counts: dict[str, int] = {}
    for c in calls:
        counts[c] = counts.get(c, 0) + 1
    lines = [f"GRIND COACH  [MODE: {label}]", "",
             f"  sitting              {ctx.run['project']} · {ctx.run['started'][:16]} -> {ctx.run['ended'][11:16]}",
             f"  tools dispatched     {len(calls)}  ({'by the Strands event loop' if mode != 'none' else 'direct calls'}; "
             f"hook logged {len(ctx.dispatch)})"]
    for name in TOOL_NAMES:
        if counts.get(name):
            lines.append(f"    {name:<18} x{counts[name]}")
    if v:
        n = v["numbers"]
        vpt = v["verified_per_turn"]
        lines += ["", "  verdict",
                  f"    typed turns        {n['turns_typed']}   (cost)",
                  f"    claims             {n['claims_verified']} verified of {n['claims']}",
                  f"    artifacts          {n['artifacts_produced']} on disk of {len(ctx.artifacts)} written",
                  f"    commits            {n['commits']}",
                  f"    verified per turn  {vpt if vpt is not None else 'needs typed turns'}",
                  f"    card agrees        {'yes' if v['matches_card'] else 'NO, rule drift'}",
                  "", f"  {v['paragraph']}", "", "  next session"]
        lines += [f"    - {p}" for p in v["plan"]]
    else:
        lines += ["", "  verdict              none written (write_verdict was refused or never called)"]
    if said:
        lines += ["", f"  agent said           {said}"]
    if mode == "local":
        lines += ["",
                  "  NOTE: the agent loop, tool registry, dispatch and hook above are real Strands.",
                  "        The model is a local scripted policy, not an LLM: it reads the run, checks",
                  "        every claim and file, and writes the verdict from the tool results. For a",
                  "        model that genuinely chooses the tools: agentgrinder coach RUN --model bedrock",
                  "        (needs AWS credentials, costs money, sends claim lines off the machine)."]
    return "\n".join(lines)
