# Historical Agent Grinder architecture (2026-08-30)

This is the historical hackathon design. Read [the current STRIVE architecture](architecture.md) for contributor work.

Screens: `../archive/hackathon-2026-09/docs/screens/`: 01 landing · 02 feed-card · 03 profile.

## Architecture (4 pieces)
```
 your machine (private)                        cloud (only what you push)
 ┌─────────────────────────┐                   ┌───────────────────────────┐
 │ CLI: agentgrinder run   │  metrics only,    │ Vercel: agentgrinder.     │
 │  reads ~/.claude,~/.cursor│  you approve  ──▶ │  vercel.app (static app)  │
 │  → card + coach + --push │  (#import hash)   │                           │
 │ MCP: preview_run         │                   │ Supabase (eu-central-1):  │
 │  (offline, no push)      │                   │  profiles·runs·follows·acks│
 └─────────────────────────┘                   │  RLS: public reads public  │
   transcripts NEVER leave                      │  GitHub OAuth = identity   │
                                                └───────────────────────────┘
```
- **CLI** (`agentgrinder`, installed): reads local transcripts, computes metrics, coach insights, `--push` opens the web importer. Never networks except the push you trigger.
- **MCP** (`agentgrinder.mcp_server`): offline preview only, metrics-only allowlist, cannot push.
- **Web** (single `site/index.html` + Supabase JS): landing · dashboard (private) · profile · Explore feed · import.
- **DB**: `profiles` (crew + rig), `runs` (metrics + rhythm + route + note + visibility), `follows`, `acks`. RLS: you own yours; public rows are world-readable.

## Data model — a Run (metrics only, verified honest)
typed prompts · moving time (idle >20m excluded) · pace · tool_calls · files · commits · rhythm (grind curve) · route (region indices, no paths) · note (you type) · is_ship · visibility. **No prompt text, no code, ever.**

## User journeys (the 3 layers)
### L1 — Private coach (wedge)  [screen 03]
1. `agentgrinder run` → your last session as a card + coach lines (focus rank, cadence vs usual, tool depth).
2. Private dashboard: grind score + sober labels, agent-to-agent comparison, your runs.
   - **Improve:** the CLI card is text-only (web card is richer) · coach needs "vs last month" trend · dashboard empty-state → first-run magic.
### L2 — Proof profile (bridge)  [screen 03]
1. `--push` → import preview (exact numbers) → publish → shareable profile (rig, ships, score).
   - **Improve:** shareable URL polish (og-image/share card) · rig should surface skills/MCPs, not just harness · "share your profile" CTA.
### L3 — Social (compounding)  [screen 02]
1. Explore feed of public runs → ACK (counts + optimistic) → follow → crews/events.
   - **Improve:** feed is empty at cold-start (graveyard risk → seed trending/example runs) · no follow UI yet · no crews/events yet · run has no permalink page.

## Cross-cutting flows to improve
| Flow | State | Next |
|---|---|---|
| Sign-in | works (GitHub OAuth, callback fixed) | confirm redirect allowlist |
| Push (CLI→web) | works via #import preview | a real CLI token push (no browser) later |
| Privacy | verified (allowlist, offline reader) | a visible "what gets pushed" in the CLI too |
| Feed cold-start | empty = graveyard | trending GitHub repos / seeded example runs |
| Brand | almanac skin shipped | logomark refinement, share-card |
