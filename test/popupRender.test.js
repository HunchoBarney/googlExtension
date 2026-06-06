const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

function setupRenderer() {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="status"></section>
    <section id="results"></section>
  </body>`, { url: "https://extension.test" });
  global.document = dom.window.document;
  delete require.cache[require.resolve("../src/popup/render")];
  const renderer = require("../src/popup/render");
  return {
    renderer,
    status: dom.window.document.getElementById("status"),
    results: dom.window.document.getElementById("results")
  };
}

test("renders loading and complete status states", () => {
  const { renderer, status } = setupRenderer();

  renderer.renderStatus(status, "reading", "Reading page", "Accessing the active tab.");
  assert.equal(status.querySelector(".scan-status").dataset.phase, "reading");
  assert.ok(status.querySelector(".spinner"));

  renderer.renderStatus(status, "complete", "Local scan complete", "3 related markets found.");
  assert.equal(status.querySelector(".scan-status").dataset.phase, "complete");
  assert.equal(status.querySelector(".spinner"), null);
  assert.match(status.textContent, /Local scan complete/);
  assert.match(status.textContent, /3 related markets found/);
});

test("renders local scan context without repeating the article preview", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderArticleContext(results, {
    title: "Bitcoin preps 3% May downside, but US PMI data may boost BTC price",
    topic: { label: "crypto" },
    classifier: {
      topic: "crypto",
      marketAngles: ["price target"]
    },
    entities: { top: [{ text: "Bitcoin" }, { text: "BTC" }] },
    keywords: [{ text: "bitcoin" }]
  });

  assert.equal(results.querySelector(".article-context"), null);
  assert.doesNotMatch(results.textContent, /Bitcoin preps 3% May downside/);
});

test("renders parent event cards with API image, option percentages, movement, and link", () => {
  const { renderer, results } = setupRenderer();
  const image = "https://polymarket.example/bitcoin.png";

  renderer.renderResults(results, [{
    title: "Will Bitcoin hit $150k in 2026?",
    url: "https://polymarket.com/event/bitcoin-targets",
    image,
    primaryOutcome: "Yes",
    secondaryOutcome: "No",
    primaryPrice: 0.44,
    secondaryPrice: 0.56,
    primaryPercent: 44,
    outcomeOptions: [
      { label: "Yes", price: 0.44, percent: 44 },
      { label: "No", price: 0.56, percent: 56 }
    ],
    movement: { direction: "up", value: 0.02 },
    volume: 1250000,
    traderCount: 12600,
    confidence: 73
  }]);

  const card = results.querySelector(".market-card");
  assert.equal(card.getAttribute("href"), "https://polymarket.com/event/bitcoin-targets");
  assert.equal(results.querySelector(".market-image").getAttribute("src"), image);
  assert.equal(results.querySelector(".market-image-fallback"), null);
  assert.match(card.textContent, /44%/);
  assert.match(card.textContent, /56%/);
  assert.ok(card.querySelector(".probability-track"));
  assert.match(card.textContent, /12.6K traders/);
  assert.match(card.textContent, /\$1.3M volume/);
  assert.match(card.textContent, /Match/);
  assert.match(card.textContent, /Open/);
});

test("falls back to local icon when an API market image is unavailable", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [{
    title: "Will Bitcoin hit $150k in 2026?",
    url: "https://polymarket.com/event/bitcoin-targets",
    image: "https://polymarket.example/missing.png",
    primaryOutcome: "Yes",
    secondaryOutcome: "No",
    primaryPrice: 0.44,
    secondaryPrice: 0.56,
    confidence: 73
  }]);

  const image = results.querySelector(".market-image");
  assert.ok(image);
  image.dispatchEvent(new global.document.defaultView.Event("error"));
  assert.equal(results.querySelector(".market-image"), null);
  assert.ok(results.querySelector(".market-image-fallback"));
});

test("only shows no-strong-match note for a full related result set", () => {
  const { renderer, results } = setupRenderer();
  const base = {
    url: "https://polymarket.com/event/example",
    primaryOutcome: "Yes",
    secondaryOutcome: "No",
    primaryPrice: 0.55,
    secondaryPrice: 0.45,
    confidence: 80
  };

  renderer.renderResults(results, [{
    ...base,
    title: "Single related market"
  }]);
  assert.equal(results.querySelector(".match-limit-note"), null);

  renderer.renderResults(results, [
    { ...base, title: "First related market", eventId: "first" },
    { ...base, title: "Second related market", eventId: "second" },
    { ...base, title: "Third related market", eventId: "third" }
  ]);
  assert.ok(results.querySelector(".match-limit-note"));
});

test("renders one clickable parent event card and hides child markets", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [
    {
      id: "fed-cut",
      eventId: "fed-event",
      eventTitle: "Fed rate decisions",
      title: "Will the Fed cut interest rates in September?",
      url: "https://polymarket.com/event/fed-rate-decisions",
      primaryOutcome: "Yes",
      secondaryOutcome: "No",
      primaryPrice: 0.58,
      secondaryPrice: 0.42,
      primaryPercent: 58,
      outcomeOptions: [
        { label: "Yes", price: 0.58, percent: 58 },
        { label: "No", price: 0.42, percent: 42 }
      ],
      movement: { direction: "flat", value: 0 },
      volume: 500000,
      confidence: 72
    },
    {
      id: "fed-hold",
      eventId: "fed-event",
      eventTitle: "Fed rate decisions",
      title: "Will the Fed hold rates after the next CPI report?",
      url: "https://polymarket.com/event/fed-rate-decisions",
      primaryOutcome: "Yes",
      secondaryOutcome: "No",
      primaryPrice: 0.36,
      secondaryPrice: 0.64,
      primaryPercent: 36,
      outcomeOptions: [
        { label: "Yes", price: 0.36, percent: 36 },
        { label: "No", price: 0.64, percent: 64 }
      ],
      movement: { direction: "flat", value: 0 },
      volume: 400000,
      confidence: 68
    }
  ]);

  const cards = results.querySelectorAll(".market-card");
  assert.equal(cards.length, 1);
  assert.equal(results.querySelectorAll(".event-group").length, 0);
  assert.equal(results.querySelectorAll(".event-child-cards .market-card").length, 0);
  assert.equal(results.querySelector(".event-parent-title").textContent, "Fed rate decisions");
  assert.equal(cards[0].getAttribute("href"), "https://polymarket.com/event/fed-rate-decisions");
  assert.match(results.textContent, /Related markets/);
  assert.doesNotMatch(results.textContent, /Will the Fed hold rates/);
});

test("renders option-agnostic labels for team and multi-option markets", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [{
    title: "NBA Finals winner",
    url: "https://polymarket.com/event/nba-finals-winner",
    primaryOutcome: "Lakers",
    secondaryOutcome: "Celtics",
    primaryPrice: 0.41,
    secondaryPrice: 0.35,
    primaryPercent: 41,
    outcomeOptions: [
      { label: "Lakers", price: 0.41, percent: 41 },
      { label: "Celtics", price: 0.35, percent: 35 },
      { label: "Knicks", price: 0.12, percent: 12 }
    ],
    movement: { direction: "flat", value: 0 },
    confidence: 66
  }]);

  const text = results.querySelector(".market-card").textContent;
  assert.match(text, /Lakers/);
  assert.match(text, /41%/);
  assert.match(text, /Celtics/);
  assert.match(text, /35%/);
  assert.match(text, /Knicks/);
  assert.match(text, /12%/);
  assert.doesNotMatch(text, /Yes/);
  assert.doesNotMatch(text, /No/);
});

test("renders unavailable option prices as n/a instead of zero", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [{
    title: "Will Bitcoin reach an extremely long price target before the end of 2026?",
    url: "https://polymarket.com/event/bitcoin-target",
    primaryOutcome: "Yes",
    secondaryOutcome: "No",
    primaryPrice: null,
    secondaryPrice: null,
    primaryPercent: null,
    movement: { direction: "unknown", value: null },
    confidence: 59
  }]);

  const text = results.textContent;
  assert.match(text, /Yesn\/a/);
  assert.match(text, /Non\/a/);
  assert.doesNotMatch(text, /Yes0%/);
  assert.doesNotMatch(text, /No0%/);
});

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

test("renders no-match and API error states in the market-first surface", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderArticleContext(results, {
    title: "Fed officials wait for CPI",
    topic: { label: "economy/markets" },
    entities: { top: [{ text: "Federal Reserve" }] },
    keywords: [{ text: "rate cuts" }]
  });
  renderer.renderEmpty(results, "No strong Polymarket match was found.", "Related markets were weak.");

  assert.equal(results.querySelector(".article-context"), null);
  assert.match(results.textContent, /No strong Polymarket match/);

  renderer.renderError(results, "Polymarket API returned 500");
  assert.equal(results.querySelector(".article-context"), null);
  assert.match(results.textContent, /Polymarket API returned 500/);
});
