const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  makeArticleContext,
  makeBinaryCandidate
} = require("../test-support/sharedShapes");

function waitFor(condition, label) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;

    function tick() {
      try {
        if (condition()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }

      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, 5);
    }

    tick();
  });
}

function setupPopup({ extractResult, searchResult, searchError, hyperliquidResult, hyperliquidError, enrichGroups, url = "chrome-extension://extension-id/src/popup/popup.html" } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <main class="popup-shell is-menu-open">
    <div class="menu-wrap">
    <button id="menu-button" type="button" aria-expanded="true"></button>
    <div class="action-menu" id="action-menu" role="menu" aria-hidden="false">
    <button class="action-menu-item" id="settings-button" type="button" role="menuitem"></button>
    <button class="action-menu-item" id="refresh-button" type="button" role="menuitem"></button>
    <button class="action-menu-item" id="privacy-info-button" type="button" role="menuitem"></button>
    </div>
    </div>
    <button id="trade-toggle-button" type="button" aria-pressed="false"></button>
    <form id="market-search-form">
      <input id="market-search-input" type="search">
      <button id="market-search-button" type="submit"></button>
    </form>
    <button class="tab-button is-active" id="related-tab" type="button"></button>
    <button class="tab-button" id="trending-tab" type="button"></button>
    <button class="tab-button" id="search-tab" type="button"></button>
    <section id="status-region"></section>
    <section id="surface-message" hidden></section>
    <section id="results-region"></section>
    <button id="outside-button" type="button"></button>
    </main>
  </body>`, {
    url,
    runScripts: "outside-only"
  });

  const calls = {
    statuses: [],
    articleContexts: [],
    results: [],
    empty: [],
    errors: [],
    executeScript: [],
    analyzeOptions: [],
    articleSearches: [],
    groupCandidates: [],
    traderEnrichments: [],
    marketSearches: [],
    trendingSearches: [],
    hyperliquidArticleSearches: [],
    hyperliquidMarketSearches: [],
    hyperliquidTrendingSearches: [],
    hyperliquidGroupCandidates: [],
    tradeViews: [],
    openedTabs: []
  };

  function stubMarketKey(candidate = {}) {
    return String(candidate.id || candidate.eventId || candidate.url || candidate.title || "market").toLowerCase();
  }

  const renderer = {
    renderStatus(_root, phase, title, detail) {
      calls.statuses.push({ phase, title, detail });
    },
    renderArticleContext(_root, article) {
      calls.articleContexts.push(article);
    },
    renderResults(root, candidates, options) {
      calls.results.push({ candidates, options });
      root.innerHTML = "";
      for (const candidate of candidates) {
        const card = dom.window.document.createElement("a");
        card.className = "market-card";
        card.href = `#trade-${stubMarketKey(candidate)}`;
        card.dataset.marketKey = stubMarketKey(candidate);
        card.dataset.marketUrl = candidate.url || "https://polymarket.com";
        card.textContent = candidate.title || candidate.eventTitle || "Market";
        root.append(card);
      }
    },
    renderTradeView(root, candidate) {
      calls.tradeViews.push(candidate);
      root.innerHTML = `
        <section class="trade-view" data-market-url="${candidate.url || "https://polymarket.com/event/test"}">
          <button data-trade-back="true" type="button">Back</button>
          <button data-trade-menu="true" type="button" aria-expanded="false">More</button>
          <div data-trade-actions hidden>
            <button data-trade-action="open-venue" type="button">Open venue</button>
            <button data-trade-action="info" type="button">Information</button>
          </div>
          <div class="trade-side-row">
            <button class="trade-side-button trade-side-yes is-active" data-trade-side="yes" data-trade-label="Yes" data-trade-price="0.32" data-trade-unit="shares" aria-pressed="true" type="button">Yes 32c</button>
            <button class="trade-side-button trade-side-no" data-trade-side="no" data-trade-label="No" data-trade-price="0.68" data-trade-unit="shares" aria-pressed="false" type="button">No 68c</button>
          </div>
          <label>
            <input data-trade-amount="true" value="$100">
            <button data-trade-max="true" type="button">MAX</button>
          </label>
          <button class="trade-buy-button" data-trade-buy="true" type="button">Buy Yes</button>
          <div class="trade-estimate" data-trade-estimate="true">Est. shares: 312.5</div>
          <div data-trade-book-side="bid"><div class="trade-book-row"><span>31c</span><span>1</span><span>1</span></div></div>
          <div data-trade-book-side="ask"><div class="trade-book-row"><span>33c</span><span>1</span><span>1</span></div></div>
        </section>`;
    },
    renderEmpty(_root, title, detail, options) {
      calls.empty.push({ title, detail, options });
    },
    renderError(_root, message) {
      calls.errors.push(message);
    },
    marketKey(candidate) {
      return stubMarketKey(candidate);
    }
  };

  const signals = {
    analyzeArticle(article, options) {
      calls.analyzeOptions.push(options);
      return makeArticleContext({
        ...article,
        analysisStrategy: options.analysisStrategy,
        queries: ["Bitcoin"]
      });
    }
  };

  const polymarket = {
    async searchAndRank(article, options) {
      assert.equal(article.queries[0], "Bitcoin");
      calls.articleSearches.push({ article, options });
      assert.equal(options.maxResults, 160);
      if (searchError) {
        throw searchError;
      }
      return typeof searchResult === "function" ? searchResult(options) : (searchResult || []);
    },
    groupCandidatesByEvent(candidates, options) {
      calls.groupCandidates.push({ candidates, options });
      return candidates.slice(0, options.maxGroups);
    },
    async searchMarkets(query, options) {
      calls.marketSearches.push({ query, options });
      if (searchError) {
        throw searchError;
      }
      return searchResult || [];
    },
    async trendingMarkets(options) {
      calls.trendingSearches.push({ options });
      if (searchError) {
        throw searchError;
      }
      return searchResult || [];
    },
    async enrichGroupsWithTraderCounts(groups, options) {
      calls.traderEnrichments.push({ groups, options });
      return enrichGroups ? enrichGroups(groups, options) : groups;
    }
  };

  function resolveHyperliquidResult(kind, value, options) {
    if (typeof hyperliquidResult === "function") {
      return hyperliquidResult(kind, value, options);
    }
    return hyperliquidResult || [];
  }

  const hyperliquid = {
    async searchAndRank(article, options) {
      calls.hyperliquidArticleSearches.push({ article, options });
      if (hyperliquidError) {
        throw hyperliquidError;
      }
      return resolveHyperliquidResult("related", article, options);
    },
    async searchMarkets(query, options) {
      calls.hyperliquidMarketSearches.push({ query, options });
      if (hyperliquidError) {
        throw hyperliquidError;
      }
      return resolveHyperliquidResult("search", query, options);
    },
    async trendingMarkets(options) {
      calls.hyperliquidTrendingSearches.push({ options });
      if (hyperliquidError) {
        throw hyperliquidError;
      }
      return resolveHyperliquidResult("trending", null, options);
    },
    groupCandidates(candidates, options) {
      calls.hyperliquidGroupCandidates.push({ candidates, options });
      return candidates.slice(0, options.maxGroups).map((candidate) => ({
        ...candidate,
        markets: [candidate],
        marketSource: "Hyperliquid",
        sourceLabel: "Hyperliquid",
        source: "hyperliquid"
      }));
    }
  };

  const chromeMock = {
    tabs: {
      async query() {
        return [{ id: 123 }];
      },
      create(options) {
        calls.openedTabs.push(options);
      }
    },
    scripting: {
      async executeScript(options) {
        calls.executeScript.push(options);
        return [{ result: extractResult || {
          ok: true,
          article: {
            title: "Bitcoin rallies as ETF inflows accelerate",
            cleanText: "Bitcoin rose as ETF inflows accelerated."
          }
        } }];
      }
    }
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.chrome = chromeMock;
  dom.window.PMRender = renderer;
  dom.window.PMArticleSignals = signals;
  dom.window.PMPolymarket = polymarket;
  if (hyperliquidResult !== undefined || hyperliquidError) {
    dom.window.PMHyperliquid = hyperliquid;
  }
  dom.window.fetch = async () => ({ ok: true, json: async () => ({}) });

  delete require.cache[require.resolve("../src/popup/popup")];
  require("../src/popup/popup");

  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

  return {
    dom,
    calls,
    refreshButton: dom.window.document.getElementById("refresh-button")
  };
}

test("popup controller runs extraction, signal analysis, search, and result rendering in order", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "successful popup run");

  assert.deepEqual(calls.statuses.map((status) => status.phase), [
    "reading",
    "extracting",
    "searching",
    "complete"
  ]);
  assert.deepEqual(dom.window.__PM_POPUP_PHASES.map((status) => status.phase), [
    "reading",
    "extracting",
    "searching",
    "complete"
  ]);
  assert.equal(calls.statuses[3].title, "Local scan complete");
  assert.equal(calls.executeScript[0].target.tabId, 123);
  assert.deepEqual(calls.analyzeOptions, [{ analysisStrategy: "classifier", classifierModel: null }]);
  assert.equal(calls.articleSearches[0].options.minConfidence, 55);
  assert.equal(calls.articleSearches[0].options.includeSimilar, true);
  assert.equal(calls.articleSearches[0].options.maxResults, 160);
  assert.equal(calls.articleSearches[0].options.searchLimitPerType, 8);
  assert.equal(calls.articleSearches[0].options.similarLimit, 20);
  assert.equal(calls.groupCandidates[0].options.maxGroups, 160);
  assert.deepEqual(calls.results[0].candidates, [candidate]);
  assert.equal(calls.results[0].options.title, "Related markets");
  assert.equal(calls.empty.length, 0);
  assert.equal(calls.errors.length, 0);
});

test("popup refresh reruns local model analysis", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { calls, refreshButton } = setupPopup({ searchResult: [candidate] });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");
  refreshButton.click();
  await waitFor(() => refreshButton.disabled === false && calls.results.length === 2, "refresh rerun");

  assert.deepEqual(calls.analyzeOptions.map((options) => options.analysisStrategy), ["classifier", "classifier"]);
});

test("clicking a rendered market opens the internal trade view", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });
  const document = dom.window.document;
  const shell = document.querySelector(".popup-shell");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  document.querySelector(".market-card").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.equal(calls.tradeViews.length, 1);
  assert.equal(calls.tradeViews[0].id, "btc");
  assert.equal(shell.classList.contains("is-trade-view"), true);
  assert.equal(calls.statuses.at(-1).title, "Trade view");
});

test("trade action menu opens the matched venue in a new tab", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  document.querySelector(".market-card").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-menu]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(document.querySelector("[data-trade-actions]").hidden, false);

  document.querySelector("[data-trade-action='open-venue']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.deepEqual(calls.openedTabs, [{ url: "https://polymarket.com/event/bitcoin" }]);
  assert.equal(document.querySelector("[data-trade-actions]").hidden, true);
  assert.equal(calls.statuses.at(-1).title, "Opening venue");
});

test("trade action menu opens Hyperliquid venue links unchanged", async () => {
  const candidate = makeBinaryCandidate({
    id: "hyperliquid-btc",
    title: "BTC perpetual market",
    confidence: 70,
    marketSource: "Hyperliquid",
    url: "https://app.hyperliquid.xyz/trade/BTC"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  document.querySelector(".market-card").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-menu]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-action='open-venue']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.deepEqual(calls.openedTabs, [{ url: "https://app.hyperliquid.xyz/trade/BTC" }]);
  assert.equal(calls.statuses.at(-1).title, "Opening venue");
});

test("trade ticket controls update side, amount, and preview detail", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  document.querySelector(".market-card").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-side='no']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.equal(document.querySelector("[data-trade-side='no']").classList.contains("is-active"), true);
  assert.equal(document.querySelector("[data-trade-side='yes']").getAttribute("aria-pressed"), "false");
  assert.equal(document.querySelector("[data-trade-buy]").textContent, "Buy No");
  assert.match(document.querySelector("[data-trade-estimate]").textContent, /Est\. shares: 147\.1/);

  document.querySelector("[data-trade-max]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.equal(document.querySelector("[data-trade-amount]").value, "$1,000");
  assert.match(document.querySelector("[data-trade-estimate]").textContent, /Est\. shares: 1,471/);

  document.querySelector("[data-trade-buy]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.equal(calls.statuses.at(-1).title, "Trade preview");
  assert.match(calls.statuses.at(-1).detail, /No - \$1,000 - Est\. shares: 1,471/);
  assert.match(document.querySelector("#surface-message").textContent, /No - \$1,000 - Est\. shares: 1,471/);
});

test("popup fills sparse related results with maybe-related groups", async () => {
  const strongCandidate = makeBinaryCandidate({
    id: "btc-strong",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    matchTier: "strong",
    url: "https://polymarket.com/event/bitcoin-150k"
  });
  const maybeCandidate = makeBinaryCandidate({
    id: "btc-maybe",
    title: "Bitcoin above $120k?",
    confidence: 46,
    matchTier: "maybe",
    url: "https://polymarket.com/event/bitcoin-120k"
  });
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
  assert.equal(calls.statuses.at(-1).detail, "2 related events found");
});

test("popup merges Hyperliquid related markets without Polymarket trader enrichment", async () => {
  const polymarketCandidate = makeBinaryCandidate({
    id: "pm-btc",
    eventId: "pm-btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    conditionId: "0xabc",
    url: "https://polymarket.com/event/bitcoin-150k"
  });
  const hyperliquidCandidate = makeBinaryCandidate({
    id: "hyperliquid:BTC",
    eventId: "hyperliquid:BTC",
    title: "BTC perpetual market",
    confidence: 82,
    url: "https://app.hyperliquid.xyz/trade/BTC",
    marketSource: "Hyperliquid",
    sourceLabel: "Hyperliquid",
    source: "hyperliquid",
    displayValue: "$105,001",
    primaryPrice: null,
    secondaryPrice: null,
    primaryPercent: null,
    outcomeOptions: []
  });
  const { calls, refreshButton } = setupPopup({
    searchResult: [polymarketCandidate],
    hyperliquidResult: [hyperliquidCandidate],
    enrichGroups(groups) {
      return groups.map((group) => ({ ...group, traderCount: 123 }));
    }
  });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "merged venue related run");

  assert.equal(calls.hyperliquidArticleSearches.length, 1);
  assert.equal(calls.hyperliquidArticleSearches[0].options.minConfidence, 35);
  assert.equal(calls.hyperliquidGroupCandidates[0].options.maxGroups, 160);
  assert.deepEqual(calls.traderEnrichments[0].groups.map((group) => group.id), ["pm-btc"]);
  assert.deepEqual(calls.results[0].candidates.map((group) => group.id), ["pm-btc", "hyperliquid:BTC"]);
  assert.equal(calls.results[0].candidates[0].traderCount, 123);
  assert.equal(calls.results[0].candidates[1].traderCount, undefined);
  assert.equal(calls.results[0].candidates[1].marketSource, "Hyperliquid");
});

test("popup progressively reveals all related groups instead of capping at four", async () => {
  const relatedCandidates = Array.from({ length: 12 }, (_item, index) => makeBinaryCandidate({
    id: `related-${index}`,
    title: `Related market ${index + 1}`,
    confidence: 90 - index,
    matchTier: index < 8 ? "strong" : "maybe",
    url: `https://polymarket.com/event/related-${index}`
  }));
  const { dom, calls, refreshButton } = setupPopup({ searchResult: relatedCandidates });

  await waitFor(() => (
    refreshButton.disabled === false &&
    calls.results.length === 1 &&
    calls.results[0].candidates.length === 8
  ), "initial related batch");

  assert.equal(calls.statuses.at(-1).detail, "12 related events found");
  assert.equal(calls.groupCandidates[0].options.maxGroups, 160);
  assert.deepEqual(calls.results[0].candidates.map((candidate) => candidate.id), relatedCandidates.slice(0, 8).map((candidate) => candidate.id));

  const loadMore = dom.window.document.querySelector("[data-related-load-more]");
  assert.ok(loadMore);
  loadMore.click();

  await waitFor(() => calls.results.length === 2 && calls.results[1].candidates.length === 12, "expanded related batch");

  assert.deepEqual(calls.results[1].candidates.map((candidate) => candidate.id), relatedCandidates.map((candidate) => candidate.id));
  assert.equal(dom.window.document.querySelector("[data-related-load-more]"), null);
});

test("popup controller renders no-readable article state without searching", async () => {
  const { calls, refreshButton } = setupPopup({
    extractResult: {
      ok: false,
      error: "The page does not contain enough readable article text."
    }
  });

  await waitFor(() => refreshButton.disabled === false && calls.empty.length === 1, "article error state");

  assert.deepEqual(calls.statuses.map((status) => status.phase), ["reading", "complete"]);
  assert.equal(calls.statuses[1].title, "No readable article");
  assert.match(calls.empty[0].title, /No readable article/);
  assert.equal(calls.results.length, 0);
});

test("popup controller renders API error state on Polymarket failure", async () => {
  const { calls, refreshButton } = setupPopup({
    searchError: new Error("Polymarket API returned 500")
  });

  await waitFor(() => refreshButton.disabled === false && calls.errors.length === 1, "api error state");

  assert.deepEqual(calls.statuses.map((status) => status.phase), [
    "reading",
    "extracting",
    "searching",
    "error"
  ]);
  assert.equal(calls.statuses[3].title, "API or extension error");
  assert.match(calls.errors[0], /Polymarket API returned 500/);
});

test("popup search form searches Polymarket markets without rerunning article extraction", async () => {
  const searchCandidate = makeBinaryCandidate({
    id: "manual-btc",
    title: "Bitcoin price on May 31?",
    confidence: 82,
    url: "https://polymarket.com/event/bitcoin-price-on-may-31"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [searchCandidate] });
  const input = dom.window.document.getElementById("market-search-input");
  const form = dom.window.document.getElementById("market-search-form");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");
  const extractionCallsAfterInitialRun = calls.executeScript.length;

  input.value = "Bitcoin May";
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  await waitFor(() => calls.marketSearches.length === 1 && calls.results.length === 2, "manual market search");

  assert.equal(calls.marketSearches[0].query, "Bitcoin May");
  assert.equal(calls.marketSearches[0].options.maxResults, 12);
  assert.equal(calls.executeScript.length, extractionCallsAfterInitialRun);
  assert.deepEqual(calls.results[1].candidates, [searchCandidate]);
  assert.equal(calls.results[1].options.title, "Search results");
});

test("popup search tab clears stale related results before a query is submitted", async () => {
  const candidate = makeBinaryCandidate({
    id: "related-btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });
  const searchTab = dom.window.document.getElementById("search-tab");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  searchTab.click();

  assert.equal(calls.statuses.at(-1).title, "Search ready");
  assert.equal(calls.empty.at(-1).title, "Search markets");
  assert.equal(calls.empty.at(-1).detail, "Type a market, token, event, or topic.");
  assert.equal(calls.empty.at(-1).options.title, "Search results");
  assert.equal(calls.results.length, 1);
});

test("popup trending tab loads live trending markets without rerunning article extraction", async () => {
  const trendingCandidate = makeBinaryCandidate({
    id: "trend-btc",
    title: "What price will Bitcoin hit this week?",
    confidence: 88,
    url: "https://polymarket.com/event/bitcoin-weekly"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [trendingCandidate] });
  const trendingTab = dom.window.document.getElementById("trending-tab");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");
  const extractionCallsAfterInitialRun = calls.executeScript.length;

  trendingTab.click();

  await waitFor(() => calls.trendingSearches.length === 1 && calls.results.length === 2, "trending markets");

  assert.equal(calls.trendingSearches[0].options.maxResults, 12);
  assert.equal(calls.executeScript.length, extractionCallsAfterInitialRun);
  assert.deepEqual(calls.results[1].candidates, [trendingCandidate]);
  assert.equal(calls.results[1].options.title, "Trending markets");
});

test("visible menu actions show sighted feedback instead of hidden-only status", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    url: "chrome-extension://extension-id/src/popup/popup.html?expanded=1"
  });
  const document = dom.window.document;
  const surface = document.getElementById("surface-message");
  const shell = document.querySelector(".popup-shell");
  const menuButton = document.getElementById("menu-button");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "expanded popup initial run");

  document.getElementById("settings-button").click();
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(surface.hidden, false);
  assert.match(surface.textContent, /Settings/);
  assert.match(surface.textContent, /Read-only matching/);

  menuButton.click();
  document.getElementById("privacy-info-button").click();
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(surface.hidden, false);
  assert.match(surface.textContent, /Information/);
  assert.match(surface.textContent, /No data leaves device/);

  document.getElementById("trade-toggle-button").click();
  assert.equal(document.getElementById("trade-toggle-button").getAttribute("aria-pressed"), "true");
  assert.match(surface.textContent, /Trade mode on/);

  menuButton.click();
  document.getElementById("refresh-button").click();
  await waitFor(() => calls.results.length === 2, "connect refresh run");
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.match(surface.textContent, /Connected/);
});

test("menu overlay can be toggled, dismissed outside, and closed with Escape", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    url: "chrome-extension://extension-id/src/popup/popup.html?expanded=1"
  });
  const document = dom.window.document;
  const shell = document.querySelector(".popup-shell");
  const menuButton = document.getElementById("menu-button");
  const actionMenu = document.getElementById("action-menu");
  const settingsButton = document.getElementById("settings-button");
  const refreshButtonNode = document.getElementById("refresh-button");
  const infoButton = document.getElementById("privacy-info-button");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "expanded popup initial run");

  assert.equal(shell.classList.contains("is-menu-open"), true);
  assert.equal(menuButton.getAttribute("aria-expanded"), "true");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "false");

  menuButton.click();
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "true");

  menuButton.click();
  assert.equal(shell.classList.contains("is-menu-open"), true);
  assert.equal(menuButton.getAttribute("aria-expanded"), "true");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "false");
  assert.equal(document.activeElement, settingsButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, refreshButtonNode);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, infoButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, settingsButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, infoButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, settingsButton);

  document.getElementById("outside-button").click();
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "true");

  menuButton.click();
  assert.equal(document.activeElement, settingsButton);
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "true");
  assert.equal(document.activeElement, menuButton);
});

test("connect refresh does not show connected when the article is unreadable", async () => {
  const { dom, calls, refreshButton } = setupPopup({
    extractResult: {
      ok: false,
      error: "The page does not contain enough readable article text."
    },
    url: "chrome-extension://extension-id/src/popup/popup.html?expanded=1"
  });
  const surface = dom.window.document.getElementById("surface-message");

  await waitFor(() => refreshButton.disabled === false && calls.empty.length === 1, "initial no-readable state");

  refreshButton.click();

  await waitFor(() => refreshButton.disabled === false && calls.empty.length === 2, "no-readable refresh state");

  assert.match(surface.textContent, /No readable article/);
  assert.doesNotMatch(surface.textContent, /Connected/);
});
