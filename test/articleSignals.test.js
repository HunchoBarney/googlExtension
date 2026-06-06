const test = require("node:test");
const assert = require("node:assert/strict");
const signals = require("../src/lib/articleSignals");

test("detects economy entities, keywords, topic, and rate-market queries", () => {
  const article = signals.analyzeArticle({
    title: "Fed officials wait for CPI before next interest-rate cut",
    cleanText: [
      "Federal Reserve Chair Jerome Powell said inflation data remains central to the timing of rate cuts.",
      "The next CPI report and labor market readings could decide whether the FOMC lowers rates in September.",
      "Treasury yields fell as traders priced a higher chance of easier policy from the central bank."
    ].join(" ")
  });

  assert.equal(article.topic.label, "economy/markets");
  assert.ok(article.entities.institutions.some((entity) => /Fed|Federal Reserve/.test(entity.text)));
  assert.ok(article.entities.people.some((entity) => /Powell/.test(entity.text)));
  assert.ok(article.keywords.length > 0);
  assert.ok(article.queries.some((query) => /Fed interest rates/i.test(query)));
});

test("detects crypto and generates compact Bitcoin queries", () => {
  const article = signals.analyzeArticle({
    title: "Bitcoin jumps as ETF inflows lift crypto sentiment",
    cleanText: [
      "Bitcoin traded above $120,000 after ETF inflows accelerated and BTC futures volume rose.",
      "Ethereum and Solana also advanced as traders watched year-end crypto price targets."
    ].join(" ")
  });

  assert.equal(article.topic.label, "crypto");
  assert.ok(article.entities.crypto.some((entity) => entity.text === "Bitcoin"));
  assert.ok(article.queries.some((query) => /^Bitcoin/i.test(query)));
  assert.ok(article.queries.every((query) => query.length <= 80));
});

test("local keyword scoring favors title-prominent article phrases", () => {
  const keywords = signals.extractKeywords([
    "Bitcoin ETF inflows accelerated early Monday as BTC traders watched the spot fund data.",
    "A market update repeated broad market commentary and market update language several times.",
    "The market update noted liquidity, market update volume, and market update sentiment across assets.",
    "Analysts said ETF inflows remained the key driver for crypto prices."
  ].join(" "), "Bitcoin ETF inflows lift crypto markets");

  const titlePhrase = keywords.find((keyword) => keyword.text === "bitcoin etf");
  const bodyOnlyPhrase = keywords.find((keyword) => keyword.text === "inflows accelerated early monday");

  assert.ok(titlePhrase, "expected a title-centered multi-word phrase");
  assert.ok(bodyOnlyPhrase, "expected a body-only phrase for score comparison");
  assert.ok(titlePhrase.score > bodyOnlyPhrase.score);
  assert.equal(titlePhrase.features.termFrequency, 2);
  assert.equal(titlePhrase.features.firstPosition, 0);
  assert.ok(titlePhrase.features.titleProminence > 0);
  assert.ok(titlePhrase.features.casingProminence > 0);
  assert.ok(titlePhrase.features.sentenceDispersion > 0);
  assert.ok(titlePhrase.features.contextDiversity > 0);
  assert.ok(titlePhrase.features.phraseQuality > 1);
});

test("local keyword scoring is deterministic and exposes scoring components", () => {
  const text = [
    "Iran ceasefire talks began before broader diplomatic meetings in Washington.",
    "Officials discussed regional security and oil markets as Trump advisers evaluated options.",
    "The ceasefire proposal appeared in several briefings while Iran policy dominated headlines."
  ].join(" ");
  const first = signals.extractKeywords(text, "Iran ceasefire talks test Trump policy");
  const second = signals.extractKeywords(text, "Iran ceasefire talks test Trump policy");

  assert.deepEqual(first.map((keyword) => keyword.text), second.map((keyword) => keyword.text));
  assert.equal(first[0].text, "iran ceasefire");
  assert.equal(first[0].algorithm, "local-keyword");
  assert.ok(Number.isFinite(first[0].localScore));
  assert.ok(first[0].features.termFrequency >= 1);
  assert.ok(first[0].features.firstPosition >= 0);
  assert.ok(first[0].features.titleProminence > 0);
  assert.ok(first[0].features.sentenceDispersion > 0);
  assert.ok(first[0].features.sentenceCoverage > 0);
  assert.ok(first[0].features.contextDiversity > 0);
});

test("analyzeArticle uses the local model-assisted keyword path when classifier strategy is requested", () => {
  const article = {
    title: "Fed waits for CPI before rate-cut decision",
    cleanText: "Federal Reserve officials said inflation and CPI data will guide whether the FOMC cuts interest rates this year."
  };
  const analyzed = signals.analyzeArticle(article, { analysisStrategy: "classifier" });

  assert.equal(analyzed.analysisStrategy, "classifier");
  assert.equal(analyzed.keywordAlgorithm, "local-keyword");
  assert.equal(analyzed.classifier.mode, "assistive");
  assert.ok(analyzed.keywords.every((keyword) => keyword.algorithm === "local-keyword"));
  assert.ok(analyzed.queries.length > 0);
});

test("central crypto entities keep quote currencies from dominating price articles", () => {
  const article = signals.analyzeArticle({
    title: "Bitcoin sell-off poses risk to nascent altcoin season",
    cleanText: [
      "Bitcoin price support weakened as traders studied whether BTC/USDT could recover.",
      "The market update also listed ETH/USDT, BNB/USDT, XRP/USDT, SOL/USDT, DOGE/USDT, ADA/USDT, and HYPE/USDT pairs.",
      "Analysts focused on Bitcoin price targets, support levels, resistance, and whether altcoins could follow BTC higher."
    ].join(" ")
  });

  assert.equal(article.topic.label, "crypto");
  assert.equal(article.centralEntities[0].text, "Bitcoin");
  assert.ok(article.entities.crypto.some((entity) => entity.text === "Tether"));
  assert.ok(article.centralEntities.every((entity) => entity.text !== "Tether"));
  assert.ok(article.queries.some((query) => /^Bitcoin price$/i.test(query)));
  assert.ok(article.queries.every((query) => !/^Tether(?:\s|$)/i.test(query)));
  assert.ok(article.queries.every((query) => !/^USDT(?:\s|$)/i.test(query)));
});

test("detects sports topics and team entities", () => {
  const article = signals.analyzeArticle({
    title: "Lakers face Celtics with playoff seeding at stake",
    cleanText: [
      "The NBA matchup between the Lakers and Celtics could alter playoff seeding.",
      "Both teams listed key players as questionable before the game."
    ].join(" ")
  });

  assert.equal(article.topic.label, "sports");
  assert.ok(article.entities.sports.some((entity) => entity.text === "NBA"));
  assert.ok(article.queries.some((query) => /Lakers|NBA/i.test(query)));
});

test("detects Trump and China tariff angles", () => {
  const article = signals.analyzeArticle({
    title: "Trump threatens new China tariffs before election debate",
    cleanText: [
      "Donald Trump said he could impose new tariffs on China if trade negotiations stall.",
      "The proposal became a campaign issue as markets weighed the impact on inflation and manufacturing."
    ].join(" ")
  });

  assert.equal(article.topic.label, "politics/elections");
  assert.ok(article.entities.people.some((entity) => entity.text === "Donald Trump" || entity.text === "Trump"));
  assert.ok(article.entities.places.some((entity) => entity.text === "China"));
  assert.ok(article.queries.some((query) => /Trump/i.test(query)));
});

test("detects Nvidia AI chip and earnings angles", () => {
  const article = signals.analyzeArticle({
    title: "Nvidia AI chip demand lifts earnings expectations",
    cleanText: [
      "Nvidia shares rose as Microsoft and Amazon expanded artificial intelligence data center orders.",
      "Analysts said GPU supply and semiconductor demand could drive another earnings beat."
    ].join(" ")
  });

  assert.ok(["AI/technology", "companies/earnings"].includes(article.topic.label));
  assert.ok(article.entities.companies.some((entity) => entity.text === "Nvidia"));
  assert.ok(article.queries.some((query) => /Nvidia/i.test(query)));
});

test("does not generate company earnings searches from incidental mentions in crypto articles", () => {
  const article = signals.analyzeArticle({
    title: "NEAR token rallies as AI crypto demand returns",
    cleanText: [
      "Ethereum and Bitcoin traders watched AI token momentum as crypto liquidity improved.",
      "The article mentioned Nvidia only as a broader market comparison, not as the subject of the crypto rally."
    ].join(" ")
  });

  assert.ok(article.entities.crypto.some((entity) => entity.text === "Ethereum" || entity.text === "Bitcoin"));
  assert.ok(article.entities.companies.some((entity) => entity.text === "Nvidia"));
  assert.ok(article.queries.some((query) => /Ethereum|Bitcoin|crypto|token/i.test(query)));
  assert.ok(article.queries.every((query) => !/^Nvidia(?:\s|$)/i.test(query)));
});

test("keeps queries title-centered when body text has incidental people, places, or crypto assets", () => {
  const article = signals.analyzeArticle({
    title: "US House lawmakers launch probe into Kalshi and Polymarket insider trading",
    cleanText: [
      "The story focused on prediction market operators Kalshi and Polymarket after lawmakers requested trading records.",
      "A related-links module mentioned Iran, Donald Trump, Ethereum, and XRP, but those were not the subject of the probe."
    ].join(" ")
  });

  assert.ok(article.queries.some((query) => /kalshi|polymarket|insider trading/i.test(query)));
  assert.ok(article.queries.every((query) => !/^House$/i.test(query)));
  assert.ok(article.queries.every((query) => !/^election$/i.test(query)));
  assert.ok(article.queries.every((query) => !/^Iran$/i.test(query)));
  assert.ok(article.queries.every((query) => !/^Ethereum(?:\s|$)/i.test(query)));
  assert.ok(article.queries.every((query) => !/^Donald Trump/i.test(query)));
});

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

test("generates entity and angle queries without sports leakage for energy conflict articles", () => {
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
