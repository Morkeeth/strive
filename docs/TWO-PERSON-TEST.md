# Two-person live test

Use this checklist for Oscar and one consenting friend on
[agentic-strava.vercel.app](https://striverun.app). This is a product acceptance walk,
not permission to message someone or publish their session. Agree on the participant, session and
audience before starting.

## Prepare

- [ ] Both people consent to the test and use separate accounts they control.
- [ ] Each person selects a safe real agent session. Remove credentials, private prompts, personal
      data and confidential output before importing it.
- [ ] Each person privately previews the complete card and checks the title, caption, output link,
      project name and every displayed measurement. Leave unsupported measurements unknown.
- [ ] Choose deliberately whether the run is public or link-only. Do not use private sessions to
      make the social path pass.
- [ ] Keep sessions separate. On a shared device, sign out fully between accounts or use separate
      browser profiles; do not share login links, cookies or credentials.

## Walk the loop

Run the following once with Oscar as Person A and the friend as Person B, then swap roles:

- [ ] Person A signs in on the live URL and confirms the Auth redirect returns to STRIVE
      with the private draft intact.
- [ ] Person A saves the reviewed run with a clear caption and, when safe and available, an HTTPS
      link to what was built.
- [ ] Person B opens the run and Person A's profile, then follows Person A.
- [ ] Person B adds an ACK and a specific reply to the run.
- [ ] Person A returns through **Responses**, opens the exact run and sees the ACK/reply in the
      correct conversation.
- [ ] Person A can open Person B's profile and see the expected Following state.

Both people should complete the post → follow → ACK/reply → Responses return path. Do not count a
local fixture, sample card, owner-only walkthrough or health check as completion.

## Record friction

For each attempt, record only:

- date, device/browser and which role was being tested;
- the step reached and whether it passed or failed;
- the exact confusing copy, unexpected state or reproducible error;
- whether retrying was necessary and what changed;
- a redacted screenshot or run URL only when both people approve sharing it.

Do not copy session contents, login links, credentials or personal data into an issue. Do not
invent timing, engagement or success metrics. Report observed facts separately as live, tested and
used, and list any step that was not completed.
