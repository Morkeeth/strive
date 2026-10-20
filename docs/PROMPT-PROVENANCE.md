# Prompt provenance v1

STRIVE records what evidence says about the origin of each prompt. A `user` role alone never proves a person typed it.

| Kind | Minimum evidence | Confidence | Human turns | Effort | Autonomy |
|---|---|---:|---:|---|---|
| `human-typed` | Native interactive marker such as Claude `promptSource=typed|queued` or Cursor `<user_query>` | High | Yes | Human direction | No |
| `human-via-tool` | A user initiator in the driving tool, or an external SDK entrypoint with a prompt id | High with named wrapper, otherwise medium | Yes | Human direction, shown as relayed | No |
| `agent-to-agent` | Native subagent, sidechain, or agent initiator marker | High | No | Agent direction | Yes |
| `automation` | Scheduled, CI, hook, system, or automation marker | High | No | Automated direction | Yes |
| `unknown` | A prompt-like record without enough origin evidence | Low | No | Unknown | Excluded |

The legacy `turns_typed` field now means recorded human turns: `human-typed + human-via-tool`. The card must show the split when provenance is present, for example `41 prompts: 38 you, 3 relayed by bb`. Agent-to-agent and automated prompts are shown but never added to human turns. Unknown prompts stay visible and are excluded from human-effort and autonomy rates.

Adapters return only the kind, confidence, adapter id, evidence field names, and optional relay name. They retain no prompt text. A new tool is one adapter plus a fixture that proves every classification it makes. Browser and Python registries use the same five kinds and adapter ids.

The registry covers official bb exports, native Claude Code JSONL, Codex rollout JSONL, and Cursor agent transcripts. Wrapper products such as Conductor and cmux should add their own evidence at the handoff. They must not relabel a native `user` role after the fact.
