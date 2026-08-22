const test = require("node:test");
const assert = require("node:assert/strict");
const signals = require("../src/lib/articleSignals");

globalThis.PMArticleSignals = signals;
const hyperliquid = require("../src/lib/hyperliquid");

function fakeWebSocketClass() {
  return class FakeWebSocket {
    static instances = [];

    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.listeners = new Map();
      this.constructor.instances.push(this);
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) {
        listener(event);
      }
    }

    open() {
      this.readyState = 1;
      this.emit("open");
    }

    message(payload) {
      this.emit("message", { data: JSON.stringify(payload) });
    }

    serverClose() {
      this.readyState = 3;
      this.emit("close", { code: 1006 });
    }

    send(value) {
      this.sent.push(value);
    }

    close() {
      this.readyState = 3;
      this.emit("close", { code: 1000 });
    }
  };
}

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

test("fetches real Hyperliquid depth and line history for the trade view", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    return {
      ok: true,
      status: 200,
      json: async () => body.type === "l2Book"
        ? {
          coin: "BTC",
          time: 1780086400000,
          levels: [
            [{ px: "68159", sz: "0.52785", n: 2 }],
            [{ px: "68160", sz: "9.04153", n: 3 }]
          ]
        }
        : [
          { t: body.req.startTime, T: body.req.startTime + 899999, o: "68000", h: "68200", l: "67900", c: "68100", v: "12.5" },
          { t: body.req.endTime - 900000, T: body.req.endTime - 1, o: "68100", h: "68300", l: "68000", c: "68200", v: "10.5" }
        ]
    };
  };

  const result = await hyperliquid.fetchTradeData({ coin: "BTC" }, {
    fetchImpl: fetch,
    now: 1780086400000,
    timeoutMs: 1000
  });

  assert.equal(result.tradeDataSource, "hyperliquid");
  assert.deepEqual(result.tradeBooksByOutcome.long.bids[0], { price: 68159, size: 0.52785 });
  assert.deepEqual(result.tradeBooksByOutcome.short.asks[0], { price: 68160, size: 9.04153 });
  assert.deepEqual(result.tradeChartHistoryByOutcome.long["1D"].map((point) => point.p), [68100, 68200]);
  assert.equal(result.tradeChartHistoryByOutcome.short, result.tradeChartHistoryByOutcome.long);
  assert.equal(result.tradeDataFetchedAt, 1780086400000);
  assert.deepEqual(calls.map((call) => call.body.type), [
    "l2Book",
    "candleSnapshot",
    "candleSnapshot",
    "candleSnapshot",
    "candleSnapshot",
    "candleSnapshot"
  ]);
  assert.deepEqual(calls.slice(1).map((call) => call.body.req.interval), ["15m", "1h", "4h", "1d", "1d"]);
  assert.ok(calls.every((call) => call.url === "https://api.hyperliquid.xyz/info"));
});

test("streams fast Hyperliquid L2 depth and candle closes with heartbeat and reconnect", () => {
  const WebSocketImpl = fakeWebSocketClass();
  const intervals = [];
  const retries = [];
  const books = [];
  const prices = [];
  let opens = 0;
  let closes = 0;
  const stop = hyperliquid.openTradeStream({ coin: "BTC" }, {
    onOpen() {
      opens += 1;
    },
    onClose() {
      closes += 1;
    },
    onBook(update) {
      books.push(update);
    },
    onPrice(update) {
      prices.push(update);
    }
  }, {
    WebSocketImpl,
    reconnectDelayMs: 25,
    setIntervalImpl(callback, delay) {
      intervals.push({ callback, delay, cleared: false });
      return intervals.length;
    },
    clearIntervalImpl(id) {
      if (intervals[id - 1]) {
        intervals[id - 1].cleared = true;
      }
    },
    setTimeoutImpl(callback, delay) {
      retries.push({ callback, delay, cleared: false });
      return retries.length;
    },
    clearTimeoutImpl(id) {
      if (retries[id - 1]) {
        retries[id - 1].cleared = true;
      }
    }
  });

  assert.equal(typeof stop, "function");
  assert.equal(WebSocketImpl.instances[0].url, "wss://api.hyperliquid.xyz/ws");
  const socket = WebSocketImpl.instances[0];
  socket.open();
  assert.equal(opens, 1);
  assert.deepEqual(socket.sent.slice(0, 2).map((value) => JSON.parse(value)), [
    { method: "subscribe", subscription: { type: "l2Book", coin: "BTC", fast: true } },
    { method: "subscribe", subscription: { type: "candle", coin: "BTC", interval: "1m" } }
  ]);
  assert.equal(intervals[0].delay, 30000);

  socket.message({
    channel: "l2Book",
    data: {
      coin: "BTC",
      time: 1780086400000,
      levels: [
        [{ px: "68159", sz: "0.52785", n: 2 }],
        [{ px: "68160", sz: "9.04153", n: 3 }]
      ]
    }
  });
  assert.deepEqual(books, [{
    outcomeKeys: ["long", "short"],
    book: {
      bids: [{ price: 68159, size: 0.52785 }],
      asks: [{ price: 68160, size: 9.04153 }]
    },
    timestamp: 1780086400000
  }]);

  socket.message({
    channel: "candle",
    data: { t: 1780086460000, T: 1780086519999, s: "BTC", i: "1m", c: "68175.5" }
  });
  assert.deepEqual(prices, [{
    outcomeKeys: ["long", "short"],
    price: 68175.5,
    timestamp: 1780086460000
  }]);

  intervals[0].callback();
  assert.deepEqual(JSON.parse(socket.sent.at(-1)), { method: "ping" });

  socket.serverClose();
  assert.equal(closes, 1);
  assert.equal(intervals[0].cleared, true);
  assert.equal(retries[0].delay, 25);
  retries[0].callback();
  assert.equal(WebSocketImpl.instances.length, 2);

  stop();
  assert.equal(WebSocketImpl.instances[1].readyState, 3);
  assert.equal(retries.length, 1);
});

test("surfaces a total Hyperliquid trade-data failure", async () => {
  await assert.rejects(
    hyperliquid.fetchTradeData({ coin: "BTC" }, {
      fetchImpl: async () => {
        throw new Error("Hyperliquid offline");
      },
      now: 1780086400000,
      timeoutMs: 1000
    }),
    /Hyperliquid offline/
  );
});
