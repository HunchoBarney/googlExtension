const test = require("node:test");
const assert = require("node:assert/strict");
const signals = require("../src/lib/articleSignals");
globalThis.PMArticleSignals = signals;
const polymarket = require("../src/lib/polymarket");

const priceArticle = {
  title: "Bitcoin sell-off poses risk to nascent altcoin season",
  cleanText: [
    "Bitcoin price support weakened as traders studied whether BTC/USDT could recover.",
    "The article compared ETH/USDT, BNB/USDT, XRP/USDT, SOL/USDT, DOGE/USDT, ADA/USDT, and HYPE/USDT price charts.",
    "Analysts focused on Bitcoin support levels, resistance, price targets, and whether altcoins could follow BTC higher."
  ].join(" ")
};

function market(overrides) {
  return polymarket.normalizeMarket({
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.45\", \"0.55\"]",
    volume: "1000000",
    liquidity: "50000",
    active: true,
    closed: false,
    ...overrides
  });
}

function precisionAt(ids, relevantIds, k) {
  const top = ids.slice(0, k);
  if (!top.length) {
    return 0;
  }
  return top.filter((id) => relevantIds.has(id)).length / top.length;
}

test("local model relevance rejects same-topic markets with the wrong article angle", () => {
  const relevantIds = new Set(["btc-price"]);
  const candidates = [
    market({
      id: "btc-price",
      question: "Will Bitcoin reach $90,000 in May?",
      description: "Bitcoin BTC crypto price target market."
    }),
    market({
      id: "microstrategy-sell",
      question: "MicroStrategy sells any Bitcoin by June 30, 2026?",
      description: "Strategy corporate treasury holdings market."
    }),
    market({
      id: "megaeth-airdrop",
      question: "Will MegaETH perform an airdrop by June 30?",
      description: "MegaETH token launch and airdrop market."
    }),
    market({
      id: "crypto-tax",
      question: "Trump eliminates capital gains tax on crypto before 2027?",
      description: "Crypto tax policy and capital gains market."
    }),
    market({
      id: "weinstein-prison",
      question: "Will Harvey Weinstein be sentenced to no prison time?",
      description: "Legal sentencing market."
    })
  ];

  const analyzed = signals.analyzeArticle(priceArticle);
  const ranked = polymarket.rankCandidates(candidates, analyzed, {
    minConfidence: 55,
    maxResults: 5
  });
  const ids = ranked.map((candidate) => candidate.id);
  const scored = Object.fromEntries(candidates.map((candidate) => [
    candidate.id,
    polymarket.rankCandidate(candidate, analyzed)
  ]));

  assert.equal(analyzed.analysisStrategy, "classifier");
  assert.equal(analyzed.keywordAlgorithm, "local-keyword");
  assert.equal(ids[0], "btc-price");
  assert.equal(precisionAt(ids, relevantIds, 3), 1);
  assert.ok(!ids.includes("microstrategy-sell"));
  assert.ok(!ids.includes("megaeth-airdrop"));
  assert.ok(!ids.includes("crypto-tax"));
  assert.ok(!ids.includes("weinstein-prison"));
  assert.ok(scored["microstrategy-sell"].scoreBreakdown.relevanceGateCap <= 52);
  assert.ok(scored["megaeth-airdrop"].scoreBreakdown.relevanceGateCap <= 45);
  assert.ok(!scored["megaeth-airdrop"].scoreBreakdown.centralEntityHits.includes("Ethereum"));
  assert.equal(scored["btc-price"].scoreBreakdown.relevanceGateReasons.includes("price-angle-match"), true);
  assert.ok(scored["btc-price"].scoreBreakdown.relevanceGate > 0);
});
