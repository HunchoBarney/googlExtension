# PMEx Market Matcher

PMEx Market Matcher is an unofficial, read-only Chrome/Chromium extension that matches the article you are reading to public Polymarket and Hyperliquid market data. It runs only after toolbar activation and does not connect a wallet or submit orders.

## Release status

This project is a pre-alpha research companion, not a trading client or financial adviser. Its market view shows live public order-book depth and smooth line history, then lets users refresh data or open the corresponding venue in a normal browser tab. It has no amount field, wallet connection, signing, submission, cancellation, fill tracking, or builder fees.

The Chrome Web Store currently prohibits products that facilitate or promote real-money prediction markets. PMEx is therefore prepared for open-source and direct developer-mode distribution, not submitted as a Chrome Web Store listing. A future store release would require a materially different, non-real-money product and a fresh policy review.

This project is not affiliated with, endorsed by, or sponsored by Polymarket or Hyperliquid.

## Privacy

Article extraction, classification, and ranking happen locally. The article title and derived search terms can be sent to Polymarket's public API; public market-data requests go to Polymarket and Hyperliquid. The full data flow, retention behavior, and permissions are documented in [PRIVACY.md](PRIVACY.md).

## Install a tagged release

1. Download and extract the `pmex-market-matcher-<version>-extension.zip` release asset.
2. Open `chrome://extensions` in Chrome or Chromium.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted extension directory.
5. Open a readable article and activate PMEx from the toolbar.

Direct-install users should download only from this project's official release page and verify the published SHA-256 checksum.

## Development

Install dependencies and run deterministic tests:

```sh
npm ci
npm test
npm run test:layout
```

Additional live verification:

```sh
npm run test:polymarket:live
npm run test:articles:live
npm run test:browser
```

The live checks use current articles and public venue APIs, so they remain separate from deterministic CI. The browser smoke loads the production extension in Chrome, confirms it cannot read a page before activation, exercises search and navigation, and verifies live venue depth and a locally packaged KLineCharts canvas when a matched market is available.

KLineCharts 10.0.1 is packaged locally under Apache-2.0. Polymarket uses real CLOB price history for the selected outcome; Hyperliquid uses real candle closes for the selected asset. Missing history or depth is displayed as unavailable instead of being replaced with synthetic market facts.

## Build release artifacts

```sh
npm run package:release
```

The command creates two allowlisted artifacts under `dist/`:

- `pmex-market-matcher-<version>-extension.zip` contains only runtime files needed by Chrome.
- `pmex-market-matcher-<version>-source.zip` is a clean public-source snapshot without internal research, generated output, dependencies, or legacy chart files.

Release verification evidence and current limitations are recorded in [docs/release-verification.md](docs/release-verification.md).

## License and notices

PMEx is licensed under MIT. Bundled dependency and trademark notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
