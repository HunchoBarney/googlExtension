# Release Verification

Last verified: 2026-08-22 00:41 UTC.

Release status: `0.1.0` direct-install pre-alpha candidate.

## Commands Passed

- `npm ci` — 42 packages audited, 0 vulnerabilities.
- `npm test` — 171/171 tests passed.
- `npm run test:layout` — popup, compact, 390 px, and 320 px layouts passed.
- `npm run test:live` — public endpoint and current-article QA passed.
- `npm run test:browser` — source extension chart and interaction flows passed.
- `node scripts/browser-smoke.js --verify-kline --extension-path="dist/pmex-market-matcher-0.1.0-extension"` — packaged chart flow passed.
- `node scripts/browser-smoke.js --verify-interactions --verify-expanded --skip-clicks --extension-path="dist/pmex-market-matcher-0.1.0-extension"` — packaged interaction flow passed.
- `npm audit --audit-level=high` — 0 vulnerabilities.
- `npm run package:release` — clean extension/source folders, ZIPs, and SHA-256 checksums generated.

## Live QA Evidence

- Polymarket smoke checked 10/10 public endpoint requests and parsed 447 candidates.
- Article QA processed eight current readable articles across politics/elections, crypto, economy/markets, AI/technology, geopolitics, sports, entertainment, and weather/climate.
- Five articles displayed live parent-event matches; three displayed the no-strong-match state.
- Chrome blocked active-tab access before manual activation, then opened the Manifest V3 popup through the extension action.
- The live chart gate opened a current Polymarket market and verified KLineCharts was ready with 729 real history points and six canvas layers.
- Trending, manual search, refresh, data-use disclosure, and anchored popup interaction checks passed in both the source extension and packaged artifact.
- The packaged extension loaded from `dist/pmex-market-matcher-0.1.0-extension`, not from the working source tree.

## Release Contract

- The extension is read-only: it does not connect wallets, hold credentials, submit orders, or execute trades.
- Article content is analyzed locally. The article title and derived search terms are sent to Polymarket; public market-data requests are sent to Polymarket and Hyperliquid.
- Trade views use public venue history and WebSocket updates. Missing venue data renders unavailable instead of synthetic quotes, charts, tickets, or books.
- Release archives are generated from explicit allowlists. Internal design artifacts, generated screenshots, development dependencies, and the removed TradingView bundle are excluded.
- `dist/SHA256SUMS.txt` is the canonical checksum file for the generated ZIPs.

## Distribution Constraint

This build is prepared for source release and direct developer-mode installation. It is not a Chrome Web Store candidate: the Chrome Web Store policy update enforced from August 1, 2026 prohibits products that facilitate or promote real-money prediction markets. See the official [regulated goods and services policy](https://developer.chrome.com/docs/webstore/program-policies/regulated-goods-and-services/) and [2026 policy update](https://developer.chrome.com/blog/cws-policy-updates-2026).

## Known Issues

- Relevance remains pre-alpha. During this run, the local classifier mislabeled a BBC budget article as sports, and the AI/technology sample produced a loosely related drone market. Automated checks prove live and structurally valid results, not editorially ideal matches.
- Live QA depends on third-party APIs, WebSockets, publisher markup, and current market inventory. A future failure may reflect upstream availability rather than a packaged-code regression.
- Direct installation requires Chrome developer mode and manual loading of the unpacked extension folder.
- PMEx is unofficial and is not affiliated with, endorsed by, or sponsored by Polymarket or Hyperliquid.
