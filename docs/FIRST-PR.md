# Pick one useful contribution

Anyone can start here. Pick one part you want to improve; no invitation or agent subscription is required. These are available starting points, not assigned work. Open an issue before a larger change so two people do not build it twice.

## Start small: docs, accessibility or a reproducible bug

Try the start guide on your machine. Correct one unclear step or broken link, test the card using only a keyboard, or report a failure with safe reproduction steps. Start in CONTRIBUTING.md, SUPPORT.md or site/index.html. Success: the next person can complete that step without extra help. No database is needed.

## 1. Cursor first-run experience

Start: `site/index.html` (`viewOnboard`, `INSTALL_CMD`), `docs/CURSOR.md`, `agentgrinder/ingest.py`.

Make the path from a fresh clone in Cursor to a private card obvious. Try it with a safe actual Cursor session. Success: a new person produces a card without needing a maintainer to explain the steps. Keep missing timing labelled unknown.

## 2. A card worth sharing

Start: `site/index.html` (`runCard`), `site/sharing.js`, `server/public-run.mjs`.

Improve phone layout and make the project, caption and link to the output easy to understand. Success: someone who did not build the project can tell what the run produced. Keep the white card and blue trace.

## 3. Empty states in a new feed

Start: `site/index.html` (feed, Following and profile views), `site/social.js`.

The hosted app at https://striverun.app is new and its feed is mostly empty. Make the empty feed, empty Following list and empty profile explain what to do next. Success: a first visitor with no follows knows how to post a run or find a person. No database is needed; the local shell shows the same states. More starting points with files and done-when lines: [docs/ISSUES-TO-OPEN.md](ISSUES-TO-OPEN.md).

Use a branch, show the changed path, and open a PR. Small copy/design fixes are welcome without an issue. The bot can implement; the contributor still reviews what it built.
