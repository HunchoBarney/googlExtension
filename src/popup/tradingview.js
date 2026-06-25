(function attachTradingViewAdapter(global, factory) {
  "use strict";

  const api = factory(global);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMTradingView = api;
})(typeof window !== "undefined" ? window : globalThis, function createTradingViewAdapter(global) {
  "use strict";

  const LIBRARY_DIR = "vendor/tradingview/charting_library/";
  const LIBRARY_SCRIPT = `${LIBRARY_DIR}charting_library.standalone.js`;
  const EXTERNAL_BOOTSTRAP_PREFIX = "oddsight-extension-inline";
  const RANGE_RESOLUTIONS = {
    "1D": "15",
    "1W": "60",
    "1M": "60",
    "1Y": "1D",
    ALL: "1D"
  };
  const RANGE_LOOKBACK_MS = {
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 31 * 24 * 60 * 60 * 1000,
    "1Y": 365 * 24 * 60 * 60 * 1000
  };
  const SUPPORTED_RESOLUTIONS = ["15", "60", "1D"];
  const subscriptions = new Map();
  let libraryPromise = null;

  function text(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }
    return String(value);
  }

  function cleanLabel(value, fallback = "") {
    return text(value, fallback).replace(/\s+/g, " ").trim();
  }

  function normalizeLookupKey(value) {
    return cleanLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function toNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function marketKey(candidate = {}) {
    return cleanLabel(candidate.id || candidate.conditionId || candidate.eventId || candidate.url || candidate.title || candidate.question || "market");
  }

  function marketTitle(candidate = {}) {
    return cleanLabel(candidate.question || candidate.title || candidate.eventTitle || candidate.name || "Market");
  }

  function sourceName(candidate = {}) {
    const raw = cleanLabel(candidate.marketSource || candidate.sourceLabel || candidate.source || candidate.venue || "");
    if (raw) {
      return /hyper\s*liquid/i.test(raw) ? "Hyperliquid" : raw;
    }
    return /hyperliquid/i.test(cleanLabel(candidate.url)) ? "Hyperliquid" : "Polymarket";
  }

  function runtimeUrl(path) {
    const chromeApi = global.chrome || (typeof chrome !== "undefined" ? chrome : null);
    try {
      return chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === "function"
        ? chromeApi.runtime.getURL(path)
        : `../../${path}`;
    } catch (_error) {
      return `../../${path}`;
    }
  }

  function primaryOutcome(candidate = {}) {
    const outcomes = Array.isArray(candidate.outcomeOptions) ? candidate.outcomeOptions : [];
    if (outcomes.length) {
      return outcomes[0];
    }
    if (sourceName(candidate) === "Hyperliquid") {
      return {
        label: "Long",
        price: toNumber(candidate.markPrice || candidate.displayPrice || candidate.price || candidate.primaryPrice)
      };
    }
    return {
      label: candidate.primaryOutcome || "Yes",
      price: toNumber(candidate.primaryPrice),
      percent: toNumber(candidate.primaryPercent)
    };
  }

  function outcomePrice(candidate = {}, outcome = primaryOutcome(candidate)) {
    const direct = toNumber(outcome && (outcome.price || outcome.value));
    if (direct !== null && direct > 0) {
      return direct;
    }
    const percent = toNumber(outcome && outcome.percent);
    if (percent !== null && percent > 0) {
      return percent / 100;
    }
    const candidatePrice = toNumber(candidate.markPrice || candidate.displayPrice || candidate.primaryPrice);
    if (candidatePrice !== null && candidatePrice > 0) {
      return candidatePrice;
    }
    const candidatePercent = toNumber(candidate.primaryPercent);
    if (candidatePercent !== null && candidatePercent > 0) {
      return candidatePercent / 100;
    }
    return 0.5;
  }

  function lookupByOutcome(candidate = {}, outcome = {}, field) {
    const source = candidate[field];
    if (!source) {
      return null;
    }
    const tokenId = cleanLabel(outcome.clobTokenId || outcome.tokenId || "");
    if (tokenId && source[tokenId]) {
      return source[tokenId];
    }
    const labelKey = normalizeLookupKey(outcome.label);
    if (labelKey) {
      for (const [key, value] of Object.entries(source)) {
        if (normalizeLookupKey(key) === labelKey) {
          return value;
        }
      }
    }
    return null;
  }

  function tradeHistoryForOutcome(candidate = {}, outcome = {}) {
    return lookupByOutcome(candidate, outcome, "tradeChartHistoryByTokenId") ||
      lookupByOutcome(candidate, outcome, "tradeChartHistoryByOutcome") ||
      candidate.tradeChartHistory ||
      null;
  }

  function normalizeHistory(history) {
    return (Array.isArray(history) ? history : [])
      .map((point) => {
        const timeValue = Array.isArray(point)
          ? point[0]
          : point && (point.t || point.timestamp || point.time);
        const priceValue = Array.isArray(point)
          ? point[1]
          : point && (point.p || point.price || point.value || point.close);
        const time = toNumber(timeValue);
        const price = toNumber(priceValue);
        if (time === null || price === null || price <= 0) {
          return null;
        }
        return {
          time: time < 10000000000 ? time * 1000 : time,
          price
        };
      })
      .filter(Boolean);
  }

  function rangeKey(range) {
    const key = cleanLabel(range || "1M").toUpperCase();
    return key === "ALL" || RANGE_RESOLUTIONS[key] ? key : "1M";
  }

  function historyForRange(candidate = {}, outcome = primaryOutcome(candidate), range = "1M") {
    const source = tradeHistoryForOutcome(candidate, outcome);
    if (Array.isArray(source)) {
      return normalizeHistory(source);
    }
    if (source && typeof source === "object") {
      const key = rangeKey(range);
      const fallback = source.ALL || source.all || source.max || source["1M"] || Object.values(source).find(Array.isArray);
      return normalizeHistory(source[key] || source[key.toLowerCase()] || fallback);
    }
    return [];
  }

  function allHistory(candidate = {}, outcome = primaryOutcome(candidate)) {
    const source = tradeHistoryForOutcome(candidate, outcome);
    if (Array.isArray(source)) {
      return normalizeHistory(source);
    }
    if (source && typeof source === "object") {
      const seen = new Map();
      for (const value of Object.values(source)) {
        for (const point of normalizeHistory(value)) {
          seen.set(point.time, point);
        }
      }
      return Array.from(seen.values()).sort((left, right) => left.time - right.time);
    }
    return [];
  }

  function fallbackHistory(candidate = {}, outcome = primaryOutcome(candidate)) {
    const price = outcomePrice(candidate, outcome);
    const now = Date.now();
    return Array.from({ length: 48 }, (_item, index) => {
      const t = index / 47;
      const ripple = Math.sin(index / 4) * 0.014 + Math.cos(index / 7) * 0.008;
      const drift = (t - 0.5) * 0.018;
      const p = price >= 1
        ? Math.max(0.0001, price * (1 + ripple * 0.3 + drift * 0.2))
        : Math.min(0.99, Math.max(0.01, price + ripple + drift));
      return {
        time: now - (47 - index) * 60 * 60 * 1000,
        price: p
      };
    });
  }

  function pointsForCandidate(candidate = {}, outcome = primaryOutcome(candidate)) {
    const history = allHistory(candidate, outcome);
    return history.length >= 2 ? history : fallbackHistory(candidate, outcome);
  }

  function pointsToBars(points) {
    const ordered = (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0)
      .sort((left, right) => left.time - right.time);
    const seen = new Set();
    const bars = [];
    let previousClose = null;
    for (const point of ordered) {
      if (seen.has(point.time)) {
        continue;
      }
      seen.add(point.time);
      const open = previousClose === null ? point.price : previousClose;
      const close = point.price;
      const pad = Math.max(Math.abs(close - open) * 0.25, close * 0.002, close >= 1 ? 0.01 : 0.001);
      bars.push({
        time: point.time,
        open,
        high: Math.max(open, close) + pad,
        low: Math.max(0.0001, Math.min(open, close) - pad),
        close,
        volume: 0
      });
      previousClose = close;
    }
    return bars;
  }

  function rangeBounds(points, range = "1M") {
    const ordered = pointsToBars(points);
    const first = ordered[0] ? ordered[0].time : Date.now() - RANGE_LOOKBACK_MS["1M"];
    const last = ordered[ordered.length - 1] ? ordered[ordered.length - 1].time : Date.now();
    const key = rangeKey(range);
    return {
      from: key === "ALL" ? first : Math.max(first, last - (RANGE_LOOKBACK_MS[key] || RANGE_LOOKBACK_MS["1M"])),
      to: last
    };
  }

  function barsForCandidate(candidate = {}, options = {}) {
    const outcome = options.outcome || primaryOutcome(candidate);
    return pointsToBars(pointsForCandidate(candidate, outcome));
  }

  function priceScaleForBars(bars) {
    const maxPrice = Math.max(0, ...bars.map((bar) => Number(bar.close)).filter(Number.isFinite));
    return maxPrice >= 1000 ? 100 : maxPrice >= 1 ? 10000 : 10000;
  }

  function symbolName(candidate = {}, outcome = primaryOutcome(candidate)) {
    const base = marketKey(candidate).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 42) || "market";
    const suffix = cleanLabel(outcome.label || "").replace(/[^a-z0-9]+/gi, "").toUpperCase() || "PRICE";
    return `ODDSIGHT:${base.toUpperCase()}:${suffix}`;
  }

  function createDatafeed(candidate = {}, options = {}) {
    const outcome = options.outcome || primaryOutcome(candidate);
    const bars = barsForCandidate(candidate, { outcome });
    const symbol = symbolName(candidate, outcome);
    const venue = sourceName(candidate);
    const symbolInfo = {
      name: symbol,
      ticker: symbol,
      description: marketTitle(candidate),
      type: "prediction",
      session: "24x7",
      timezone: "Etc/UTC",
      exchange: venue,
      listed_exchange: venue,
      format: "price",
      minmov: 1,
      pricescale: priceScaleForBars(bars),
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: false,
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      intraday_multipliers: ["15", "60"],
      daily_multipliers: ["1"],
      volume_precision: 0,
      data_status: "streaming"
    };

    return {
      onReady(callback) {
        setTimeout(() => callback({
          supported_resolutions: SUPPORTED_RESOLUTIONS,
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: true,
          exchanges: [{ value: venue, name: venue, desc: venue }],
          symbols_types: [{ name: "Prediction", value: "prediction" }]
        }), 0);
      },
      resolveSymbol(_symbolName, onResolve, _onError) {
        setTimeout(() => onResolve(symbolInfo), 0);
      },
      getBars(_symbolInfo, _resolution, periodParams, onResult, onError) {
        try {
          const from = Number(periodParams && periodParams.from) || 0;
          const to = Number(periodParams && periodParams.to) || Number.MAX_SAFE_INTEGER;
          const countBack = Number(periodParams && periodParams.countBack) || 300;
          let result = bars.filter((bar) => {
            const seconds = Math.floor(bar.time / 1000);
            return seconds >= from && seconds < to;
          });
          if (!result.length && periodParams && periodParams.firstDataRequest) {
            result = bars.slice(-countBack);
          } else if (result.length > countBack) {
            result = result.slice(-countBack);
          }
          onResult(result, { noData: result.length === 0 });
        } catch (error) {
          onError(error && error.message ? error.message : "Unable to load bars");
        }
      },
      subscribeBars(_symbolInfo, _resolution, onTick, listenerGuid) {
        const latest = bars[bars.length - 1];
        subscriptions.set(listenerGuid, latest);
        if (latest) {
          setTimeout(() => {
            if (subscriptions.has(listenerGuid)) {
              onTick({ ...latest });
            }
          }, 0);
        }
      },
      unsubscribeBars(listenerGuid) {
        subscriptions.delete(listenerGuid);
      },
      getServerTime(callback) {
        callback(Math.floor(Date.now() / 1000));
      },
      __oddsight: {
        bars,
        symbol,
        symbolInfo,
        outcome
      }
    };
  }

  function rewriteIframeHtmlForExtension(html) {
    let scriptIndex = 0;
    let styleIndex = 0;
    return cleanLabel(html)
      ? html
        .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, () => {
          scriptIndex += 1;
          return `<script src="${EXTERNAL_BOOTSTRAP_PREFIX}-${scriptIndex}.js"></script>`;
        })
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, () => {
          styleIndex += 1;
          return `<link type="text/css" href="${EXTERNAL_BOOTSTRAP_PREFIX}-${styleIndex}.css" rel="stylesheet">`;
        })
      : html;
  }

  function patchTradingViewForExtension(TradingView) {
    const prototype = TradingView && TradingView.widget && TradingView.widget.prototype;
    if (!prototype || prototype.__oddsightCspPatched || typeof prototype._generateIframeHtml !== "function") {
      return;
    }
    const originalGenerateIframeHtml = prototype._generateIframeHtml;
    prototype._generateIframeHtml = function generateExtensionSafeIframeHtml(...args) {
      return rewriteIframeHtmlForExtension(originalGenerateIframeHtml.apply(this, args));
    };
    prototype.__oddsightCspPatched = true;
  }

  function loadTradingViewLibrary() {
    if (global.TradingView && typeof global.TradingView.widget === "function") {
      patchTradingViewForExtension(global.TradingView);
      return Promise.resolve(global.TradingView);
    }
    if (libraryPromise) {
      return libraryPromise;
    }
    libraryPromise = new Promise((resolve, reject) => {
      if (!global.document || typeof global.document.createElement !== "function") {
        reject(new Error("TradingView library cannot load without a document"));
        return;
      }
      const script = global.document.createElement("script");
      script.src = runtimeUrl(LIBRARY_SCRIPT);
      script.async = true;
      script.onload = () => {
        if (global.TradingView && typeof global.TradingView.widget === "function") {
          patchTradingViewForExtension(global.TradingView);
          resolve(global.TradingView);
        } else {
          reject(new Error("TradingView widget did not initialize"));
        }
      };
      script.onerror = () => reject(new Error("TradingView library failed to load"));
      (global.document.head || global.document.documentElement).append(script);
    });
    return libraryPromise;
  }

  function destroyHost(host) {
    if (!host) {
      return;
    }
    const widget = host.__oddsightTradingViewWidget;
    if (widget && typeof widget.remove === "function") {
      try {
        widget.remove();
      } catch (_error) {
        // Removing a detached TradingView iframe can throw in browser teardown.
      }
    }
    host.__oddsightTradingViewWidget = null;
    host.__oddsightTradingViewDatafeed = null;
    host.__oddsightTradingViewBars = null;
    host.__oddsightTradingViewReady = false;
  }

  function unmountAll(root) {
    for (const host of Array.from((root || global.document || {}).querySelectorAll ? (root || global.document).querySelectorAll("[data-tradingview-chart]") : [])) {
      destroyHost(host);
    }
  }

  function disabledFeatures() {
    return [
      "header_widget",
      "legend_widget",
      "left_toolbar",
      "timeframes_toolbar",
      "use_localstorage_for_settings",
      "create_volume_indicator_by_default",
      "create_volume_indicator_by_default_once",
      "volume_force_overlay",
      "display_market_status",
      "show_symbol_logo_in_legend",
      "symbol_search_hot_key",
      "go_to_date",
      "chart_property_page_scales",
      "chart_property_page_style",
      "context_menus",
      "legend_context_menu",
      "pane_context_menu",
      "show_object_tree",
      "control_bar"
    ];
  }

  function chartOverrides() {
    return {
      "paneProperties.background": "#151a1f",
      "paneProperties.backgroundType": "solid",
      "paneProperties.vertGridProperties.color": "rgba(255,255,255,0.035)",
      "paneProperties.horzGridProperties.color": "rgba(255,255,255,0.035)",
      "paneProperties.legendProperties.showLegend": false,
      "paneProperties.legendProperties.showSeriesTitle": false,
      "paneProperties.legendProperties.showSeriesOHLC": false,
      "paneProperties.legendProperties.showStudyTitles": false,
      "paneProperties.legendProperties.showStudyValues": false,
      "paneProperties.legendProperties.showVolume": false,
      "scalesProperties.textColor": "#9aa0ab",
      "mainSeriesProperties.style": 2,
      "mainSeriesProperties.lineStyle.color": "#b6dc77",
      "mainSeriesProperties.lineStyle.linewidth": 3,
      "mainSeriesProperties.priceLineColor": "#b6dc77",
      "mainSeriesProperties.showCountdown": false,
      "mainSeriesProperties.visible": true
    };
  }

  function applyVisibleRange(host, range) {
    const widget = host && host.__oddsightTradingViewWidget;
    const bars = host && host.__oddsightTradingViewBars;
    if (!widget || !bars || !bars.length || typeof widget.chart !== "function") {
      return;
    }
    try {
      const chart = widget.chart();
      const resolution = RANGE_RESOLUTIONS[rangeKey(range)] || RANGE_RESOLUTIONS["1M"];
      if (chart && typeof chart.setResolution === "function") {
        chart.setResolution(resolution, () => {});
      }
      const bounds = rangeBounds(bars, range);
      if (chart && typeof chart.setVisibleRange === "function") {
        chart.setVisibleRange({
          from: Math.floor(bounds.from / 1000),
          to: Math.floor(bounds.to / 1000)
        });
      }
    } catch (_error) {
      // The compact widget may not expose all chart controls before onChartReady.
    }
  }

  async function mountTradeChart(root, candidate = {}, options = {}) {
    const host = root && root.querySelector ? root.querySelector("[data-tradingview-chart]") : null;
    if (!host) {
      return null;
    }
    destroyHost(host);
    const card = host.closest(".trade-chart-card");
    const rangeButton = root.querySelector(".trade-range-button.is-active");
    const initialRange = rangeKey(options.range || (rangeButton && rangeButton.dataset ? rangeButton.dataset.tradeRange : "1M"));
    const outcome = primaryOutcome(candidate);
    const datafeed = createDatafeed(candidate, { outcome });
    const bars = datafeed.__oddsight.bars;
    host.__oddsightTradingViewDatafeed = datafeed;
    host.__oddsightTradingViewBars = bars;
    host.dataset.tradingviewState = "loading";
    if (card) {
      card.classList.add("has-tradingview");
      card.classList.remove("tv-ready", "tv-error");
    }

    try {
      const TradingView = await loadTradingViewLibrary();
      if (!host.isConnected) {
        return null;
      }
      const widget = new TradingView.widget({
        autosize: true,
        symbol: datafeed.__oddsight.symbol,
        interval: RANGE_RESOLUTIONS[initialRange] || RANGE_RESOLUTIONS["1M"],
        container: host,
        datafeed,
        library_path: runtimeUrl(LIBRARY_DIR),
        locale: "en",
        timezone: "Etc/UTC",
        theme: "dark",
        disabled_features: disabledFeatures(),
        enabled_features: ["hide_left_toolbar_by_default", "iframe_loading_same_origin"],
        overrides: chartOverrides(),
        loading_screen: {
          backgroundColor: "#151a1f",
          foregroundColor: "#b6dc77"
        },
        custom_css_url: ""
      });
      host.__oddsightTradingViewWidget = widget;
      if (widget && typeof widget.onChartReady === "function") {
        widget.onChartReady(() => {
          host.__oddsightTradingViewReady = true;
          host.dataset.tradingviewState = "ready";
          if (card) {
            card.classList.add("tv-ready");
            card.classList.remove("tv-error");
          }
          applyVisibleRange(host, initialRange);
        });
      }
      return widget;
    } catch (error) {
      host.dataset.tradingviewState = "fallback";
      if (card) {
        card.classList.add("tv-error");
        card.classList.remove("tv-ready");
      }
      return null;
    }
  }

  function setRange(root, range) {
    const host = root && root.querySelector ? root.querySelector("[data-tradingview-chart]") : null;
    if (host) {
      applyVisibleRange(host, range);
    }
  }

  return {
    createDatafeed,
    rewriteIframeHtmlForExtension,
    historyForRange,
    barsForCandidate,
    rangeBounds,
    mountTradeChart,
    setRange,
    unmountAll
  };
});
