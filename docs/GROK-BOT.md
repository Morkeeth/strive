# Grok Bot · capture work from the bot’s computer

Use Agentic Strava as a post-run step for the project Grok Bot is already building. The export
must be a JSONL file explicitly selected on that bot’s computer. A bot cannot read a session from
the owner’s laptop, and the capture flow must never guess private paths.

## Install the post-run source kit

Clone or update the capture tool on the bot’s computer, separate from the project being built:

```sh
git clone https://github.com/Morkeeth/strive.git ~/.agentgrinder/strive
cd ~/.agentgrinder/strive
```

Install the complete `templates/grokbot/post-agent-run/` directory through the current Grok Bot
skill interface. Keep `SKILL.md` and `scripts/preview.py` together. This repository contains
source, not a verified marketplace or one-click installation.

First verify the helper with labelled sample bot activity:

```sh
python3 templates/grokbot/post-agent-run/scripts/preview.py \
  samples/sample_grokbot_bot_activity.jsonl
```

The sample is visibly labelled **SAMPLE** / **bot activity** and cannot be saved or posted.
Running it proves only that this checkout’s source works.

## Select one real export and open the hosted private preview

Ask the owner to identify the exact JSONL export already present on this bot’s computer. Then run:

```sh
cd ~/.agentgrinder/strive
python3 templates/grokbot/post-agent-run/scripts/preview.py \
  /exact/path/to/selected-grokbot-export.jsonl \
  --base-url https://striverun.app
```

The output repeats `selected_export`, says that the latest sitting in that selected export was
used, prints allowlisted metrics, and returns a private `#import` URL on the hosted origin. The
helper makes no network request and does not post or save anything. Open that URL for the owner.

Review the white card and blue trace. Grok Bot runs remain labelled **bot activity**. This export
format does not establish elapsed duration, native file writes, completed commits or other
unsupported measurements, so those fields remain unknown. Shell requests do not prove that a
commit succeeded.

The owner supplies public-facing title, caption and optional HTTPS output link, checks the
signed-in account and destination, deliberately chooses **Only me**, **Followers and close friends**, or
**Public feed and profile**, and only then presses **Save run**. Never auto-publish, select an
audience, or perform engagement for the owner.

For local-only kit development, omit `--base-url`, run `python3 scripts/dev.py serve`, and use the
localhost URL. Normal capture should use the exact hosted-origin command above. Never point the
helper at the separate hackathon service.

Keep the evidence states separate:

- **Source available:** this repository contains the kit.
- **Installed:** a second bot was observed invoking its installed copy.
- **Used:** that bot previewed its explicitly selected real export.
- **Published:** the owner deliberately saved an approved run to an approved audience.

Only source availability is established by this repository. Samples do not establish installation,
real use, publication, two-person use or hosted OAuth verification.

## Separate workflow: contribute code to Agentic Strava

Cloning Agentic Strava as the active workspace is for contributors, not for capturing ordinary
work. When the owner explicitly wants a contribution, give Grok Bot the selected issue and ask it
to read `AGENTS.md`, `PRODUCT.md`, `CONTRIBUTING.md` and `docs/FIRST-PR.md`; inspect first, keep the
change bounded, run `python3 scripts/dev.py check`, browser-check the changed path and open a
reviewed PR. Do not deploy, alter production data or post publicly.

Cursor documents Grok Bot as a persistent cloud computer with terminal, filesystem and browser:
[Grok Bot overview](https://prod.cursor.com/docs/grok-bot), checked 14 September 2026.
