# Starter issue drafts

These tasks are drafts, not published GitHub issues or assigned work. Check [open issues](https://github.com/Morkeeth/strive/issues) before starting. Suggested labels are `good first issue` and `help wanted`. Each task comes from a current source gap or an observed workflow problem.

## Preserve comment text when a read fails

Files: `site/social.js`, `scripts/test-comment-flow.mjs`.

A rejected comment write keeps the draft. Investigate the different case where the write succeeds but the following thread read fails. The reader should understand that the save succeeded and have a retry action without accidentally posting twice.

Done when: a browser test rejects the refresh after a successful insert; exactly one row remains; the user sees a clear saved/read-failed state and can retry the read. Keep fixture and hosted evidence distinct.

## Recover when GitHub friends cannot load

Files: `site/people.js`, `server/github-friends.mjs`.

A live browser sweep saw no visible result from the GitHub friends control; the cause was not established. Reproduce loading, empty and failed responses with disposable identities before proposing a repair.

Done when: the control gives a visible loading state and a useful empty/error result, keyboard activation works, and no follow is created without an explicit press for that person. Do not ingest a private contact list or claim the old observation proves a current backend fault.

## Explain the static local shell

Files: `scripts/dev.py`, `CONTRIBUTING.md`.

The serve command names the local URL and says no hosted database is configured. Add a short pointer to striverun.app for people who want to use the hosted product. Keep local setup and hosted account actions clear.

Done when: the printed line names the local URL, local database limitation and hosted address; it works on an alternate port and stays readable in a terminal. No account or secret is needed.
