# Capture and integrations

STRIVE reads a recorded agent session on the machine where that session exists. The local capture creates a private preview. Saving a run, adding photos, changing audience and posting a public link are separate choices.

The current website release publishes its matching capture package and SHA-256 at [striverun.app/agents.md](https://striverun.app/agents.md). Use that release's instructions: a repository checkout can be ahead of the website. Confirm the project, session and selected portion before importing. If a format or source is unsupported, leave its measurements unknown; do not post sample data as your work.

## Where to start

- **With a coding agent:** give it [striverun.app](https://striverun.app) and ask it to prepare a private preview from a recorded sitting on its own computer. It cannot read sessions on another machine from a link.
- **With an export:** use [Add a run](https://striverun.app/?post) to select a supported local export. The file is read on your device for preview; nothing is saved until you choose to save.
- **With the STRIVE companion:** [install the one companion](../templates/grokbot/INSTALL.md) for capture, discussion, photo guidance, feedback and owner-requested social actions. Its access depends on its actual environment. The historical `post-agent-run` folder contains the canonical `strive-companion` skill; `manage-strive` is a compatibility pointer. A Connect token, if used, belongs in supported secret storage, never in a prompt or public issue.
- **With native editor plugins:** [Cursor and Claude Code source plugins](../plugins/strive/README.md) can select sessions across named projects and prepare cards. Install from the checkout and restart the client. They are source packages, not marketplace listings. Project completion hooks are optional and local. A new Code Route requires [consented capture before work](../plugins/strive/README.md#record-a-new-code-route); it cannot be inferred from old totals.

The same-release archive contains the capture CLI and companion helpers. It does not include the full website, contributor scripts or backend tests. [Contributing](../CONTRIBUTING.md) covers the full checkout and local test boundaries.

## What a run can say

Measured facts stay bound to their source. Tool calls show activity, not work quality or a completed task. Timing, human turns and worker counts remain unknown when the recording does not support them. You control the title, description, screenshots, one optional personal photo and audience. A saved private run is distinct from a public share.

Image uploads are resized and stripped of embedded metadata, but visible people, screens and addresses remain visible. [Photos and deletion](RUN-PHOTOS.md) · [Privacy](../PRIVACY.md).

For product feedback, use the signed-in [feedback form](https://striverun.app/?feedback). Its private database save and any maintainer notification are separate outcomes. For public bugs use [issues](https://github.com/Morkeeth/strive/issues); for sensitive problems use [private vulnerability reporting](../SECURITY.md). Do not attach raw transcripts or credentials.
