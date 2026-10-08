# STRIVE

**Your work, in good company.**

Your real agent session, a run map, a photo and the story behind the work. Save it privately, choose who sees it, and follow what your friends are building. Free to use, with no model API key required for capture.

**[Open STRIVE](https://striverun.app)** · [Give feedback](https://striverun.app/?feedback) · [Contribute](CONTRIBUTING.md)

## Your first run

1. Open **https://striverun.app**. Give that same link to your Cursor agent or your STRIVE Grok companion and ask it to prepare a private preview of its own recorded session. [Agent instructions](https://striverun.app/agents.md) identify the capture package and SHA-256 for the website release.
2. Confirm the project, session and selected portion. The agent reads supported records on its own computer. It cannot reach sessions on another machine simply because you gave it a link. If access or a format is unsupported, it must say so. Sample data is for trying the parser, not posting as your work.
3. Open the preview. Sign in using a provider offered by the site, choose your name and handle, and check that this is your account. Review the measured facts, then add your story and optional images. Select at most one personal photo plus supporting screenshots or results.
4. Choose your audience: **Only me** is the default. **Close friends**, **Followers** and **Public** are deliberate choices. When you save with images, the run stays private until the images finish saving. Follow a friend, give XUDOS or reply, and come back to see what they made next.

Measurements stay bound to their captured source; titles, descriptions, photos and audience are yours to manage. Tool calls are activity, not a score for quality or proof the task succeeded. Unknown timing, human turns or worker counts must stay unknown. Local preview, saved run and public sharing are separate actions.

### One companion, not another bot

The [STRIVE companion](templates/grokbot/INSTALL.md) handles capture, discussion, descriptions, photo guidance, feedback and owner-requested social actions. Update the existing companion; do not create separate capture and management bots. The historical `post-agent-run` folder contains the canonical `strive-companion` skill; `manage-strive` is a compatibility pointer.

Use the complete same-release kit linked by **https://striverun.app/agents.md**, including references, scripts and samples. Installation supplies instructions and capture helpers, not access to a browser, another person's files or an account. Native Grok access depends on the environment's actual transcript capability. A Connect token enables separately authorized private uploads; do not paste it into a prompt or public issue. [Capture details](templates/grokbot/post-agent-run/references/CAPTURE.md).

The repository can be ahead of the website or the installed companion. Check the release metadata and observed result before claiming a new feature is live. X/email sign-in and Origin connections depend on deployment configuration; Origin is not a consumer sign-in provider here.

### Native Cursor and Claude Code plugins

[Install STRIVE from source](plugins/strive/README.md) to select real sessions across named projects, review the cards together, and save privately. Run `python3 scripts/strive-plugin.py install cursor` or `python3 scripts/strive-plugin.py install claude` from this checkout, restart the client, then select its STRIVE skill (Claude Code: `/strive:strive`). These are native plugin packages with optional project-scoped completion hooks; they are not marketplace listings. Capture stays local. Private saving requires your separate review, and sharing stays a deliberate choice in STRIVE.

For a measured Code Route, [start a consented capture before new work](plugins/strive/README.md#record-a-new-code-route). Record checkpoints after edits and commits, then review their source references and observation order. Existing runs are unchanged; no activity is guessed from a tool-call total.

## Photos, privacy and feedback

Photos use the saved run's audience. The server resizes supported still images and removes embedded metadata from the uploaded derivative. Review what is visible in the picture too: removing metadata does not hide people, screens or addresses. Removing access cannot retract a copy somebody already saved. [Photo and deletion details](docs/RUN-PHOTOS.md) · [Privacy](PRIVACY.md).

[Send feedback](https://striverun.app/?feedback) from the signed-in app when something feels wrong or an idea would help. Include the action, expected result and what happened. Feedback is stored in a private app table, not posted to the feed. A maintainer notification is a separate best-effort delivery step that needs a configured destination; a saved message does not prove a ping arrived. Never include credentials, raw transcripts or confidential source code.

Use [GitHub issues](https://github.com/Morkeeth/strive/issues) for public bugs, ideas and contribution discussions. For sensitive problems, read [SECURITY.md](SECURITY.md) before sending details.

## Contribute

Design, accessibility, clear writing, testing and small bug fixes all help. You do not need a paid AI tool or previous open-source experience. [Start here](CONTRIBUTING.md), read the [product direction](PRODUCT.md), and check existing issues before starting larger work.

For the full contributor checkout, use Python 3.9+ and Node 22:

```sh
git clone https://github.com/Morkeeth/strive.git
cd strive
python3 scripts/dev.py setup
npm ci
python3 scripts/dev.py serve
```

Open **http://127.0.0.1:8000** for a static UI preview. It has no local API or database; it is not a sign-in or photo-upload test. Run the focused contributor checks with:

```sh
python3 scripts/dev.py check
```

The same-release download at `/agents.md` is a small capture source package. It includes the Python CLI and companion helpers, not the full website, contributor scripts or backend tests. Use the full repository for contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for disposable database checks and deployment boundaries.

## Scope and history

The core is **capture → private preview → save → share → respond → return**. Real sessions and real images lead. Coaching is planned, not a live promise. Posting and browsing do not require paid inference.

This public product grew from [the separate Agent Grinder hackathon repository](https://github.com/Morkeeth/agentgrinder). Internal `agentgrinder` package names and the `strava` database schema remain for compatibility. Material under `archive/hackathon-2026-09/` describes that history, not the current service.

[MIT license](LICENSE). Contributions use the same license. [Support](SUPPORT.md) · [Security reporting](SECURITY.md).
