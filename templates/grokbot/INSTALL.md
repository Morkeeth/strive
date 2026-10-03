# Use the STRIVE companion once, or keep it

The canonical [strive-companion](https://striverun.app/capture/grok/SKILL.md) records real runs, discusses results, helps with photos and descriptions, gathers approved feedback and supports owner-requested interactions with friends. Use text, not voice.

## One-time use: no installation

Read https://striverun.app/agents.md and its linked SKILL.md. Download the exact same-release archive, verify its stated SHA-256, inspect it and extract it to a separate local folder. Keep `templates/grokbot/post-agent-run/` complete, including references, scripts and samples. Python 3 helpers need no third-party packages, pip install, CLI installation or skill write.

Read `references/CAPTURE.md` before collecting source. Choose projection for the observed agent-ID/page-envelope interface; choose native only with an actual session identity and exact records. Use supported own-conversation access first, an explicitly selected export if that access is absent. Never invent identity or source. Run `scripts/preview.py` with the actual mode, source and frozen bounds. Preview stays local and needs no token. Samples cannot be saved.

The bundled contract, native, projection and smoke tests exercise synthetic data locally, not a real saved run.

## Optional reusable companion

Only if the owner wants persistence, use the client's supported skill-save action, if actually available. Read the canonical SKILL.md frontmatter for its name (`strive-companion`) and description. The reviewed Grok client invokes saved skills through `/` or `@`; no separate import button or installation API has been established. If your client lacks skill saving, continue one-time use and state that limit.

Keep one existing companion. Preserve owner-authored instructions when updating it; do not automatically delete other skills. The historical `post-agent-run` directory is retained for helper compatibility, and `manage-strive` is an alias. Saving instructions does not supply Python files: obtain the verified complete kit when needed. Never store transcripts or credentials in the skill folder.

## Preview, save and share are separate

A token is optional. An authorized owner can open the preview and save through their signed-in website. Separately authorized private agent upload uses a Connect token in the supported secret environment and the bundled upload helper. Installing or saving a skill grants neither browser access nor account authorization.

Descriptions, photos, friends, replies and feedback use actual signed-in website controls. Check the saved run and audience after reload. Public sharing requires the owner's deliberate choice. No guessed management API is supplied by this kit.
