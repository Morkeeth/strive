# Get help

Questions and reports are welcome, including “the start guide did not work for me.” You do not need to solve the problem before asking.

## Where to ask

- **Private product feedback:** use the signed-in [feedback form](https://striverun.app/?feedback). A stored message and a delivered maintainer notification are separate outcomes.
- **Setup, contribution or usage question:** [open a help request](https://github.com/Morkeeth/strive/issues/new?template=help.md).
- **Broken behaviour:** [report a bug](https://github.com/Morkeeth/strive/issues/new?template=bug.md).
- **Feature or design idea:** [propose an improvement](https://github.com/Morkeeth/strive/issues/new?template=improvement.md).
- **A change already under review:** comment on its PR so the discussion stays with the code.

Search existing issues first. If yours matches, add useful new details rather than opening a duplicate. Support is community-based; there is no promised response time.

## What helps us help

Tell us what you tried, the command or click that failed, what you expected and what happened. Include your OS, Python/Node versions and the commit if relevant. If Cursor or Grok Bot is involved, say which one and whether it runs locally or in the cloud.

A short, redacted error or screenshot is enough. Never paste API keys, sign-in links, session tokens or private transcripts into an issue. For a potentially sensitive security problem, follow [SECURITY.md](SECURITY.md). Request a private reporting channel without publishing exploit details or affected private data.

## Common first-run problems

- **`python3` not found:** install Python 3.9+; on Windows try `py -3`.
- **Port 8000 is busy:** run `python3 scripts/dev.py serve --port 8001` and open that port.
- **“Run setup first”:** run `python3 scripts/dev.py setup` from your checkout, then retry `check`.
- **JavaScript checks not run:** install Node 22 and retry `python3 scripts/dev.py check`.
- **No Cursor session found:** the reader needs a supported session on the machine where it runs. A cloud bot cannot see your laptop’s files. Report a redacted format mismatch; do not attach the full session.
- **Sign-in or feed does not work locally:** a local checkout is not connected to a database. Use the hosted app at https://striverun.app, or set up your own database as described in CONTRIBUTING.

If a missing instruction caused the problem, a small documentation PR is a useful contribution too.
