# First paint and private review — 16 October 2026

Baseline: public main 9187bae. Local candidate only; deployment requires Oscar.

The live public feed first-card insertion was 2277/1075 ms (390 cold/warm), and 1893/1144 ms (1440). FCP was already 272/84 ms and 472/60 ms: header paint is not card fill. These are viewport sizes, without CPU/network throttling. Cold means a fresh browser context, warm the second navigation in that context. These point measurements are not a latency percentile.

The live waterfall is runs → acknowledgements → all saved day choices plus all photo-list reads → first card. Phone cold: runs ended 1087 ms; acks 1271; photo lists began 1273 and the slowest ended 2250; first card at 2277. The desktop cold slowest saved-choice read ended 1881 and the first card followed at 1893. No fetch blocked FCP itself; script/CSS loading and HTML parsing precede it.

The candidate puts useful public copy in the HTML response and queue copy before the account SDK, removes feed/queue boot skeletons, removes the pre-render photo-count batch, shares day-choice promises, and streams cards in activity order after each required saved-choice result. Actual photo reads and author selection checks remain in the existing guarded media mount. No private row or session cache was added.

Same local origin, real public Supabase reads and read-only public photo proxy, baseline files pinned to 9187bae:

| Viewport/cache | Before first card | Candidate first card |
|---|---:|---:|
| 390 cold | 2137 ms | 942 ms |
| 390 warm | 978 ms | 160 ms |
| 1440 cold | 1531 ms | 399 ms |
| 1440 warm | 1123 ms | 171 ms |

An earlier candidate pass measured 565/161 ms phone and 498/186 ms desktop. The variation is recorded, not averaged away. This comparison removes hosted HTML delivery time; it is not a post-deploy claim. Authenticated hosted cold/warm timings were not obtained: owner UI was inspected, but browser tooling exposes no performance API. The private route must still restore the verified profile before reading private runs. Authenticated queue screenshots and privacy journeys use the actual app with disposable TEST DATA and real local REST/RLS.

Queue identity is present before async card rendering: title, run date with year, project, safe recorded repository label, and exact authored story_result lines. An author caption/note is explicitly labelled Author note; no activity-based achievement is invented. Unknown project/repository/results say so. Missing start dates label the creation date Saved, not Run. These lines remain visible when collapsed. The exact real preliminary share card and manual Post/Edit/Discard actions remain below.

Tests: red-before photo-stall and missing-repository/result assertions retained in the external receipt. Green regression covers photo stalls, a later slow card, shared day-read promises, stale generation cancellation, static first paint and queue result text. Full Node gate: 123 pass, 8 inventoried, 0 new failures. Focused regression/queue/day-card/card-system and final build pass. Browser 390/1440: no overflow/page errors/run writes; next/collapse work; switched owner and signed-out show no prior private cards. Screenshots use identical TEST DATA for before/after; hosted owner baseline is separate.

Rollback: revert this presentation/loading commit. No schema, account, audience, capture or domain configuration changes are part of it.
