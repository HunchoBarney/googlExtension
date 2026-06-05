# Polymarket Article Matcher

Chrome/Chromium Manifest V3 extension that runs only after toolbar activation. It extracts the current article with Mozilla Readability, derives local entities/topics plus a small local article-angle model, searches Polymarket public APIs, and shows conservative high-confidence parent event matches in the popup.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked" and select this repository root.
4. Open a readable article page and click the extension action.

The extension uses `activeTab` and `scripting` for manual page reads, plus host permissions for Polymarket API domains. It does not send full article text to any AI service.

## Development

Run the focused Node test suite:

```sh
npm test
```

Additional verification commands:

```sh
npm run test:polymarket:live   # verifies live Gamma API schemas and price parsing
npm run test:articles:live      # discovers current articles from feeds and runs matching QA
npm run test:browser            # loads the unpacked extension in Chrome and triggers the action popup through a user-style browser event
npm run test:release            # local suite plus live and browser smoke checks
```

Live QA commands print concise summaries to stdout. Use `npm run test:articles:live -- --save-failures` only when you want to save unreadable or failing article HTML as regression candidates.

The browser smoke test uses Playwright Chromium in headless mode with the production unpacked extension. It opens a current live article in a real browser tab, confirms the extension cannot read the page before activation, triggers Chrome's `_execute_action` command, verifies the popup reaches `reading -> extracting -> searching -> complete`, verifies the real extension popup keeps a usable production width, clicks a rendered parent event card, and confirms Polymarket opens in a browser tab. No temporary article host permission is added.

The popup uses the local article-angle model path by default. The model artifact lives at `src/lib/articleAngleClassifierData.json` and is loaded locally by the extension; it is not a remote AI service. Child markets are used internally for scoring and event summaries, but the popup displays only parent event cards that link to the corresponding Polymarket event page.

Release evidence and current known QA caveats are tracked in `docs/release-verification.md`.

If Playwright Chromium is not installed yet, install it once:

```sh
npx playwright-core install chromium
```

The extension is intentionally unbundled. Browser scripts in `src/lib` use small UMD wrappers so the popup and tests exercise the same parsing, signal, ranking, and rendering logic.
