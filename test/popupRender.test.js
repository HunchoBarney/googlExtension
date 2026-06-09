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
  assert.equal(card.tagName, "A");
  assert.match(card.getAttribute("href"), /^#trade-/);
  assert.equal(card.dataset.marketUrl, "https://polymarket.com/event/bitcoin-targets");
  assert.equal(results.querySelector(".market-image").getAttribute("src"), image);
  assert.equal(results.querySelector(".market-image-fallback"), null);
  assert.match(card.textContent, /44%/);
  assert.match(card.textContent, /56%/);
  assert.equal(card.querySelector(".probability-track"), null);
  assert.ok(card.classList.contains("market-card-expanded"));
  assert.equal(card.querySelectorAll(".market-scenario-row").length, 2);
  assert.match(card.textContent, /Polymarket/);
  assert.equal(card.dataset.marketSource, "Polymarket");
  assert.equal(card.querySelector(".source-badge").getAttribute("aria-label"), "Polymarket");
  assert.ok(card.querySelector(".source-polymarket .source-mark"));
  assert.equal(card.querySelector(".market-meta-row"), null);
  assert.doesNotMatch(card.textContent, /traders/);
  assert.doesNotMatch(card.textContent, /volume/);
  assert.equal(card.querySelector(".market-score"), null);
  assert.equal(card.querySelector(".category-chip"), null);
  assert.equal(card.querySelector(".open-link"), null);
  assert.doesNotMatch(card.textContent, /73/);
  assert.doesNotMatch(card.textContent, /Match/);
  assert.doesNotMatch(card.textContent, /Politics/);
  assert.doesNotMatch(card.textContent, /Iran/);
  assert.doesNotMatch(card.textContent, /Open/);
});

test("renders compact secondary cards with source badges, quotes, and chevrons", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [
    makeBinaryCandidate({ id: "first", eventId: "first", title: "First market" }),
    makeBinaryCandidate({
      id: "hyperliquid-market",
      eventId: "second",
      title: "Brent crude above $95 by Jul 31?",
      url: "https://app.hyperliquid.xyz/trade/BRENT",
      primaryPrice: 0.41,
      secondaryPrice: 0.59,
      displayValue: "$95.12",
      displayDetail: "$28.4M 24h volume",
      marketSource: "Hyperliquid",
      movement: makeMovement("up", 0.05)
    })
  ]);

  const cards = results.querySelectorAll(".market-card");
  assert.equal(cards.length, 2);
  assert.ok(cards[0].classList.contains("market-card-expanded"));
  assert.equal(cards[1].classList.contains("market-card-expanded"), false);
  assert.match(cards[1].textContent, /Brent crude above/);
  assert.match(cards[1].textContent, /\$95\.12/);
  assert.doesNotMatch(cards[1].textContent, /41%/);
  assert.match(cards[1].textContent, /Hyperliquid/);
  assert.equal(cards[1].dataset.marketSource, "Hyperliquid");
  assert.match(cards[1].getAttribute("href"), /^#trade-/);
  assert.equal(cards[1].dataset.marketUrl, "https://app.hyperliquid.xyz/trade/BRENT");
  assert.equal(cards[1].querySelector(".source-badge").getAttribute("aria-label"), "Hyperliquid");
  assert.ok(cards[1].querySelector(".source-hyperliquid .source-mark"));
  assert.ok(cards[1].querySelector(".market-quote"));
  assert.ok(cards[1].querySelector(".market-chevron"));
});

test("renders a Hyperliquid-only expanded card with venue price rows", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderResults(results, [makeBinaryCandidate({
    id: "hyperliquid-btc",
    eventId: "hyperliquid-btc",
    title: "BTC perpetual market",
    url: "https://app.hyperliquid.xyz/trade/BTC",
    primaryPrice: null,
    secondaryPrice: null,
    primaryPercent: null,
    outcomeOptions: [],
    displayValue: "$105,001",
    displayDetail: "$123.5M 24h volume",
    primaryOutcome: "Mark",
    marketSource: "Hyperliquid",
    movement: makeMovement("up", 0.05)
  })]);

  const card = results.querySelector(".market-card");
  assert.ok(card.classList.contains("market-card-expanded"));
  assert.equal(card.dataset.marketSource, "Hyperliquid");
  assert.match(card.textContent, /BTC perpetual market/);
  assert.match(card.textContent, /Mark/);
  assert.match(card.textContent, /\$105,001/);
  assert.match(card.textContent, /24h volume/);
  assert.match(card.textContent, /\$123\.5M/);
  assert.doesNotMatch(card.textContent, /n\/a/i);
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
  assert.match(cards[0].getAttribute("href"), /^#trade-/);
  assert.equal(cards[0].dataset.marketUrl, "https://polymarket.com/event/fed-rate-decisions");
  assert.ok(cards[0].classList.contains("market-card-expanded"));
  assert.equal(cards[0].querySelectorAll(".market-scenario-row").length, 2);
  assert.match(cards[0].textContent, /Will the Fed hold rates/);
});

test("renders an internal trade view with chart, order ticket, and order book", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderTradeView(results, makeBinaryCandidate({
    id: "iran-peace",
    title: "Will the US and Iran reach a permanent peace deal in 2026?",
    url: "https://polymarket.com/event/us-iran-peace-deal",
    image: "https://polymarket.example/iran.png",
    volume: 261000000,
    endDate: "2026-12-31T00:00:00.000Z",
    primaryPrice: 0.32,
    secondaryPrice: 0.68,
    primaryPercent: 32,
    movement: makeMovement("up", 0.02)
  }));

  const view = results.querySelector(".trade-view");
  assert.ok(view);
  assert.equal(view.dataset.marketUrl, "https://polymarket.com/event/us-iran-peace-deal");
  assert.match(view.textContent, /Will the US and Iran reach a permanent peace deal in 2026/);
  assert.match(view.textContent, /\$261M Vol/);
  assert.match(view.textContent, /Ends Dec 30, 2026|Ends Dec 31, 2026/);
  assert.ok(view.querySelector("[data-trade-back]"));
  assert.ok(view.querySelector("[data-trade-menu]"));
  assert.equal(view.querySelector("[data-trade-menu]").getAttribute("aria-expanded"), "false");
  assert.equal(view.querySelectorAll("[data-trade-action]").length, 3);
  assert.deepEqual(
    Array.from(view.querySelectorAll("[data-trade-action]")).map((node) => node.textContent),
    ["Settings", "Connect", "Information"]
  );
  assert.equal(view.querySelector("[data-trade-action='open-venue']"), null);
  assert.equal(view.querySelector("[data-trade-actions]").hidden, true);
  assert.ok(view.querySelector(".trade-chart-svg .trade-chart-line"));
  assert.equal(view.querySelector(".trade-chart-price").textContent, "$0.3200");
  assert.equal(view.querySelector(".trade-range-button.is-active").dataset.tradeRange, "1M");
  assert.ok(view.querySelector("[data-trade-range='1Y']").dataset.chartPath);
  assert.notEqual(
    view.querySelector("[data-trade-range='1Y']").dataset.chartPath,
    view.querySelector("[data-trade-range='1M']").dataset.chartPath
  );
  assert.match(view.textContent, /Yes\s+32/);
  assert.match(view.textContent, /No\s+68/);
  assert.equal(view.querySelector(".trade-buy-button").textContent, "Buy Yes");
  assert.match(view.querySelector(".trade-estimate").textContent, /312\.5/);
  assert.equal(view.querySelectorAll(".trade-book-bid .trade-book-row").length, 5);
  assert.equal(view.querySelectorAll(".trade-book-ask .trade-book-row").length, 5);
});

test("trade view renders live CLOB chart history and depth when provided", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderTradeView(results, makeBinaryCandidate({
    id: "iran-peace",
    title: "Will the US and Iran reach a permanent peace deal in 2026?",
    primaryPrice: 0.32,
    secondaryPrice: 0.68,
    primaryPercent: 32,
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ],
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
  }));

  const view = results.querySelector(".trade-view");
  assert.equal(view.querySelector(".trade-chart-price").textContent, "$0.3200");
  assert.equal(view.querySelector("[data-trade-range='1M']").dataset.chartPrice, "$0.3200");
  assert.notEqual(
    view.querySelector("[data-trade-range='1M']").dataset.chartPath,
    view.querySelector("[data-trade-range='1Y']").dataset.chartPath
  );
  assert.deepEqual(
    Array.from(view.querySelector(".trade-book-bid .trade-book-row").querySelectorAll("span")).map((node) => node.textContent),
    ["31\u00a2", "123", "123"]
  );
  assert.deepEqual(
    Array.from(view.querySelector(".trade-book-ask .trade-book-row").querySelectorAll("span")).map((node) => node.textContent),
    ["33\u00a2", "456", "456"]
  );
  const noRows = JSON.parse(view.querySelector("[data-trade-side='no']").dataset.tradeBookBidRows);
  assert.equal(noRows[0].shares, 789);
});

test("trade view prefers the actual market question over grouped event copy", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderTradeView(results, makeBinaryCandidate({
    id: "iran-peace",
    eventTitle: "US x Iran permanent peace deal by...?",
    title: "US x Iran permanent peace deal by...?",
    question: "Will the US and Iran reach a permanent peace deal in 2026?",
    url: "https://polymarket.com/event/us-iran-peace-deal"
  }));

  const heading = results.querySelector(".trade-hero h2");
  assert.equal(heading.textContent, "Will the US and Iran reach a permanent peace deal in 2026?");
});

test("trade view infers the opposite side when a grouped market omits secondary pricing", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderTradeView(results, makeBinaryCandidate({
    id: "grouped-peace",
    title: "US x Iran permanent peace deal by...?",
    url: "https://polymarket.com/event/us-iran-peace",
    primaryPrice: 0.32,
    secondaryPrice: null,
    secondaryOutcome: "No",
    secondaryPercent: null
  }));

  const text = results.querySelector(".trade-ticket").textContent;
  assert.match(text, /Yes\s+32/);
  assert.match(text, /No\s+68/);
  assert.doesNotMatch(text, /No\s+1/);
});

test("trade view uses Hyperliquid mark prices instead of fake binary fallbacks", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderTradeView(results, {
    id: "hyperliquid:BRENT",
    eventId: "hyperliquid:BRENT",
    title: "BRENT perpetual market",
    eventTitle: "BRENT perpetual market",
    url: "https://app.hyperliquid.xyz/trade/BRENT",
    displayValue: "$95.12",
    displayDetail: "$28.4M 24h volume",
    primaryOutcome: "Mark",
    secondaryOutcome: "24h",
    primaryPrice: null,
    secondaryPrice: null,
    primaryPercent: null,
    outcomeOptions: [],
    marketSource: "Hyperliquid",
    sourceLabel: "Hyperliquid",
    source: "hyperliquid",
    raw: {
      context: {
        markPx: "95.12"
      }
    }
  });

  const view = results.querySelector(".trade-view");
  const ticketText = view.querySelector(".trade-ticket").textContent;
  assert.equal(view.dataset.marketUrl, "https://app.hyperliquid.xyz/trade/BRENT");
  assert.equal(view.querySelector(".trade-chart-price").textContent, "$95.12");
  assert.match(ticketText, /Long\s+\$95\.12/);
  assert.match(ticketText, /Short\s+\$95\.12/);
  assert.equal(view.querySelector(".trade-buy-button").textContent, "Buy Long");
  assert.match(view.querySelector(".trade-estimate").textContent, /Est\. contracts:/);
  assert.doesNotMatch(ticketText, /Yes\s+32/);
  assert.doesNotMatch(ticketText, /No\s+68/);
  assert.match(view.querySelector(".trade-book-bid .trade-book-row").textContent, /\$95\./);
  assert.doesNotMatch(view.querySelector(".trade-order-book").textContent, /31\u00a2/);
});

test("trade view ignores stale binary outcome fields for Hyperliquid markets", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderTradeView(results, {
    id: "hyperliquid:BRENT",
    eventId: "hyperliquid:BRENT",
    title: "BRENT perpetual market",
    eventTitle: "BRENT perpetual market",
    url: "https://app.hyperliquid.xyz/trade/BRENT",
    displayValue: "$95.12",
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
  });

  const view = results.querySelector(".trade-view");
  const ticketText = view.querySelector(".trade-ticket").textContent;
  assert.match(ticketText, /Long\s+\$95\.12/);
  assert.match(ticketText, /Short\s+\$95\.12/);
  assert.doesNotMatch(ticketText, /Yes\s+41/);
  assert.doesNotMatch(ticketText, /No\s+59/);
  assert.equal(view.querySelector(".trade-chart-price").textContent, "$95.12");
  assert.doesNotMatch(view.querySelector(".trade-order-book").textContent, /\d+\u00a2/);
});

test("trade view does not invent binary prices for Hyperliquid markets without a mark", () => {
  const { renderer, results } = setupRenderer();

  renderer.renderTradeView(results, {
    id: "hyperliquid:NEW",
    eventId: "hyperliquid:NEW",
    title: "NEW perpetual market",
    eventTitle: "NEW perpetual market",
    url: "https://app.hyperliquid.xyz/trade/NEW",
    primaryOutcome: "Mark",
    secondaryOutcome: "24h",
    primaryPrice: null,
    secondaryPrice: null,
    primaryPercent: null,
    outcomeOptions: [],
    marketSource: "Hyperliquid",
    sourceLabel: "Hyperliquid",
    source: "hyperliquid",
    raw: {
      context: {}
    }
  });

  const view = results.querySelector(".trade-view");
  const ticketText = view.querySelector(".trade-ticket").textContent;
  assert.equal(view.querySelector(".trade-chart-price").textContent, "n/a");
  assert.match(ticketText, /Long\s+n\/a/);
  assert.match(ticketText, /Short\s+n\/a/);
  assert.equal(view.querySelector(".trade-buy-button").textContent, "Buy Long");
  assert.match(view.querySelector(".trade-estimate").textContent, /Est\. contracts: 0/);
  assert.doesNotMatch(ticketText, /Yes\s+1/);
  assert.doesNotMatch(ticketText, /No\s+99/);
  assert.match(view.querySelector(".trade-order-book").textContent, /n\/a/);
  assert.doesNotMatch(view.querySelector(".trade-order-book").textContent, /\d+\u00a2/);
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
