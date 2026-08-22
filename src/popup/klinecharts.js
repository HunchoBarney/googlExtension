(function attachKLineChartsAdapter(global, factory) {
  "use strict";

  const api = factory(global);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMKLineChart = api;
})(typeof window !== "undefined" ? window : globalThis, function createKLineChartsAdapter(global) {
  "use strict";

  const RANGE_LOOKBACK_MS = {
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 31 * 24 * 60 * 60 * 1000,
    "1Y": 365 * 24 * 60 * 60 * 1000
  };
  const RANGE_PERIODS = {
    "1D": { span: 15, type: "minute" },
    "1W": { span: 1, type: "hour" },
    "1M": { span: 1, type: "hour" },
    "1Y": { span: 1, type: "day" },
    ALL: { span: 1, type: "day" }
  };
  const PERIOD_MS = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000
  };

  function text(value, fallback = "") {
    return value === null || value === undefined ? fallback : String(value);
  }

  function cleanLabel(value, fallback = "") {
    return text(value, fallback).replace(/\s+/g, " ").trim();
  }

  function toNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function rangeKey(range) {
    const key = cleanLabel(range || "1M").toUpperCase();
    return key === "ALL" || RANGE_LOOKBACK_MS[key] ? key : "1M";
  }

  function primaryOutcome(candidate = {}) {
    const outcomes = Array.isArray(candidate.outcomeOptions) ? candidate.outcomeOptions : [];
    if (outcomes.length) {
      return outcomes[0];
    }
    return {
      label: candidate.primaryOutcome || "Yes",
      clobTokenId: candidate.clobTokenId || "",
      tokenId: candidate.tokenId || ""
    };
  }

  function normalizeLookupKey(value) {
    return cleanLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function lookupByOutcome(candidate = {}, outcome = {}, field) {
    const source = candidate[field];
    if (!source || typeof source !== "object") {
      return null;
    }
    const tokenId = cleanLabel(outcome.clobTokenId || outcome.tokenId || outcome.assetId || "");
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
    const points = new Map();
    for (const point of Array.isArray(history) ? history : []) {
      const rawTime = Array.isArray(point)
        ? point[0]
        : point && (point.t ?? point.timestamp ?? point.time);
      const rawPrice = Array.isArray(point)
        ? point[1]
        : point && (point.p ?? point.price ?? point.value ?? point.close);
      const time = toNumber(rawTime);
      const price = toNumber(rawPrice);
      if (time === null || price === null || price < 0) {
        continue;
      }
      const timestamp = time < 10000000000 ? time * 1000 : time;
      points.set(timestamp, { timestamp, price });
    }
    return Array.from(points.values()).sort((left, right) => left.timestamp - right.timestamp);
  }

  function combinedHistory(source) {
    if (Array.isArray(source)) {
      return normalizeHistory(source);
    }
    if (!source || typeof source !== "object") {
      return [];
    }
    return normalizeHistory(Object.values(source).flatMap((value) => Array.isArray(value) ? value : []));
  }

  function historyForRange(candidate = {}, outcome = primaryOutcome(candidate), range = "1M") {
    const key = rangeKey(range);
    const source = tradeHistoryForOutcome(candidate, outcome);
    let points = [];
    if (Array.isArray(source)) {
      points = normalizeHistory(source);
    } else if (source && typeof source === "object") {
      const exact = source[key] || source[key.toLowerCase()];
      points = Array.isArray(exact) ? normalizeHistory(exact) : combinedHistory(source);
    }
    if (!points.length || key === "ALL") {
      return points;
    }
    const lastTimestamp = points[points.length - 1].timestamp;
    const firstTimestamp = lastTimestamp - RANGE_LOOKBACK_MS[key];
    return points.filter((point) => point.timestamp >= firstTimestamp);
  }

  function pointsToBars(points) {
    return (Array.isArray(points) ? points : []).map((point) => ({
      timestamp: point.timestamp,
      open: point.price,
      high: point.price,
      low: point.price,
      close: point.price,
      volume: 0
    }));
  }

  function barsForCandidate(candidate = {}, options = {}) {
    const outcome = options.outcome || primaryOutcome(candidate);
    return pointsToBars(historyForRange(candidate, outcome, options.range || "1M"));
  }

  function outcomeToken(outcome = {}) {
    return cleanLabel(outcome.clobTokenId || outcome.tokenId || outcome.assetId || "");
  }

  function ensureHistoryForOutcome(candidate, outcome) {
    const existing = lookupByOutcome(candidate, outcome, "tradeChartHistoryByTokenId") ||
      lookupByOutcome(candidate, outcome, "tradeChartHistoryByOutcome");
    if (existing) {
      return existing;
    }
    const tokenId = outcomeToken(outcome);
    if (tokenId) {
      candidate.tradeChartHistoryByTokenId = candidate.tradeChartHistoryByTokenId || {};
      candidate.tradeChartHistoryByTokenId[tokenId] = candidate.tradeChartHistoryByTokenId[tokenId] || {};
      return candidate.tradeChartHistoryByTokenId[tokenId];
    }
    const labelKey = normalizeLookupKey(outcome && outcome.label);
    if (labelKey) {
      candidate.tradeChartHistoryByOutcome = candidate.tradeChartHistoryByOutcome || {};
      candidate.tradeChartHistoryByOutcome[labelKey] = candidate.tradeChartHistoryByOutcome[labelKey] || {};
      return candidate.tradeChartHistoryByOutcome[labelKey];
    }
    candidate.tradeChartHistory = candidate.tradeChartHistory || {};
    return candidate.tradeChartHistory;
  }

  function normalizedPointTime(point) {
    const raw = point && (point.t ?? point.timestamp ?? point.time);
    const time = toNumber(raw);
    return time === null ? null : time < 10000000000 ? time * 1000 : time;
  }

  function upsertHistoryPoint(history, point, periodMs = 0) {
    const timestamp = normalizedPointTime(point);
    const price = toNumber(point && (point.p ?? point.price ?? point.value ?? point.close));
    if (!Array.isArray(history) || timestamp === null || price === null || price < 0) {
      return false;
    }
    const next = { t: timestamp, p: price };
    const index = history.findIndex((current) => normalizedPointTime(current) === timestamp);
    if (index >= 0) {
      history[index] = next;
    } else {
      let latestIndex = -1;
      let latestTimestamp = -Infinity;
      for (const [currentIndex, current] of history.entries()) {
        const currentTimestamp = normalizedPointTime(current);
        if (currentTimestamp !== null && currentTimestamp > latestTimestamp) {
          latestIndex = currentIndex;
          latestTimestamp = currentTimestamp;
        }
      }
      const samePeriod = periodMs > 0 &&
        Math.floor(timestamp / periodMs) === Math.floor(latestTimestamp / periodMs);
      if (timestamp > latestTimestamp && samePeriod) {
        history[latestIndex] = next;
      } else {
        history.push(next);
      }
    }
    history.sort((left, right) => normalizedPointTime(left) - normalizedPointTime(right));
    return true;
  }

  function sameOutcome(left = {}, right = {}) {
    const leftToken = outcomeToken(left);
    const rightToken = outcomeToken(right);
    if (leftToken || rightToken) {
      return Boolean(leftToken && rightToken && leftToken === rightToken);
    }
    return normalizeLookupKey(left.label) === normalizeLookupKey(right.label);
  }

  function appendLivePoint(root, candidate = {}, outcome = {}, point = {}) {
    const timestamp = normalizedPointTime(point);
    const price = toNumber(point && (point.p ?? point.price ?? point.value ?? point.close));
    if (timestamp === null || price === null || price < 0) {
      return false;
    }
    const source = ensureHistoryForOutcome(candidate, outcome);
    if (Array.isArray(source)) {
      upsertHistoryPoint(source, { t: timestamp, p: price });
    } else {
      let histories = Object.entries(source).filter((entry) => Array.isArray(entry[1]));
      if (!histories.length) {
        source.ALL = [];
        histories = [["ALL", source.ALL]];
      }
      for (const [range, history] of histories) {
        const period = RANGE_PERIODS[rangeKey(range)];
        upsertHistoryPoint(history, { t: timestamp, p: price }, period.span * PERIOD_MS[period.type]);
      }
    }

    const host = chartHost(root);
    if (!host || marketKey(host.__pmexKLineCandidate) !== marketKey(candidate) || !sameOutcome(host.__pmexKLineOutcome, outcome)) {
      return true;
    }
    host.__pmexKLineCandidate = candidate;
    const bars = barsForCandidate(candidate, {
      outcome,
      range: host.__pmexKLineRange || "1M"
    });
    host.dataset.klinePoints = String(bars.length);
    if (!host.__pmexKLineChart && bars.length >= 2) {
      mountTradeChart(root, candidate, {
        outcome,
        range: host.__pmexKLineRange || "1M"
      });
      return true;
    }
    setHostState(host, bars.length >= 2 ? "ready" : "unavailable", bars.length >= 2 ? "" : "Price history unavailable.");
    const latestBar = bars[bars.length - 1];
    if (latestBar && typeof host.__pmexKLinePush === "function") {
      const period = RANGE_PERIODS[rangeKey(host.__pmexKLineRange)];
      const periodMs = period.span * PERIOD_MS[period.type];
      let liveTimestamp = toNumber(host.__pmexKLineLiveTimestamp);
      if (liveTimestamp === null || Math.floor(timestamp / periodMs) > Math.floor(liveTimestamp / periodMs)) {
        liveTimestamp = latestBar.timestamp;
      }
      host.__pmexKLineLiveTimestamp = liveTimestamp;
      host.__pmexKLinePush({ ...latestBar, timestamp: liveTimestamp });
    } else if (host.__pmexKLineChart && typeof host.__pmexKLineChart.resetData === "function") {
      host.__pmexKLineChart.resetData();
    }
    return true;
  }

  function marketKey(candidate = {}) {
    return cleanLabel(candidate.id || candidate.conditionId || candidate.eventId || candidate.url || candidate.title || candidate.question || "market");
  }

  function symbolName(candidate = {}, outcome = primaryOutcome(candidate)) {
    const market = marketKey(candidate).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 42) || "MARKET";
    const side = cleanLabel(outcome.label || "PRICE").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "PRICE";
    return `PMEX:${market.toUpperCase()}:${side.toUpperCase()}`;
  }

  function pricePrecision(bars) {
    const maxPrice = Math.max(0, ...(Array.isArray(bars) ? bars : []).map((bar) => bar.close));
    return maxPrice >= 1000 ? 2 : 4;
  }

  function isRedOutcome(candidate = {}, outcome = {}) {
    const outcomes = Array.isArray(candidate.outcomeOptions) ? candidate.outcomeOptions : [];
    const secondary = outcomes[1] || (candidate.secondaryOutcome ? { label: candidate.secondaryOutcome } : null);
    return Boolean(secondary && sameOutcome(secondary, outcome)) || ["no", "short"].includes(normalizeLookupKey(outcome.label));
  }

  function chartStyles(red = false) {
    const accent = red ? "#ff6676" : "#b6dc77";
    const accentRgb = red ? "255,102,118" : "182,220,119";
    return {
      grid: {
        horizontal: {
          show: true,
          color: "rgba(255,255,255,0.035)",
          size: 1,
          style: "dashed",
          dashedValue: [3, 3]
        },
        vertical: {
          show: true,
          color: "rgba(255,255,255,0.025)",
          size: 1,
          style: "dashed",
          dashedValue: [3, 3]
        }
      },
      candle: {
        type: "area",
        area: {
          lineSize: 3,
          lineColor: accent,
          value: "close",
          smooth: true,
          backgroundColor: [
            { offset: 0, color: `rgba(${accentRgb},0.24)` },
            { offset: 1, color: `rgba(${accentRgb},0.01)` }
          ],
          point: {
            show: true,
            color: accent,
            radius: 3,
            rippleColor: `rgba(${accentRgb},0.24)`,
            rippleRadius: 7,
            animation: false,
            animationDuration: 0
          }
        },
        priceMark: {
          high: { show: false },
          low: { show: false }
        },
        tooltip: {
          showRule: "none"
        }
      },
      xAxis: {
        axisLine: { color: "rgba(255,255,255,0.08)" },
        tickLine: { color: "rgba(255,255,255,0.08)" },
        tickText: { color: "#9aa0ab" }
      },
      yAxis: {
        axisLine: { color: "rgba(255,255,255,0.08)" },
        tickLine: { color: "rgba(255,255,255,0.08)" },
        tickText: { color: "#9aa0ab" }
      },
      crosshair: {
        horizontal: {
          line: { color: "rgba(214,219,225,0.28)" },
          text: { backgroundColor: "#272d37", color: accent }
        },
        vertical: {
          line: { color: "rgba(214,219,225,0.24)" },
          text: { backgroundColor: "#272d37", color: "#f0f3f7" }
        }
      }
    };
  }

  function chartOptions(red = false) {
    return {
      locale: "en-US",
      timezone: "Etc/UTC",
      styles: chartStyles(red),
      layout: {
        yAxis: {
          position: "right",
          inside: true
        }
      },
      hotkey: { enabled: false }
    };
  }

  function chartHost(root) {
    return root && root.querySelector ? root.querySelector("[data-kline-chart]") : null;
  }

  function emptyMessage(host) {
    const card = host && host.closest ? host.closest(".trade-chart-card") : null;
    return card && card.querySelector ? card.querySelector(".kline-chart-empty") : null;
  }

  function setHostState(host, state, message = "") {
    if (!host) {
      return;
    }
    const card = host.closest ? host.closest(".trade-chart-card") : null;
    const empty = emptyMessage(host);
    host.dataset.klineState = state;
    host.setAttribute("aria-hidden", String(state !== "ready"));
    if (card) {
      card.classList.toggle("kline-ready", state === "ready");
      card.classList.toggle("kline-unavailable", state === "unavailable");
      card.classList.toggle("kline-error", state === "error");
    }
    if (empty) {
      empty.hidden = state === "ready" || state === "idle";
      if (message) {
        empty.textContent = message;
      }
    }
  }

  function dataLoaderForHost(host) {
    return {
      getBars({ type, callback }) {
        if (typeof callback !== "function") {
          return;
        }
        if (type !== "init" && type !== "update") {
          callback([], { forward: false, backward: false });
          return;
        }
        callback(barsForCandidate(host.__pmexKLineCandidate, {
          outcome: host.__pmexKLineOutcome,
          range: host.__pmexKLineRange
        }), { forward: false, backward: false });
      },
      subscribeBar({ callback }) {
        host.__pmexKLinePush = typeof callback === "function" ? callback : null;
        const bars = barsForCandidate(host.__pmexKLineCandidate, {
          outcome: host.__pmexKLineOutcome,
          range: host.__pmexKLineRange
        });
        host.__pmexKLineLiveTimestamp = bars.length ? bars[bars.length - 1].timestamp : null;
      },
      unsubscribeBar() {
        host.__pmexKLinePush = null;
        host.__pmexKLineLiveTimestamp = null;
      }
    };
  }

  function library() {
    return global.klinecharts || null;
  }

  function destroyHost(host) {
    if (!host) {
      return;
    }
    const api = library();
    if (host.__pmexKLineChart && api && typeof api.dispose === "function") {
      try {
        api.dispose(host);
      } catch (_error) {
        // A detached popup host may already have been disposed by the chart library.
      }
    }
    host.__pmexKLineChart = null;
    host.__pmexKLineCandidate = null;
    host.__pmexKLineOutcome = null;
    host.__pmexKLineRange = null;
    host.__pmexKLinePush = null;
    host.__pmexKLineLiveTimestamp = null;
    delete host.dataset.klineRange;
    delete host.dataset.klinePoints;
    setHostState(host, "idle");
  }

  function unmountAll(root) {
    const scope = root || global.document;
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return;
    }
    for (const host of Array.from(scope.querySelectorAll("[data-kline-chart]"))) {
      destroyHost(host);
    }
  }

  function mountTradeChart(root, candidate = {}, options = {}) {
    const host = chartHost(root);
    if (!host) {
      return null;
    }
    destroyHost(host);
    const outcome = options.outcome || primaryOutcome(candidate);
    const initialRange = rangeKey(options.range || "1M");
    const initialBars = barsForCandidate(candidate, { outcome, range: initialRange });
    host.__pmexKLineCandidate = candidate;
    host.__pmexKLineOutcome = outcome;
    host.__pmexKLineRange = initialRange;
    host.dataset.klineRange = initialRange;
    host.dataset.klinePoints = String(initialBars.length);

    if (initialBars.length < 2) {
      setHostState(host, "unavailable", "Price history unavailable.");
      return null;
    }

    const api = library();
    if (!api || typeof api.init !== "function") {
      setHostState(host, "error", "Chart unavailable.");
      return null;
    }

    try {
      const chart = api.init(host, chartOptions(isRedOutcome(candidate, outcome)));
      if (!chart) {
        setHostState(host, "error", "Chart unavailable.");
        return null;
      }
      host.__pmexKLineChart = chart;
      chart.setSymbol({
        ticker: symbolName(candidate, outcome),
        pricePrecision: pricePrecision(initialBars),
        volumePrecision: 0
      });
      chart.setPeriod({ ...RANGE_PERIODS[initialRange] });
      chart.setDataLoader(dataLoaderForHost(host));
      if (typeof chart.setOffsetRightDistance === "function") {
        chart.setOffsetRightDistance(0);
      }
      setHostState(host, "ready");
      return chart;
    } catch (_error) {
      destroyHost(host);
      setHostState(host, "error", "Chart unavailable.");
      return null;
    }
  }

  function setRange(root, range) {
    const host = chartHost(root);
    const chart = host && host.__pmexKLineChart;
    if (!host) {
      return;
    }
    const key = rangeKey(range);
    if (!chart) {
      const candidate = host.__pmexKLineCandidate;
      if (candidate) {
        return mountTradeChart(root, candidate, {
          outcome: host.__pmexKLineOutcome,
          range: key
        });
      }
      return;
    }
    host.__pmexKLineRange = key;
    const bars = barsForCandidate(host.__pmexKLineCandidate, {
      outcome: host.__pmexKLineOutcome,
      range: key
    });
    host.dataset.klineRange = key;
    host.dataset.klinePoints = String(bars.length);
    setHostState(host, bars.length >= 2 ? "ready" : "unavailable", bars.length >= 2 ? "" : "Price history unavailable.");
    if (typeof chart.setPeriod === "function") {
      chart.setPeriod({ ...RANGE_PERIODS[key] });
    }
    if (typeof chart.resetData === "function") {
      chart.resetData();
    }
  }

  return {
    historyForRange,
    barsForCandidate,
    appendLivePoint,
    mountTradeChart,
    setRange,
    unmountAll
  };
});
