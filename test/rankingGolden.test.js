const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const signals = require("../src/lib/articleSignals");
globalThis.PMArticleSignals = signals;
const polymarket = require("../src/lib/polymarket");

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "polymarket", "ranking-golden.json"),
  "utf8"
));

test("ranking golden fixture keeps representative topic ordering stable", () => {
  const candidates = fixture.markets.map((market) => polymarket.normalizeMarket(market));

  for (const item of fixture.articles) {
    const analyzed = signals.analyzeArticle({
      title: item.title,
      cleanText: item.cleanText
    });
    const ranked = polymarket.rankCandidates(candidates, analyzed, {
      minConfidence: 48,
      maxResults: 3
    });

    if (item.expectedTopId === null) {
      assert.equal(ranked.length, 0, item.name);
      continue;
    }

    assert.ok(ranked.length >= 1, item.name);
    assert.equal(ranked[0].id, item.expectedTopId, item.name);
    assert.ok(ranked[0].confidence >= 48, item.name);
    assert.notEqual(ranked[0].id, "closed-bitcoin", item.name);
  }
});

test("local model ranking remains stable when legacy keyword strategy input is ignored", () => {
  const candidates = fixture.markets.map((market) => polymarket.normalizeMarket(market));

  for (const item of fixture.articles) {
    const analyzed = signals.analyzeArticle({
      title: item.title,
      cleanText: item.cleanText
    }, { keywordAlgorithm: "legacy-keyword-mode" });
    const ranked = polymarket.rankCandidates(candidates, analyzed, {
      minConfidence: 48,
      maxResults: 3
    });

    if (item.expectedTopId === null) {
      assert.equal(ranked.length, 0, item.name);
      continue;
    }

    assert.equal(analyzed.keywordAlgorithm, "local-keyword");
    assert.equal(ranked[0] && ranked[0].id, item.expectedTopId, item.name);
  }
});
