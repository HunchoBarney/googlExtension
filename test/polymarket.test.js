const test = require("node:test");
const assert = require("node:assert/strict");
const signals = require("../src/lib/articleSignals");
globalThis.PMArticleSignals = signals;
const polymarket = require("../src/lib/polymarket");

function article(overrides = {}) {
  return signals.analyzeArticle({
    title: "Bitcoin rallies as ETF inflows accelerate",
    cleanText: [
      "Bitcoin rose after BTC ETF inflows accelerated and traders debated whether crypto markets would reach new highs.",
      "The article focused on Bitcoin price targets, exchange liquidity, and year-end prediction markets."
    ].join(" "),
    ...overrides
  });
}

test("parses stringified Yes/No outcome fields safely", () => {
  const market = polymarket.normalizeMarket({
    id: "1",
    question: "Will Bitcoin hit $150k by December 31?",
    slug: "will-bitcoin-hit-150k",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.37\", \"0.63\"]",
    clobTokenIds: "[\"100\", \"200\"]",
    active: true,
    closed: false
  });

  assert.deepEqual(market.outcomes, ["Yes", "No"]);
  assert.equal(market.primaryOutcome, "Yes");
  assert.equal(market.secondaryOutcome, "No");
  assert.equal(market.primaryPrice, 0.37);
  assert.equal(market.primaryPercent, 37);
  assert.equal(market.yesPrice, 0.37);
  assert.deepEqual(market.outcomeOptions.map((option) => ({
    label: option.label,
    percent: option.percent
  })), [
    { label: "Yes", percent: 37 },
    { label: "No", percent: 63 }
  ]);
  assert.deepEqual(market.clobTokenIds, ["100", "200"]);
});

test("parses Up/Down markets and missing movement fields", () => {
  const market = polymarket.normalizeMarket({
    id: "2",
    question: "Will BTC move Up or Down today?",
    outcomes: "[\"Up\", \"Down\"]",
    outcomePrices: "[\"0.52\", \"0.48\"]",
    active: true,
    closed: false
  });

  assert.equal(market.primaryOutcome, "Up");
  assert.equal(market.secondaryOutcome, "Down");
  assert.equal(market.primaryPercent, 52);
  assert.equal(market.upPrice, 0.52);
  assert.equal(market.movement.direction, "unknown");
});

test("preserves non-binary outcome labels and percentages", () => {
  const market = polymarket.normalizeMarket({
    id: "nba-winner",
    question: "Who will win the NBA Finals?",
    outcomes: "[\"Lakers\", \"Celtics\", \"Knicks\"]",
    outcomePrices: "[\"0.41\", \"0.35\", \"0.12\"]",
    active: true,
    closed: false
  });

  assert.deepEqual(market.outcomeOptions.map((option) => ({
    label: option.label,
    percent: option.percent
  })), [
    { label: "Lakers", percent: 41 },
    { label: "Celtics", percent: 35 },
    { label: "Knicks", percent: 12 }
  ]);
  assert.equal(market.primaryOutcome, "Lakers");
  assert.equal(market.secondaryOutcome, "Celtics");
});

test("handles missing prices without throwing", () => {
  const market = polymarket.normalizeMarket({
    id: "missing-prices",
    question: "Will the Fed cut rates in September?",
    outcomes: "[\"Yes\", \"No\"]",
    active: true,
    closed: false
  });

  assert.equal(market.primaryOutcome, "Yes");
  assert.equal(market.primaryPrice, null);
  assert.equal(market.primaryPercent, null);
  assert.equal(market.secondaryPrice, null);
});

test("flattens grouped events with markets", () => {
  const candidates = polymarket.flattenPayload({
    events: [{
      id: "event-1",
      slug: "when-will-bitcoin-hit-150k",
      title: "When will Bitcoin hit $150k?",
      image: "https://example.com/btc.png",
      active: true,
      closed: false,
      markets: [{
        id: "market-1",
        question: "Will Bitcoin hit $150k by December 31?",
        outcomes: "[\"Yes\", \"No\"]",
        outcomePrices: "[\"0.41\", \"0.59\"]",
        active: true,
        closed: false
      }]
    }]
  }, { query: "Bitcoin" });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].eventSlug, "when-will-bitcoin-hit-150k");
  assert.equal(candidates[0].image, "https://example.com/btc.png");
  assert.equal(candidates[0].sourceQueries[0], "Bitcoin");
});

test("normalizes Polymarket image variants from market and event payloads", () => {
  const marketImage = polymarket.normalizeMarket({
    id: "image-market",
    question: "Will Bitcoin hit $150k in 2026?",
    imageOptimized: { url: "https://example.com/optimized-market.webp" },
    active: true,
    closed: false
  }, {
    image: "https://example.com/event.png"
  });
  const eventImage = polymarket.normalizeMarket({
    id: "image-event",
    question: "Will Ethereum hit $10k in 2026?",
    active: true,
    closed: false
  }, {
    imageUrl: "https://example.com/event-image-url.png"
  });

  assert.equal(marketImage.image, "https://example.com/optimized-market.webp");
  assert.equal(eventImage.image, "https://example.com/event-image-url.png");
});

test("normalizes condition ids for Data API market metadata", () => {
  const market = polymarket.normalizeMarket({
    id: "condition-market",
    conditionId: "0xabc",
    question: "Will Bitcoin hit $150k in 2026?",
    active: true,
    closed: false
  });

  assert.equal(market.conditionId, "0xabc");
});

test("enriches grouped markets with public position holder counts", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => [
        {
          positions: [
            { proxyWallet: "0xA" },
            { proxyWallet: "0xB" },
            { proxyWallet: "0xA" }
          ]
        },
        {
          positions: [
            { proxyWallet: "0xC" }
          ]
        }
      ]
    };
  };

  const [group] = await polymarket.enrichGroupsWithTraderCounts([
    {
      title: "Bitcoin above __ on May 31?",
      conditionId: "0xabc",
      traderCount: 0,
      markets: []
    }
  ], {
    fetchImpl,
    limit: 50,
    timeoutMs: 0
  });

  assert.equal(group.traderCount, 3);
  assert.equal(group.traderCountCapped, false);
  assert.equal(group.traderCountSource, "market-positions");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /data-api\.polymarket\.com\/v1\/market-positions/);
  assert.match(calls[0], /market=0xabc/);
});

test("ranks relevant active markets and hides irrelevant or resolved markets", () => {
  const analyzed = article();
  const candidates = [
    polymarket.normalizeMarket({
      id: "btc-open",
      question: "Will Bitcoin hit $150k in 2026?",
      description: "Resolves Yes if BTC reaches the listed price.",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.44\", \"0.56\"]",
      volume: "2000000",
      liquidity: "50000",
      active: true,
      closed: false
    }),
    polymarket.normalizeMarket({
      id: "btc-closed",
      question: "Will Bitcoin hit $100k in 2024?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"1\", \"0\"]",
      volume: "5000000",
      active: true,
      closed: true
    }),
    polymarket.normalizeMarket({
      id: "rihanna",
      question: "Will Rihanna release a new album before GTA VI?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.51\", \"0.49\"]",
      volume: "1000000",
      active: true,
      closed: false
    })
  ];

  const ranked = polymarket.rankCandidates(candidates, analyzed, { minConfidence: 48, maxResults: 5 });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, "btc-open");
  assert.ok(ranked[0].confidence >= 48);
});

test("filters markets that are pending review or otherwise not live", () => {
  const analyzed = article();
  const live = polymarket.normalizeMarket({
    id: "btc-live",
    question: "Will Bitcoin hit $150k in 2026?",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.44\", \"0.56\"]",
    volume: "250000",
    active: true,
    closed: false
  });
  const pending = polymarket.normalizeMarket({
    id: "btc-review",
    question: "Will Bitcoin hit $175k in 2026?",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.22\", \"0.78\"]",
    volume: "5000000",
    active: true,
    closed: false,
    reviewStatus: "pending review"
  });

  const ranked = polymarket.rankCandidates([pending, live], analyzed, { minConfidence: 30, maxResults: 5 });

  assert.equal(pending.active, false);
  assert.equal(pending.unavailable, true);
  assert.deepEqual(ranked.map((candidate) => candidate.id), ["btc-live"]);
});

test("keeps active approved markets displayable when Polymarket marks ready false", () => {
  const market = polymarket.normalizeMarket({
    id: "active-ready-false",
    question: "Will Spain win the 2026 FIFA World Cup?",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.12\", \"0.88\"]",
    active: true,
    closed: false,
    approved: true,
    acceptingOrders: true,
    ready: false
  });

  assert.equal(market.active, true);
  assert.equal(market.unavailable, false);
  assert.equal(polymarket.isDisplayableCandidate(market), true);
});

test("collapses ranked child markets into a clickable parent Polymarket event", () => {
  const analyzed = signals.analyzeArticle({
    title: "Fed waits for CPI before rate-cut decision",
    cleanText: "Federal Reserve officials said inflation and CPI data will guide whether the FOMC cuts interest rates this year."
  });
  const event = {
    id: "fed-event",
    slug: "fed-rate-decisions",
    title: "Fed rate decisions",
    image: "https://example.com/fed.png",
    active: true,
    closed: false
  };
  const ranked = polymarket.rankCandidates([
    polymarket.normalizeMarket({
      id: "fed-cut",
      question: "Will the Fed cut interest rates in September?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.58\", \"0.42\"]",
      volume: "500000",
      active: true,
      closed: false
    }, event),
    polymarket.normalizeMarket({
      id: "fed-hold",
      question: "Will the Fed hold rates after the next CPI report?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.36\", \"0.64\"]",
      volume: "400000",
      active: true,
      closed: false
    }, event)
  ], analyzed, { minConfidence: 30, maxResults: 5 });
  const groups = polymarket.groupCandidatesByEvent(ranked, { maxGroups: 5 });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "Fed rate decisions");
  assert.equal(groups[0].url, "https://polymarket.com/event/fed-rate-decisions");
  assert.equal(groups[0].markets.length, 2);
  assert.deepEqual(new Set(groups[0].markets.map((market) => market.id)), new Set(["fed-cut", "fed-hold"]));
});

test("grouped parent events must clear parent-level relevance when article context is provided", () => {
  const analyzed = signals.analyzeArticle({
    title: "Bitcoin rallies as ETF inflows accelerate",
    cleanText: "Bitcoin rose as BTC ETF inflows lifted crypto sentiment and traders watched year-end price targets."
  });
  const relevantEvent = {
    id: "btc-parent",
    slug: "bitcoin-price-targets",
    title: "Bitcoin price targets",
    active: true,
    closed: false
  };
  const weakParentEvent = {
    id: "generic-parent",
    slug: "finance-and-culture-roundup",
    title: "Finance and culture roundup",
    active: true,
    closed: false
  };
  const ranked = [
    {
      ...polymarket.normalizeMarket({
        id: "btc-child",
        question: "Will Bitcoin hit $150k in 2026?",
        outcomes: "[\"Yes\", \"No\"]",
        outcomePrices: "[\"0.44\", \"0.56\"]",
        volume: "1000000",
        active: true,
        closed: false
      }, relevantEvent),
      confidence: 74
    },
    {
      ...polymarket.normalizeMarket({
        id: "weak-child",
        question: "Will one finance article mention Bitcoin this week?",
        outcomes: "[\"Yes\", \"No\"]",
        outcomePrices: "[\"0.51\", \"0.49\"]",
        volume: "900000",
        active: true,
        closed: false
      }, weakParentEvent),
      confidence: 62
    }
  ];

  const groups = polymarket.groupCandidatesByEvent(ranked, {
    article: analyzed,
    minParentConfidence: 55,
    maxGroups: 5
  });

  assert.deepEqual(groups.map((group) => group.eventSlug), ["bitcoin-price-targets"]);
  assert.ok(groups[0].parentConfidence >= 55);
});

test("classifier-assisted ranking exposes classifier boosts for matching market angles", () => {
  const analyzed = signals.analyzeArticle({
    title: "Coinbase expands wallet security after crypto exchange attacks",
    cleanText: "The company said adoption of new wallet controls followed hacks and security incidents across crypto exchanges."
  }, { analysisStrategy: "classifier" });
  const ranked = polymarket.rankCandidates([
    polymarket.normalizeMarket({
      id: "coinbase-security",
      question: "Will Coinbase launch new crypto wallet security controls in 2026?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.41\", \"0.59\"]",
      volume: "500000",
      active: true,
      closed: false
    }),
    polymarket.normalizeMarket({
      id: "sports-trend",
      question: "Will the Lakers win the NBA championship?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.21\", \"0.79\"]",
      volume: "5000000",
      active: true,
      closed: false
    })
  ], analyzed, { minConfidence: 40, maxResults: 5 });

  assert.equal(analyzed.classifier.mode, "assistive");
  assert.equal(analyzed.classifier.topic, "crypto");
  assert.equal(ranked[0].id, "coinbase-security");
  assert.ok(ranked[0].scoreBreakdown.classifier > 0);
  assert.ok(ranked.every((candidate) => candidate.id !== "sports-trend"));
});

test("strict topic penalties exclude place-only weather false positives", () => {
  const analyzed = signals.analyzeArticle({
    title: "Scientists discover towering red auroras above Japan",
    cleanText: "Researchers tracked unusual auroras reaching deep into space above Japan during a geomagnetic storm."
  });
  const boj = polymarket.normalizeMarket({
      id: "boj-rates",
      question: "Bank of Japan increases interest rates by 25 bps after the June 2026 meeting?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.21\", \"0.79\"]",
      volume: "5000000",
      active: true,
      closed: false
  });
  const ranked = polymarket.rankCandidates([boj], analyzed, { minConfidence: 45, maxResults: 5 });
  const scored = polymarket.rankCandidate(boj, analyzed);

  assert.equal(analyzed.topic.label, "weather/climate");
  assert.equal(scored.scoreBreakdown.strictTopicPenalty, -34);
  assert.equal(ranked.length, 0);
});

test("geopolitical event articles demote speech word-mention markets", () => {
  const analyzed = signals.analyzeArticle({
    title: "Trump urges no tolls in Strait of Hormuz as Iran war resolution vote delayed",
    cleanText: [
      "The live updates focused on Iran, the Strait of Hormuz, sanctions, military conflict, and US-Iran diplomacy.",
      "Officials discussed whether the US could declare war on Iran and whether a permanent peace deal was possible."
    ].join(" ")
  });
  const speechMarket = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "trump-say-iran",
    question: "Will Trump say \"Iran\" during events with Xi Jinping?",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.01\", \"0.99\"]",
    volume: "79000000",
    active: true,
    closed: false
  }), analyzed);
  const ranked = polymarket.rankCandidates([
    polymarket.normalizeMarket({
      id: "trump-say-iran",
      question: "Will Trump say \"Iran\" during events with Xi Jinping?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.01\", \"0.99\"]",
      volume: "79000000",
      active: true,
      closed: false
    }),
    polymarket.normalizeMarket({
      id: "us-iran-peace",
      question: "US x Iran permanent peace deal by June 30, 2026?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.13\", \"0.87\"]",
      volume: "102000000",
      active: true,
      closed: false
    }),
    polymarket.normalizeMarket({
      id: "us-iran-war",
      question: "Will the US officially declare war on Iran by December 31, 2026?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.07\", \"0.93\"]",
      volume: "1100000",
      active: true,
      closed: false
    })
  ], analyzed, { minConfidence: 55, maxResults: 3 });

  assert.equal(analyzed.topic.label, "geopolitics");
  assert.equal(speechMarket.scoreBreakdown.speechPenalty, -45);
  assert.deepEqual(ranked.map((candidate) => candidate.id), ["us-iran-war"]);
});

test("trending boost helps relevant markets but does not rescue irrelevant trends", () => {
  const analyzed = article();
  const relevantTrend = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "btc-trending",
    question: "Will Bitcoin hit $150k in 2026?",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.44\", \"0.56\"]",
    volume24hr: "1200000",
    liquidity: "250000",
    active: true,
    closed: false
  }), analyzed);
  const irrelevantTrend = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "rihanna-trending",
    question: "Will Rihanna release a new album before GTA VI?",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.51\", \"0.49\"]",
    volume24hr: "50000000",
    liquidity: "5000000",
    active: true,
    closed: false
  }), analyzed);
  const ranked = polymarket.rankCandidates([relevantTrend, irrelevantTrend], analyzed, { minConfidence: 48, maxResults: 5 });

  assert.ok(relevantTrend.scoreBreakdown.trending > 0);
  assert.equal(irrelevantTrend.scoreBreakdown.trending, 0);
  assert.deepEqual(ranked.map((candidate) => candidate.id), ["btc-trending"]);
});

test("matches representative article topics to relevant markets", () => {
  const cases = [
    {
      name: "Fed/inflation",
      article: {
        title: "Fed waits for CPI before rate-cut decision",
        cleanText: "Federal Reserve officials said inflation and CPI data will guide whether the FOMC cuts interest rates this year."
      },
      relevant: "Will the Fed cut interest rates after the next CPI report?"
    },
    {
      name: "Trump/tariff",
      article: {
        title: "Trump threatens China tariffs during campaign",
        cleanText: "Donald Trump said new China tariffs could become part of his election platform if trade talks fail."
      },
      relevant: "Will Trump impose new China tariffs in 2026?"
    },
    {
      name: "Bitcoin",
      article: {
        title: "Bitcoin rallies as ETF inflows accelerate",
        cleanText: "Bitcoin rose as BTC ETF inflows lifted crypto sentiment and traders watched year-end price targets."
      },
      relevant: "Will Bitcoin hit $150k in 2026?"
    },
    {
      name: "Nvidia/AI chip",
      article: {
        title: "Nvidia AI chip demand lifts earnings expectations",
        cleanText: "Nvidia shares rose as GPU orders for artificial intelligence data centers boosted earnings expectations."
      },
      relevant: "Will Nvidia beat earnings expectations after AI chip demand?"
    },
    {
      name: "sports",
      article: {
        title: "Lakers and Celtics meet with playoff seeding at stake",
        cleanText: "The NBA game could shift playoff seeding as the Lakers face the Celtics."
      },
      relevant: "Will the Lakers beat the Celtics in their next NBA game?"
    }
  ];

  for (const item of cases) {
    const analyzed = signals.analyzeArticle(item.article);
    const ranked = polymarket.rankCandidates([
      polymarket.normalizeMarket({
        id: `${item.name}-relevant`,
        question: item.relevant,
        outcomes: "[\"Yes\", \"No\"]",
        outcomePrices: "[\"0.48\", \"0.52\"]",
        volume: "750000",
        liquidity: "30000",
        active: true,
        closed: false
      }),
      polymarket.normalizeMarket({
        id: `${item.name}-irrelevant`,
        question: "Will Rihanna release a new album before GTA VI?",
        outcomes: "[\"Yes\", \"No\"]",
        outcomePrices: "[\"0.51\", \"0.49\"]",
        volume: "900000",
        liquidity: "25000",
        active: true,
        closed: false
      })
    ], analyzed, { minConfidence: 48, maxResults: 1 });

    assert.equal(ranked.length, 1, item.name);
    assert.equal(ranked[0].id, `${item.name}-relevant`, item.name);
  }
});

test("ranking ignores incidental high-impact entities that are not central to the title", () => {
  const analyzed = signals.analyzeArticle({
    title: "US House lawmakers launch probe into Kalshi and Polymarket insider trading",
    cleanText: [
      "The story focused on prediction market operators Kalshi and Polymarket after lawmakers requested trading records.",
      "A related-links module mentioned Donald Trump, Iran, Ethereum, and XRP, but those were not the subject of the probe."
    ].join(" ")
  });
  const ranked = polymarket.rankCandidates([
    polymarket.normalizeMarket({
      id: "trump-unrelated",
      question: "Trump out as President before GTA VI?",
      description: "Donald Trump presidency market.",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.24\", \"0.76\"]",
      volume: "2000000",
      liquidity: "90000",
      active: true,
      closed: false
    }),
    polymarket.normalizeMarket({
      id: "iran-unrelated",
      question: "US x Iran permanent peace deal by May 31, 2026?",
      description: "Iran diplomacy market.",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.31\", \"0.69\"]",
      volume: "1800000",
      liquidity: "80000",
      active: true,
      closed: false
    })
  ], analyzed, { minConfidence: 55, maxResults: 5 });

  assert.equal(ranked.length, 0);
});

test("searchAndRank tolerates partial API failures", async () => {
  const analyzed = article();
  const fetchImpl = async (url) => {
    if (url.includes("/events")) {
      throw new Error("events unavailable");
    }
    return {
      ok: true,
      json: async () => ({
        events: [{
          id: "event-1",
          slug: "bitcoin-targets",
          title: "Bitcoin price targets",
          active: true,
          closed: false,
          markets: [{
            id: "market-1",
            question: "Will Bitcoin hit $150k in 2026?",
            outcomes: "[\"Yes\", \"No\"]",
            outcomePrices: "[\"0.42\", \"0.58\"]",
            volume: "1000000",
            liquidity: "20000",
            active: true,
            closed: false
          }]
        }]
      })
    };
  };

  const ranked = await polymarket.searchAndRank(analyzed, { fetchImpl, minConfidence: 48 });

  assert.ok(ranked.length >= 1);
  assert.equal(ranked[0].id, "market-1");
});

test("fetchCandidates uses tuned public-search requests for text retrieval", async () => {
  const calls = [];
  const analyzed = signals.analyzeArticle({
    title: "Dogecoin added to Paxos brokerage and custody platform",
    cleanText: "Paxos added Dogecoin support for brokerage and custody customers while DOGE traders watched crypto adoption."
  });

  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ events: [] })
    };
  };

  const candidates = await polymarket.fetchCandidates({
    ...analyzed,
    queries: ["Dogecoin", "Dogecoin price"]
  }, {
    fetchImpl,
    includeSimilar: false,
    searchLimitPerType: 8
  });

  assert.deepEqual(candidates, []);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.includes("/public-search?")));
  assert.ok(calls.every((url) => url.includes("q=Dogecoin")));
  assert.ok(calls.every((url) => url.includes("limit_per_type=8")));
  assert.ok(calls.every((url) => url.includes("events_status=active")));
  assert.ok(calls.every((url) => url.includes("keep_closed_markets=0")));
  assert.ok(calls.every((url) => url.includes("search_profiles=false")));
  assert.ok(calls.every((url) => url.includes("search_tags=false")));
  assert.ok(calls.every((url) => !url.includes("optimized=true")));
  assert.ok(calls.every((url) => !url.includes("/events?")));
  assert.ok(calls.every((url) => !url.includes("/markets?")));
});

test("fetchCandidates expands central entity tags into event inventory", async () => {
  const calls = [];
  const analyzed = signals.analyzeArticle({
    title: "Ceasefire faces strain as US and Iran launch new strikes",
    cleanText: "Iran, Israel, and the US faced renewed conflict as ceasefire talks and war risks dominated the live updates."
  });

  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/events?tag_id=78")) {
      return {
        ok: true,
        json: async () => [{
          id: "iran-tag-event",
          slug: "iran-agrees-to-end-enrichment",
          title: "Iran agrees to end enrichment of uranium by June 30?",
          active: true,
          closed: false,
          markets: [{
            id: "iran-tag-market",
            question: "Iran agrees to end enrichment of uranium by June 30?",
            outcomes: "[\"Yes\", \"No\"]",
            outcomePrices: "[\"0.34\", \"0.66\"]",
            volume: "1000000",
            active: true,
            closed: false
          }]
        }]
      };
    }
    return {
      ok: true,
      json: async () => ({
        events: [],
        tags: [
          { id: "78", label: "Iran", slug: "iran" },
          { id: "500", label: "Sports", slug: "sports" }
        ]
      })
    };
  };

  const candidates = await polymarket.fetchCandidates({
    ...analyzed,
    queries: ["Iran"]
  }, {
    fetchImpl,
    includeTagExpansion: true,
    searchLimitPerType: 8,
    tagEventLimit: 100
  });

  assert.ok(calls.some((url) => url.includes("search_tags=true")));
  assert.ok(calls.some((url) => url.includes("/events?tag_id=78")));
  assert.ok(calls.some((url) => url.includes("active=true")));
  assert.ok(calls.some((url) => url.includes("closed=false")));
  assert.ok(calls.some((url) => url.includes("limit=100")));
  assert.ok(calls.every((url) => !url.includes("tag_id=500")));
  assert.ok(candidates.some((candidate) => candidate.id === "iran-tag-market"));
});

test("fetchCandidates can request similar events from the article title", async () => {
  const calls = [];
  const analyzed = signals.analyzeArticle({
    title: "Bitcoin preps May downside but US PMI data may boost BTC price",
    cleanText: "Bitcoin traders watched BTC support levels, PMI data, and crypto price targets."
  });

  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/events/similar?")) {
      return {
        ok: true,
        json: async () => [{
          id: "similar-event",
          slug: "bitcoin-price-on-june-3",
          title: "Bitcoin price on June 3?",
          active: true,
          closed: false,
          markets: [{
            id: "similar-market",
            question: "Bitcoin price on June 3?",
            outcomes: "[\"Yes\", \"No\"]",
            outcomePrices: "[\"0.51\", \"0.49\"]",
            volume: "1200000",
            active: true,
            closed: false
          }]
        }]
      };
    }
    return {
      ok: true,
      json: async () => ({ events: [] })
    };
  };

  const candidates = await polymarket.fetchCandidates({
    ...analyzed,
    queries: ["Bitcoin price"]
  }, {
    fetchImpl,
    includeSimilar: true,
    similarLimit: 5
  });

  assert.ok(calls.some((url) => url.includes("/events/similar?")));
  assert.ok(calls.some((url) => url.includes("event_title=Bitcoin+preps+May+downside")));
  assert.ok(calls.some((url) => url.includes("closed=false")));
  assert.ok(calls.some((url) => url.includes("limit=5")));
  assert.ok(candidates.some((candidate) => candidate.id === "similar-market"));
  assert.ok(candidates.find((candidate) => candidate.id === "similar-market").sourceQueries.includes("Bitcoin preps May downside but US PMI data may boost BTC price"));
});

test("manual search requires lexical query relevance before volume boosts", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      events: [
        {
          id: "relevant-event",
          title: "Google Pixel Watch release date",
          active: true,
          closed: false,
          markets: [{
            id: "pixel-watch",
            question: "Will Google release Pixel Watch 5 by October?",
            outcomes: "[\"Yes\", \"No\"]",
            outcomePrices: "[\"0.42\", \"0.58\"]",
            volume: "10000",
            active: true,
            closed: false
          }]
        },
        {
          id: "noise-event",
          title: "World Cup winner",
          active: true,
          closed: false,
          markets: [{
            id: "world-cup",
            question: "Will Brazil win the World Cup?",
            outcomes: "[\"Yes\", \"No\"]",
            outcomePrices: "[\"0.25\", \"0.75\"]",
            volume: "5000000",
            liquidity: "900000",
            active: true,
            closed: false
          }]
        }
      ]
    })
  });

  const matches = await polymarket.searchMarkets("Google Pixel Watch", {
    fetchImpl,
    maxResults: 5
  });

  assert.deepEqual(matches.map((candidate) => candidate.id), ["pixel-watch"]);
});

test("rankCandidate labels high-confidence matches as strong", () => {
  const analyzed = article();
  const scored = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "btc-strong",
    question: "Will Bitcoin hit $150k in 2026?",
    description: "Bitcoin BTC crypto price target market.",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.44\", \"0.56\"]",
    volume: "1000000",
    liquidity: "50000",
    active: true,
    closed: false
  }), analyzed);

  assert.equal(scored.matchTier, "strong");
  assert.ok(scored.confidence >= 55);
});

test("rankCandidate labels plausible lower-confidence matches as maybe", () => {
  const analyzed = signals.analyzeArticle({
    title: "The Google Pixel Watch 5 may have been spoiled by the creator of Borderlands",
    cleanText: [
      "A video game creator appeared to show unreleased Google Pixel Watch hardware.",
      "The article focused on Wear OS, Android, battery life, display details, and Google device design."
    ].join(" ")
  });
  const scored = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "google-gemini-maybe",
    question: "Next Google Gemini Pro Model: Arena Debut?",
    description: "Google artificial intelligence model market.",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.31\", \"0.69\"]",
    volume: "500000",
    liquidity: "30000",
    active: true,
    closed: false
  }), analyzed);

  assert.equal(scored.matchTier, "maybe");
  assert.ok(scored.confidence < 55);
  assert.ok(scored.scoreBreakdown.entities > 0 || scored.scoreBreakdown.overlap > 0 || scored.scoreBreakdown.keywords > 0);
});

test("rankCandidates can include maybe matches without promoting rejected markets", () => {
  const analyzed = signals.analyzeArticle({
    title: "The Google Pixel Watch 5 may have been spoiled by the creator of Borderlands",
    cleanText: "The article focused on Google Pixel Watch hardware, Wear OS, battery life, and Android device design."
  });
  const ranked = polymarket.rankCandidates([
    polymarket.normalizeMarket({
      id: "google-maybe",
      question: "Next Google Gemini Pro Model: Arena Debut?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.31\", \"0.69\"]",
      volume: "500000",
      active: true,
      closed: false
    }),
    polymarket.normalizeMarket({
      id: "rihanna-reject",
      question: "Will Rihanna release a new album before GTA VI?",
      outcomes: "[\"Yes\", \"No\"]",
      outcomePrices: "[\"0.51\", \"0.49\"]",
      volume: "5000000",
      active: true,
      closed: false
    })
  ], analyzed, {
    minConfidence: 35,
    includeMaybe: true,
    maxResults: 5
  });

  assert.deepEqual(ranked.map((candidate) => candidate.id), ["google-maybe"]);
  assert.equal(ranked[0].matchTier, "maybe");
});

test("product-specific company matches are capped to maybe when the market misses the product", () => {
  const analyzed = signals.analyzeArticle({
    title: "The Google Pixel Watch 5 may have been spoiled by the creator of Borderlands",
    cleanText: [
      "A video game creator appeared to show unreleased Google Pixel Watch hardware.",
      "The article focused on Wear OS, Android, battery life, display details, and Google device design."
    ].join(" ")
  });
  const scored = polymarket.rankCandidate(polymarket.normalizeMarket({
    id: "google-stock",
    question: "Google (GOOGL) closes above $200 on June 1?",
    description: "Alphabet stock price market.",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.31\", \"0.69\"]",
    volume: "2500000",
    liquidity: "150000",
    active: true,
    closed: false
  }), analyzed);

  assert.equal(scored.matchTier, "maybe");
  assert.ok(scored.confidence <= 54);
  assert.ok(scored.scoreBreakdown.relevanceGateReasons.includes("missing-specific-product"));
});
