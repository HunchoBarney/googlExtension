# PMEx Public Beta Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move PMEx from a dirty, red-test internal alpha state to a public-beta candidate with reliable popup interaction, bounded loading, accurate privacy behavior, and a repeatable release gate.

**Architecture:** Keep the existing MV3/manual-activation/local-analysis architecture. Make targeted fixes around test determinism, popup clickability, primary network timeout boundaries, privacy/link/image safety, and release packaging metadata without broad rewrites. Remove the unrelated market-maker research files from this release branch.

**Tech Stack:** Chrome MV3, vanilla JavaScript UMD modules, Node `node:test`, JSDOM, Playwright Core, Polymarket Gamma/Data/CLOB APIs, Hyperliquid API.

---

## File Structure

- Modify `test/popupController.test.js`: remove date-sensitive fixtures, add regression checks for clickable cards after loading completes, and keep tests future-proof.
- Modify `scripts/popup-layout-smoke.js`: remove fixed dates that expire in 2026 and replace with generated future dates.
- Modify `src/popup/popup.js`: preserve controls once first results are rendered, add clear partial/error states, and avoid disabling interaction after the visible loading state is gone.
- Modify `src/lib/polymarket.js`: add abortable timeout support to primary API fetches and expose timeout options through `fetchCandidates`.
- Modify `src/popup/render.js`: restrict external links/images to supported venues and HTTPS-only images unless explicitly allowlisted.
- Modify `src/popup/popup.html` and `src/popup/popup.js`: replace inaccurate privacy copy with accurate local-analysis plus remote-query disclosure.
- Modify `manifest.json` and `package.json`: align version/license metadata and add extension icons only if available.
- Modify `README.md` and `docs/release-verification.md`: document release gate, privacy model, known network risks, and current verified outputs.
- Remove `src/lib/marketMaker.js`, `scripts/tune-market-maker.js`, `docs/market-maker-strategy.md`, and `test/marketMaker.test.js` from the extension release branch.

---

### Task 1: Fix Date-Sensitive Popup Tests

**Files:**
- Modify: `test/popupController.test.js`
- Modify: `scripts/popup-layout-smoke.js`
- Test: `test/popupController.test.js`

- [ ] **Step 1: Write the failing test helper**

In `test/popupController.test.js`, add this helper near `delay(ms)`:

```js
function futureIsoDate(daysFromNow = 180) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}
```

- [ ] **Step 2: Replace expired fixtures**

Replace every popup interaction fixture that uses:

```js
endDate: "2026-06-30T00:00:00.000Z"
```

with:

```js
endDate: futureIsoDate()
```

Specifically inspect the two tests starting at `test/popupController.test.js:706` and `test/popupController.test.js:744`.

- [ ] **Step 3: Verify the original failure is gone**

Run:

```bash
node --test test/popupController.test.js --test-name-pattern "clicking a rendered market|market expansion"
```

Expected: both targeted tests pass. If they fail for any reason other than the old expired date, stop and diagnose that new failure before continuing.

- [ ] **Step 4: Fix layout smoke dates**

In `scripts/popup-layout-smoke.js`, add this helper near the `VIEWPORTS` constant:

```js
function futureIsoDate(daysFromNow) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  date.setUTCHours(23, 59, 0, 0);
  return date.toISOString();
}
```

Replace fixed fixture dates that are now in the past, for example:

```js
endDate: "2026-06-30T23:59:00Z",
```

with:

```js
endDate: futureIsoDate(180),
```

Keep any intentionally future static dates only if they are still future on the current date.

- [ ] **Step 5: Run focused validation**

Run:

```bash
npm test
```

Expected: `149` tests pass, `0` fail.

- [ ] **Step 6: Commit**

```bash
git add test/popupController.test.js scripts/popup-layout-smoke.js
git commit -m "test: make popup date fixtures future-proof"
```

---

### Task 2: Reproduce and Guard the “Done Loading but Not Clickable” Bug

**Files:**
- Modify: `test/popupController.test.js`
- Modify: `scripts/browser-smoke.js`
- Test: `test/popupController.test.js`

- [ ] **Step 1: Add a unit regression for clickable first cards during optional work**

Add this test near the existing test named `popup keeps first related cards clickable before optional expansion starts`:

```js
test("first rendered related card stays clickable while optional enrichment is pending", async () => {
  let resolveEnrichment;
  const enrichmentPromise = new Promise((resolve) => {
    resolveEnrichment = resolve;
  });
  const candidate = makeBinaryCandidate({
    id: "btc",
    eventId: "btc-event",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin",
    endDate: futureIsoDate()
  });

  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    useRealRenderer: true,
    enrichGroups() {
      return enrichmentPromise;
    }
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "initial clickable related card");

  clickNode(dom, document.querySelector(".market-card"));

  assert.ok(document.querySelector(".market-card-expanded"));
  assert.equal(calls.tradeViews.length, 0);

  resolveEnrichment([candidate]);
});
```

- [ ] **Step 2: Verify RED if the bug exists**

Run:

```bash
node --test test/popupController.test.js --test-name-pattern "first rendered related card stays clickable"
```

Expected before implementation: fail if controls remain disabled, overlay blocks cards, or the loading surface is still present over cards. If it passes immediately, keep the test and move to Step 3 because the user symptom may be browser-only.

- [ ] **Step 3: Add browser-smoke clickable-state evidence**

In `scripts/browser-smoke.js`, extend `readPopupState()` visual data with:

```js
loadingStateCount: document.querySelectorAll(".loading-state").length,
resultsLoading: Boolean(document.querySelector("#results-region")?.classList.contains("is-loading")),
disabledControls: [...document.querySelectorAll("button:disabled, input:disabled")].map((node) => node.id || node.className || node.tagName),
topElementAtFirstCard: (() => {
  const card = document.querySelector(".market-card");
  if (!card) return "";
  const rect = card.getBoundingClientRect();
  const node = document.elementFromPoint(rect.left + Math.min(24, rect.width / 2), rect.top + Math.min(24, rect.height / 2));
  return node ? `${node.tagName.toLowerCase()}#${node.id || ""}.${String(node.className || "").replace(/\s+/g, ".")}` : "";
})()
```

- [ ] **Step 4: Add browser-smoke assertion after final state**

After the popup reaches final state and before click interactions, assert:

```js
if (finalState.phase === "complete" && finalState.cardLinks.length) {
  if (finalState.visual.loadingStateCount !== 0 || finalState.visual.resultsLoading) {
    throw new Error(`Popup completed but still exposes loading UI: ${JSON.stringify(finalState.visual)}`);
  }
  if (finalState.visual.disabledControls.includes("market-search-input")) {
    throw new Error(`Popup completed with search input disabled: ${JSON.stringify(finalState.visual)}`);
  }
  if (!/market-card/.test(finalState.visual.topElementAtFirstCard)) {
    throw new Error(`First card is visually covered by another element: ${JSON.stringify(finalState.visual)}`);
  }
}
```

- [ ] **Step 5: Run focused validation**

Run:

```bash
node --test test/popupController.test.js --test-name-pattern "first rendered related card stays clickable"
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add test/popupController.test.js scripts/browser-smoke.js
git commit -m "test: guard clickable popup results after loading"
```

---

### Task 3: Bound Primary Polymarket Network Latency

**Files:**
- Modify: `test/polymarket.test.js`
- Modify: `src/lib/polymarket.js`
- Modify: `src/popup/popup.js`
- Test: `test/polymarket.test.js`, `test/popupController.test.js`

- [ ] **Step 1: Add a failing timeout test for primary candidate fetches**

In `test/polymarket.test.js`, add:

```js
test("fetchCandidates aborts slow primary API requests when timeoutMs is set", async () => {
  const calls = [];
  const analyzed = signals.analyzeArticle({
    title: "Bitcoin rises as ETF inflows return",
    cleanText: "Bitcoin ETF inflows returned while BTC traders watched year-end price targets."
  });
  const fetchImpl = (url, init = {}) => {
    calls.push({ url, signal: init.signal });
    return new Promise((resolve, reject) => {
      if (init.signal) {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }
    });
  };

  await assert.rejects(
    () => polymarket.fetchCandidates(analyzed, { fetchImpl, timeoutMs: 20 }),
    /aborted|Polymarket API request failed/
  );
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.signal));
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/polymarket.test.js --test-name-pattern "fetchCandidates aborts slow primary API requests"
```

Expected: fail because `fetchJson` does not currently pass an abort signal.

- [ ] **Step 3: Implement abortable fetch helper**

In `src/lib/polymarket.js`, replace `fetchJson(fetchImpl, url)` with:

```js
async function fetchJson(fetchImpl, url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 0;
  const controller = timeoutMs && typeof AbortController === "function"
    ? new AbortController()
    : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : 0;
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json"
      },
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) {
      throw new Error(`Polymarket API returned ${response.status}`);
    }
    return response.json();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
```

Then pass `{ timeoutMs: options.timeoutMs }` from all `fetchCandidates()` primary request calls and tag-expansion calls:

```js
const payload = await fetchJson(fetchImpl, request.url, { timeoutMs: options.timeoutMs });
```

and:

```js
const payload = await fetchJson(fetchImpl, request.url, { timeoutMs: options.timeoutMs });
```

- [ ] **Step 4: Wire popup primary timeout**

In `src/popup/popup.js`, add a primary timeout constant near the optional timeouts:

```js
const PRIMARY_POLYMARKET_TIMEOUT_MS = 3200;
```

In `polymarketStageOptions(options = {})`, include:

```js
timeoutMs: options.timeoutMs || PRIMARY_POLYMARKET_TIMEOUT_MS,
```

In primary calls, pass:

```js
timeoutMs: PRIMARY_POLYMARKET_TIMEOUT_MS
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test test/polymarket.test.js --test-name-pattern "fetchCandidates aborts slow primary API requests"
npm test
```

Expected: targeted test passes; full suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/polymarket.js src/popup/popup.js test/polymarket.test.js
git commit -m "fix: bound primary Polymarket fetch latency"
```

---

### Task 4: Make Loading and Partial States Honest

**Files:**
- Modify: `test/popupController.test.js`
- Modify: `src/popup/popup.js`
- Test: `test/popupController.test.js`

- [ ] **Step 1: Add a regression for primary timeout fallback copy**

Add this test in `test/popupController.test.js` near API error-state tests:

```js
test("popup shows partial no-match state when primary venue search times out", async () => {
  const never = new Promise(() => {});
  const { calls, refreshButton } = setupPopup({
    searchResult: never,
    hyperliquidResult: []
  });

  await waitFor(() => refreshButton.disabled === false && calls.empty.length === 1, "partial timeout empty state");

  assert.equal(calls.statuses.at(-1).phase, "complete");
  assert.match(calls.statuses.at(-1).detail, /No related events|slow|timeout|unavailable/i);
  assert.equal(calls.empty.at(-1).options.title, "Related markets");
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/popupController.test.js --test-name-pattern "primary venue search times out"
```

Expected: fail or hang until current wait timeout, proving the current behavior is not bounded enough.

- [ ] **Step 3: Update `run()` to settle the primary stage**

In `src/popup/popup.js`, replace the direct primary await:

```js
const primary = await searchPolymarketRelatedStage(enrichedArticle, "polymarket-primary", {
  minConfidence: MIN_CONFIDENCE,
  includeTagExpansion: false
});
```

with:

```js
const primarySettled = await settleWithin(
  "polymarket-primary",
  searchPolymarketRelatedStage(enrichedArticle, "polymarket-primary", {
    minConfidence: MIN_CONFIDENCE,
    includeTagExpansion: false,
    timeoutMs: PRIMARY_POLYMARKET_TIMEOUT_MS
  }),
  PRIMARY_POLYMARKET_TIMEOUT_MS + 300
);
const primary = primarySettled.status === "fulfilled"
  ? primarySettled.value
  : { candidates: [], resultGroups: [] };
```

If `primarySettled.status` is `"timeout"` or `"rejected"`, keep moving to secondary/Hyperliquid fallback with honest status copy.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test test/popupController.test.js --test-name-pattern "primary venue search times out"
npm test
```

Expected: targeted test passes; full suite passes.

- [ ] **Step 5: Commit**

```bash
git add src/popup/popup.js test/popupController.test.js
git commit -m "fix: show partial related-market state after primary timeout"
```

---

### Task 5: Correct Privacy Copy and URL/Image Safety

**Files:**
- Modify: `test/popupRender.test.js`
- Modify: `test/popupController.test.js`
- Modify: `src/popup/render.js`
- Modify: `src/popup/popup.js`
- Test: `test/popupRender.test.js`, `test/popupController.test.js`

- [ ] **Step 1: Add renderer tests for URL safety**

In `test/popupRender.test.js`, add:

```js
test("renderer blocks unsupported market links and non-HTTPS images", () => {
  const dom = setupDom();
  const root = dom.window.document.getElementById("root");

  renderer.renderResults(root, [{
    id: "unsafe",
    title: "Unsafe market",
    url: "https://evil.example/market",
    image: "http://evil.example/image.png",
    confidence: 80,
    primaryPrice: 0.4,
    primaryPercent: 40,
    outcomeOptions: [{ label: "Yes", price: 0.4, percent: 40 }]
  }], { showMatchLimitNote: false });

  const card = root.querySelector(".market-card");
  assert.equal(card.dataset.marketUrl, "https://polymarket.com");
  assert.equal(root.querySelector("img.market-image"), null);
  assert.ok(root.querySelector(".market-image-fallback"));
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/popupRender.test.js --test-name-pattern "blocks unsupported market links"
```

Expected: fail because current `safeHttpUrl()` accepts any `http` or `https` URL.

- [ ] **Step 3: Implement venue allowlists**

In `src/popup/render.js`, replace `safeHttpUrl(value)` with:

```js
function safeVenueUrl(value) {
  const raw = text(value).trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const allowed = (
      url.protocol === "https:" &&
      (host === "polymarket.com" || host.endsWith(".polymarket.com") || host === "app.hyperliquid.xyz")
    );
    return allowed ? url.href : "";
  } catch (error) {
    return "";
  }
}
```

Update `marketHref(candidate)`:

```js
const explicitUrl = safeVenueUrl(candidate.url);
```

Update `marketImageUrl(candidate)` so only `https:` and data images are allowed:

```js
return url.protocol === "https:" ? url.href : "";
```

- [ ] **Step 4: Fix privacy copy**

In `src/popup/popup.js`, replace:

```js
showSurfaceMessage("Information", "Read only. Matched locally. No data leaves device.");
renderStatus("complete", "Read only", "Matched locally. No data leaves device.");
```

with:

```js
showSurfaceMessage("Information", "Read only. Article analysis stays local; market queries go to supported venues.");
renderStatus("complete", "Read only", "Local article analysis with venue market queries.");
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test test/popupRender.test.js --test-name-pattern "blocks unsupported market links"
npm test
```

Expected: targeted test passes; full suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/popup/render.js src/popup/popup.js test/popupRender.test.js test/popupController.test.js
git commit -m "fix: make venue links and privacy copy accurate"
```

---

### Task 6: Remove Market-Maker Scope From Release Branch

**Files:**
- Delete: `src/lib/marketMaker.js`
- Delete: `scripts/tune-market-maker.js`
- Delete: `docs/market-maker-strategy.md`
- Delete: `test/marketMaker.test.js`
- Modify: `package.json`
- Test: `npm test`

- [ ] **Step 1: Delete market-maker files**

Remove these files from the release branch:

```text
src/lib/marketMaker.js
scripts/tune-market-maker.js
docs/market-maker-strategy.md
test/marketMaker.test.js
```

- [ ] **Step 2: Remove package script**

Remove this script from `package.json`:

```json
"tune:market-maker": "node scripts/tune-market-maker.js"
```

- [ ] **Step 3: Add a guard test**

In `test/staticPolicy.test.js`, add:

```js
test("extension runtime does not load market-maker tooling", () => {
  const popup = fs.readFileSync(path.join(root, "src/popup/popup.html"), "utf8");
  const manifest = JSON.stringify(readJson("manifest.json"));

  assert.doesNotMatch(popup, /marketMaker|tune-market-maker|PMMarketMaker/);
  assert.doesNotMatch(manifest, /marketMaker|tune-market-maker|PMMarketMaker/);
});
```

- [ ] **Step 4: Verify market-maker references are gone from release runtime**

Run:

```bash
rg -n "marketMaker|PMMarketMaker|tune-market-maker|Market-Making Strategy" src scripts test package.json README.md manifest.json docs/release-verification.md
```

Expected: no matches, except the new static policy test name if it includes the string.

- [ ] **Step 5: Verify full suite**

Run:

```bash
npm test
```

Expected: full suite passes.

- [ ] **Step 6: Commit**

```bash
git add package.json test/staticPolicy.test.js
git add -A src/lib/marketMaker.js scripts/tune-market-maker.js docs/market-maker-strategy.md test/marketMaker.test.js
git commit -m "chore: remove market-maker research from extension beta"
```

---

### Task 7: Release Metadata and Documentation

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/release-verification.md`
- Test: `npm test`

- [ ] **Step 1: Align versions**

Choose one version for beta. Recommended:

```json
"version": "0.2.0"
```

Set both:

```json
// manifest.json
"version": "0.2.0"
```

and:

```json
// package.json
"version": "0.2.0"
```

- [ ] **Step 2: Align license metadata**

If the root `LICENSE` remains MIT, update `package.json`:

```json
"license": "MIT"
```

- [ ] **Step 3: Document real privacy model**

In `README.md`, replace the current privacy sentence with:

```md
The extension uses `activeTab` and `scripting` for manual page reads. Article extraction and classification run locally. The full article text is not sent to an AI service, but derived market queries are sent to supported market-data venues and market images may be loaded from HTTPS image URLs returned by those venues.
```

- [ ] **Step 4: Refresh release-verification template**

Replace stale test counts in `docs/release-verification.md` with a current template:

```md
# Release Verification

Last verified: pending.

## Required Commands

- [ ] `npm test`
- [ ] `npm run test:layout`
- [ ] `npm run test:live`
- [ ] `npm run test:browser`
- [ ] `npm run test:release`

## Release Gate

Do not ship unless every command above passes on the release candidate branch and browser smoke shows a final complete, no-match, partial, or error state without a lingering loading overlay.
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test
```

Expected: full suite passes.

- [ ] **Step 6: Commit**

```bash
git add manifest.json package.json README.md docs/release-verification.md
git commit -m "docs: prepare beta release metadata and verification"
```

---

### Task 8: Full Verification Gate

**Files:**
- Read/verify only unless failures require fixes.
- Test: all release scripts.

- [ ] **Step 1: Run unit suite**

```bash
npm test
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Run layout smoke**

```bash
npm run test:layout
```

Expected: layout smoke passes for popup, compact, mid, and narrow viewports. If it writes screenshots to `test-artifacts/`, do not commit them.

- [ ] **Step 3: Run browser smoke**

```bash
npm run test:browser
```

Expected: browser smoke reaches final state, pre-activation access remains blocked, first card is clickable, and no lingering loading UI covers results.

- [ ] **Step 4: Run live smoke if network is available**

```bash
npm run test:live
```

Expected: live Polymarket schemas parse and live article QA completes. If network fails, record the exact failure and rerun on a stable network before public beta.

- [ ] **Step 5: Run release gate**

```bash
npm run test:release
```

Expected: full release script passes.

- [ ] **Step 6: Update release verification evidence**

Update `docs/release-verification.md` with:

```md
Last verified: <UTC timestamp>.

## Commands Passed

- `npm test`
- `npm run test:layout`
- `npm run test:live`
- `npm run test:browser`
- `npm run test:release`

## Current Known Risks

- Live venue API availability and schema drift remain network-dependent.
- Relevance quality still requires human review before each public release.
```

- [ ] **Step 7: Final git hygiene**

Run:

```bash
git status --short
```

Expected: only intentional source/doc changes remain. No `outputs/`, `test-artifacts/`, screenshots, or generated spreadsheets are staged.

- [ ] **Step 8: Commit verification docs**

```bash
git add docs/release-verification.md
git commit -m "docs: record beta release verification"
```

---

## Subagent Execution Strategy

Use one fresh implementer subagent per task. Do not run multiple implementation subagents in parallel because tasks touch overlapping popup/test files. After each task:

1. Run the task’s focused verification.
2. Dispatch a spec-compliance review subagent with the task text and diff.
3. Fix every spec issue.
4. Dispatch a code-quality review subagent.
5. Fix every quality issue.
6. Run the task verification again.
7. Commit.

Recommended subagent split:

- Task 1: deterministic tests engineer.
- Task 2: popup interaction/debugging engineer.
- Task 3: API/network reliability engineer.
- Task 4: popup state machine engineer.
- Task 5: security/privacy engineer.
- Task 6: product-scope/release engineer.
- Task 7: release/documentation engineer.
- Task 8: QA/release engineer.

---

## Verification Before Completion

No one may claim the extension is “fixed,” “fast,” “clickable,” “beta-ready,” or “passing” without fresh output from:

```bash
npm test
npm run test:layout
npm run test:browser
npm run test:live
npm run test:release
```

If any command fails, report the exact command, exit status, failure text, and the next fix. Do not summarize failure as success.

---

## Self-Review

Spec coverage:

- Red tests: Task 1.
- User clickability symptom: Task 2.
- Finding-related-markets latency: Tasks 3 and 4.
- Privacy/security concerns: Task 5.
- Market-maker scope drift: Task 6 removes it from the release branch.
- Release readiness: Tasks 7 and 8.

Placeholder scan: no `TBD`, no unresolved “implement later,” no unspecified test commands.

Type consistency: plan uses existing Node `node:test`, existing popup helper names, and existing module/file structure.
