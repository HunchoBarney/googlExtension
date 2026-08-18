const test = require("node:test");
const assert = require("node:assert/strict");
const signals = require("../src/lib/articleSignals");

globalThis.PMArticleSignals = signals;
const hyperliquid = require("../src/lib/hyperliquid");

function metaPayload() {
  return [
    {
      universe: [
        { name: "BTC" },
        { name: "ETH" },
        { name: "DELIST", isDelisted: true },
        { name: "HYPE" }
      ]
    },
    [
      {
        markPx: "105000.5",
        prevDayPx: "100000",
        dayNtlVlm: "123456789",
        openInterest: "25000"
      },
      {
        markPx: "2500",
        prevDayPx: "2600",
        dayNtlVlm: "9000000",
        openInterest: "5000"
      },
      {
        markPx: "1",
        prevDayPx: "1",
        dayNtlVlm: "1",
        openInterest: "1"
      },
      {
        markPx: "38.25",
        prevDayPx: "37.50",
        dayNtlVlm: "45000000",
        openInterest: "1200000"
      }
    ]
  ];
}

function fetchImpl(payload = metaPayload()) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => payload
    };
  };
  fetch.calls = calls;
  return fetch;
}

test("normalizes Hyperliquid meta and asset contexts into venue market candidates", () => {
  const markets = hyperliquid.normalizeMetaAndAssetCtxs(metaPayload());

  assert.deepEqual(markets.map((market) => market.coin), ["BTC", "ETH", "HYPE"]);
  assert.equal(markets[0].id, "hyperliquid:BTC");
  assert.equal(markets[0].url, "https://app.hyperliquid.xyz/trade/BTC");
  assert.equal(markets[0].displayValue, "$105,001");
  assert.equal(markets[0].displayDetail, "$123.5M 24h volume");
  assert.equal(markets[0].movement.direction, "up");
  assert.equal(Math.round(markets[0].movement.value * 100), 5);
  assert.equal(markets[0].marketSource, "Hyperliquid");
  assert.equal(markets[0].source, "hyperliquid");
});

test("searches Hyperliquid markets by article entities and aliases", async () => {
  const fetch = fetchImpl();
  const article = signals.analyzeArticle({
    title: "Bitcoin rallies as BTC ETF inflows accelerate",
    cleanText: "Bitcoin traders watched BTC liquidity while Ethereum lagged."
  });

  const results = await hyperliquid.searchAndRank(article, {
    fetchImpl: fetch,
    maxResults: 4,
    minConfidence: 50
  });

  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.hyperliquid.xyz/info");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), { type: "metaAndAssetCtxs" });
  assert.equal(results[0].coin, "BTC");
  assert.equal(results[0].confidence >= 50, true);
});

test("skips Hyperliquid article search without a crypto signal", async () => {
  const fetch = fetchImpl();
  const article = signals.analyzeArticle({
    title: "Prime minister says immigration plan is not ready",
    cleanText: "The minister said the policy was not ready after opposition lawmakers criticized the plan."
  });

  const results = await hyperliquid.searchAndRank(article, {
    fetchImpl: fetch,
    maxResults: 4,
    minConfidence: 35
  });

  assert.deepEqual(results, []);
  assert.equal(fetch.calls.length, 0);
});

test("searches Hyperliquid markets by manual query", async () => {
  const results = await hyperliquid.searchMarkets("ethereum price", {
    fetchImpl: fetchImpl(),
    maxResults: 4
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].coin, "ETH");
  assert.equal(results[0].marketSource, "Hyperliquid");
});

test("returns top Hyperliquid trending markets by 24h notional volume", async () => {
  const results = await hyperliquid.trendingMarkets({
    fetchImpl: fetchImpl(),
    maxResults: 2
  });

  assert.deepEqual(results.map((market) => market.coin), ["BTC", "HYPE"]);
  assert.deepEqual(results.map((market) => market.sourceQueries), [
    ["Hyperliquid trending"],
    ["Hyperliquid trending"]
  ]);
});

test("groups Hyperliquid venue candidates without changing their source", () => {
  const candidates = hyperliquid.normalizeMetaAndAssetCtxs(metaPayload());
  const groups = hyperliquid.groupCandidates(candidates, { maxGroups: 2 });

  assert.equal(groups.length, 2);
  assert.equal(groups[0].marketSource, "Hyperliquid");
  assert.equal(groups[0].sourceLabel, "Hyperliquid");
  assert.deepEqual(groups[0].markets, [candidates[0]]);
});
