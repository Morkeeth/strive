# Security

## Report a sensitive problem

Do not put exploit details, credentials, sign-in links, tokens, private photos or session contents in a public issue or pull request.

GitHub private vulnerability reporting was **not enabled** for this repository when checked on 3 October 2026. No dedicated security email or response-time guarantee is published here. Do not assume an unlisted GitHub URL is a private reporting channel.

Use the signed-in [STRIVE feedback form](https://striverun.app/?feedback) to request a private reporting route. At this stage send only a short description of the affected feature and a request for secure contact, without the exploit, another person's data or a secret. The feedback message is stored for the operator; a notification is separate and may fail. This is not an encrypted security inbox or a guaranteed response channel.

If feedback is unavailable, a [public issue](https://github.com/Morkeeth/strive/issues) may ask only how to make a private report. Wait for the maintainer to establish an appropriate private channel before providing sensitive details. Once provided, include the affected version, safe reproduction steps, impact and a minimal redacted example. Do not test against other users' records.

## Boundaries to preserve

- Local capture and preview do not authorize upload. Saving privately, adding photos, changing audience and social actions each follow the owner's intent.
- App data uses the `strava` schema. Authentication is shared with a separate service; do not change shared Auth triggers or public-schema data as an app repair.
- Database policies and server checks restrict private run and photo access. This is access control, not end-to-end encryption. Operators with server/database privileges have additional access.
- Connect tokens belong in supported secret storage, never in chat, URLs or a committed file. Revoke compromised access through the app's Connections controls.
- Capture hashes identify the imported object. They do not prove a local transcript is authentic or that a task succeeded.
- The photo service removes metadata from its re-encoded derivative; visible private information is still visible. Revocation cannot remove copies previously saved by a reader.
- Feedback content stays in the operator's app database. Configured notifications carry a reference, category and private inbox link, not the feedback text. Private feedback is not a place to put credentials or exploit payloads.

No independent security certification or complete penetration test is claimed. Local tests, configured controls and observed hosted behavior are different evidence. See [privacy](PRIVACY.md), [photo safeguards](docs/RUN-PHOTOS.md) and [feedback delivery](docs/FEEDBACK-NOTIFICATIONS.md).

## For contributors

Use disposable data and the focused privacy tests before proposing access-control changes. Preserve owner/stranger denial, audience revocation, private-first save, token scope, immutable source facts and metadata stripping. Include the command and result in the PR, with no private payloads. Never weaken a denial to make a demo pass. Deployment and credential configuration belong to the maintainer.
