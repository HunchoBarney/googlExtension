const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const classifierModel = require("../src/lib/articleAngleClassifierData.json");
const signals = require("../src/lib/articleSignals");

function analyze(article, options = {}) {
  return signals.analyzeArticle(article, {
    classifierModel,
    ...options
  });
}

test("local classifier emits structured market-angle output from JSON artifact", () => {
  const article = analyze({
    title: "Fed officials wait for CPI before next interest-rate cut",
    cleanText: "Federal Reserve Chair Jerome Powell said inflation data and the next CPI report could decide whether the FOMC lowers rates."
  }, { analysisStrategy: "classifier" });

  assert.equal(article.analysisStrategy, "classifier");
  assert.equal(article.keywordAlgorithm, "local-keyword");
  assert.equal(article.classifier.modelVersion, "local-json-v1");
  assert.equal(article.classifier.mode, "assistive");
  assert.equal(article.classifier.topic, "economy/markets");
  assert.ok(article.classifier.marketAngles.includes("rate decision"));
  assert.ok(article.classifier.confidence >= 0.5);
  assert.ok(article.queries.some((query) => /Fed interest rates|rate decision/i.test(query)));
});

test("classifier golden cases produce expected local topics and market angles", () => {
  const cases = [
    {
      name: "Bitcoin price",
      article: {
        title: "Bitcoin jumps as ETF inflows lift crypto price targets",
        cleanText: "Bitcoin traded above a new level after BTC ETF inflows accelerated and traders debated year-end price targets."
      },
      topic: "crypto",
      angle: "price target"
    },
    {
      name: "crypto business security",
      article: {
        title: "Coinbase expands wallet security after crypto exchange attacks",
        cleanText: "The company said adoption of new wallet controls followed hacks and security incidents across crypto exchanges."
      },
      topic: "crypto",
      angle: "company/adoption/security"
    },
    {
      name: "UK by-election",
      article: {
        title: "UK by-election poll narrows before voters cast ballots",
        cleanText: "Campaign officials said the by-election vote could reshape the party's parliamentary strategy."
      },
      topic: "politics/elections",
      angle: "election"
    },
    {
      name: "Iran diplomacy",
      article: {
        title: "Iran ceasefire talks resume as sanctions remain in focus",
        cleanText: "Diplomats discussed a peace deal, military de-escalation, and oil sanctions after weeks of regional conflict."
      },
      topic: "geopolitics",
      angle: "diplomacy"
    },
    {
      name: "sports matchup",
      article: {
        title: "Lakers face Celtics with NBA playoff seeding at stake",
        cleanText: "The game could decide playoff seeding and which team gets home court in the next matchup."
      },
      topic: "sports",
      angle: "matchup/winner"
    },
    {
      name: "weather storm",
      article: {
        title: "NOAA tracks hurricane risk as storm brings flood warnings",
        cleanText: "Forecasters warned that rain, flood conditions, and storm surge could worsen along the coast."
      },
      topic: "weather/climate",
      angle: "storm"
    }
  ];

  for (const item of cases) {
    const article = analyze(item.article, { analysisStrategy: "classifier" });
    assert.equal(article.classifier.topic, item.topic, item.name);
    assert.ok(article.classifier.marketAngles.includes(item.angle), item.name);
    assert.ok(article.classifier.confidence >= 0.45, item.name);
  }
});

test("classifier returns a conservative no-angle result for local articles", () => {
  const article = analyze({
    title: "Neighborhood library extends weekend hours",
    cleanText: "The local branch added Saturday reading programs, children's story time, and new community meeting rooms."
  }, { analysisStrategy: "classifier" });

  assert.equal(article.classifier.topic, "general");
  assert.ok(article.classifier.confidence < 0.45);
  assert.deepEqual(article.classifier.marketAngles, []);
});

test("local model analysis stays within popup latency budget", () => {
  const article = {
    title: "Bitcoin jumps as ETF inflows lift crypto price targets",
    cleanText: Array(40).fill([
      "Bitcoin traded above a new level after BTC ETF inflows accelerated and traders debated year-end price targets.",
      "Analysts compared Ethereum, Solana, liquidity, exchange volume, and macro policy signals across crypto markets."
    ].join(" ")).join(" ")
  };
  const started = performance.now();
  const runs = 5;
  for (let index = 0; index < runs; index += 1) {
    const analyzed = analyze(article);
    assert.equal(analyzed.analysisStrategy, "classifier");
    assert.ok(analyzed.classifier.confidence >= 0.45);
  }
  const elapsedMs = performance.now() - started;
  assert.ok(elapsedMs < 500, `expected five local model analyses under 500ms, saw ${elapsedMs.toFixed(1)}ms`);
});
