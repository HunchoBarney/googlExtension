const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  makeArticleContext,
  makeBinaryCandidate,
  makeMovement,
  makeOutcome
} = require("../test-support/sharedShapes");

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

  renderer.renderStatus(status, "complete", "Local scan complete", "3 related events found.");
  assert.equal(status.querySelector(".scan-status").dataset.phase, "complete");
  assert.equal(status.querySelector(".spinner"), null);
  assert.match(status.textContent, /Local scan complete/);
  assert.match(status.textContent, /3 related events found/);
});

test("renders local scan context without repeating the article preview", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderArticleContext(results, makeArticleContext({
    title: "Bitcoin preps 3% May downside, but US PMI data may boost BTC price",
    entities: { top: [{ text: "Bitcoin" }, { text: "BTC" }] }
  }));

  assert.equal(results.querySelector(".article-context"), null);
  assert.doesNotMatch(results.textContent, /Bitcoin preps 3% May downside/);
});

test("renders parent event cards with API image, option percentages, movement, and link", () => {
  const { renderer, results } = setupRenderer();
  const image = "https://polymarket.example/bitcoin.png";

  renderer.renderResults(results, [makeBinaryCandidate({
    image,
    movement: makeMovement("up", 0.02),
    volume: 1250000,
    traderCount: 12600,
    confidence: 73,
    category: "Politics",
    tags: ["Iran"]
  })]);

  const card = results.querySelector(".market-card");
  assert.equal(card.getAttribute("href"), "https://polymarket.com/event/bitcoin-targets");
  assert.equal(results.querySelector(".market-image").getAttribute("src"), image);
  assert.equal(results.querySelector(".market-image-fallback"), null);
  assert.match(card.textContent, /44%/);
  assert.match(card.textContent, /56%/);
  assert.ok(card.querySelector(".probability-track"));
  assert.match(card.textContent, /12.6K traders/);
  assert.match(card.textContent, /\$1.3M volume/);
  assert.equal(card.querySelector(".market-score"), null);
  assert.equal(card.querySelector(".category-chip"), null);
  assert.doesNotMatch(card.textContent, /73/);
  assert.doesNotMatch(card.textContent, /Match/);
  assert.doesNotMatch(card.textContent, /Politics/);
  assert.doesNotMatch(card.textContent, /Iran/);
  assert.match(card.textContent, /Open/);
});

test("falls back to local icon when an API market image is unavailable", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [makeBinaryCandidate({
    image: "https://polymarket.example/missing.png",
    confidence: 73
  })]);

  const image = results.querySelector(".market-image");
  assert.ok(image);
  image.dispatchEvent(new global.document.defaultView.Event("error"));
  assert.equal(results.querySelector(".market-image"), null);
  assert.ok(results.querySelector(".market-image-fallback"));
});

test("only shows no-strong-match note for a full related result set", () => {
  const { renderer, results } = setupRenderer();
  const base = makeBinaryCandidate({
    url: "https://polymarket.com/event/example",
    primaryPrice: 0.55,
    secondaryPrice: 0.45,
    confidence: 80
  });

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
      ...makeBinaryCandidate({
        id: "fed-cut",
        title: "Will the Fed cut interest rates in September?",
        url: "https://polymarket.com/event/fed-rate-decisions",
        primaryPrice: 0.58,
        secondaryPrice: 0.42,
        primaryPercent: 58,
        movement: makeMovement("flat", 0),
        volume: 500000,
        confidence: 72
      }),
      eventId: "fed-event",
      eventTitle: "Fed rate decisions"
    },
    {
      ...makeBinaryCandidate({
        id: "fed-hold",
        title: "Will the Fed hold rates after the next CPI report?",
        url: "https://polymarket.com/event/fed-rate-decisions",
        primaryPrice: 0.36,
        secondaryPrice: 0.64,
        primaryPercent: 36,
        movement: makeMovement("flat", 0),
        volume: 400000,
        confidence: 68
      }),
      eventId: "fed-event",
      eventTitle: "Fed rate decisions"
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

  renderer.renderResults(results, [makeBinaryCandidate({
    title: "NBA Finals winner",
    url: "https://polymarket.com/event/nba-finals-winner",
    primaryOutcome: "Lakers",
    secondaryOutcome: "Celtics",
    primaryPrice: 0.41,
    secondaryPrice: 0.35,
    primaryPercent: 41,
    outcomeOptions: [
      makeOutcome("Lakers", 0.41, 41),
      makeOutcome("Celtics", 0.35, 35),
      makeOutcome("Knicks", 0.12, 12)
    ],
    movement: makeMovement("flat", 0),
    confidence: 66
  })]);

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

  renderer.renderResults(results, [makeBinaryCandidate({
    title: "Will Bitcoin reach an extremely long price target before the end of 2026?",
    url: "https://polymarket.com/event/bitcoin-target",
    primaryPrice: null,
    secondaryPrice: null,
    primaryPercent: null,
    movement: makeMovement("unknown", null),
    confidence: 59
  })]);

  const text = results.textContent;
  assert.match(text, /Yesn\/a/);
  assert.match(text, /Non\/a/);
  assert.doesNotMatch(text, /Yes0%/);
  assert.doesNotMatch(text, /No0%/);
});

test("does not expose maybe score badges on related cards", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [makeBinaryCandidate({
    title: "Next Google Gemini Pro Model: Arena Debut?",
    url: "https://polymarket.com/event/google-gemini-pro-model",
    primaryPrice: 0.31,
    secondaryPrice: 0.69,
    primaryPercent: 31,
    movement: makeMovement("flat", 0),
    confidence: 46,
    parentConfidence: 52,
    matchTier: "maybe",
    category: "Tech",
    tags: ["AI"]
  })]);

  const card = results.querySelector(".market-card");
  assert.equal(card.querySelector(".market-score"), null);
  assert.equal(card.querySelector(".category-chip"), null);
  assert.doesNotMatch(card.textContent, /46/);
  assert.doesNotMatch(card.textContent, /52/);
  assert.doesNotMatch(card.textContent, /Maybe/);
  assert.doesNotMatch(card.textContent, /Match/);
  assert.doesNotMatch(card.textContent, /Tech/);
  assert.doesNotMatch(card.textContent, /AI/);
});

test("renders no-match and API error states in the market-first surface", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderArticleContext(results, makeArticleContext({
    title: "Fed officials wait for CPI",
    topic: { label: "economy/markets" },
    entities: { top: [{ text: "Federal Reserve" }] },
    keywords: [{ text: "rate cuts" }]
  }));
  renderer.renderEmpty(results, "No strong Polymarket match was found.", "Related markets were weak.");

  assert.equal(results.querySelector(".article-context"), null);
  assert.match(results.textContent, /No strong Polymarket match/);

  renderer.renderError(results, "Polymarket API returned 500");
  assert.equal(results.querySelector(".article-context"), null);
  assert.match(results.textContent, /Polymarket API returned 500/);
});
