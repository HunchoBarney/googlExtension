# Privacy Policy

Effective date: August 21, 2026

PMEx Market Matcher is an unofficial, read-only browser extension. It has no developer-operated server, account system, telemetry, advertising, or analytics.

## Data handled after activation

The extension runs only when you activate it. It reads the active page's URL, title, selected text, metadata, and readable article content so it can identify relevant public markets. Article extraction, classification, and ranking occur on your device.

The extension does not send the full article body to PMEx or an AI service. It sends the article title and derived search terms to Polymarket's public API when searching for related markets. Manual market searches are also sent to Polymarket. It requests public market metadata, prices, history, positions summaries, and order-book data from Polymarket and Hyperliquid. Live views connect directly to those venues over HTTPS or secure WebSockets. Market images may be requested from URLs supplied by venue data.

Those external services receive normal network information such as your IP address and request metadata. Their own privacy policies govern their handling of that information.

## Storage and retention

PMEx does not persist article text, market searches, account information, or trading information. Popup state is held in memory and is discarded when the popup closes. The extension does not connect a wallet or submit, sign, cancel, or track orders.

## Permissions

- `activeTab` permits a one-time read of the page you explicitly activate the extension on.
- `scripting` injects the local article extractor after activation.
- Venue host permissions allow read-only requests to the listed Polymarket and Hyperliquid public APIs.

## Contact

Use the repository's private security-reporting channel for security or privacy concerns. Do not include sensitive browsing or account information in a public issue.

This policy will be updated before any change that introduces accounts, persistent storage, telemetry, or order execution.
