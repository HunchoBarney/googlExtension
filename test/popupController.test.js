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

function setupPopup({ extractResult, searchResult, searchError } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="refresh-button" type="button"></button>
    <button id="settings-button" type="button"></button>
    <form id="market-search-form">
      <input id="market-search-input" type="search">
      <button id="market-search-button" type="submit"></button>
    </form>
    <button class="tab-button is-active" id="related-tab" type="button"></button>
    <button class="tab-button" id="trending-tab" type="button"></button>
    <button class="tab-button" id="search-tab" type="button"></button>
    <section id="status-region"></section>
    <section id="results-region"></section>
  </body>`, {
    url: "chrome-extension://extension-id/src/popup/popup.html",
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
    marketSearches: [],
    trendingSearches: []
  };

  const renderer = {
    renderStatus(_root, phase, title, detail) {
      calls.statuses.push({ phase, title, detail });
    },
    renderArticleContext(_root, article) {
      calls.articleContexts.push(article);
    },
    renderResults(_root, candidates, options) {
      calls.results.push({ candidates, options });
    },
    renderEmpty(_root, title, detail) {
      calls.empty.push({ title, detail });
    },
    renderError(_root, message) {
      calls.errors.push(message);
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
    }
  };

  const chromeMock = {
    tabs: {
      async query() {
        return [{ id: 123 }];
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
