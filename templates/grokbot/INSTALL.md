# One STRIVE companion

The canonical skill is [strive-companion](post-agent-run/SKILL.md), served at https://striverun.app/capture/grok/SKILL.md. It records real runs, discusses results and improvements, helps with photos and descriptions, collects product feedback, and supports owner-requested interactions with friends. Text only. The historical folder name `post-agent-run` remains for script compatibility; `manage-strive` is only an alias, not a second job or bot.

Read https://striverun.app/agents.md for the exact same-release source archive and SHA-256. Verify the archive, then update the existing companion's complete `post-agent-run` directory, including `references`, `scripts` and `samples`. Its skill name is `strive-companion`. Remove duplicate legacy skill registrations after preserving any owner-authored instructions. Never place transcripts or credentials in the installed skill folder.

Run `scripts/test_contract.py`, `scripts/test_native.py` and `scripts/smoke_test.py` with Python 3 from that directory. These are local synthetic checks, not evidence of a real saved run. Capture helpers need no third-party Python packages.

Ask the companion to record its own current session. It should acquire bounded exact records through supported `ReadTranscript`, prepare the private preview and preserve the full link locally. Read `references/CAPTURE.md` for source bounds and unknown measurements. Only when native access is absent should it ask for an explicit export. The sample cannot be saved.

Private save requires authorization and either the owner's signed-in website or a Connect upload token stored in the supported secret field. Description, photos, friends, replies and feedback use the actual signed-in website controls. No management API or browser capability is supplied by installing this kit. Check the real saved run after reload, then add selected photos and deliberately choose its audience. Installation, preview, private save and public sharing are separate outcomes.
