const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { makeBinaryCandidate } = require("../test-support/sharedShapes");

function loadAdapter() {
  delete require.cache[require.resolve("../src/popup/klinecharts")];
  return require("../src/popup/klinecharts");
}

function candidateWithHistory() {
  return makeBinaryCandidate({
    id: "iran-peace",
    title: "Will the US and Iran reach a permanent peace deal in 2026?",
    outcomeOptions: [
      { label: "Yes", price: 0.32, percent: 32, clobTokenId: "yes-token" },
      { label: "No", price: 0.68, percent: 68, clobTokenId: "no-token" }
    ],
    tradeChartHistoryByTokenId: {
      "yes-token": {
        "1M": [
          { t: 1780086400, p: 0.32 },
          { t: 1780000000, p: 0.3 }
        ],
        "1Y": [
          { t: 1760000000, p: 0.2 },
          { t: 1770000000, p: 0.46 },
          { t: 1780086400, p: 0.32 }
        ]
      }
    }
  });
}

function chartRoot() {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="root">
      <section class="trade-chart-card">
        <div class="trade-chart-frame">
          <div class="kline-chart-host" data-kline-chart="true"></div>
          <p class="kline-chart-empty" hidden>Price history unavailable.</p>
        </div>
        <button class="trade-range-button is-active" data-trade-range="1M">1M</button>
      </section>
    </section>
  </body>`);
  return {
    dom,
    root: dom.window.document.getElementById("root")
  };
}

test("maps only real CLOB price points into flat area-series bars", () => {
  const kline = loadAdapter();

  assert.deepEqual(kline.barsForCandidate(candidateWithHistory(), { range: "1M" }), [
    { timestamp: 1780000000000, open: 0.3, high: 0.3, low: 0.3, close: 0.3, volume: 0 },
    { timestamp: 1780086400000, open: 0.32, high: 0.32, low: 0.32, close: 0.32, volume: 0 }
  ]);
  assert.deepEqual(kline.barsForCandidate({
    tradeChartHistory: [{ t: 1780086400, p: 0 }]
  }), [
    { timestamp: 1780086400000, open: 0, high: 0, low: 0, close: 0, volume: 0 }
  ]);
  assert.deepEqual(kline.barsForCandidate(makeBinaryCandidate({ primaryPrice: 0.72 })), []);
});

test("keeps fallback range history when a live point arrives", () => {
  const kline = loadAdapter();
  const outcome = { label: "Yes", clobTokenId: "yes-token" };
  const candidate = {
    id: "fallback-history",
    outcomeOptions: [outcome],
    tradeChartHistoryByTokenId: {
      "yes-token": {
        ALL: [
          { t: 1740000000, p: 0.2 },
          { t: 1770000000, p: 0.4 },
          { t: 1780000000, p: 0.5 }
        ]
      }
    }
  };

  assert.deepEqual(
    kline.historyForRange(candidate, outcome, "1Y").map((point) => point.price),
    [0.4, 0.5]
  );

  kline.appendLivePoint(null, candidate, outcome, { t: 1780000100, p: 0.51 });

  assert.deepEqual(
    kline.historyForRange(candidate, outcome, "1Y").map((point) => point.price),
    [0.4, 0.51]
  );
});

test("mounts a smooth area chart and switches its loader to the selected real range", () => {
  const { root } = chartRoot();
  const previousLibrary = global.klinecharts;
  const initCalls = [];
  const symbolCalls = [];
  const periodCalls = [];
  const loaders = [];
  const disposedHosts = [];
  let offsetRightDistance = 80;
  let resetCount = 0;
  const chart = {
    setSymbol(symbol) {
      symbolCalls.push(symbol);
    },
    setPeriod(period) {
      periodCalls.push(period);
    },
    setDataLoader(loader) {
      loaders.push(loader);
    },
    setOffsetRightDistance(distance) {
      offsetRightDistance = distance;
    },
    resetData() {
      resetCount += 1;
    }
  };
  global.klinecharts = {
    init(host, options) {
      initCalls.push({ host, options });
      return chart;
    },
    dispose(host) {
      disposedHosts.push(host);
    }
  };

  try {
    const kline = loadAdapter();
    const mounted = kline.mountTradeChart(root, candidateWithHistory(), { range: "1M" });
    const host = root.querySelector("[data-kline-chart]");
    const firstLoad = [];
    loaders[0].getBars({
      type: "init",
      timestamp: null,
      symbol: symbolCalls[0],
      period: periodCalls[0],
      callback(data, more) {
        firstLoad.push({ data, more });
      }
    });

    assert.equal(mounted, chart);
    assert.equal(initCalls[0].host, host);
    assert.equal(initCalls[0].options.styles.candle.type, "area");
    assert.equal(initCalls[0].options.styles.candle.area.smooth, true);
    assert.equal(initCalls[0].options.styles.candle.area.lineColor, "#b6dc77");
    assert.equal(initCalls[0].options.styles.candle.tooltip.showRule, "none");
    assert.equal(symbolCalls[0].ticker, "PMEX:IRAN-PEACE:YES");
    assert.equal(symbolCalls[0].pricePrecision, 4);
    assert.deepEqual(periodCalls[0], { span: 1, type: "hour" });
    assert.equal(offsetRightDistance, 0);
    assert.equal(firstLoad.length, 1);
    assert.deepEqual(firstLoad[0].data.map((bar) => bar.close), [0.3, 0.32]);
    assert.deepEqual(firstLoad[0].more, { forward: false, backward: false });
    assert.equal(host.dataset.klineState, "ready");
    assert.equal(host.dataset.klineRange, "1M");
    assert.equal(host.dataset.klinePoints, "2");
    assert.ok(root.querySelector(".trade-chart-card").classList.contains("kline-ready"));

    kline.setRange(root, "1Y");
    const secondLoad = [];
    loaders[0].getBars({
      type: "init",
      timestamp: null,
      symbol: symbolCalls[0],
      period: periodCalls.at(-1),
      callback(data, more) {
        secondLoad.push({ data, more });
      }
    });
    assert.deepEqual(periodCalls.at(-1), { span: 1, type: "day" });
    assert.equal(resetCount, 1);
    assert.deepEqual(secondLoad[0].data.map((bar) => bar.close), [0.2, 0.46, 0.32]);
    assert.equal(host.dataset.klineRange, "1Y");
    assert.equal(host.dataset.klinePoints, "3");

    const paginationLoad = [];
    loaders[0].getBars({
      type: "forward",
      timestamp: 1760000000000,
      symbol: symbolCalls[0],
      period: periodCalls.at(-1),
      callback(data, more) {
        paginationLoad.push({ data, more });
      }
    });
    assert.deepEqual(paginationLoad, [{ data: [], more: { forward: false, backward: false } }]);

    kline.unmountAll(root);
    assert.deepEqual(disposedHosts, [host]);
    assert.equal(host.dataset.klineState, "idle");
    assert.equal(root.querySelector(".trade-chart-card").classList.contains("kline-ready"), false);
  } finally {
    global.klinecharts = previousLibrary;
  }
});

test("colors secondary and Short outcome charts red", () => {
  const { root } = chartRoot();
  const previousLibrary = global.klinecharts;
  const initOptions = [];
  const chart = {
    setSymbol() {},
    setPeriod() {},
    setDataLoader() {}
  };
  global.klinecharts = {
    init(_host, options) {
      initOptions.push(options);
      return chart;
    },
    dispose() {}
  };

  try {
    const kline = loadAdapter();
    const binaryCandidate = candidateWithHistory();
    binaryCandidate.tradeChartHistoryByTokenId["no-token"] = {
      "1M": [
        { t: 1780000000, p: 0.7 },
        { t: 1780086400, p: 0.68 }
      ]
    };
    kline.mountTradeChart(root, binaryCandidate, {
      outcome: binaryCandidate.outcomeOptions[1]
    });
    kline.mountTradeChart(root, {
      id: "hyperliquid:BTC",
      tradeChartHistoryByOutcome: {
        short: {
          "1M": [
            { t: 1780000000, p: 68000 },
            { t: 1780086400, p: 68100 }
          ]
        }
      }
    }, { outcome: { label: "Short" } });

    for (const options of initOptions) {
      assert.equal(options.styles.candle.area.lineColor, "#ff6676");
      assert.deepEqual(options.styles.candle.area.backgroundColor, [
        { offset: 0, color: "rgba(255,102,118,0.24)" },
        { offset: 1, color: "rgba(255,102,118,0.01)" }
      ]);
      assert.equal(options.styles.candle.area.point.color, "#ff6676");
      assert.equal(options.styles.crosshair.horizontal.text.color, "#ff6676");
    }
  } finally {
    global.klinecharts = previousLibrary;
  }
});

test("updates the current streamed period without adding a chart bar for every event", () => {
  const { root } = chartRoot();
  const candidate = candidateWithHistory();
  candidate.tradeChartHistoryByTokenId["no-token"] = {
    "1M": [
      { t: 1780000000, p: 0.7 },
      { t: 1780086400, p: 0.68 }
    ]
  };
  const previousLibrary = global.klinecharts;
  const loaders = [];
  const streamedBars = [];
  let initCount = 0;
  let resetCount = 0;
  const chart = {
    setSymbol() {},
    setPeriod() {},
    setDataLoader(loader) {
      loaders.push(loader);
    },
    resetData() {
      resetCount += 1;
    }
  };
  global.klinecharts = {
    init() {
      initCount += 1;
      return chart;
    },
    dispose() {}
  };

  try {
    const kline = loadAdapter();
    kline.mountTradeChart(root, candidate, {
      range: "1M",
      outcome: candidate.outcomeOptions[0]
    });
    loaders[0].subscribeBar({
      callback(bar) {
        streamedBars.push(bar);
      }
    });

    assert.equal(kline.appendLivePoint(root, candidate, candidate.outcomeOptions[0], {
      t: 1780086460000,
      p: 0.34
    }), true);
    assert.equal(initCount, 1);
    assert.equal(resetCount, 0);
    assert.equal(root.querySelector("[data-kline-chart]").dataset.klinePoints, "2");
    assert.deepEqual(streamedBars.at(-1), {
      timestamp: 1780086400000,
      open: 0.34,
      high: 0.34,
      low: 0.34,
      close: 0.34,
      volume: 0
    });

    const firstUpdate = [];
    loaders[0].getBars({
      type: "update",
      callback(data) {
        firstUpdate.push(data);
      }
    });
    assert.deepEqual(firstUpdate[0].map((bar) => [bar.timestamp, bar.close]), [
      [1780000000000, 0.3],
      [1780086460000, 0.34]
    ]);

    kline.appendLivePoint(root, candidate, candidate.outcomeOptions[0], {
      t: 1780086460000,
      p: 0.35
    });
    assert.equal(resetCount, 0);
    assert.equal(root.querySelector("[data-kline-chart]").dataset.klinePoints, "2");
    assert.equal(candidate.tradeChartHistoryByTokenId["yes-token"]["1M"].at(-1).p, 0.35);
    assert.equal(streamedBars.at(-1).timestamp, 1780086400000);
    assert.equal(streamedBars.at(-1).close, 0.35);

    kline.appendLivePoint(root, candidate, candidate.outcomeOptions[0], {
      t: 1780088399000,
      p: 0.36
    });
    kline.appendLivePoint(root, candidate, candidate.outcomeOptions[0], {
      t: 1780088401000,
      p: 0.37
    });
    assert.equal(root.querySelector("[data-kline-chart]").dataset.klinePoints, "3");
    assert.deepEqual(candidate.tradeChartHistoryByTokenId["yes-token"]["1M"].slice(-2), [
      { t: 1780088399000, p: 0.36 },
      { t: 1780088401000, p: 0.37 }
    ]);
    assert.deepEqual(streamedBars.slice(-2).map((bar) => [bar.timestamp, bar.close]), [
      [1780086400000, 0.36],
      [1780088401000, 0.37]
    ]);

    const resetCountBeforeNoUpdate = resetCount;
    const streamedCountBeforeNoUpdate = streamedBars.length;
    kline.appendLivePoint(root, candidate, candidate.outcomeOptions[1], {
      t: 1780086460000,
      p: 0.65
    });
    assert.equal(resetCount, resetCountBeforeNoUpdate);
    assert.equal(streamedBars.length, streamedCountBeforeNoUpdate);
    assert.equal(candidate.tradeChartHistoryByTokenId["no-token"]["1M"].at(-1).p, 0.65);

    kline.mountTradeChart(root, candidate, {
      range: "1M",
      outcome: candidate.outcomeOptions[1]
    });
    const noUpdate = [];
    loaders.at(-1).getBars({
      type: "init",
      callback(data) {
        noUpdate.push(data);
      }
    });
    assert.equal(initCount, 2);
    assert.deepEqual(noUpdate[0].map((bar) => bar.close), [0.7, 0.65]);
  } finally {
    global.klinecharts = previousLibrary;
  }
});

test("shows an unavailable state instead of initializing a synthetic chart", () => {
  const { root } = chartRoot();
  const previousLibrary = global.klinecharts;
  let initCount = 0;
  global.klinecharts = {
    init() {
      initCount += 1;
      return {};
    },
    dispose() {}
  };

  try {
    const kline = loadAdapter();
    const result = kline.mountTradeChart(root, makeBinaryCandidate({ primaryPrice: 0.72 }));
    const card = root.querySelector(".trade-chart-card");
    const host = root.querySelector("[data-kline-chart]");
    const empty = root.querySelector(".kline-chart-empty");

    assert.equal(result, null);
    assert.equal(initCount, 0);
    assert.equal(host.dataset.klineState, "unavailable");
    assert.ok(card.classList.contains("kline-unavailable"));
    assert.equal(empty.hidden, false);
  } finally {
    global.klinecharts = previousLibrary;
  }
});

test("can recover from an unavailable initial range when another real range has history", () => {
  const { root } = chartRoot();
  const previousLibrary = global.klinecharts;
  const candidate = candidateWithHistory();
  delete candidate.tradeChartHistoryByTokenId["yes-token"]["1M"];
  let initCount = 0;
  global.klinecharts = {
    init() {
      initCount += 1;
      return {
        setSymbol() {},
        setPeriod() {},
        setDataLoader() {},
        resetData() {}
      };
    },
    dispose() {}
  };

  try {
    const kline = loadAdapter();
    assert.equal(kline.mountTradeChart(root, candidate, { range: "1M" }), null);
    assert.equal(root.querySelector("[data-kline-chart]").dataset.klineState, "unavailable");

    kline.setRange(root, "1Y");

    const host = root.querySelector("[data-kline-chart]");
    assert.equal(initCount, 1);
    assert.equal(host.dataset.klineState, "ready");
    assert.equal(host.dataset.klineRange, "1Y");
    assert.equal(host.dataset.klinePoints, "3");
  } finally {
    global.klinecharts = previousLibrary;
  }
});

test("reports a packaged-library error without revealing the synthetic fallback", () => {
  const { root } = chartRoot();
  const previousLibrary = global.klinecharts;
  delete global.klinecharts;

  try {
    const kline = loadAdapter();
    const result = kline.mountTradeChart(root, candidateWithHistory());
    const card = root.querySelector(".trade-chart-card");
    const host = root.querySelector("[data-kline-chart]");
    const empty = root.querySelector(".kline-chart-empty");

    assert.equal(result, null);
    assert.equal(host.dataset.klineState, "error");
    assert.ok(card.classList.contains("kline-error"));
    assert.equal(empty.hidden, false);
    assert.equal(empty.textContent, "Chart unavailable.");
  } finally {
    global.klinecharts = previousLibrary;
  }
});
