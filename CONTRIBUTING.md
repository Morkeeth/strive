# Contributing to STRIVE

Welcome. Help us make a small, useful place to share agent runs. You can contribute code, design, docs, translations, accessibility checks, testing or a clear bug report. Cursor and Grok Bot are supported development paths; neither is required.

## Choose a contribution

Read [PRODUCT.md](PRODUCT.md) for the scope. Then pick a [first contribution](docs/FIRST-PR.md) or check [open issues](https://github.com/Morkeeth/strive/issues).

A typo, broken link or small fix can go straight to a PR. For a feature or larger change, open an issue describing the user problem and intended result before doing substantial work. Comment when you start an existing issue so others can coordinate. A comment signals intent; it does not reserve the task indefinitely.

You do not need to understand the whole repository. Start with one visible improvement. [Get help](SUPPORT.md) whenever instructions or behaviour are unclear.

## Set up your copy

Use GitHub’s **Fork** button to create your own copy, then clone it. Replace `YOUR-HANDLE` with your GitHub username:

```sh
git clone https://github.com/YOUR-HANDLE/strive.git
cd strive
git remote add upstream https://github.com/Morkeeth/strive.git
git switch -c improve-run-card
```

If you already have repository write access, clone the main repository and create a branch there instead. Never commit directly to `main` for a contribution.

Python 3.9+ is required; Node 22 runs the JavaScript checks. On Windows, use `py -3` if `python3` is unavailable.

```sh
python3 scripts/dev.py setup
npm ci
python3 scripts/dev.py serve
```

Open http://127.0.0.1:8000. `setup` installs test dependencies in `.venv`; it does not alter global Python. `serve` needs only Python. Use `python3 scripts/dev.py serve --port 8001` if port 8000 is busy. Stop it with Ctrl+C. Capture prints a preview link; the CLI opens a browser only with `--open`. Set `AGENTGRINDER_URL=http://localhost:8000` to target this static UI. A preview is not a database save. `npm ci` installs the website and disposable-test dependencies from the lockfile.

This local server is the UI with no database behind it. The hosted app at https://striverun.app has sign-in, posting and replies; a local checkout does not connect to it. You can work on layouts, docs, local capture and tests now. To test sign-in, posting and replies locally you need your own database, set up as described below. The inherited coaching fixture at `/?example` is development material, outside the product’s main flow.

The same-release capture archive linked by https://striverun.app/agents.md is for running the CLI and companion. It does not include the full website, `scripts/dev.py`, or backend test harness. Clone the full repository for contributor work.

## Work in Cursor

Open the repo folder. The project rule points Cursor to these instructions. No MCP setup is required to edit the app. Enable **agentgrinder** under Customize only if you want local session tools; see [Cursor details](docs/CURSOR.md).

A useful task prompt:

```text
Read AGENTS.md, PRODUCT.md and CONTRIBUTING.md. Inspect the implementation for the issue I selected. Make one complete improvement, keep the app minimal, run the relevant checks and show the changed path in a browser. Tell me what still needs manual verification.
```

## Work with Grok Bot

Give the bot your fork or branch, the selected issue and [docs/GROK-BOT.md](docs/GROK-BOT.md). The user-facing [STRIVE companion](templates/grokbot/INSTALL.md) is one skill for capture and management; installing it alone does not provision development access. Ask it to make a PR with a short explanation and screenshots for UI work. It can use the same terminal commands as a person.

Its cloud computer does not have your laptop’s sessions. Use safe sample data or explicitly provided exports. Do not grant production access merely to work on the UI.

You are responsible for the contribution even when an agent writes it. Read the diff, check the result and correct unsupported claims. Mention material agent assistance in the PR’s testing notes when it helps reviewers understand what was or was not checked.

## Check the change

```sh
python3 scripts/dev.py check
```

This runs targeted Cursor-reader tests, MCP launch/onboarding checks and JavaScript syntax checks. It does not test every inherited feature or prove hosted behaviour. Add or run focused tests when you change behaviour; documentation-only changes need working links and accurate commands, not unrelated test runs.

For capture, photo, feedback or database changes, install Node 22 dependencies with `npm ci`, then run the relevant focused checks. For example:

```sh
npm run test:launch
node scripts/test-grok-native-admission.mjs
node scripts/test-feedback-notifications.mjs
```

These use disposable or mocked services; they do not prove a hosted deployment. Never point test users or synthetic records at production.

For UI changes, open the changed path at desktop and phone widths. Check keyboard access, readable text, loading/empty/error states and the action the user came to complete. For social or privacy changes, test the relevant access rules using disposable data.

Do not commit local transcripts, generated personal cards, credentials or private notes. Label fixtures. Missing measurements stay unknown. No invented users, engagement or shipped-work claims.

## Send a pull request

Review `git diff` and `git status`. Stage the files you intend to contribute, commit them with a short description, then:

```sh
git push -u origin improve-run-card
```

Open a PR from your branch to `Morkeeth/strive:main`. Use the template: describe the user-visible change, link the issue if any, show UI screenshots and state exactly what you tested. List missing checks or required setup.

Keep the PR focused. If review asks for changes, push to the same branch. A maintainer reviews before merging. Reviews have no guaranteed response time; keep follow-ups on the PR so the context stays together. See [maintainer guidelines](docs/MAINTAINING.md).

## Code map

- `site/index.html`: layout, routes, onboarding and run cards.
- `site/social.js`, `site/sharing.js`, `site/progress.js`: social actions, sharing and run history.
- `agentgrinder/ingest.py`, `agentgrinder/mcp_server.py`: local capture and agent tools.
- `server/public-run.mjs`: public link previews.
- `scripts/dev.py`: contributor commands.
- `PRODUCT.md`: agreed scope. Old hackathon checklists are historical, not the backlog.

## Separate website, shared database project

The production website is a separate Vercel project (https://striverun.app). It shares the existing Supabase project using only a dedicated `strava` schema and shared Auth. For local end-to-end checks, `node scripts/disposable-supabase.mjs --serve` starts an isolated disposable database with labelled test data; the `scripts/check-*.py` walks use it. There is no command that provisions a hosted project of your own. Follow [release setup](docs/PUBLIC-RELEASE-SETUP.md); do not apply the inherited public-schema migration command to that project. Generate and review the Strava bootstrap with `python3 scripts/prepare-strava-database.py`. Read `server/runtime-config.mjs` and [release setup](docs/PUBLIC-RELEASE-SETUP.md) for environment configuration. Do not paste credentials into checked-in browser constants or public configuration. CLI/MCP clients accept `AGENTGRINDER_URL`, `AGENTGRINDER_SUPABASE_URL` and `AGENTGRINDER_SUPABASE_ANON_KEY`.

The checked-in `local-development-only` key is not a working credential. Do not reuse the hackathon database, accounts or deployment. A maintainer coordinates production configuration and releases. Do not publish a development database or test users as real adoption.

## Feedback and sensitive reports

The signed-in [feedback form](https://striverun.app/?feedback) is for private product feedback. Saving the message and notifying a maintainer are separate outcomes. Public implementation discussion belongs in issues or PRs. Do not attach private transcripts to either surface. Read [SECURITY.md](SECURITY.md) before reporting a vulnerability; do not assume GitHub has private reporting enabled.

## Working together

Be kind, specific and respectful. Critique the change, not the person. Welcome questions and first-time contributors. No harassment, discrimination, spam or publication of another person’s private information. Maintainers may edit or remove harmful content and limit participation when needed.

Keep existing attribution. Contributions must be yours to share and are distributed under this project’s [MIT license](LICENSE).
