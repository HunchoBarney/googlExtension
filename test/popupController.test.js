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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function futureIsoDate(daysAhead = 30) {
  return new Date(Date.now() + (daysAhead * 24 * 60 * 60 * 1000)).toISOString();
}

function setupPopup({ extractResult, searchResult, searchError, tradeDataResult, hyperliquidResult, hyperliquidTradeDataResult, hyperliquidError, enrichGroups, runtimeManifest, tabQueryResults, url = "chrome-extension://extension-id/src/popup/popup.html", useRealRenderer = false, klineAdapter } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <main class="popup-shell">
    <header class="rainbow-topbar">
    <form id="market-search-form">
      <input id="market-search-input" type="search">
      <button id="market-search-button" type="submit"></button>
    </form>
    <div class="menu-wrap">
    <button id="menu-button" type="button" aria-expanded="false"></button>
    <div class="action-menu" id="action-menu" role="menu" aria-hidden="true">
    <button class="action-menu-item" id="profile-button" type="button" role="menuitem"></button>
    <button class="action-menu-item" id="settings-button" type="button" role="menuitem"></button>
    <button class="action-menu-item" id="refresh-button" type="button" role="menuitem"></button>
    <button class="action-menu-item" id="privacy-info-button" type="button" role="menuitem"></button>
    </div>
    </div>
    </header>
    <section class="hero-region">
      <nav class="market-tabs">
        <button class="tab-button is-active" id="related-tab" type="button" data-tab="related">Relevant Markets</button>
        <button class="tab-button" id="trending-tab" type="button" data-tab="trending">Trending</button>
        <button class="tab-button" id="watchlist-tab" type="button" data-tab="watchlist">Watchlist</button>
      </nav>
    </section>
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
    loading: [],
    groupCandidates: [],
    traderEnrichments: [],
    marketSearches: [],
    trendingSearches: [],
    tradeDataRequests: [],
    hyperliquidTradeDataRequests: [],
    hyperliquidArticleSearches: [],
    hyperliquidMarketSearches: [],
    hyperliquidTrendingSearches: [],
    hyperliquidGroupCandidates: [],
    tradeViews: [],
    tradeStreams: [],
    tradeStreamStops: [],
    openedTabs: [],
    reloads: []
  };

  function stubMarketKey(candidate = {}) {
    return String(candidate.id || candidate.eventId || candidate.url || candidate.title || "market").toLowerCase();
  }

  const realRenderer = useRealRenderer ? require("../src/popup/render") : null;
  const renderer = useRealRenderer ? {
    renderStatus(root, phase, title, detail) {
      calls.statuses.push({ phase, title, detail });
      realRenderer.renderStatus(root, phase, title, detail);
    },
    renderArticleContext(root, article) {
      calls.articleContexts.push(article);
      realRenderer.renderArticleContext(root, article);
    },
    renderResults(root, candidates, options) {
      calls.results.push({ candidates, options });
      realRenderer.renderResults(root, candidates, options);
    },
    renderTradeView(root, candidate) {
      calls.tradeViews.push(candidate);
      realRenderer.renderTradeView(root, candidate);
    },
    renderLoading(root, title, detail) {
      calls.loading.push({ title, detail });
      realRenderer.renderLoading(root, title, detail);
    },
    renderEmpty(root, title, detail, options) {
      calls.empty.push({ title, detail, options });
      realRenderer.renderEmpty(root, title, detail, options);
    },
    renderError(root, message, options) {
      calls.errors.push(message);
      realRenderer.renderError(root, message, options);
    },
    marketKey(candidate) {
      return realRenderer.marketKey(candidate);
    },
    orderRowsForBook(book, side) {
      return realRenderer.orderRowsForBook(book, side);
    }
  } : {
    renderStatus(_root, phase, title, detail) {
      calls.statuses.push({ phase, title, detail });
    },
    renderArticleContext(_root, article) {
      calls.articleContexts.push(article);
    },
    renderResults(root, candidates, options) {
      calls.results.push({ candidates, options });
      root.innerHTML = "";
      const hasExpandedKey = Object.prototype.hasOwnProperty.call(options || {}, "expandedMarketKey");
      const expandedKey = hasExpandedKey ? options.expandedMarketKey : "";
      for (const candidate of candidates) {
        const card = dom.window.document.createElement("a");
        card.className = "market-card";
        if (expandedKey && stubMarketKey(candidate) === expandedKey) {
          card.classList.add("market-card-expanded");
        }
        card.href = `#trade-${stubMarketKey(candidate)}`;
        card.dataset.marketKey = stubMarketKey(candidate);
        card.dataset.marketUrl = candidate.url || "https://polymarket.com";
        card.textContent = candidate.title || candidate.eventTitle || "Market";
        if (card.classList.contains("market-card-expanded")) {
          const row = dom.window.document.createElement("div");
          row.className = "market-scenario-row";
          row.dataset.marketRowKey = stubMarketKey(candidate);
          row.textContent = "June 30";
          card.append(row);
        }
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
            <button data-trade-action="refresh" type="button">Refresh data</button>
            <button data-trade-action="open-venue" type="button">Open on Polymarket</button>
          </div>
          <div class="trade-side-row">
            <button class="trade-side-button trade-side-yes is-active" data-trade-side="yes" data-trade-label="Yes" data-trade-price="0.32" data-trade-unit="shares" aria-pressed="true" type="button">Yes 32c</button>
            <button class="trade-side-button trade-side-no" data-trade-side="no" data-trade-label="No" data-trade-price="0.68" data-trade-unit="shares" aria-pressed="false" type="button">No 68c</button>
          </div>
          <section class="trade-order-book" data-trade-data-state="loading">
            <p class="trade-book-state">Loading live depth…</p>
            <div data-trade-book-side="bid"></div>
            <div data-trade-book-side="ask"></div>
          </section>
        </section>`;
    },
    renderLoading(root, title, detail) {
      calls.loading.push({ title, detail });
      root.innerHTML = `<section class="loading-state"><div class="loader"></div><strong>${title}</strong>${detail ? `<p>${detail}</p>` : ""}</section>`;
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
    },
    async fetchClobTradeData(candidate, options) {
      calls.tradeDataRequests.push({ candidate, options });
      return typeof tradeDataResult === "function"
        ? tradeDataResult(candidate, options)
        : (tradeDataResult || null);
    },
    openTradeStream(candidate, handlers) {
      const stream = { venue: "polymarket", candidate, handlers, closed: false };
      calls.tradeStreams.push(stream);
      return () => {
        stream.closed = true;
        calls.tradeStreamStops.push(stream);
      };
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
    },
    async fetchTradeData(candidate, options) {
      calls.hyperliquidTradeDataRequests.push({ candidate, options });
      return typeof hyperliquidTradeDataResult === "function"
        ? hyperliquidTradeDataResult(candidate, options)
        : (hyperliquidTradeDataResult || null);
    },
    openTradeStream(candidate, handlers) {
      const stream = { venue: "hyperliquid", candidate, handlers, closed: false };
      calls.tradeStreams.push(stream);
      return () => {
        stream.closed = true;
        calls.tradeStreamStops.push(stream);
      };
    }
  };

  const chromeMock = {
    tabs: {
      async query() {
        return typeof tabQueryResults === "function"
          ? tabQueryResults()
          : (tabQueryResults || [{ id: 123, url: "https://news.example/article" }]);
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
  if (runtimeManifest) {
    chromeMock.runtime = {
      getManifest() {
        return runtimeManifest;
      },
      reload() {
        calls.reloads.push(true);
      }
    };
  }

  global.window = dom.window;
  global.document = dom.window.document;
  global.chrome = chromeMock;
  dom.window.PMRender = renderer;
  dom.window.PMArticleSignals = signals;
  dom.window.PMPolymarket = polymarket;
  if (klineAdapter) {
    dom.window.PMKLineChart = klineAdapter;
  }
  if (hyperliquidResult !== undefined || hyperliquidTradeDataResult !== undefined || hyperliquidError) {
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

function clickNode(dom, node) {
  assert.ok(node);
  node.dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
}

function clickFirstTradeRow(dom) {
  if (!dom.window.document.querySelector("[data-market-row-key]")) {
    clickNode(dom, dom.window.document.querySelector(".market-card"));
  }
  clickNode(dom, dom.window.document.querySelector("[data-market-row-key]"));
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

test("popup controller shows finding-related-markets loader while related search is pending", async () => {
  let resolveSearch;
  const pendingSearch = new Promise((resolve) => {
    resolveSearch = resolve;
  });
  const { calls, refreshButton } = setupPopup({
    searchResult: () => pendingSearch
  });

  await waitFor(() => calls.loading.length === 1, "related search loading state");

  assert.equal(refreshButton.disabled, true);
  assert.equal(calls.loading[0].title, "Finding related markets");

  resolveSearch([]);
  await waitFor(() => refreshButton.disabled === false && calls.empty.length === 1, "related search completion");
});

test("popup exposes timing entries for the related-market pipeline", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });

  await waitFor(() => (
    refreshButton.disabled === false &&
    calls.results.length >= 1 &&
    (dom.window.__PM_POPUP_TIMINGS || []).some((timing) => timing.label === "trader-enrichment")
  ), "timed popup run");

  const timings = dom.window.__PM_POPUP_TIMINGS || [];
  const labels = timings.map((timing) => timing.label);
  for (const label of [
    "extraction",
    "local-analysis",
    "polymarket-primary-fetch",
    "polymarket-primary-grouping",
    "trader-enrichment",
    "render-results"
  ]) {
    assert.ok(labels.includes(label), `missing timing label ${label}`);
  }
  for (const timing of timings) {
    assert.equal(typeof timing.durationMs, "number");
    assert.ok(timing.durationMs >= 0);
    assert.ok(timing.endedAt >= timing.startedAt);
  }
});

test("popup does not start heavy maybe-related expansion after primary cards render", async () => {
  const strongCandidate = makeBinaryCandidate({
    id: "btc-strong",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    matchTier: "strong",
    url: "https://polymarket.com/event/bitcoin-150k"
  });
  const { calls, refreshButton } = setupPopup({
    searchResult(options) {
      return options.minConfidence === 55 ? [strongCandidate] : [];
    }
  });

  await waitFor(() => calls.results.length === 1, "primary related render");

  assert.equal(refreshButton.disabled, false);
  assert.deepEqual(calls.results[0].candidates.map((candidate) => candidate.id), ["btc-strong"]);
  assert.equal(calls.statuses.at(-1).detail, "1 related event found");
  await delay(750);
  assert.equal(calls.articleSearches.length, 1);
});

test("popup keeps first related cards clickable before optional expansion starts", async () => {
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
  const { dom, calls, refreshButton } = setupPopup({
    searchResult(options) {
      return options.minConfidence === 55
        ? [strongCandidate]
        : [strongCandidate, maybeCandidate];
    },
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => (
    refreshButton.disabled === false &&
    document.querySelector(".market-card") &&
    /Local scan complete/i.test(document.querySelector("#status-region").textContent)
  ), "first complete related render");

  assert.equal(calls.articleSearches.length, 1);
  assert.equal(document.querySelector("#results-region").classList.contains("is-loading"), false);

  clickNode(dom, document.querySelector(".market-card"));
  assert.ok(document.querySelector(".market-card-expanded"));

  await delay(750);
  assert.equal(calls.articleSearches.length, 1);
});

test("popup does not start Hyperliquid article expansion after primary Polymarket cards render", async () => {
  const polymarketCandidate = makeBinaryCandidate({
    id: "pm-btc",
    eventId: "pm-btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
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
    hyperliquidResult: [hyperliquidCandidate]
  });

  await waitFor(() => calls.results.length === 1, "Polymarket render");

  assert.equal(refreshButton.disabled, false);
  assert.deepEqual(calls.results[0].candidates.map((candidate) => candidate.id), ["pm-btc"]);
  await delay(750);
  assert.equal(calls.hyperliquidArticleSearches.length, 0);
});

test("popup renders related cards before trader enrichment finishes", async () => {
  let resolveEnrichment;
  const pendingEnrichment = new Promise((resolve) => {
    resolveEnrichment = resolve;
  });
  const candidate = makeBinaryCandidate({
    id: "pm-btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    conditionId: "0xabc",
    url: "https://polymarket.com/event/bitcoin-150k"
  });
  const { calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    enrichGroups() {
      return pendingEnrichment;
    }
  });

  await waitFor(() => calls.results.length === 1, "related render before enrichment");

  assert.equal(refreshButton.disabled, false);
  assert.deepEqual(calls.results[0].candidates.map((group) => group.traderCount), [undefined]);

  resolveEnrichment([{ ...candidate, traderCount: 123 }]);
  await waitFor(() => calls.results.length === 2, "enriched related render");

  assert.deepEqual(calls.results[1].candidates.map((group) => group.traderCount), [123]);
});

test("legacy detached launcher reloads stale manifest before searching", async () => {
  const { calls } = setupPopup({
    runtimeManifest: { action: {} },
    url: "chrome-extension://extension-id/src/popup/popup.html?expanded=1&sourceTabId=123"
  });

  await waitFor(() => calls.reloads.length === 1, "legacy detached launcher reload");

  assert.equal(calls.executeScript.length, 0);
  assert.deepEqual(calls.statuses.at(-1), {
    phase: "reading",
    title: "Updating popup",
    detail: "Reloading the toolbar popup."
  });
  assert.equal(calls.loading.at(-1).title, "Updating popup");
});

test("results scroll smoothly collapses the visible heading", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?"
  });
  const { dom, calls, refreshButton } = setupPopup({
    url: "chrome-extension://extension-id/src/popup/popup.html?expanded=1",
    searchResult: [candidate]
  });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "expanded popup initial render");

  const document = dom.window.document;
  const shell = document.querySelector(".popup-shell");
  const topbar = document.querySelector(".rainbow-topbar");
  const hero = document.querySelector(".hero-region");
  const results = document.getElementById("results-region");

  results.scrollTop = 24;
  results.dispatchEvent(new dom.window.Event("scroll"));

  await waitFor(() => {
    const topbarHeight = Number.parseFloat(topbar.style.getPropertyValue("--topbar-height"));
    const topbarOpacity = Number.parseFloat(topbar.style.getPropertyValue("--topbar-opacity"));
    const height = Number.parseFloat(hero.style.getPropertyValue("--hero-height"));
    const opacity = Number.parseFloat(hero.style.getPropertyValue("--hero-opacity"));
    return topbarHeight > 0 &&
      topbarHeight < 48 &&
      topbarOpacity > 0 &&
      topbarOpacity < 1 &&
      height > 0 &&
      height < 48 &&
      opacity > 0 &&
      opacity < 1;
  }, "partially collapsed heading");

  results.scrollTop = 72;
  results.dispatchEvent(new dom.window.Event("scroll"));

  await waitFor(() => shell.classList.contains("is-results-scrolled"), "collapsed heading class");
  assert.equal(topbar.style.getPropertyValue("--topbar-height"), "0px");
  assert.equal(topbar.style.getPropertyValue("--topbar-opacity"), "0");
  assert.equal(hero.style.getPropertyValue("--hero-height"), "0px");
  assert.equal(hero.style.getPropertyValue("--hero-opacity"), "0");

  results.scrollTop = 0;
  results.dispatchEvent(new dom.window.Event("scroll"));

  await waitFor(() => !shell.classList.contains("is-results-scrolled") && hero.style.getPropertyValue("--hero-opacity") === "1", "restored heading");
  assert.equal(topbar.style.getPropertyValue("--topbar-height"), "48px");
  assert.equal(hero.style.getPropertyValue("--hero-height"), "48px");
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

test("popup refresh reuses the activation article snapshot when Chrome reports the popup surface", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const tabQueries = [
    [{ id: 123, url: "https://news.example/article" }],
    [{ id: 999, url: "chrome-extension://extension-id/src/popup/popup.html" }]
  ];
  const { calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tabQueryResults() {
      return tabQueries.shift() || [{ id: 999, url: "chrome-extension://extension-id/src/popup/popup.html" }];
    }
  });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");
  refreshButton.click();
  await waitFor(() => refreshButton.disabled === false && calls.results.length === 2, "cached article-tab refresh");

  assert.deepEqual(calls.executeScript.map((call) => call.target.tabId), [123]);
  assert.deepEqual(calls.analyzeOptions.map((options) => options.analysisStrategy), ["classifier", "classifier"]);
});

test("clicking a rendered market toggles it while clicking a date row opens trade view", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    eventId: "btc-event",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin",
    endDate: futureIsoDate()
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate], useRealRenderer: true });
  const document = dom.window.document;
  const shell = document.querySelector(".popup-shell");

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "initial popup run");
  assert.equal(document.querySelector(".market-card-expanded"), null);

  clickNode(dom, document.querySelector(".market-card"));

  assert.equal(calls.tradeViews.length, 0);
  assert.ok(document.querySelector(".market-card-expanded"));

  clickNode(dom, document.querySelector(".market-card"));

  assert.equal(document.querySelector(".market-card-expanded"), null);

  clickNode(dom, document.querySelector(".market-card"));

  await waitFor(() => document.querySelector(".market-card-expanded"), "card re-expansion");
  assert.equal(calls.tradeViews.length, 0);

  clickFirstTradeRow(dom);

  assert.equal(calls.tradeViews.length, 1);
  assert.equal(calls.tradeViews[0].id, "btc");
  assert.equal(shell.classList.contains("is-trade-view"), true);
  assert.equal(calls.statuses.at(-1).title, "Trade view");
});

test("trade view mounts, ranges, and unmounts the KLineCharts adapter", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    eventId: "btc-event",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin",
    endDate: futureIsoDate(),
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ]
  });
  const adapterCalls = {
    mounts: [],
    ranges: [],
    unmounts: []
  };
  const klineAdapter = {
    mountTradeChart(root, market, options) {
      adapterCalls.mounts.push({ root, market, options });
      return {};
    },
    setRange(root, range) {
      adapterCalls.ranges.push({ root, range });
    },
    unmountAll(root) {
      adapterCalls.unmounts.push(root);
    }
  };
  const { dom, refreshButton } = setupPopup({
    searchResult: [candidate],
    useRealRenderer: true,
    klineAdapter
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "initial popup run");
  assert.equal(document.documentElement.dataset.viewMode, "expanded");
  clickNode(dom, document.querySelector(".market-card"));
  clickFirstTradeRow(dom);

  assert.equal(document.documentElement.dataset.viewMode, "trade");
  assert.equal(adapterCalls.mounts.length, 1);
  assert.equal(adapterCalls.mounts[0].market.id, "btc");
  assert.equal(adapterCalls.mounts[0].options.range, "1M");
  assert.deepEqual(adapterCalls.mounts[0].options.outcome, {
    label: "Yes",
    clobTokenId: "yes-token"
  });

  clickNode(dom, document.querySelector("[data-trade-range='1Y']"));
  assert.deepEqual(adapterCalls.ranges.map((call) => call.range), ["1Y"]);

  clickNode(dom, document.querySelector("[data-trade-side='no']"));
  assert.equal(adapterCalls.mounts.length, 2);
  assert.equal(adapterCalls.mounts[1].options.range, "1Y");
  assert.deepEqual(adapterCalls.mounts[1].options.outcome, {
    label: "No",
    clobTokenId: "no-token"
  });

  clickNode(dom, document.querySelector("[data-trade-back]"));
  assert.equal(document.documentElement.dataset.viewMode, "expanded");
  assert.equal(adapterCalls.unmounts.at(-1), document.getElementById("results-region"));
});

test("market expansion animates between measured card heights", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    eventId: "btc-event",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin",
    endDate: futureIsoDate()
  });
  const { dom, refreshButton } = setupPopup({ searchResult: [candidate], useRealRenderer: true });
  const document = dom.window.document;
  const proto = dom.window.HTMLElement.prototype;
  const originalGetBoundingClientRect = proto.getBoundingClientRect;

  function rect(height) {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 420,
      bottom: height,
      width: 420,
      height,
      toJSON() {
        return this;
      }
    };
  }

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "initial popup run");

  proto.getBoundingClientRect = function getBoundingClientRect() {
    if (this.classList && this.classList.contains("market-card")) {
      return rect(this.classList.contains("market-card-expanded") ? 260 : 80);
    }
    return originalGetBoundingClientRect.call(this);
  };

  try {
    clickNode(dom, document.querySelector(".market-card"));

    const expandedCard = document.querySelector(".market-card-expanded");
    assert.ok(expandedCard);
    assert.equal(expandedCard.style.height, "80px");
    assert.equal(expandedCard.style.overflow, "hidden");
    assert.ok(expandedCard.classList.contains("market-card-height-transition"));
    assert.ok(expandedCard.classList.contains("is-expanding"));

    await waitFor(() => expandedCard.style.height === "260px", "expanded card target height");
  } finally {
    proto.getBoundingClientRect = originalGetBoundingClientRect;
  }
});

test("clicking show more reveals all grouped options without opening trade view", async () => {
  const countries = ["Argentina", "Spain", "Brazil", "France", "England", "Germany", "Portugal", "Japan"];
  const candidates = countries.map((country, index) => makeBinaryCandidate({
    id: `world-cup-${country.toLowerCase()}`,
    eventId: "world-cup-winner",
    eventTitle: "World Cup Winner",
    title: `Will ${country} win the 2026 FIFA World Cup?`,
    groupItemTitle: country,
    raw: { groupItemTitle: country },
    endDate: futureIsoDate(60),
    primaryPercent: index === 0 ? 10 : index,
    confidence: 80 - index,
    url: `https://polymarket.com/event/world-cup-winner/${country.toLowerCase()}`
  }));
  const { dom, calls, refreshButton } = setupPopup({ searchResult: candidates, useRealRenderer: true });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "initial popup run");

  clickNode(dom, document.querySelector(".market-card"));
  await waitFor(() => document.querySelector(".market-card-expanded"), "expanded group");

  assert.equal(document.querySelectorAll(".market-scenario-row[data-market-row-key]").length, 6);
  assert.ok(document.querySelector("[data-market-show-more-key]"));

  clickNode(dom, document.querySelector("[data-market-show-more-key]"));

  assert.equal(calls.tradeViews.length, 0);
  assert.ok(document.querySelector(".market-card-expanded"));
  assert.equal(document.querySelectorAll(".market-scenario-row[data-market-row-key]").length, 8);
  assert.equal(document.querySelector("[data-market-show-more-key]"), null);
});

test("clicking a market chevron toggles expansion without opening trade view", async () => {
  const first = makeBinaryCandidate({
    id: "first",
    eventId: "first",
    title: "First market",
    confidence: 70,
    url: "https://polymarket.com/event/first",
    endDate: "2026-09-29T00:00:00.000Z"
  });
  const second = makeBinaryCandidate({
    id: "second",
    eventId: "second",
    title: "Second market",
    confidence: 69,
    url: "https://polymarket.com/event/second",
    endDate: "2026-12-30T00:00:00.000Z"
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [first, second],
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelectorAll(".market-card").length === 2, "initial popup run");

  const secondCard = document.querySelectorAll(".market-card")[1];
  clickNode(dom, secondCard.querySelector("[data-market-toggle]"));

  await waitFor(() => document.querySelectorAll(".market-card")[1].classList.contains("market-card-expanded"), "second card expansion");
  assert.equal(document.querySelectorAll(".market-card-expanded").length, 1);
  assert.equal(calls.tradeViews.length, 0);

  clickNode(dom, document.querySelectorAll(".market-card")[1]);

  assert.equal(calls.tradeViews.length, 0);
  assert.equal(document.querySelector(".market-card-expanded"), null);
});

test("trade action menu exposes only refresh and the matched venue link", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin",
    endDate: futureIsoDate()
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate], useRealRenderer: true });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  clickFirstTradeRow(dom);
  document.querySelector("[data-trade-menu]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(document.querySelector("[data-trade-actions]").hidden, false);

  assert.deepEqual(
    Array.from(document.querySelectorAll("[data-trade-action]")).map((node) => node.textContent),
    ["Refresh data", "Open on Polymarket"]
  );
  assert.equal(document.querySelector("[data-trade-action='settings']"), null);
  assert.equal(document.querySelector("[data-trade-action='connect']"), null);
  assert.equal(document.querySelector("[data-trade-action='info']"), null);
  assert.ok(document.querySelector("[data-trade-action='refresh']"));
  assert.ok(document.querySelector("[data-trade-action='open-venue']"));
  assert.deepEqual(calls.openedTabs, []);
});

test("trade refresh reloads venue data and open venue opens the matched URL", async () => {
  const candidate = makeBinaryCandidate({
    id: "btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin",
    endDate: futureIsoDate()
  });
  const tradeDataResult = {
    tradeDataSource: "clob",
    tradeBooksByTokenId: {},
    tradeChartHistoryByTokenId: {},
    tradeDataFetchedAt: 1780086400000
  };
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult,
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  clickFirstTradeRow(dom);
  await waitFor(() => calls.tradeDataRequests.length === 1, "initial trade data request");

  document.querySelector("[data-trade-menu]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-action='refresh']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  await waitFor(() => calls.tradeDataRequests.length === 2, "refreshed trade data request");
  assert.ok(document.querySelector(".trade-view"));

  document.querySelector("[data-trade-menu]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-action='open-venue']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.deepEqual(calls.openedTabs, [{ url: "https://polymarket.com/event/bitcoin" }]);
});

test("trade refresh immediately clears the live-depth state", async () => {
  const candidate = makeBinaryCandidate({
    id: "refresh-state",
    title: "Will the live market refresh?",
    url: "https://polymarket.com/event/refresh-state",
    endDate: futureIsoDate(),
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ]
  });
  const tradeData = {
    tradeDataSource: "clob",
    tradeBooksByTokenId: {
      "yes-token": { bids: [{ price: 0.31, size: 10 }], asks: [{ price: 0.33, size: 12 }] }
    },
    tradeChartHistoryByTokenId: {},
    tradeDataFetchedAt: 1780086400000
  };
  let requestCount = 0;
  let resolveRefresh;
  const refreshResult = new Promise((resolve) => {
    resolveRefresh = resolve;
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult() {
      requestCount += 1;
      return requestCount === 1 ? tradeData : refreshResult;
    },
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "refresh-state initial popup run");
  clickFirstTradeRow(dom);
  await waitFor(() => calls.tradeStreams.length === 1, "refresh-state stream start");
  calls.tradeStreams[0].handlers.onBook({
    tokenId: "yes-token",
    book: { bids: [{ price: 0.32, size: 20 }], asks: [{ price: 0.34, size: 24 }] },
    timestamp: 1780086500000
  });
  assert.equal(document.querySelector(".trade-order-book").dataset.tradeDataState, "live");

  clickNode(dom, document.querySelector("[data-trade-menu]"));
  clickNode(dom, document.querySelector("[data-trade-action='refresh']"));
  await waitFor(() => calls.tradeDataRequests.length === 2, "refresh-state request");

  try {
    assert.equal(document.querySelector(".trade-order-book").dataset.tradeDataState, "refreshing");
    assert.match(document.querySelector(".trade-book-state").textContent, /Refreshing venue snapshot/);
  } finally {
    resolveRefresh(tradeData);
  }
  await waitFor(() => calls.tradeStreams.length === 2, "refresh-state stream restart");
});

test("open venue refuses an untrusted market URL", async () => {
  const candidate = makeBinaryCandidate({
    id: "untrusted",
    title: "Untrusted market",
    url: "https://evil.example/market",
    endDate: futureIsoDate()
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate], useRealRenderer: true });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "untrusted initial popup run");
  clickNode(dom, document.querySelector(".market-card"));
  clickFirstTradeRow(dom);
  clickNode(dom, document.querySelector("[data-trade-menu]"));
  clickNode(dom, document.querySelector("[data-trade-action='open-venue']"));

  assert.deepEqual(calls.openedTabs, []);
  assert.match(document.querySelector("#surface-message").textContent, /Could not open this venue/);
});

test("real renderer trade data controls work through the popup controller", async () => {
  const candidate = makeBinaryCandidate({
    id: "iran-peace",
    eventId: "iran-peace-event",
    title: "Will the US and Iran reach a permanent peace deal in 2026?",
    eventTitle: "US x Iran permanent peace deal by...?",
    confidence: 88,
    url: "https://polymarket.com/event/us-iran-peace-deal",
    endDate: "2026-12-31T12:00:00.000Z",
    primaryPrice: 0.32,
    secondaryPrice: 0.68,
    primaryPercent: 32,
    endDate: "2026-12-31T00:00:00.000Z",
    volume: 261000000
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate], useRealRenderer: true });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "real renderer initial popup run");

  clickFirstTradeRow(dom);

  assert.ok(document.querySelector(".trade-view"));
  assert.equal(document.querySelector(".trade-view").dataset.marketUrl, "https://polymarket.com/event/us-iran-peace-deal");
  assert.match(document.querySelector(".trade-hero h2").textContent, /permanent peace deal/);
  assert.equal(document.querySelector("[data-trade-buy]"), null);

  const chartHost = document.querySelector("[data-kline-chart]");
  assert.ok(chartHost);
  document.querySelector("[data-trade-range='1Y']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(document.querySelector(".trade-range-button.is-active").dataset.tradeRange, "1Y");
  assert.equal(document.querySelector("[data-kline-chart]"), chartHost);

  document.querySelector("[data-trade-side='no']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(document.querySelector("[data-trade-side='no']").classList.contains("is-active"), true);
  assert.equal(document.querySelector("[data-trade-amount]"), null);
  assert.equal(document.querySelector("[data-trade-max]"), null);

  document.querySelector("[data-trade-back]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(document.querySelector(".trade-view"), null);
  assert.equal(document.querySelectorAll(".market-card").length, 1);
});

test("real renderer hydrates Polymarket trade view with live CLOB data", async () => {
  const chartMounts = [];
  const klineAdapter = {
    mountTradeChart(root, market, options) {
      chartMounts.push({ root, market, options });
      return {};
    },
    setRange() {},
    unmountAll() {}
  };
  const candidate = makeBinaryCandidate({
    id: "iran-peace",
    eventId: "iran-peace-event",
    title: "Will the US and Iran reach a permanent peace deal in 2026?",
    eventTitle: "US x Iran permanent peace deal by...?",
    confidence: 88,
    url: "https://polymarket.com/event/us-iran-peace-deal",
    endDate: "2026-12-31T12:00:00.000Z",
    primaryPrice: 0.32,
    secondaryPrice: 0.68,
    primaryPercent: 32,
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ]
  });
  const tradeDataResult = {
    tradeDataSource: "clob",
    tradeBooksByTokenId: {
      "yes-token": {
        bids: [{ price: 0.31, size: 123 }],
        asks: [{ price: 0.33, size: 456 }]
      },
      "no-token": {
        bids: [{ price: 0.66, size: 789 }],
        asks: [{ price: 0.69, size: 987 }]
      }
    },
    tradeChartHistoryByTokenId: {
      "yes-token": {
        "1M": [
          { t: 1780000000, p: 0.3 },
          { t: 1780086400, p: 0.32 }
        ],
        "1Y": [
          { t: 1760000000, p: 0.2 },
          { t: 1770000000, p: 0.46 },
          { t: 1780086400, p: 0.32 }
        ]
      }
    }
  };
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult,
    useRealRenderer: true,
    klineAdapter
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "CLOB hydrate initial popup run");

  clickFirstTradeRow(dom);

  await waitFor(() => (
    calls.tradeDataRequests.length === 1 &&
    calls.tradeViews.length === 2 &&
    document.querySelector(".trade-book-bid .trade-book-row span:nth-child(2)")?.textContent === "123"
  ), "live CLOB trade hydration");

  assert.equal(calls.tradeDataRequests[0].candidate.id, "iran-peace");
  assert.equal(typeof calls.tradeDataRequests[0].options.fetchImpl, "function");
  assert.deepEqual(
    chartMounts.at(-1).market.tradeChartHistoryByTokenId["yes-token"]["1M"],
    tradeDataResult.tradeChartHistoryByTokenId["yes-token"]["1M"]
  );
  assert.equal(calls.statuses.at(-1).detail, "Live venue data loaded.");

  document.querySelector("[data-trade-side='no']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.deepEqual(
    Array.from(document.querySelector(".trade-book-bid .trade-book-row").querySelectorAll("span")).map((node) => node.textContent),
    ["66\u00a2", "789", "789"]
  );
});

test("streams live depth and chart points while the UTC clock ticks between events", async () => {
  const livePoints = [];
  const klineAdapter = {
    mountTradeChart() {
      return {};
    },
    appendLivePoint(root, market, outcome, point) {
      livePoints.push({ root, market, outcome, point });
      return true;
    },
    setRange() {},
    unmountAll() {}
  };
  const candidate = makeBinaryCandidate({
    id: "streaming-market",
    title: "Will the live market move?",
    url: "https://polymarket.com/event/streaming-market",
    endDate: futureIsoDate(),
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ]
  });
  const tradeDataResult = {
    tradeDataSource: "clob",
    tradeBooksByTokenId: {
      "yes-token": { bids: [{ price: 0.31, size: 10 }], asks: [{ price: 0.33, size: 12 }] },
      "no-token": { bids: [{ price: 0.67, size: 8 }], asks: [{ price: 0.69, size: 9 }] }
    },
    tradeChartHistoryByTokenId: {
      "yes-token": { "1M": [{ t: 1780000000, p: 0.3 }, { t: 1780086400, p: 0.32 }] },
      "no-token": { "1M": [{ t: 1780000000, p: 0.7 }, { t: 1780086400, p: 0.68 }] }
    },
    tradeDataFetchedAt: 1780086400000
  };
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult,
    useRealRenderer: true,
    klineAdapter
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "streaming initial popup run");
  clickFirstTradeRow(dom);
  await waitFor(() => calls.tradeStreams.length === 1, "trade stream start");

  const stream = calls.tradeStreams[0];
  const view = document.querySelector(".trade-view");
  const chartHost = document.querySelector("[data-kline-chart]");
  const book = document.querySelector(".trade-order-book");
  stream.handlers.onOpen();
  assert.match(document.querySelector(".trade-chart-stream-state").textContent, /Connected to Polymarket/);
  stream.handlers.onBook({
    tokenId: "yes-token",
    book: {
      bids: [{ price: 0.32, size: 222 }],
      asks: [{ price: 0.34, size: 333 }]
    },
    timestamp: 1780086500000
  });

  assert.equal(document.querySelector(".trade-view"), view);
  assert.equal(document.querySelector("[data-kline-chart]"), chartHost);
  assert.equal(document.querySelector(".trade-order-book"), book);
  assert.equal(document.querySelector(".trade-book-bid .trade-book-row span:nth-child(2)").textContent, "222");
  assert.equal(book.dataset.tradeDataState, "live");
  assert.match(document.querySelector(".trade-book-state").textContent, /Streaming Polymarket depth/);
  assert.match(document.querySelector(".trade-chart-stream-state").textContent, /Live Polymarket quote/);
  const firstClockText = document.querySelector(".trade-chart-stream-state").textContent;
  await delay(1100);
  assert.notEqual(document.querySelector(".trade-chart-stream-state").textContent, firstClockText);

  const bidRow = document.querySelector(".trade-book-bid .trade-book-row");
  stream.handlers.onBook({
    tokenId: "yes-token",
    book: {
      bids: [{ price: 0.325, size: 225 }],
      asks: [{ price: 0.345, size: 335 }]
    },
    timestamp: 1780086500250
  });
  assert.equal(document.querySelector(".trade-book-bid .trade-book-row"), bidRow);
  assert.deepEqual(
    Array.from(bidRow.querySelectorAll("span")).map((node) => node.textContent),
    ["33\u00a2", "225", "225"]
  );

  stream.handlers.onPrice({
    tokenId: "yes-token",
    price: 0.325,
    timestamp: 1780086500500
  });
  assert.equal(livePoints.length, 1);
  assert.equal(livePoints[0].root, document.getElementById("results-region"));
  assert.equal(livePoints[0].market.id, "streaming-market");
  assert.equal(livePoints[0].outcome.clobTokenId, "yes-token");
  assert.deepEqual(livePoints[0].point, { t: 1780086500500, p: 0.325 });

  stream.handlers.onBook({
    tokenId: "no-token",
    book: {
      bids: [{ price: 0.64, size: 444 }],
      asks: [{ price: 0.66, size: 555 }]
    },
    timestamp: 1780086501000
  });
  clickNode(dom, document.querySelector("[data-trade-side='no']"));
  assert.deepEqual(
    Array.from(document.querySelector(".trade-book-bid .trade-book-row").querySelectorAll("span")).map((node) => node.textContent),
    ["64\u00a2", "444", "444"]
  );

  stream.handlers.onClose();
  assert.equal(book.dataset.tradeDataState, "reconnecting");
  assert.match(document.querySelector(".trade-book-state").textContent, /Reconnecting live stream/);

  clickNode(dom, document.querySelector("[data-trade-back]"));
  assert.equal(stream.closed, true);
  assert.equal(calls.tradeStreamStops.length, 1);
  assert.equal(document.querySelector(".trade-view"), null);
});

test("chart-only stream updates do not mark REST depth live", async () => {
  const livePoints = [];
  const klineAdapter = {
    mountTradeChart() {
      return {};
    },
    appendLivePoint(_root, _market, _outcome, point) {
      livePoints.push(point);
      return true;
    },
    setRange() {},
    unmountAll() {}
  };
  const candidate = makeBinaryCandidate({
    id: "chart-only-update",
    title: "Will the chart move before depth?",
    url: "https://polymarket.com/event/chart-only-update",
    endDate: futureIsoDate(),
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ]
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult: {
      tradeDataSource: "clob",
      tradeBooksByTokenId: {
        "yes-token": { bids: [{ price: 0.31, size: 10 }], asks: [{ price: 0.33, size: 12 }] }
      },
      tradeChartHistoryByTokenId: {},
      tradeDataFetchedAt: 1780086400000
    },
    useRealRenderer: true,
    klineAdapter
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "chart-only initial popup run");
  clickFirstTradeRow(dom);
  await waitFor(() => calls.tradeStreams.length === 1, "chart-only stream start");
  const stream = calls.tradeStreams[0];
  stream.handlers.onOpen();
  stream.handlers.onPrice({ tokenId: "yes-token", price: 0.325, timestamp: 1780086500500 });

  assert.deepEqual(livePoints, [{ t: 1780086500500, p: 0.325 }]);
  assert.equal(document.querySelector(".trade-order-book").dataset.tradeDataState, "connecting");
  assert.match(document.querySelector(".trade-book-state").textContent, /waiting for live update/);
  stream.handlers.onClose();
});

test("selecting an outcome without live depth clears the book instead of inventing rows", async () => {
  const candidate = makeBinaryCandidate({
    id: "one-sided-depth",
    eventId: "one-sided-depth-event",
    title: "Will one side have depth?",
    url: "https://polymarket.com/event/one-sided-depth",
    endDate: futureIsoDate(),
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ]
  });
  const tradeDataResult = {
    tradeDataSource: "clob",
    tradeBooksByTokenId: {
      "yes-token": { bids: [{ price: 0.31, size: 123 }], asks: [{ price: 0.33, size: 456 }] }
    },
    tradeChartHistoryByTokenId: {},
    tradeDataFetchedAt: 1780086400000
  };
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult,
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "one-sided initial popup run");
  clickNode(dom, document.querySelector(".market-card"));
  clickFirstTradeRow(dom);
  await waitFor(() => calls.tradeViews.length === 2 && document.querySelectorAll(".trade-book-row").length === 2, "one-sided live depth");

  clickNode(dom, document.querySelector("[data-trade-side='no']"));

  assert.equal(document.querySelectorAll(".trade-book-row").length, 0);
  assert.equal(document.querySelector(".trade-order-book").dataset.tradeDataState, "unavailable");
  assert.match(document.querySelector(".trade-book-state").textContent, /Depth unavailable/);
});

test("real renderer hydrates Hyperliquid depth and line history", async () => {
  const chartMounts = [];
  const klineAdapter = {
    mountTradeChart(root, market, options) {
      chartMounts.push({ root, market, options });
      return {};
    },
    setRange() {},
    unmountAll() {}
  };
  const candidate = {
    id: "hyperliquid:BTC",
    eventId: "hyperliquid:BTC",
    title: "BTC perpetual market",
    eventTitle: "BTC perpetual market",
    coin: "BTC",
    symbol: "BTC",
    url: "https://app.hyperliquid.xyz/trade/BTC",
    displayValue: "$68,160",
    marketSource: "Hyperliquid",
    sourceLabel: "Hyperliquid",
    source: "hyperliquid",
    raw: { context: { markPx: "68160" } }
  };
  const histories = {
    "1M": [
      { t: 1780000000000, p: 68100 },
      { t: 1780086400000, p: 68200 }
    ]
  };
  const hyperliquidTradeDataResult = {
    tradeDataSource: "hyperliquid",
    tradeBooksByOutcome: {
      long: { bids: [{ price: 68159, size: 0.52785 }], asks: [{ price: 68160, size: 9.04153 }] },
      short: { bids: [{ price: 68159, size: 0.52785 }], asks: [{ price: 68160, size: 9.04153 }] }
    },
    tradeChartHistoryByOutcome: { long: histories, short: histories },
    tradeDataFetchedAt: 1780086400000
  };
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    hyperliquidResult: [],
    hyperliquidTradeDataResult,
    useRealRenderer: true,
    klineAdapter
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "Hyperliquid initial popup run");
  clickNode(dom, document.querySelector(".market-card"));
  clickFirstTradeRow(dom);

  await waitFor(() => (
    calls.hyperliquidTradeDataRequests.length === 1 &&
    document.querySelector(".trade-order-book")?.dataset.tradeDataState === "ready"
  ), "Hyperliquid trade hydration");

  assert.equal(calls.tradeDataRequests.length, 0);
  assert.equal(calls.hyperliquidTradeDataRequests[0].candidate.coin, "BTC");
  assert.deepEqual(
    Array.from(document.querySelector(".trade-book-bid .trade-book-row").querySelectorAll("span")).map((node) => node.textContent),
    ["$68,159", "0.52785", "0.52785"]
  );
  assert.equal(chartMounts.at(-1).market.tradeChartHistoryByOutcome.long["1M"][1].p, 68200);
  assert.equal(chartMounts.at(-1).options.outcome.label, "Long");
});

test("missing venue data becomes unavailable instead of remaining a fake preview", async () => {
  const candidate = makeBinaryCandidate({
    id: "no-depth",
    eventId: "no-depth-event",
    title: "Will this market have depth?",
    url: "https://polymarket.com/event/no-depth",
    endDate: futureIsoDate()
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult: null,
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "unavailable initial popup run");
  clickNode(dom, document.querySelector(".market-card"));
  clickFirstTradeRow(dom);

  await waitFor(() => calls.tradeViews.length === 2, "unavailable trade hydration");

  assert.equal(document.querySelector(".trade-order-book").dataset.tradeDataState, "unavailable");
  assert.match(document.querySelector(".trade-book-state").textContent, /Depth unavailable/);
  assert.equal(document.querySelectorAll(".trade-book-row").length, 0);
});

test("venue request failures render an error instead of unavailable depth", async () => {
  const candidate = makeBinaryCandidate({
    id: "failed-depth",
    eventId: "failed-depth-event",
    title: "Will this venue request fail?",
    url: "https://polymarket.com/event/failed-depth",
    endDate: futureIsoDate()
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult() {
      throw new Error("CLOB offline");
    },
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelector(".market-card"), "error initial popup run");
  clickNode(dom, document.querySelector(".market-card"));
  clickFirstTradeRow(dom);

  await waitFor(() => calls.tradeViews.length === 2, "error trade hydration");

  assert.equal(document.querySelector(".trade-order-book").dataset.tradeDataState, "error");
  assert.match(document.querySelector(".trade-book-state").textContent, /Could not load live depth/);
  assert.equal(document.querySelectorAll(".trade-book-row").length, 0);
});

test("real renderer preserves selected range, side, and menu when live CLOB hydration finishes late", async () => {
  const candidate = makeBinaryCandidate({
    id: "iran-peace",
    eventId: "iran-peace-event",
    title: "Will the US and Iran reach a permanent peace deal in 2026?",
    confidence: 88,
    url: "https://polymarket.com/event/us-iran-peace-deal",
    endDate: "2026-12-31T12:00:00.000Z",
    primaryPrice: 0.32,
    secondaryPrice: 0.68,
    primaryPercent: 32,
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ]
  });
  const tradeDataResult = {
    tradeDataSource: "clob",
    tradeBooksByTokenId: {
      "yes-token": {
        bids: [{ price: 0.31, size: 123 }],
        asks: [{ price: 0.33, size: 456 }]
      },
      "no-token": {
        bids: [{ price: 0.66, size: 789 }],
        asks: [{ price: 0.69, size: 987 }]
      }
    },
    tradeChartHistoryByTokenId: {
      "yes-token": {
        "1M": [
          { t: 1780000000, p: 0.3 },
          { t: 1780086400, p: 0.32 }
        ],
        "1Y": [
          { t: 1760000000, p: 0.2 },
          { t: 1770000000, p: 0.46 },
          { t: 1780086400, p: 0.32 }
        ]
      }
    }
  };
  let resolveTradeData;
  const tradeDataPromise = new Promise((resolve) => {
    resolveTradeData = resolve;
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [candidate],
    tradeDataResult: () => tradeDataPromise,
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "delayed CLOB initial popup run");

  clickFirstTradeRow(dom);

  await waitFor(() => calls.tradeDataRequests.length === 1 && document.querySelector(".trade-view"), "delayed CLOB trade view");

  document.querySelector("[data-trade-range='1Y']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-side='no']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  document.querySelector("[data-trade-menu]").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(document.querySelector("[data-trade-actions]").hidden, false);

  resolveTradeData(tradeDataResult);

  await waitFor(() => calls.tradeViews.length === 2 && calls.statuses.at(-1).detail === "Live venue data loaded.", "delayed CLOB hydration");

  assert.equal(document.querySelector(".trade-range-button.is-active").dataset.tradeRange, "1Y");
  assert.equal(document.querySelector(".trade-side-button.is-active").dataset.tradeSide, "no");
  assert.equal(document.querySelector("[data-trade-actions]").hidden, false);
  assert.deepEqual(
    Array.from(document.querySelector(".trade-book-bid .trade-book-row").querySelectorAll("span")).map((node) => node.textContent),
    ["66\u00a2", "789", "789"]
  );
});

test("real renderer Hyperliquid trade controls stay Long Short through the popup controller", async () => {
  const candidate = {
    id: "hyperliquid:BRENT",
    eventId: "hyperliquid:BRENT",
    title: "BRENT perpetual market",
    eventTitle: "BRENT perpetual market",
    confidence: 82,
    url: "https://app.hyperliquid.xyz/trade/BRENT",
    displayValue: "$95.12",
    markPrice: 95.12,
    primaryOutcome: "Yes",
    secondaryOutcome: "No",
    primaryPrice: 0.41,
    secondaryPrice: 0.59,
    primaryPercent: 41,
    outcomeOptions: [
      { label: "Yes", price: 0.41, percent: 41 },
      { label: "No", price: 0.59, percent: 59 }
    ],
    marketSource: "Hyperliquid",
    sourceLabel: "Hyperliquid",
    source: "hyperliquid",
    raw: {
      context: {
        markPx: "95.12"
      }
    }
  };
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate], useRealRenderer: true });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "real Hyperliquid initial popup run");

  clickFirstTradeRow(dom);

  const ticketText = document.querySelector(".trade-ticket").textContent;
  assert.equal(document.querySelector(".trade-view").dataset.marketUrl, "https://app.hyperliquid.xyz/trade/BRENT");
  assert.equal(document.querySelector("[data-trade-buy]"), null);
  assert.match(ticketText, /Long\s+\$95\.12/);
  assert.match(ticketText, /Short\s+\$95\.12/);
  assert.doesNotMatch(ticketText, /Yes|No|\u00a2/);
  assert.doesNotMatch(document.querySelector(".trade-order-book").textContent, /\u00a2/);

  document.querySelector("[data-trade-side='no']").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.equal(document.querySelector("[data-trade-side='no']").classList.contains("is-active"), true);
});

test("real renderer compact Hyperliquid fallback cards expand before their rows open the internal trade view", async () => {
  const hyperliquidCandidate = {
    id: "hyperliquid:BRENT",
    eventId: "hyperliquid:BRENT",
    title: "Brent crude above $95 by Jul 31?",
    eventTitle: "Brent crude above $95 by Jul 31?",
    confidence: 82,
    url: "https://app.hyperliquid.xyz/trade/BRENT",
    displayValue: "$95.12",
    markPrice: 95.12,
    marketSource: "Hyperliquid",
    sourceLabel: "Hyperliquid",
    source: "hyperliquid",
    raw: {
      context: {
        markPx: "95.12"
      }
    }
  };
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [],
    hyperliquidResult: [hyperliquidCandidate],
    useRealRenderer: true
  });
  const document = dom.window.document;

  await waitFor(() => refreshButton.disabled === false && document.querySelectorAll(".market-card").length === 1, "Hyperliquid fallback card");

  const hyperliquidCard = document.querySelector('a.market-card[data-market-source="Hyperliquid"]');
  assert.ok(hyperliquidCard);
  assert.equal(hyperliquidCard.classList.contains("market-card-expanded"), false);

  clickNode(dom, hyperliquidCard);
  assert.equal(calls.tradeViews.length, 0);
  assert.ok(document.querySelector('a.market-card[data-market-source="Hyperliquid"].market-card-expanded'));

  const resultsRegion = document.querySelector("#results-region");
  resultsRegion.scrollTop = 220;
  clickNode(dom, document.querySelector('a.market-card[data-market-source="Hyperliquid"] [data-market-row-key]'));

  const tradeView = document.querySelector(".trade-view");
  assert.ok(tradeView);
  assert.equal(tradeView.dataset.marketUrl, "https://app.hyperliquid.xyz/trade/BRENT");
  assert.equal(tradeView.querySelector(".source-badge").getAttribute("aria-label"), "Hyperliquid");
  assert.equal(tradeView.querySelector("[data-trade-buy]"), null);
  assert.equal(resultsRegion.scrollTop, 0);
  assert.equal(calls.openedTabs.length, 0);
});

test("popup uses maybe-related groups when primary related search finds no cards", async () => {
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
        ? []
        : [maybeCandidate];
    }
  });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1 && calls.articleSearches.length === 2, "maybe related fallback popup run");

  assert.deepEqual(calls.articleSearches.map((call) => call.options.minConfidence), [55, 35]);
  assert.deepEqual(calls.articleSearches.map((call) => call.options.includeSimilar), [true, true]);
  assert.equal(calls.articleSearches[1].options.includeMaybe, true);
  assert.deepEqual(calls.results[0].candidates, [maybeCandidate]);
  assert.equal(calls.results[0].candidates[0].matchTier, "maybe");
  assert.equal(calls.statuses.at(-1).detail, "1 related event found");
});

test("popup uses Hyperliquid related fallback without Polymarket trader enrichment", async () => {
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
    searchResult: [],
    hyperliquidResult: [hyperliquidCandidate],
    enrichGroups(groups) {
      return groups.map((group) => ({ ...group, traderCount: 123 }));
    }
  });

  await waitFor(() => (
    refreshButton.disabled === false &&
    calls.results.length >= 1 &&
    calls.hyperliquidArticleSearches.length === 1
  ), "Hyperliquid fallback related run");

  assert.equal(calls.hyperliquidArticleSearches.length, 1);
  assert.equal(calls.hyperliquidArticleSearches[0].options.minConfidence, 35);
  assert.equal(calls.hyperliquidGroupCandidates[0].options.maxGroups, 160);
  assert.equal(calls.traderEnrichments.length, 0);
  assert.deepEqual(calls.results[0].candidates.map((group) => group.id), ["hyperliquid:BTC"]);
  assert.equal(calls.results[0].candidates[0].traderCount, undefined);
  assert.equal(calls.results[0].candidates[0].marketSource, "Hyperliquid");
});

test("popup does not render expired or closed markets even if a source returns them", async () => {
  const expiredCandidate = makeBinaryCandidate({
    id: "btc-expired",
    title: "Bitcoin above $100k last month?",
    active: true,
    closed: false,
    endDate: "2000-01-01T00:00:00.000Z",
    url: "https://polymarket.com/event/bitcoin-expired"
  });
  const activeCandidate = makeBinaryCandidate({
    id: "btc-active",
    title: "Bitcoin above $150k next year?",
    active: true,
    closed: false,
    endDate: "2999-01-01T00:00:00.000Z",
    url: "https://polymarket.com/event/bitcoin-active"
  });
  const { dom, calls, refreshButton } = setupPopup({
    searchResult: [expiredCandidate, activeCandidate]
  });

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "closed market guard run");

  assert.deepEqual(calls.results[0].candidates, [activeCandidate]);
  assert.equal(calls.statuses.at(-1).detail, "1 related event found");
  assert.doesNotMatch(dom.window.document.querySelector("#results-region").textContent, /last month/);
  assert.match(dom.window.document.querySelector("#results-region").textContent, /next year/);
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

test("related pagination preserves scroll-collapsed header state", async () => {
  const relatedCandidates = Array.from({ length: 12 }, (_item, index) => makeBinaryCandidate({
    id: `related-${index}`,
    title: `Related market ${index + 1}`,
    confidence: 90 - index,
    matchTier: index < 8 ? "strong" : "maybe",
    url: `https://polymarket.com/event/related-${index}`
  }));
  const { dom, calls, refreshButton } = setupPopup({
    url: "chrome-extension://extension-id/src/popup/popup.html?expanded=1",
    searchResult: relatedCandidates
  });
  const document = dom.window.document;
  const shell = document.querySelector(".popup-shell");
  const results = document.getElementById("results-region");

  await waitFor(() => (
    refreshButton.disabled === false &&
    calls.results.length === 1 &&
    calls.results[0].candidates.length === 8
  ), "initial related batch");

  results.scrollTop = 72;
  results.dispatchEvent(new dom.window.Event("scroll"));
  await waitFor(() => shell.classList.contains("is-results-scrolled"), "collapsed header before pagination");

  document.querySelector("[data-related-load-more]").click();

  await waitFor(() => calls.results.length === 2 && calls.results[1].candidates.length === 12, "expanded related batch");

  assert.equal(results.scrollTop, 72);
  assert.equal(shell.classList.contains("is-results-scrolled"), true);
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

test("popup watchlist tab clears stale results and renders an empty placeholder", async () => {
  const candidate = makeBinaryCandidate({
    id: "related-btc",
    title: "Will Bitcoin hit $150k?",
    confidence: 70,
    url: "https://polymarket.com/event/bitcoin"
  });
  const { dom, calls, refreshButton } = setupPopup({ searchResult: [candidate] });
  const watchlistTab = dom.window.document.getElementById("watchlist-tab");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "initial popup run");

  watchlistTab.click();

  assert.equal(calls.statuses.at(-1).title, "Watchlist");
  assert.equal(calls.empty.at(-1).title, "No watchlist markets yet");
  assert.equal(calls.empty.at(-1).detail, "Saved markets will appear here.");
  assert.equal(calls.empty.at(-1).options.title, "Watchlist");
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

  menuButton.click();
  document.getElementById("profile-button").click();
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(surface.hidden, false);
  assert.match(surface.textContent, /Profile/);
  assert.match(surface.textContent, /Default profile/);

  menuButton.click();
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
  assert.match(surface.textContent, /Data use/);
  assert.match(surface.textContent, /Article text stays on this device/);
  assert.match(surface.textContent, /article title and derived search terms go to Polymarket/i);
  assert.match(surface.textContent, /market-data requests go to Polymarket and Hyperliquid/i);
  assert.doesNotMatch(surface.textContent, /No data leaves device/);

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
  const profileButton = document.getElementById("profile-button");
  const settingsButton = document.getElementById("settings-button");
  const refreshButtonNode = document.getElementById("refresh-button");
  const infoButton = document.getElementById("privacy-info-button");

  await waitFor(() => refreshButton.disabled === false && calls.results.length === 1, "expanded popup initial run");

  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "true");

  menuButton.click();
  assert.equal(shell.classList.contains("is-menu-open"), true);
  assert.equal(menuButton.getAttribute("aria-expanded"), "true");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "false");
  assert.equal(document.activeElement, profileButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, settingsButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, infoButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, profileButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, infoButton);

  actionMenu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, profileButton);

  document.getElementById("outside-button").click();
  assert.equal(shell.classList.contains("is-menu-open"), false);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(actionMenu.getAttribute("aria-hidden"), "true");

  menuButton.click();
  assert.equal(document.activeElement, profileButton);
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
