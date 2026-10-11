# STRIVE with Grok Bot

Grok Bot runs on its own shared cloud computer. Give it the [STRIVE companion](https://striverun.app/capture/grok/SKILL.md) and ask it to turn **one selected real conversation** into a private run preview. The [public STRIVE Bot template](https://x.ai/bot/JWU4CVq6sWA8LGcRHSxp4) is available, but adding a template is separate from saving a STRIVE run.

## One real run

1. Ask the Bot to read the current [agents entry](https://striverun.app/agents.md) and companion skill. It should obtain the exact same-release helper archive and check its SHA-256 before using it.
2. The Bot first checks whether its own conversation exposes `ReadTranscript`. The observed client returned an agent ID and redacted page envelopes, not a native session ID. For that shape, use the helper's **projection** mode, freeze the upper source position, and disclose missing positions. Native mode requires an actual returned session ID and exact records. An explicitly selected export is the fallback when direct access is absent.
3. The helper makes a **local private preview**. The Bot and owner inspect what was observed, what is unknown, and whether the card says something meaningful about the work. No account token is needed for preview.
4. The owner can save through a signed-in STRIVE browser. A separate, explicitly approved agent save can use a Connect token to save **Only me**. Sharing, photos and interactions are later owner choices through the supported site controls.

The real own-session check behind the published template previewed **153 of 193 source positions**, disclosed **40 missing positions**, and did **not** save a STRIVE run. It demonstrates the projection path, not complete transcript access or outside adoption. The bot computer's shared files and sign-ins also mean the Bot must select its own source deliberately.

xAI's current [Grok Bot overview](https://docs.x.ai/grok-bot/overview), [skills guide](https://docs.x.ai/grok-bot/skills-routines-and-automations), and [message guide](https://docs.x.ai/grok-bot/chat-and-collaboration) describe persistent cloud computers, saved skills and visible transcript activity. They do not specify a public `ReadTranscript` export API contract. The transport rules above come from the observed client response and STRIVE's parser, so each Bot must inspect its actual fields before capture.

The complete capture rules and commands are in [CAPTURE.md](../templates/grokbot/post-agent-run/references/CAPTURE.md). Do not substitute sample data, another person's export, a summary, or guessed native records. A sample or a successful local parser test is not a real run.
