# Related Market Search Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve related-market retrieval so the extension uses Polymarket search correctly, separates strong matches from maybe-related fallbacks, and keeps the popup populated without overstating weak relevance.

**Architecture:** Keep the existing local-only article analysis and Gamma/Data API architecture. Replace unsupported `events?q` and `markets?q` retrieval with tuned `public-search` requests, add optional guarded `events/similar` retrieval, improve article query generation, and add a `matchTier` field that flows from ranking through grouping into rendering.

**Tech Stack:** Chrome Manifest V3, unbundled CommonJS-compatible JavaScript modules, Node `node:test`, JSDOM, Polymarket Gamma API, Polymarket Data API.

---

## Execution Notes

- Current checkout path: `C:\Users\jaswi\OneDrive\Documents\CODE\PMEx-main`.
- Current checkout is not a Git repo. Commit steps below are included for a normal repo checkout; skip them here unless `.git` exists.
- Fresh baseline before this plan: `npm test` passed 66 tests; `npm run test:articles:live -- --limit=4 --no-release-gates` processed 4 readable articles with 3 displayed match states and 1 no-match state.
- The implementation must preserve the existing UI card size. Only the score badge label changes from `Match` to `Maybe` for lower-confidence fallback markets.

## File Structure

- Modify `src/lib/polymarket.js`: build API-correct search URLs, add optional similar-event requests, attach `matchTier`, keep event grouping parent-aware.
- Modify `src/lib/articleSignals.js`: improve query generation and suppress sports classification from generic game/product language.
- Modify `src/popup/popup.js`: request maybe-related candidates when strong related results are sparse.
- Modify `src/popup/render.js`: render maybe-tier cards with `Maybe` badge text.
- Modify `scripts/live-polymarket-smoke.js`: stop probing unsupported text-search params on `/events` and `/markets`.
- Modify `test/polymarket.test.js`: retrieval URL tests, similar-event tests, match-tier tests.
- Modify `test/articleSignals.test.js`: Pixel Watch/product article regression and query generation tests.
- Modify `test/popupController.test.js`: maybe fallback request and result tests.
- Modify `test/popupRender.test.js`: maybe badge rendering test.

---

### Task 1: Make Polymarket Text Retrieval API-Correct

**Files:**
- Modify: `src/lib/polymarket.js`
- Test: `test/polymarket.test.js`

- [ ] **Step 1: Write the failing retrieval URL test**

Add this test near the existing `searchAndRank tolerates partial API failures` test in `test/polymarket.test.js`.

```js
test("fetchCandidates uses tuned public-search requests for text retrieval", async () => {
  const calls = [];
  const analyzed = signals.analyzeArticle({
    title: "Dogecoin added to Paxos brokerage and custody platform",
    cleanText: "Paxos added Dogecoin support for brokerage and custody customers while DOGE traders watched crypto adoption."
  });

  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ events: [] })
    };
  };

  const candidates = await polymarket.fetchCandidates({
    ...analyzed,
    queries: ["Dogecoin", "Dogecoin price"]
  }, {
    fetchImpl,
    includeSimilar: false,
    searchLimitPerType: 8
  });

  assert.deepEqual(candidates, []);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.includes("/public-search?")));
  assert.ok(calls.every((url) => url.includes("q=Dogecoin")));
  assert.ok(calls.every((url) => url.includes("limit_per_type=8")));
  assert.ok(calls.every((url) => url.includes("events_status=active")));
  assert.ok(calls.every((url) => url.includes("keep_closed_markets=0")));
  assert.ok(calls.every((url) => url.includes("search_profiles=false")));
  assert.ok(calls.every((url) => url.includes("search_tags=false")));
  assert.ok(calls.every((url) => !url.includes("optimized=true")));
  assert.ok(calls.every((url) => !url.includes("/events?")));
  assert.ok(calls.every((url) => !url.includes("/markets?")));
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm test -- test\polymarket.test.js
```

Expected: the new test fails because `src/lib/polymarket.js` still adds `/events?...&q=` and `/markets?...&q=` requests for the first two queries.

- [ ] **Step 3: Replace `searchUrls` with tuned `public-search` only**

In `src/lib/polymarket.js`, replace the existing `searchUrls(query, index)` function with this implementation.

```js
  function publicSearchUrl(query, options = {}) {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("events_status", "active");
    params.set("limit_per_type", String(Math.max(3, Math.min(20, Number(options.limitPerType) || 8))));
    params.set("keep_closed_markets", "0");
    params.set("search_profiles", "false");
    params.set("search_tags", "false");
    return {
      url: `${GAMMA_API}/public-search?${params.toString()}`,
      source: "public-search"
    };
  }

  function searchUrls(query, _index, options = {}) {
    return [publicSearchUrl(query, options)];
  }
```

- [ ] **Step 4: Pass search limit options from `fetchCandidates`**

In `src/lib/polymarket.js`, replace this line inside `fetchCandidates`:

```js
    const requests = queries.flatMap((query, index) => searchUrls(query, index).map((item) => ({ ...item, query })));
```

with this code:

```js
    const searchOptions = {
      limitPerType: options.searchLimitPerType
    };
    const requests = queries.flatMap((query, index) => (
      searchUrls(query, index, searchOptions).map((item) => ({ ...item, query }))
    ));
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
npm test -- test\polymarket.test.js
```

Expected: `test\polymarket.test.js` passes, including the new public-search URL test.

- [ ] **Step 6: Commit if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available, commit:

```powershell
git add src/lib/polymarket.js test/polymarket.test.js
git commit -m "fix: use public search for market retrieval"
```

If Git is unavailable in this checkout, continue without committing.

---

### Task 2: Add Guarded Similar-Event Retrieval

**Files:**
- Modify: `src/lib/polymarket.js`
- Test: `test/polymarket.test.js`

- [ ] **Step 1: Write the failing similar-event request test**

Add this test in `test/polymarket.test.js` after the public-search URL test from Task 1.

```js
test("fetchCandidates can request similar events from the article title", async () => {
  const calls = [];
  const analyzed = signals.analyzeArticle({
    title: "Bitcoin preps May downside but US PMI data may boost BTC price",
    cleanText: "Bitcoin traders watched BTC support levels, PMI data, and crypto price targets."
  });

  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/events/similar?")) {
      return {
        ok: true,
        json: async () => [{
          id: "similar-event",
          slug: "bitcoin-price-on-june-3",
          title: "Bitcoin price on June 3?",
          active: true,
          closed: false,
          markets: [{
            id: "similar-market",
            question: "Bitcoin price on June 3?",
            outcomes: "[\"Yes\", \"No\"]",
            outcomePrices: "[\"0.51\", \"0.49\"]",
            volume: "1200000",
            active: true,
            closed: false
          }]
        }]
      };
    }
    return {
      ok: true,
      json: async () => ({ events: [] })
    };
  };

  const candidates = await polymarket.fetchCandidates({
    ...analyzed,
    queries: ["Bitcoin price"]
  }, {
    fetchImpl,
    includeSimilar: true,
    similarLimit: 5
  });

  assert.ok(calls.some((url) => url.includes("/events/similar?")));
  assert.ok(calls.some((url) => url.includes("event_title=Bitcoin+preps+May+downside")));
  assert.ok(calls.some((url) => url.includes("closed=false")));
  assert.ok(calls.some((url) => url.includes("limit=5")));
  assert.ok(candidates.some((candidate) => candidate.id === "similar-market"));
  assert.ok(candidates.find((candidate) => candidate.id === "similar-market").sourceQueries.includes("Bitcoin preps May downside but US PMI data may boost BTC price"));
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm test -- test\polymarket.test.js
```

Expected: the new test fails because `fetchCandidates` does not call `/events/similar`.

- [ ] **Step 3: Add similar-event request helpers**

In `src/lib/polymarket.js`, insert these functions after `searchUrls`.

```js
  function shouldFetchSimilarEvents(article, options = {}) {
    if (options.includeSimilar !== true) {
      return false;
    }
    const title = normalizeWhitespace(article && article.title);
    return title.length >= 12 && !/^untitled\b/i.test(title);
  }

  function similarEventRequest(article, options = {}) {
    const title = normalizeWhitespace(article && article.title);
    const params = new URLSearchParams();
    params.set("event_title", title);
    params.set("closed", "false");
    params.set("limit", String(Math.max(3, Math.min(20, Number(options.similarLimit) || 5))));
    return {
      url: `${GAMMA_API}/events/similar?${params.toString()}`,
      query: title,
      source: "events-similar"
    };
  }
```

- [ ] **Step 4: Add the similar request to `fetchCandidates`**

In `src/lib/polymarket.js`, after building `requests`, insert the guarded similar-event request.

```js
    if (shouldFetchSimilarEvents(article, options)) {
      requests.push(similarEventRequest(article, options));
    }
```

The surrounding `fetchCandidates` request block should now read:

```js
    const searchOptions = {
      limitPerType: options.searchLimitPerType
    };
    const requests = queries.flatMap((query, index) => (
      searchUrls(query, index, searchOptions).map((item) => ({ ...item, query }))
    ));
    if (shouldFetchSimilarEvents(article, options)) {
      requests.push(similarEventRequest(article, options));
    }
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
npm test -- test\polymarket.test.js
```

Expected: `test\polymarket.test.js` passes and the new similar-event test observes one `/events/similar` request.

- [ ] **Step 6: Commit if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available, commit:

```powershell
git add src/lib/polymarket.js test/polymarket.test.js
git commit -m "feat: add similar event retrieval source"
```

If Git is unavailable in this checkout, continue without committing.

---

### Task 3: Improve Article Queries and Suppress Generic Sports False Positives

**Files:**
- Modify: `src/lib/articleSignals.js`
- Test: `test/articleSignals.test.js`

- [ ] **Step 1: Write the Pixel Watch regression test**

Add this test at the end of `test/articleSignals.test.js`.

```js
test("does not turn product and video-game language into a sports matchup query", () => {
  const article = signals.analyzeArticle({
    title: "The Google Pixel Watch 5 may have been spoiled by the creator of Borderlands",
    cleanText: [
      "A video game creator appeared to show unreleased Google Pixel Watch hardware in a short clip.",
      "The leak focused on Wear OS, battery life, display details, and Android device design.",
      "The article was about a consumer technology product rather than a sports game or match."
    ].join(" ")
  });

  assert.notEqual(article.topic.label, "sports");
  assert.notEqual(article.classifier.topic, "sports");
  assert.ok(article.queries.some((query) => /Google Pixel Watch|Pixel Watch|Google/i.test(query)));
  assert.ok(article.queries.every((query) => !/\bwinner\b|\bmatchup\b|\bchampionship\b/i.test(query)));
});
```

- [ ] **Step 2: Write the maybe-query regression test**

Add this test after the Pixel Watch test.

```js
test("generates entity and angle queries for maybe-related fallback search", () => {
  const article = signals.analyzeArticle({
    title: "Iran war cost lifts average household gas and energy bills",
    cleanText: [
      "The article connected Iran conflict risk with oil, gas, energy costs, and household inflation pressure.",
      "Traders watched whether diplomatic conflict would affect crude supply and US energy prices."
    ].join(" ")
  });

  assert.ok(article.queries.some((query) => /^Iran$/i.test(query) || /^Iran conflict$/i.test(query)));
  assert.ok(article.queries.some((query) => /Iran.*war|Iran.*conflict|Iran.*energy/i.test(query)));
  assert.ok(article.queries.every((query) => !/^Bills(?:\s|$)/i.test(query)));
  assert.ok(article.queries.every((query) => query.length <= 80));
});
```

- [ ] **Step 3: Run the article signal tests to verify failure**

Run:

```powershell
npm test -- test\articleSignals.test.js
```

Expected: the Pixel Watch test fails before the sports-evidence and company-query guards are added.

- [ ] **Step 4: Add technology product terms to topic rules**

In `src/lib/articleSignals.js`, replace the `AI/technology` entry in `TOPIC_RULES` with this list.

```js
    "AI/technology": [
      "ai", "artificial intelligence", "chip", "semiconductor", "gpu", "model", "openai", "anthropic", "data center",
      "software", "robot", "technology", "pixel", "watch", "wear os", "android", "hardware", "device", "gadget"
    ],
```

- [ ] **Step 5: Add sports-evidence helpers**

In `src/lib/articleSignals.js`, insert these helpers before `classifyTopic`.

```js
  function hasStrongSportsEvidence(text, title, entities) {
    const rawCombined = `${title || ""} ${text || ""}`;
    const combined = canonicalKey(rawCombined);
    if (/\b(nba|nfl|mlb|nhl|epl|fifa|world cup|super bowl|champions league)\b/i.test(rawCombined)) {
      return true;
    }
    const casedTeamHits = rawCombined.match(/\b(Lakers|Celtics|Knicks|Warriors|Yankees|Dodgers|Mets|Chiefs|Bills|Eagles|Cowboys|49ers|Arsenal|Chelsea|Liverpool|Manchester City|Real Madrid|Barcelona)\b/g) || [];
    if (casedTeamHits.length >= 2) {
      return true;
    }
    return casedTeamHits.length === 1 && /\b(vs\.?|against|face|faces|beat|win|winner|game|match|playoff|season|championship)\b/i.test(combined);
  }

  function suppressWeakSportsScore(scores, text, title, entities) {
    if (!scores || !scores.sports) {
      return;
    }
    if (hasStrongSportsEvidence(text, title, entities)) {
      return;
    }
    const combined = canonicalKey(`${title} ${text}`);
    const genericSportsOnly = /\b(game|match|score|season|winner|beat)\b/i.test(combined);
    if (genericSportsOnly) {
      scores.sports = Math.min(scores.sports, 1);
    }
  }
```

- [ ] **Step 6: Use the sports guard in `classifyTopic`**

In `src/lib/articleSignals.js`, inside `classifyTopic`, after the existing topic score boosts and before `const sorted = ...`, add:

```js
    suppressWeakSportsScore(scores, text, title, entities);
```

- [ ] **Step 7: Use the sports guard in `classifyArticleAngle`**

In `src/lib/articleSignals.js`, inside the `for (const label of model.labels)` loop in `classifyArticleAngle`, add this block before `const termScore = ...`.

```js
      if (label.topic === "sports" && !hasStrongSportsEvidence(text, title, entities)) {
        labelScores.push({
          topic: label.topic,
          score: 0,
          matchedTerms: [],
          matchedEntityTypes: [],
          angles: [],
          excludeAngles: label.excludeAngles || []
        });
        continue;
      }
```

- [ ] **Step 8: Add title-centered product and angle queries**

In `src/lib/articleSignals.js`, insert this helper before `generateQueries`.

```js
  function productQueryFromTitle(title) {
    const clean = normalizeWhitespace(title);
    const match = clean.match(/\b(Google\s+Pixel\s+Watch\s+\d*|Pixel\s+Watch\s+\d*|Apple\s+Watch\s+\d*|iPhone\s+\d*|Galaxy\s+Watch\s+\d*|PlayStation\s+\d*|Xbox\s+[A-Za-z0-9 ]{1,20})\b/i);
    return match ? normalizeWhitespace(match[1]) : "";
  }
```

Then in `generateQueries`, after `const genericSoloEntities = ...`, add:

```js
    const productQuery = productQueryFromTitle(title);
    if (productQuery) {
      addQuery(queries, productQuery);
    }
```

In `generateQueries`, insert this helper after `entityAppearsInTitle`.

```js
    function hasEarningsIntent() {
      return topicLabel === "companies/earnings" || /\b(earnings|revenue|profit|guidance|quarter|beat|miss|stock price|shares)\b/i.test(articleKey);
    }
```

Then replace the company query block:

```js
    if (companyEntities[0] && (!hasCryptoEntities || entityAppearsInTitle(companyEntities[0]))) {
      addQuery(queries, [companyEntities[0].text, "earnings"]);
      addQuery(queries, [companyEntities[0].text, topKeywords[0] && topKeywords[0].text]);
    }
```

with:

```js
    if (companyEntities[0] && (!hasCryptoEntities || entityAppearsInTitle(companyEntities[0]))) {
      if (hasEarningsIntent()) {
        addQuery(queries, [companyEntities[0].text, "earnings"]);
      } else if (topicLabel === "AI/technology" || productQuery) {
        addQuery(queries, [companyEntities[0].text, "technology"]);
      }
      addQuery(queries, [companyEntities[0].text, topKeywords[0] && topKeywords[0].text]);
    }
```

Then replace the sports query block:

```js
    if (entities.sports && entities.sports[0]) {
      addQuery(queries, [entities.sports[0].text, entities.sports[1] && entities.sports[1].text]);
    }
```

with:

```js
    if (hasStrongSportsEvidence(article.cleanText || article.text || "", title, entities) && entities.sports && entities.sports[0]) {
      addQuery(queries, [entities.sports[0].text, entities.sports[1] && entities.sports[1].text]);
    }
```

Inside `shouldUseEntityQuery`, before `return true`, add:

```js
      if (entity.type === "sports" && !hasStrongSportsEvidence(article.cleanText || article.text || "", title, entities)) {
        return false;
      }
```

In the geopolitics block near the bottom of `generateQueries`, replace:

```js
    if (article.topic && article.topic.label === "geopolitics" && entities.places && entities.places[0]) {
      addQuery(queries, [entities.places[0].text, "war"]);
    }
```

with:

```js
    if (article.topic && article.topic.label === "geopolitics" && entities.places && entities.places[0]) {
      addQuery(queries, entities.places[0].text);
      addQuery(queries, [entities.places[0].text, "conflict"]);
      addQuery(queries, [entities.places[0].text, "war"]);
      if (/\b(oil|gas|energy|crude|fuel)\b/i.test(articleKey)) {
        addQuery(queries, [entities.places[0].text, "energy"]);
      }
    }
```

- [ ] **Step 9: Run the article signal tests**

Run:

```powershell
npm test -- test\articleSignals.test.js
```

Expected: all article signal tests pass, including the Pixel Watch and Iran maybe-query regressions.

- [ ] **Step 10: Commit if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available, commit:

```powershell
git add src/lib/articleSignals.js test/articleSignals.test.js
git commit -m "fix: improve article query generation"
```

If Git is unavailable in this checkout, continue without committing.

---

### Task 4: Add Strong and Maybe Match Tiers

**Files:**
- Modify: `src/lib/polymarket.js`
- Test: `test/polymarket.test.js`

- [ ] **Step 1: Write match-tier tests**

Add these tests in `test/polymarket.test.js` after the existing ranking relevance tests.

```js
test("rankCandidate labels high-confidence matches as strong", () => {
  const analyzed = signals.analyzeArticle({
    title: "Bitcoin rallies as ETF inflows accelerate",
    cleanText: "Bitcoin rose as BTC ETF inflows lifted crypto sentiment and traders watched year-end price targets."
  });
  const scored = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "btc-strong-tier",
    question: "Will Bitcoin hit $150k in 2026?",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.44\", \"0.56\"]",
    volume: "2000000",
    liquidity: "50000",
    active: true,
    closed: false
  }), analyzed);

  assert.equal(scored.matchTier, "strong");
  assert.ok(scored.confidence >= 55);
});

test("rankCandidate labels weak but related entity matches as maybe", () => {
  const analyzed = signals.analyzeArticle({
    title: "The Google Pixel Watch 5 may have been spoiled by the creator of Borderlands",
    cleanText: [
      "A video game creator appeared to show unreleased Google Pixel Watch hardware.",
      "The article focused on Wear OS, Android, battery life, display details, and Google device design."
    ].join(" ")
  });
  const scored = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "google-gemini-maybe",
    question: "Next Google Gemini Pro Model: Arena Debut?",
    description: "Google artificial intelligence model market.",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.31\", \"0.69\"]",
    volume: "500000",
    liquidity: "30000",
    active: true,
    closed: false
  }), analyzed);

  assert.equal(scored.matchTier, "maybe");
  assert.ok(scored.confidence < 55);
  assert.ok(scored.scoreBreakdown.entities > 0 || scored.scoreBreakdown.overlap > 0 || scored.scoreBreakdown.keywords > 0);
});

test("rankCandidates can include maybe matches without promoting rejected markets", () => {
  const analyzed = signals.analyzeArticle({
    title: "The Google Pixel Watch 5 may have been spoiled by the creator of Borderlands",
    cleanText: "The article focused on Google Pixel Watch hardware, Wear OS, battery life, and Android device design."
  });
  const ranked = polymarket.rankCandidates([
    polymarket.normalizeMarket({
      id: "google-maybe",
      question: "Next Google Gemini Pro Model: Arena Debut?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.31\", \"0.69\"]",
      volume: "500000",
      active: true,
      closed: false
    }),
    polymarket.normalizeMarket({
      id: "rihanna-reject",
      question: "Will Rihanna release a new album before GTA VI?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.51\", \"0.49\"]",
      volume: "5000000",
      active: true,
      closed: false
    })
  ], analyzed, {
    minConfidence: 35,
    includeMaybe: true,
    maxResults: 5
  });

  assert.deepEqual(ranked.map((candidate) => candidate.id), ["google-maybe"]);
  assert.equal(ranked[0].matchTier, "maybe");
});

test("product-specific company matches are capped to maybe when the market misses the product", () => {
  const analyzed = signals.analyzeArticle({
    title: "The Google Pixel Watch 5 may have been spoiled by the creator of Borderlands",
    cleanText: [
      "A video game creator appeared to show unreleased Google Pixel Watch hardware.",
      "The article focused on Wear OS, Android, battery life, display details, and Google device design."
    ].join(" ")
  });
  const scored = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "google-stock",
    question: "Google (GOOGL) closes above $200 on June 1?",
    description: "Alphabet stock price market.",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.31\", \"0.69\"]",
    volume: "2500000",
    liquidity: "150000",
    active: true,
    closed: false
  }), analyzed);

  assert.equal(scored.matchTier, "maybe");
  assert.ok(scored.confidence <= 54);
  assert.ok(scored.scoreBreakdown.relevanceGateReasons.includes("missing-specific-product"));
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```powershell
npm test -- test\polymarket.test.js
```

Expected: the new tests fail because `matchTier` is not assigned yet.

- [ ] **Step 3: Add tier constants and helper functions**

In `src/lib/polymarket.js`, after `DEFAULT_MAX_CHILD_MARKETS`, add:

```js
  const STRONG_MATCH_CONFIDENCE = 55;
  const MAYBE_MATCH_CONFIDENCE = 35;
```

Insert these helpers before `rankCandidate`.

```js
  function maybeRelatedByBreakdown(scoreBreakdown) {
    if (!scoreBreakdown) {
      return false;
    }
    const hasArticleOverlap = (
      scoreBreakdown.entities >= 8 ||
      scoreBreakdown.keywords >= 7 ||
      scoreBreakdown.overlap >= 5 ||
      scoreBreakdown.centralEntityHits.length > 0
    );
    const hardPenalty = (
      scoreBreakdown.topicMismatch <= -24 ||
      scoreBreakdown.strictTopicPenalty <= -30 ||
      scoreBreakdown.speechPenalty <= -40 ||
      scoreBreakdown.relevanceGateCap === 45
    );
    return hasArticleOverlap && !hardPenalty;
  }

  function matchTierForConfidence(confidence, scoreBreakdown) {
    if (confidence >= STRONG_MATCH_CONFIDENCE) {
      return "strong";
    }
    if (confidence >= MAYBE_MATCH_CONFIDENCE && maybeRelatedByBreakdown(scoreBreakdown)) {
      return "maybe";
    }
    return "reject";
  }

  function specificArticlePhrases(article) {
    return (article.queries || [])
      .filter((query) => /\b(pixel watch|apple watch|iphone|galaxy watch|playstation|xbox)\b/i.test(query))
      .slice(0, 3);
  }
```

- [ ] **Step 4: Attach `matchTier` and product-specific capping inside `rankCandidate`**

In `rankCandidate`, replace the existing `const uncappedConfidence ... return { ... }` tail with this version.

```js
    let productSpecificityPenalty = 0;
    let productSpecificityCap = null;
    const specificPhrases = specificArticlePhrases(article);
    if (specificPhrases.length) {
      const candidateText = `${candidate.title} ${candidate.eventTitle} ${candidate.description}`;
      const hasSpecificPhrase = specificPhrases.some((phrase) => textHasTerm(candidateText, phrase));
      if (!hasSpecificPhrase && entities > 0) {
        productSpecificityPenalty = -8;
        productSpecificityCap = 54;
        gate.reasons.push("missing-specific-product");
      }
    }

    const confidenceCaps = [gate.maxConfidence, productSpecificityCap].filter((value) => value !== null);
    const maxConfidence = confidenceCaps.length ? Math.min(...confidenceCaps) : null;
    const uncappedConfidence = Math.max(0, Math.min(100, relevanceScore + quality + trending + topicMismatch + strictTopicPenalty + speechPenalty + classifier.penalty + gate.penalty + productSpecificityPenalty + placeOnlyPenalty + weakMatchPenalty));
    const confidence = maxConfidence === null
      ? uncappedConfidence
      : Math.min(uncappedConfidence, maxConfidence);
    const scoreBreakdown = {
      entities,
      keywords,
      overlap,
      topic,
      classifier: classifier.boost,
      classifierPenalty: classifier.penalty,
      classifierAngleHits: classifier.angleHits,
      classifierExcludeHits: classifier.excludeHits,
      relevanceGate: gate.boost + gate.penalty,
      relevanceGateCap: maxConfidence,
      relevanceGateReasons: gate.reasons,
      candidateAngles: gate.candidateAngles,
      centralEntityHits: gate.centralEntityHits,
      quality,
      trending,
      topicMismatch,
      strictTopicPenalty,
      speechPenalty,
      productSpecificityPenalty,
      placeOnlyPenalty,
      weakMatchPenalty
    };
    const matchTier = matchTierForConfidence(confidence, scoreBreakdown);

    return {
      ...candidate,
      confidence,
      matchTier,
      scoreBreakdown
    };
```

- [ ] **Step 5: Let `rankCandidates` include maybe matches only when requested**

In `rankCandidates`, replace the filter after `map((candidate) => rankCandidate(...))` with:

```js
      .filter((candidate) => candidate.confidence >= minConfidence)
      .filter((candidate) => candidate.matchTier === "strong" || (options.includeMaybe && candidate.matchTier === "maybe"))
```

The full chain should still sort and slice after these filters.

- [ ] **Step 6: Preserve tier information in grouped parent events**

In `mergeGroupCandidate`, after merging `sourceQueries`, add:

```js
    if (candidate.matchTier === "strong" || group.matchTier !== "strong") {
      group.matchTier = candidate.matchTier || group.matchTier || "strong";
    }
```

In `groupCandidatesByEvent`, inside the final returned object, add this property:

```js
          matchTier: parentRank ? parentRank.matchTier : (group.matchTier || "strong"),
```

Place it next to `parentConfidence` and `parentScoreBreakdown`.

- [ ] **Step 7: Run the focused tests**

Run:

```powershell
npm test -- test\polymarket.test.js
```

Expected: all Polymarket tests pass and match-tier tests pass.

- [ ] **Step 8: Commit if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available, commit:

```powershell
git add src/lib/polymarket.js test/polymarket.test.js
git commit -m "feat: add maybe related match tier"
```

If Git is unavailable in this checkout, continue without committing.

---

### Task 5: Use Maybe Fallbacks in the Popup Controller

**Files:**
- Modify: `src/popup/popup.js`
- Test: `test/popupController.test.js`

- [ ] **Step 1: Update the sparse fallback controller test**

Replace the existing `popup fills sparse related results with lower-confidence relevant groups` test in `test/popupController.test.js` with this version.

```js
test("popup fills sparse related results with maybe-related groups", async () => {
  const strongCandidate = {
    id: "btc-strong",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    matchTier: "strong",
    url: "https://polymarket.com/event/bitcoin-150k"
  };
  const maybeCandidate = {
    id: "btc-maybe",
    title: "Bitcoin above $120k?",
    confidence: 46,
    matchTier: "maybe",
    url: "https://polymarket.com/event/bitcoin-120k"
  };
  const { calls, refreshButton } = setupPopup({
    searchResult(options) {
      return options.minConfidence === 55
        ? [strongCandidate]
        : [strongCandidate, maybeCandidate];
    }
  });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "filled related popup run");

  assert.deepEqual(calls.articleSearches.map((call) => call.options.minConfidence), [55, 35]);
  assert.deepEqual(calls.articleSearches.map((call) => call.options.includeSimilar), [true, true]);
  assert.equal(calls.articleSearches[1].options.includeMaybe, true);
  assert.deepEqual(calls.results[0].candidates, [strongCandidate, maybeCandidate]);
  assert.equal(calls.results[0].candidates[1].matchTier, "maybe");
  assert.equal(calls.statuses.at(-1).detail, "2 related markets found");
});
```

- [ ] **Step 2: Run the popup controller test to verify failure**

Run:

```powershell
npm test -- test\popupController.test.js
```

Expected: the test fails because the controller still uses `FILLER_MIN_CONFIDENCE = 48` and does not pass `includeMaybe`.

- [ ] **Step 3: Add a maybe confidence constant**

In `src/popup/popup.js`, replace:

```js
  const FILLER_MIN_CONFIDENCE = 48;
```

with:

```js
  const MAYBE_MIN_CONFIDENCE = 35;
```

- [ ] **Step 4: Update `searchRelatedGroups` related and fallback searches**

In `src/popup/popup.js`, add `includeSimilar: true` to the primary related `searchAndRank` call:

```js
    const candidates = await polymarket.searchAndRank(article, {
      fetchImpl: fetch.bind(global),
      minConfidence: MIN_CONFIDENCE,
      includeSimilar: true,
      maxResults: MAX_RELATED_RANKED_MARKETS
    });
```

In `src/popup/popup.js`, replace the lower-confidence fallback block condition:

```js
    if (resultGroups.length >= MAX_RESULT_GROUPS || FILLER_MIN_CONFIDENCE >= MIN_CONFIDENCE) {
      return { candidates, resultGroups };
    }
```

with:

```js
    if (resultGroups.length >= MAX_RESULT_GROUPS || MAYBE_MIN_CONFIDENCE >= MIN_CONFIDENCE) {
      return { candidates, resultGroups };
    }
```

Then replace the fallback `searchAndRank` call:

```js
      const fillerCandidates = await polymarket.searchAndRank(article, {
        fetchImpl: fetch.bind(global),
        minConfidence: FILLER_MIN_CONFIDENCE,
        maxResults: MAX_RELATED_RANKED_MARKETS
      });
```

with:

```js
      const fillerCandidates = await polymarket.searchAndRank(article, {
        fetchImpl: fetch.bind(global),
        minConfidence: MAYBE_MIN_CONFIDENCE,
        includeMaybe: true,
        includeSimilar: true,
        maxResults: MAX_RELATED_RANKED_MARKETS
      });
```

Then replace the fallback grouping threshold:

```js
          minParentConfidence: FILLER_MIN_CONFIDENCE
```

with:

```js
          minParentConfidence: MAYBE_MIN_CONFIDENCE
```

- [ ] **Step 5: Run the popup controller test**

Run:

```powershell
npm test -- test\popupController.test.js
```

Expected: all popup controller tests pass, including the maybe-related fallback test.

- [ ] **Step 6: Commit if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available, commit:

```powershell
git add src/popup/popup.js test/popupController.test.js
git commit -m "feat: fill popup with maybe related markets"
```

If Git is unavailable in this checkout, continue without committing.

---

### Task 6: Render Maybe-Tier Cards Honestly

**Files:**
- Modify: `src/popup/render.js`
- Test: `test/popupRender.test.js`

- [ ] **Step 1: Write the render regression test**

Add this test in `test/popupRender.test.js` before the no-match/API error test.

```js
test("renders maybe-related cards with a Maybe badge label", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [{
    title: "Next Google Gemini Pro Model: Arena Debut?",
    url: "https://polymarket.com/event/google-gemini-pro-model",
    primaryOutcome: "Yes",
    secondaryOutcome: "No",
    primaryPrice: 0.31,
    secondaryPrice: 0.69,
    primaryPercent: 31,
    outcomeOptions: [
      { label: "Yes", price: 0.31, percent: 31 },
      { label: "No", price: 0.69, percent: 69 }
    ],
    movement: { direction: "flat", value: 0 },
    confidence: 46,
    matchTier: "maybe"
  }]);

  const score = results.querySelector(".market-score");
  assert.match(score.textContent, /46/);
  assert.match(score.textContent, /Maybe/);
  assert.doesNotMatch(score.textContent, /Match/);
});
```

- [ ] **Step 2: Run the render test to verify failure**

Run:

```powershell
npm test -- test\popupRender.test.js
```

Expected: the new test fails because all cards currently render the label `Match`.

- [ ] **Step 3: Add a match badge label helper**

In `src/popup/render.js`, insert this helper before `appendCardContents`.

```js
  function scoreBadgeLabel(candidate) {
    return candidate && candidate.matchTier === "maybe" ? "Maybe" : "Match";
  }
```

- [ ] **Step 4: Use the helper in `appendCardContents`**

In `src/popup/render.js`, replace:

```js
    scoreLabel.textContent = "Match";
```

with:

```js
    scoreLabel.textContent = scoreBadgeLabel(candidate);
```

- [ ] **Step 5: Run the render test**

Run:

```powershell
npm test -- test\popupRender.test.js
```

Expected: all popup render tests pass and maybe-tier cards render `Maybe`.

- [ ] **Step 6: Commit if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available, commit:

```powershell
git add src/popup/render.js test/popupRender.test.js
git commit -m "feat: label maybe related cards"
```

If Git is unavailable in this checkout, continue without committing.

---

### Task 7: Update Live Polymarket Smoke Coverage

**Files:**
- Modify: `scripts/live-polymarket-smoke.js`

- [ ] **Step 1: Replace unsupported endpoint probes**

In `scripts/live-polymarket-smoke.js`, replace the `ENDPOINTS` array with this version.

```js
const ENDPOINTS = [
  {
    source: "public-search",
    url(query) {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("events_status", "active");
      params.set("limit_per_type", "8");
      params.set("keep_closed_markets", "0");
      params.set("search_profiles", "false");
      params.set("search_tags", "false");
      return `${polymarket.GAMMA_API}/public-search?${params.toString()}`;
    }
  },
  {
    source: "events-similar",
    url(query) {
      const params = new URLSearchParams();
      params.set("event_title", query);
      params.set("closed", "false");
      params.set("limit", "5");
      return `${polymarket.GAMMA_API}/events/similar?${params.toString()}`;
    }
  }
];
```

- [ ] **Step 2: Update the endpoint count expectation**

No source line uses the old count directly; the existing final line already uses `QUERIES.length * ENDPOINTS.length`. Keep it unchanged.

- [ ] **Step 3: Run the live Polymarket smoke test**

Run:

```powershell
npm run test:polymarket:live
```

Expected: the script checks `public-search` and `events-similar`, parses at least one candidate, and exits with code 0.

- [ ] **Step 4: Commit if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available, commit:

```powershell
git add scripts/live-polymarket-smoke.js
git commit -m "test: align live smoke with supported search endpoints"
```

If Git is unavailable in this checkout, continue without committing.

---

### Task 8: Full Verification

**Files:**
- No source files changed in this task.
- Uses all files touched by Tasks 1-7.

- [ ] **Step 1: Run the full unit suite**

Run:

```powershell
npm test
```

Expected: all Node tests pass with 0 failures.

- [ ] **Step 2: Run layout smoke**

Run:

```powershell
npm run test:layout
```

Expected: popup layout smoke exits 0 and confirms loaded API images, usable card count, no article preview, and no child-market dropdown content.

- [ ] **Step 3: Run live Polymarket API smoke**

Run:

```powershell
npm run test:polymarket:live
```

Expected: live public-search and events-similar payloads parse, price mapping checks pass, and the command exits 0.

- [ ] **Step 4: Run live article QA**

Run:

```powershell
npm run test:articles:live -- --limit=4 --no-release-gates
```

Expected: at least one readable live article produces displayed markets and at least one readable live article can still produce no strong match or maybe-related-only behavior without crashing.

- [ ] **Step 5: Run browser smoke if Chromium is installed**

Run:

```powershell
npm run test:browser
```

Expected: the extension opens the expanded popup, reaches a terminal phase, renders parent event cards or a valid empty state, and can open a Polymarket event tab. If Playwright Chromium is missing, run `npx playwright-core install chromium` once and rerun this step.

- [ ] **Step 6: Inspect for unsupported search endpoints**

Run:

```powershell
rg -n "/events\\?.*q=|/markets\\?.*q=" src scripts test
```

Expected: no matches in `src`, `scripts`, or `test`.

- [ ] **Step 7: Commit final verification record if this is a Git checkout**

Run:

```powershell
git status --short
```

If Git is available and the previous task commits were skipped, commit all implementation changes:

```powershell
git add src/lib/polymarket.js src/lib/articleSignals.js src/popup/popup.js src/popup/render.js scripts/live-polymarket-smoke.js test/polymarket.test.js test/articleSignals.test.js test/popupController.test.js test/popupRender.test.js
git commit -m "feat: improve related market search"
```

If Git is unavailable in this checkout, report the changed files and verification outputs without committing.

---

## Self-Review

**Spec Coverage:** The plan covers API-correct retrieval, maybe-related fallback behavior, query generation, Pixel Watch false-positive prevention, honest maybe labeling, live smoke updates, and final verification.

**Placeholder Scan:** The plan contains no deferred implementation markers and every code-changing step includes the exact code or test block to add or replace.

**Type Consistency:** The new cross-file field is consistently named `matchTier` with values `"strong"`, `"maybe"`, and `"reject"`. Popup rendering reads `candidate.matchTier`; ranking assigns `candidate.matchTier`; grouping preserves `group.matchTier`.

**Plan Verification Notes:** A live scratch benchmark on June 1, 2026 supported the corrected plan assumptions. Active `public-search` without `optimized=true` preserved strong Dogecoin and Fed matches while avoiding unsupported `/events?q=` and `/markets?q=` noise. Removing sports alias leakage changed the Iran energy case from `Bills` queries to Iran conflict/war/energy queries and surfaced a stronger Iran war result. Product-specific capping kept Google Pixel Watch fallback markets in the maybe tier instead of treating generic Google markets as strong matches.

**Known Risk:** The exact confidence scores for live Polymarket results may shift as market data changes. The deterministic unit tests should anchor tier behavior; live QA should be used as smoke evidence, not as a pixel-perfect ranking oracle.
