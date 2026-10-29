# STRIVE

## TLDR

Turn a recorded coding-agent session into a visual run you can keep private or share.<br>
For builders who want others to see and respond to actual work.<br>
Capture needs no model API key; review the preview and audience before deliberately saving a run.

[Open STRIVE](https://striverun.app) · [Install STRIVE](https://striverun.app/install) · [the public FAVOUR run](https://striverun.app/?run=47e8f731-a4a3-44ce-add2-63fa6e815af5)

## The problem and approach

Work done with a coding agent is hard for other people to see and respond to.  
Import a session, review source-backed measurements, write your own title and story, add a screenshot, then save as Only me or post it to the feed where others can follow, thank and reply.  
Capture needs no model API key, stays on your machine until you save, and missing measurements stay unknown. Try it at [striverun.app](https://striverun.app).

## Review and pick up the work

[PRODUCT.md](PRODUCT.md) · [Agent guide](AGENTS.md)

Start with the linked source, setup and evidence. Recorded demos and sample data keep their original scope; use the repository instructions for a fresh run.

STRIVE turns a recorded coding-agent session into a visual run you can save privately and share when you choose. Capture needs no model API key.

**[Open STRIVE](https://striverun.app)** · [Install STRIVE](https://striverun.app/install) · [Contribute](CONTRIBUTING.md)

![Live STRIVE card for a FAVOUR review-request run, with recorded activity and project screenshots.](docs/strive-live-favour-card-20261011.png)

_Captured from [the public FAVOUR run](https://striverun.app/?run=47e8f731-a4a3-44ce-add2-63fa6e815af5) on 11 October 2026._

## Make your first private run

1. **Choose a recorded session.** Open [STRIVE](https://striverun.app/?post) and use the [capture instructions](https://striverun.app/agents.md) with your coding agent, or select a supported export on your own computer. Confirm the project and session before import.
2. **Review the preview.** Check the source-backed measurements, write your own title and story, and add a screenshot of the work if you have one. A preview is not a saved run.
3. **Save as Only me.** Sign in, choose **Only me**, save, then open the run again to check the result. You can change its audience later if you want to share it.

The capture stays on your machine until you deliberately save a run. Missing measurements stay unknown. A saved private run is visible only to its owner. [Privacy and photo details](PRIVACY.md) · [How capture works](docs/CAPTURE-AND-INTEGRATIONS.md)

## Run locally in ten minutes

Install Python 3.9+ and Node 22, then clone your fork:

```sh
git clone https://github.com/YOUR-HANDLE/strive.git
cd strive
python3 scripts/dev.py setup
npm ci --ignore-scripts
python3 scripts/dev.py serve
```

Open http://127.0.0.1:8000. This serves `site/` directly; `npm run build` checks the separate deployment output in `dist/`. Sign-in and saved social actions need a database. No production account, API key or private session is required for setup, build or the contributor checks. Run `python3 scripts/dev.py check` and `npm run test:shared-schema` before a code PR. See [the full setup](CONTRIBUTING.md) for database tests and troubleshooting.

## Build with us

STRIVE is free and open source. Help with a first-run problem, a card, accessibility, or a clear bug report. [Start contributing](CONTRIBUTING.md) · [First contributions](docs/FIRST-PR.md) · [Product direction](PRODUCT.md) · [Architecture](docs/architecture.md) · [Exploring](docs/ROADMAP.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Get help](SUPPORT.md) · [Report a security issue](SECURITY.md).

The public app is at [striverun.app](https://striverun.app). The [full contributor setup](CONTRIBUTING.md) uses a local static UI; it does not reproduce the hosted account or database. Historical Agent Grinder material is kept in [the technical history](docs/TECHNICAL-HISTORY.md) and [archive](archive/hackathon-2026-09/).

## License and data boundaries

Code terms: [LICENSE](LICENSE). Data, provider responses, media, fonts and other third-party assets may have separate terms. Repository access alone does not grant rights to those materials. 
