# Prompt provenance v1

STRIVE records what evidence says about the origin of each prompt. A `user` role alone never proves a person typed it.

| Kind | Minimum evidence | Confidence | Human turns | Effort | Autonomy |
|---|---|---:|---:|---|---|
| `human-typed` | Native interactive marker such as Claude `promptSource=typed|queued` or Cursor `<user_query>` | High | Yes | Human direction | No |
| `human-via-tool` | The driving tool explicitly records a user initiator | High | Yes | Human direction, shown as relayed | No |
| `agent-to-agent` | Native subagent, sidechain, or agent initiator marker | High | No | Agent direction | Yes |
| `automation` | Scheduled, CI, hook, system, or automation marker | High | No | Automated direction | Yes |
| `unknown` | A prompt-like record without enough origin evidence | Low | No | Unknown | Excluded |

The legacy `turns_typed` field means recorded human turns when every prompt origin is known: `human-typed + human-via-tool`. If any prompt origin is unknown, the legacy field stays unknown instead of showing a measured zero or lower bound. The full split appears only under **Explore this run**, for example `41 prompts: 38 you, 3 relayed by bb`. Agent-to-agent and automated prompts are shown there but never added to human turns. Unknown prompts stay visible and are excluded from human-effort and autonomy rates.

An external SDK entrypoint and prompt ID prove how a request arrived, not who initiated it. Claude SDK envelopes remain unknown unless the driving tool's own export records a human initiator.

Adapters return only the kind, confidence, adapter id, evidence field names, and optional relay name. They retain no prompt text. A new tool is one adapter plus a fixture that proves every classification it makes. Browser and Python registries use the same five kinds and adapter ids.

The registry covers official bb exports, native Claude Code JSONL, Codex rollout JSONL, and Cursor agent transcripts. Wrapper products such as Conductor and cmux should add their own evidence at the handoff. They must not relabel a native `user` role after the fact.
