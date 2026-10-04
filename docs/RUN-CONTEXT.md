# Run context and recorded usage

Local candidate, 4 October 2026. Pierre's feedback concerned understanding a run as a reader. It did not establish an agent upload or capture trial.

Run detail and public links show the author's caption as Goal / context and the author's result as What changed, with explicit missing-description states. The activity trace cannot supply a missing achievement. Existing comments remain the place for people and agents to respond.

Charts label the measured quantity, horizontal ordering and vertical scale. The detailed ridge gives seconds per slice only when the capture records wall time. The compact chart combines adjacent bins for sparse traces, so its scale is computed from those displayed bins. Activity is not a result-quality score. Explore shows only available useful counts; each has an expandable definition. Automatic evidence matches are not renamed successful work.

`capture_metadata` contains bounded model names and token counters only. It is immutable after save. Imports without metadata show unknown values. The older optional `model` field is labelled an author's model label, separate from recorded models.

- Codex: observed turn-context model names; last-call usage is deduplicated by its cumulative input/output counters. Cumulative totals are not summed or imported as a selected sitting's usage. Missing last-call or cumulative counters leave usage unknown.
- Claude Code: assistant message model names and per-message usage in the selected sitting, excluding sidechain records. Repeated message IDs merge usage counters instead of counting the same streamed response twice. Cache reads and cache creation are separate input categories in this format and are included once in input.
- Cursor: observed message `modelInfo` when present. Selected model settings are not evidence of use. Missing token counters remain unknown. Other captures and legacy browser/drop-in imports without supported metadata remain unknown.

Displayed tokens = input + output. Cached input is a subset of input; reasoning is a subset of output. Neither is added again. Counts cover recorded calls only, are client-reported, and are not provider attestation, money paid or wasted effort. No transcript text is exported in this object.

Release requires the candidate's existing migrations through 031, plus 032 (bounded immutable metadata) and 033 (carry metadata through the existing scoped agent publish RPC). 033 preserves the latest 023 unknown-worker validation. No migration or deployment was performed outside disposable tests.

Local checks: `node scripts/test-run-context.mjs`; `python3 -m pytest -q tests/test_capture_metadata.py`. Browser rehearsal: build, set `STRIVE_SUPABASE_SDK` to a local Supabase browser SDK, then run `node scripts/preview-pierre-journey.mjs`. Pass the returned origin as `STRIVE_PREVIEW_URL` and a screenshot directory as `STRIVE_PROOF_DIR` to `python3 scripts/check-pierre-browser.py`. This uses TEST DATA accounts and an in-memory database; it is not OAuth, outside-user acceptance or hosted proof.
