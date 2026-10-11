"""A local, scripted Strands model provider: no network, no credentials, no spend.

Lifted from MAGNET (`magnet/local_model.py`, same author, MIT, disclosed in the README) and
changed in one way: MAGNET replays a FIXED list of tool calls; the coach cannot, because how
many claims and artifacts a sitting has is only known after `read_run` returns. So this
provider replays a POLICY: a function from the tool calls made so far (with their results) to
the next tool call, or None when the run is finished.

WHAT IS REAL AND WHAT IS NOT, read this before quoting the demo:
  REAL     the Strands Agent, its event loop, the tool registry built from the five `@tool`
           functions, tool dispatch, tool results, the hook that logs every dispatch, and the
           message history the report is read back from.
  NOT REAL the token generation. This provider does not reason. It applies a deterministic
           policy: read the run, check every claim, verify every artifact, ask git about each,
           write the verdict from the numbers the tools returned. The paragraph and the plan
           it writes are templates filled with those numbers.

To see a model actually choose the tools, run `agentgrinder coach RUN --model bedrock`. That
path needs AWS credentials, costs money, and sends claim lines and result snippets to Amazon
Bedrock; the command prints that before it runs. It is never the default.
"""
from __future__ import annotations

import json
import threading
from collections.abc import AsyncGenerator, AsyncIterable, Callable
from typing import Any

from strands.models.model import Model
from strands.types.content import Messages, SystemContentBlock
from strands.types.streaming import StreamEvent
from strands.types.tools import ToolChoice, ToolSpec

from .policy import FINAL_TEXT, REFUSED_TEXT, History, Policy, Step, coach_policy, history_of  # noqa: F401


# ---- the provider -----------------------------------------------------------------------------

class ScriptedLocalModel(Model):
    """Replays a policy through the real Strands event loop. Not a language model."""

    MODE_LABEL = "strands agent loop · local scripted model (no network, no spend)"

    def __init__(self, policy: Policy | None = None, **config: Any) -> None:
        self.final_text = config.pop("final_text", FINAL_TEXT)
        self.policy: Policy = policy or coach_policy
        self._config: dict[str, Any] = {"model_id": "agentgrinder-coach-scripted-local", **config}
        self.calls: list[str] = []

    def update_config(self, **model_config: Any) -> None:
        self._config.update(model_config)

    def get_config(self) -> dict[str, Any]:
        return dict(self._config)

    async def structured_output(self, output_model, prompt: Messages, system_prompt: str | None = None,
                                **kwargs: Any) -> AsyncGenerator[dict[str, Any], None]:
        raise NotImplementedError("ScriptedLocalModel does not support structured_output()")

    async def stream(self, messages: Messages, tool_specs: list[ToolSpec] | None = None,
                     system_prompt: str | None = None, *, tool_choice: ToolChoice | None = None,
                     system_prompt_content: list[SystemContentBlock] | None = None,
                     invocation_state: dict[str, Any] | None = None,
                     cancel_signal: threading.Event | None = None,
                     **kwargs: Any) -> AsyncIterable[StreamEvent]:
        history = history_of(messages)
        step = self.policy(history)
        yield {"messageStart": {"role": "assistant"}}
        if step is None:
            last = history[-1] if history else None
            refused = bool(last and last[0] == "write_verdict" and last[2] and not last[2].get("accepted"))
            yield {"contentBlockDelta": {"delta": {"text": REFUSED_TEXT if refused else self.final_text}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "end_turn"}}
            return
        name, tool_input = step
        self._guard_tool_exists(name, tool_specs)
        self.calls.append(name)
        yield {"contentBlockStart": {"start": {"toolUse": {
            "name": name, "toolUseId": f"coach-{len(history)}-{name}"}}}}
        yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(tool_input)}}}}
        yield {"contentBlockStop": {}}
        yield {"messageStop": {"stopReason": "tool_use"}}

    @staticmethod
    def _guard_tool_exists(name: str, tool_specs: list[ToolSpec] | None) -> None:
        """A policy naming a tool the agent was never given must explode, not look like a model
        that chose to call nothing."""
        if not tool_specs:
            raise RuntimeError(f"ScriptedLocalModel planned {name!r} but the agent was given no tools.")
        available = {spec["name"] for spec in tool_specs}
        if name not in available:
            raise RuntimeError(f"ScriptedLocalModel planned {name!r}, which is not a registered tool. "
                               f"Registered: {sorted(available)}")
