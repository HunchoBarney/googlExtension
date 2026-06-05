# Release Verification

Last verified: 2026-05-23 02:48 UTC.

## Commands Passed

- `npm test`
- `npm run test:layout`
- `npm run test:polymarket:live`
- `npm run test:articles:live`
- `npm run test:release`

## Live QA Evidence

- Live Polymarket API smoke checked 15/15 endpoint requests and parsed 442 candidates.
- Live article QA processed 8 current readable articles across politics/elections, crypto, economy/markets, AI/technology, geopolitics, sports, entertainment, and weather/climate.
- 6 current articles displayed live parent event matches.
- 2 current articles correctly displayed the no-strong-match state.
- The browser smoke loaded the unpacked extension in Chrome, confirmed pre-activation tab access was blocked, opened the popup through the `_execute_action` browser event, rendered 2 parent event cards, clicked the first parent event card, and opened `https://polymarket.com/event/andy-burnham-out-as-mayor-of-greater-manchester-by-may-31`.
- Browser smoke printed the live article title, local model topic/angle/confidence, model keywords, generated queries, and displayed parent event names.
- `node --test` passed 57/57 tests, including the local model latency budget check.
- Popup layout smoke passed at 390 px and 320 px widths. The latest inspected layout screenshot was `test-artifacts/popup-layout-popup-2026-05-23T02-47-46-048Z.png`.
- The latest inspected real extension popup screenshot was `test-artifacts/browser-smoke-popup-2026-05-23T02-48-12-305Z.png`.
- No live JSON report artifacts were generated.

## Current UX Contract

- The popup displays parent event cards only.
- Child markets are used for scoring, filtering, and related-market counts, but they are not shown as popup dropdowns or separate result cards.
- Parent event cards link to Polymarket event pages, where Polymarket displays the related markets under the topic.
- Outcome display is option-agnostic. Yes/No markets render Yes and No, sports/team markets keep team names, and multi-option markets keep the original Polymarket option names.
- Missing outcome prices render as `n/a`, not `0%`.
- The visible YAKE/TextRank/PageRank strategy selector has been removed; the popup uses the local article-angle model path.

## Current Known Issues

- Live relevance still needs human review during release checks. The automated threshold can prove that matches are live and structurally valid, but not that every candidate is editorially ideal.
- Some publishers can change markup, block automation, or show different content in browser versus RSS fetches. Any extraction failure or mismatch should be saved as a regression fixture.
- The local model is intentionally small and transparent. It should stay JSON-based unless fixture and live QA data show that a heavier local model materially improves precision without popup latency or size problems.
