const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { makeBinaryCandidate } = require("../test-support/sharedShapes");

function loadAdapter() {
  delete require.cache[require.resolve("../src/popup/tradingview")];
  return require("../src/popup/tradingview");
}

function callbackResult(register) {
  return new Promise((resolve, reject) => {
    register(resolve, reject);
  });
}

test("TradingView datafeed converts CLOB history into ascending bars", async () => {
  const tradingView = loadAdapter();
  const candidate = makeBinaryCandidate({
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
          { t: 1770000000, p: 0.46 }
        ]
      }
    }
  });

  const datafeed = tradingView.createDatafeed(candidate);
  const config = await callbackResult((resolve) => datafeed.onReady(resolve));
  const symbolInfo = await callbackResult((resolve, reject) => datafeed.resolveSymbol("ODDSIGHT:IRAN", resolve, reject));
  const bars = await callbackResult((resolve, reject) => datafeed.getBars(
    symbolInfo,
    "60",
    { from: 0, to: 1999999999, countBack: 100, firstDataRequest: true },
    resolve,
    reject
  ));

  assert.deepEqual(config.supported_resolutions, ["15", "60", "1D"]);
  assert.equal(symbolInfo.description, "Will the US and Iran reach a permanent peace deal in 2026?");
  assert.equal(symbolInfo.exchange, "Polymarket");
  assert.deepEqual(
    bars.map((bar) => [bar.time, bar.close]),
    [
      [1760000000000, 0.2],
      [1770000000000, 0.46],
      [1780000000000, 0.3],
      [1780086400000, 0.32]
    ]
  );
});

test("TradingView mount uses packaged assets and updates visible range", async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="root">
      <section class="trade-chart-card">
        <div class="trade-chart-frame">
          <div class="tradingview-chart-host" data-tradingview-chart="true"></div>
        </div>
        <button class="trade-range-button is-active" data-trade-range="1M">1M</button>
      </section>
    </section>
  </body>`, { url: "chrome-extension://extension-id/src/popup/popup.html" });
  const previousTradingView = global.TradingView;
  const previousChrome = global.chrome;
  let widgetOptions = null;
  let resolution = "";
  let visibleRange = null;

  global.TradingView = {
    widget: function Widget(options) {
      widgetOptions = options;
      return {
        onChartReady(callback) {
          callback();
        },
        chart() {
          return {
            setResolution(value) {
              resolution = value;
            },
            setVisibleRange(value) {
              visibleRange = value;
            }
          };
        },
        remove() {}
      };
    }
  };
  global.chrome = {
    runtime: {
      getURL(path) {
        return `chrome-extension://extension-id/${path}`;
      }
    }
  };

  try {
    const tradingView = loadAdapter();
    const candidate = makeBinaryCandidate({
      id: "world-cup-winner",
      title: "World Cup Winner",
      outcomeOptions: [{ label: "Argentina", price: 0.11, percent: 11, clobTokenId: "arg-token" }],
      tradeChartHistoryByTokenId: {
        "arg-token": {
          "1M": [
            { t: 1780000000, p: 0.1 },
            { t: 1780086400, p: 0.11 }
          ]
        }
      }
    });

    const root = dom.window.document.getElementById("root");
    const widget = await tradingView.mountTradeChart(root, candidate);
    tradingView.setRange(root, "1Y");

    assert.ok(widget);
    assert.equal(widgetOptions.container, root.querySelector("[data-tradingview-chart]"));
    assert.equal(widgetOptions.library_path, "chrome-extension://extension-id/vendor/tradingview/charting_library/");
    assert.ok(widgetOptions.enabled_features.includes("iframe_loading_same_origin"));
    assert.ok(widgetOptions.disabled_features.includes("legend_widget"));
    assert.ok(widgetOptions.disabled_features.includes("create_volume_indicator_by_default"));
    assert.ok(widgetOptions.disabled_features.includes("create_volume_indicator_by_default_once"));
    assert.equal(widgetOptions.overrides["paneProperties.legendProperties.showLegend"], false);
    assert.equal(widgetOptions.overrides["paneProperties.legendProperties.showVolume"], false);
    assert.equal(widgetOptions.datafeed.__oddsight.symbol, "ODDSIGHT:WORLD-CUP-WINNER:ARGENTINA");
    assert.ok(root.querySelector(".trade-chart-card").classList.contains("tv-ready"));
    assert.equal(resolution, "1D");
    assert.equal(typeof visibleRange.from, "number");
    assert.equal(typeof visibleRange.to, "number");
  } finally {
    global.TradingView = previousTradingView;
    global.chrome = previousChrome;
  }
});

test("TradingView iframe bootstrap is rewritten without inline script or style tags", () => {
  const tradingView = loadAdapter();
  const html = [
    "<!doctype html><html><head>",
    "<base href=\"chrome-extension://extension-id/vendor/tradingview/charting_library/\">",
    "<script>window.inlineOne = true;</script>",
    "<script defer src=\"bundles/runtime.js\"></script>",
    "<style>.lib-icon{background:currentColor}</style>",
    "</head><body>",
    "<script>window.inlineTwo = true;</script>",
    "</body></html>"
  ].join("");
  const rewritten = tradingView.rewriteIframeHtmlForExtension(html);

  assert.doesNotMatch(rewritten, /<script\b(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(rewritten, /<style\b/i);
  assert.match(rewritten, /src="oddsight-extension-inline-1\.js"/);
  assert.match(rewritten, /src="oddsight-extension-inline-2\.js"/);
  assert.match(rewritten, /href="oddsight-extension-inline-1\.css"/);
  assert.match(rewritten, /src="bundles\/runtime\.js"/);
});
