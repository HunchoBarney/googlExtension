(function attachHyperliquid(global, factory) {
  "use strict";

  const api = factory(global.PMArticleSignals);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMHyperliquid = api;
})(typeof window !== "undefined" ? window : globalThis, function createHyperliquid(signals) {
  "use strict";

  const HYPERLIQUID_API = "https://api.hyperliquid.xyz";
  const HYPERLIQUID_APP = "https://app.hyperliquid.xyz";
  const HYPERLIQUID_WS = "wss://api.hyperliquid.xyz/ws";
  const DEFAULT_MAX_RESULTS = 4;
  const DEFAULT_TIMEOUT_MS = 3500;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const TRADE_HISTORY_RANGES = [
    ["1D", "15m", DAY_MS],
    ["1W", "1h", 7 * DAY_MS],
    ["1M", "4h", 31 * DAY_MS],
    ["1Y", "1d", 365 * DAY_MS],
    ["ALL", "1d", null]
  ];
  const ALIASES = new Map([
    ["BTC", ["Bitcoin", "BTC"]],
    ["ETH", ["Ethereum", "Ether", "ETH"]],
    ["SOL", ["Solana", "SOL"]],
    ["HYPE", ["Hyperliquid", "HYPE"]],
    ["DOGE", ["Dogecoin", "DOGE"]],
    ["XRP", ["Ripple", "XRP"]],
    ["BNB", ["Binance Coin", "BNB"]],
    ["ADA", ["Cardano", "ADA"]],
    ["AVAX", ["Avalanche", "AVAX"]],
    ["LINK", ["Chainlink", "LINK"]],
    ["LTC", ["Litecoin", "LTC"]],
    ["BCH", ["Bitcoin Cash", "BCH"]],
    ["DOT", ["Polkadot", "DOT"]],
    ["TRX", ["Tron", "TRX"]],
    ["ARB", ["Arbitrum", "ARB"]],
    ["OP", ["Optimism", "OP"]],
    ["SUI", ["Sui", "SUI"]],
    ["ATOM", ["Cosmos", "ATOM"]],
    ["UNI", ["Uniswap", "UNI"]],
    ["AAVE", ["Aave", "AAVE"]],
    ["PEPE", ["Pepe", "PEPE", "kPEPE"]]
  ]);

  const normalizeWhitespace = signals && signals.normalizeWhitespace
    ? signals.normalizeWhitespace
    : function normalizeWhitespace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    };
  const canonicalKey = signals && signals.canonicalKey
    ? signals.canonicalKey
    : function canonicalKey(value) {
      return normalizeWhitespace(value).toLowerCase().replace(/[^\w$.\s-]/g, "").replace(/\s+/g, " ");
    };

  function toNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatUsd(value) {
    const number = toNumber(value);
    if (number === null) {
      return "n/a";
    }
    if (number >= 1000) {
      return `$${Math.round(number).toLocaleString("en-US")}`;
    }
    if (number >= 1) {
      return `$${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${number.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  }

  function compactUsd(value) {
    const number = toNumber(value);
    if (number === null) {
      return null;
    }
    if (number >= 1000000000) {
      return `$${(number / 1000000000).toFixed(1)}B`;
    }
    if (number >= 1000000) {
      return `$${(number / 1000000).toFixed(1)}M`;
    }
    if (number >= 1000) {
      return `$${(number / 1000).toFixed(1)}K`;
    }
    return formatUsd(number);
  }

  function aliasesForCoin(coin) {
    const normalized = String(coin || "").trim();
    if (!normalized) {
      return [];
    }
    const bare = normalized.replace(/^k(?=[A-Z]{2,}$)/, "");
    return Array.from(new Set([
      normalized,
      bare,
      ...((ALIASES.get(normalized) || ALIASES.get(bare)) || [])
    ].filter(Boolean)));
  }

  function aliasMatchesText(alias, text) {
    const key = canonicalKey(alias);
    if (!key || !text) {
      return false;
    }
    if (/^[a-z0-9]{2,6}$/.test(key)) {
      return new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);
    }
    return text.includes(key);
  }

  function candidateAliases(candidate) {
    return aliasesForCoin(candidate.coin || candidate.symbol || candidate.title);
  }

  function sourceTextForArticle(article = {}) {
    const entities = article.entities && Array.isArray(article.entities.top) ? article.entities.top : [];
    const centralEntities = Array.isArray(article.centralEntities) ? article.centralEntities : [];
    return [
      article.title,
      article.cleanText,
      article.text,
      ...((article.queries || []).slice(0, 8)),
      ...entities.map((entity) => entity && entity.text),
      ...centralEntities.map((entity) => entity && entity.text)
    ].map(canonicalKey).filter(Boolean).join(" ");
  }

  function articleHasCryptoSignal(article = {}) {
    const topic = article.topic && article.topic.label;
    const classifierTopic = article.classifier && article.classifier.topic;
    if (topic === "crypto" || classifierTopic === "crypto") {
      return true;
    }
    const entities = [
      ...((article.entities && article.entities.crypto) || []),
      ...((article.entities && article.entities.top) || []),
      ...((article.centralEntities) || [])
    ];
    if (entities.some((entity) => entity && entity.type === "crypto")) {
      return true;
    }
    const text = canonicalKey([
      article.title,
      ...((article.queries || []).slice(0, 8)),
      ...entities.map((entity) => entity && entity.text)
    ].filter(Boolean).join(" "));
    return /\b(bitcoin|btc|ethereum|ether|eth|solana|sol|dogecoin|doge|xrp|crypto|token|blockchain|defi|stablecoin|hyperliquid|perp|perpetual)\b/.test(text);
  }

  function movementFromContext(context = {}) {
    const mark = toNumber(context.markPx || context.midPx || context.oraclePx);
    const previous = toNumber(context.prevDayPx);
    if (mark === null || previous === null || previous <= 0) {
      return { direction: "unknown", value: null };
    }
    const change = (mark - previous) / previous;
    return {
      direction: change > 0 ? "up" : (change < 0 ? "down" : "flat"),
      value: change
    };
  }

  function normalizeAsset(asset = {}, context = {}, index = 0) {
    const coin = normalizeWhitespace(asset.name || asset.coin || "");
    if (!coin || asset.isDelisted) {
      return null;
    }
    const mark = toNumber(context.markPx || context.midPx || context.oraclePx);
    const volume = toNumber(context.dayNtlVlm);
    const openInterest = toNumber(context.openInterest);
    return {
      id: `hyperliquid:${coin}`,
      eventId: `hyperliquid:${coin}`,
      type: "venueMarket",
      title: `${coin} perpetual market`,
      eventTitle: `${coin} perpetual market`,
      coin,
      symbol: coin,
      url: `${HYPERLIQUID_APP}/trade/${encodeURIComponent(coin)}`,
      displayValue: formatUsd(mark),
      displayDetail: volume === null ? "" : `${compactUsd(volume)} 24h volume`,
      primaryOutcome: "Mark",
      secondaryOutcome: "24h",
      primaryPrice: null,
      secondaryPrice: null,
      primaryPercent: null,
      outcomeOptions: [],
      movement: movementFromContext(context),
      volume,
      liquidity: openInterest,
      confidence: 0,
      marketSource: "Hyperliquid",
      sourceLabel: "Hyperliquid",
      source: "hyperliquid",
      category: "Crypto",
      tags: ["Hyperliquid", coin, "perpetual"],
      sourceQueries: [],
      raw: {
        asset,
        context,
        index
      }
    };
  }

  function normalizeMetaAndAssetCtxs(payload) {
    const value = payload && payload.value && Array.isArray(payload.value) ? payload.value : payload;
    if (!Array.isArray(value) || value.length < 2) {
      return [];
    }
    const meta = value[0] || {};
    const contexts = Array.isArray(value[1]) ? value[1] : [];
    const universe = Array.isArray(meta.universe) ? meta.universe : [];
    return universe
      .map((asset, index) => normalizeAsset(asset, contexts[index] || {}, index))
      .filter(Boolean);
  }

  async function fetchInfo(body, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) {
      throw new Error("No fetch implementation is available for Hyperliquid.");
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS)
      : null;
    try {
      const response = await fetchImpl(`${HYPERLIQUID_API}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      });
      if (!response || !response.ok) {
        throw new Error(`Hyperliquid API returned ${response ? response.status : "no response"}`);
      }
      return response.json();
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async function fetchMetaAndAssetCtxs(options = {}) {
    return normalizeMetaAndAssetCtxs(await fetchInfo({ type: "metaAndAssetCtxs" }, options));
  }

  function normalizeBook(payload) {
    const levels = payload && Array.isArray(payload.levels) ? payload.levels : [];
    const normalizeSide = (rows) => (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const price = toNumber(row && (row.px ?? row.price));
        const size = toNumber(row && (row.sz ?? row.size));
        return price !== null && price > 0 && size !== null && size > 0 ? { price, size } : null;
      })
      .filter(Boolean);
    const bids = normalizeSide(levels[0]);
    const asks = normalizeSide(levels[1]);
    return bids.length || asks.length ? { bids, asks } : null;
  }

  function normalizeHistory(payload) {
    return (Array.isArray(payload) ? payload : [])
      .map((row) => {
        const t = toNumber(row && (row.t ?? row.time ?? row.timestamp));
        const p = toNumber(row && (row.c ?? row.close ?? row.p ?? row.price));
        return t !== null && p !== null && p > 0 ? { t, p } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.t - right.t);
  }

  function streamTimestamp(value) {
    const timestamp = toNumber(value);
    if (timestamp === null || timestamp <= 0) {
      return Date.now();
    }
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  }

  function openTradeStream(candidate = {}, handlers = {}, options = {}) {
    const coin = normalizeWhitespace(candidate.coin || candidate.symbol || (candidate.raw && candidate.raw.asset && candidate.raw.asset.name));
    const WebSocketImpl = options.WebSocketImpl || (typeof WebSocket === "function" ? WebSocket : null);
    if (!coin || !WebSocketImpl) {
      return null;
    }

    const setIntervalImpl = options.setIntervalImpl || setInterval;
    const clearIntervalImpl = options.clearIntervalImpl || clearInterval;
    const setTimeoutImpl = options.setTimeoutImpl || setTimeout;
    const clearTimeoutImpl = options.clearTimeoutImpl || clearTimeout;
    const reconnectDelayMs = Number.isFinite(Number(options.reconnectDelayMs))
      ? Number(options.reconnectDelayMs)
      : 1000;
    let stopped = false;
    let socket = null;
    let heartbeat = null;
    let retry = null;

    const notify = (name, value) => {
      if (typeof handlers[name] === "function") {
        handlers[name](value);
      }
    };

    const clearHeartbeat = () => {
      if (heartbeat !== null) {
        clearIntervalImpl(heartbeat);
        heartbeat = null;
      }
    };

    const handlePayload = (payload) => {
      if (!payload || typeof payload !== "object") {
        return;
      }
      if (payload.channel === "l2Book") {
        const book = normalizeBook(payload.data);
        if (book) {
          notify("onBook", {
            outcomeKeys: ["long", "short"],
            book,
            timestamp: streamTimestamp(payload.data && payload.data.time)
          });
        }
        return;
      }
      if (payload.channel !== "candle") {
        return;
      }
      for (const candle of Array.isArray(payload.data) ? payload.data : [payload.data]) {
        const price = toNumber(candle && (candle.c ?? candle.close));
        if (price !== null && price > 0) {
          notify("onPrice", {
            outcomeKeys: ["long", "short"],
            price,
            timestamp: streamTimestamp(candle.t ?? candle.time ?? candle.timestamp)
          });
        }
      }
    };

    const connect = () => {
      if (stopped) {
        return;
      }
      retry = null;
      let connection;
      let closed = false;
      try {
        connection = new WebSocketImpl(HYPERLIQUID_WS);
        socket = connection;
      } catch (error) {
        notify("onError", error);
        notify("onClose", error);
        retry = setTimeoutImpl(connect, reconnectDelayMs);
        return;
      }
      connection.addEventListener("open", () => {
        if (stopped) {
          return;
        }
        connection.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "l2Book", coin, fast: true }
        }));
        connection.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "candle", coin, interval: "1m" }
        }));
        clearHeartbeat();
        heartbeat = setIntervalImpl(() => {
          if (!stopped && connection.readyState === 1) {
            connection.send(JSON.stringify({ method: "ping" }));
          }
        }, 30000);
        notify("onOpen");
      });
      connection.addEventListener("message", (event) => {
        try {
          handlePayload(JSON.parse(event.data));
        } catch (error) {
          notify("onError", error);
        }
      });
      connection.addEventListener("error", (error) => {
        notify("onError", error);
      });
      connection.addEventListener("close", (event) => {
        if (closed) {
          return;
        }
        closed = true;
        clearHeartbeat();
        if (stopped) {
          return;
        }
        notify("onClose", event);
        retry = setTimeoutImpl(connect, reconnectDelayMs);
      });
    };

    connect();
    return function stopTradeStream() {
      stopped = true;
      clearHeartbeat();
      if (retry !== null) {
        clearTimeoutImpl(retry);
        retry = null;
      }
      if (socket && socket.readyState < 2) {
        socket.close();
      }
    };
  }

  async function fetchTradeData(candidate = {}, options = {}) {
    const coin = normalizeWhitespace(candidate.coin || candidate.symbol || (candidate.raw && candidate.raw.asset && candidate.raw.asset.name));
    if (!coin) {
      return null;
    }
    const optionNow = Number(options.now);
    const now = Number.isFinite(optionNow) ? optionNow : Date.now();
    const requests = [
      fetchInfo({ type: "l2Book", coin }, options),
      ...TRADE_HISTORY_RANGES.map(([_range, interval, lookback]) => fetchInfo({
        type: "candleSnapshot",
        req: {
          coin,
          interval,
          startTime: lookback === null ? 0 : now - lookback,
          endTime: now
        }
      }, options))
    ];
    const settled = await Promise.allSettled(requests);
    if (settled.every((result) => result.status === "rejected")) {
      throw settled[0].reason || new Error("Hyperliquid trade data request failed.");
    }
    const book = settled[0].status === "fulfilled" ? normalizeBook(settled[0].value) : null;
    const histories = {};
    for (const [index, [range]] of TRADE_HISTORY_RANGES.entries()) {
      const result = settled[index + 1];
      const history = result.status === "fulfilled" ? normalizeHistory(result.value) : [];
      if (history.length) {
        histories[range] = history;
      }
    }
    if (!book && !Object.keys(histories).length) {
      return null;
    }
    return {
      tradeDataSource: "hyperliquid",
      tradeBooksByOutcome: book ? { long: book, short: book } : {},
      tradeChartHistoryByOutcome: Object.keys(histories).length ? { long: histories, short: histories } : {},
      tradeDataFetchedAt: now
    };
  }

  function scoreCandidateForText(candidate, text) {
    let score = 0;
    for (const alias of candidateAliases(candidate)) {
      if (aliasMatchesText(alias, text)) {
        score = Math.max(score, canonicalKey(alias) === canonicalKey(candidate.coin) ? 72 : 82);
      }
    }
    return score;
  }

  function rankCandidates(candidates, text, options = {}) {
    const minConfidence = Number.isFinite(Number(options.minConfidence)) ? Number(options.minConfidence) : 50;
    const maxResults = Number.isFinite(Number(options.maxResults)) ? Number(options.maxResults) : DEFAULT_MAX_RESULTS;
    return candidates
      .map((candidate) => {
        const confidence = scoreCandidateForText(candidate, text);
        return {
          ...candidate,
          confidence,
          sourceQueries: confidence > 0 ? [normalizeWhitespace(text).slice(0, 120)] : []
        };
      })
      .filter((candidate) => candidate.confidence >= minConfidence)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (b.volume || 0) - (a.volume || 0))
      .slice(0, maxResults);
  }

  async function searchAndRank(article, options = {}) {
    if (!articleHasCryptoSignal(article)) {
      return [];
    }
    const text = sourceTextForArticle(article);
    if (!text) {
      return [];
    }
    const candidates = await fetchMetaAndAssetCtxs(options);
    return rankCandidates(candidates, text, options);
  }

  async function searchMarkets(query, options = {}) {
    const text = canonicalKey(query);
    if (!text || text.length < 2) {
      return [];
    }
    const candidates = await fetchMetaAndAssetCtxs(options);
    return rankCandidates(candidates, text, {
      ...options,
      minConfidence: 50
    });
  }

  async function trendingMarkets(options = {}) {
    const maxResults = Number.isFinite(Number(options.maxResults)) ? Number(options.maxResults) : DEFAULT_MAX_RESULTS;
    const candidates = await fetchMetaAndAssetCtxs(options);
    return candidates
      .filter((candidate) => Number.isFinite(Number(candidate.volume)) && Number(candidate.volume) > 0)
      .map((candidate) => ({
        ...candidate,
        confidence: 50,
        sourceQueries: ["Hyperliquid trending"]
      }))
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, maxResults);
  }

  function groupCandidates(candidates, options = {}) {
    const maxGroups = Number.isFinite(Number(options.maxGroups)) ? Number(options.maxGroups) : DEFAULT_MAX_RESULTS;
    return (candidates || []).slice(0, maxGroups).map((candidate) => ({
      ...candidate,
      markets: [candidate],
      type: "venueMarket",
      parentConfidence: candidate.confidence,
      marketSource: "Hyperliquid",
      sourceLabel: "Hyperliquid",
      source: "hyperliquid"
    }));
  }

  return {
    HYPERLIQUID_API,
    HYPERLIQUID_APP,
    HYPERLIQUID_WS,
    normalizeMetaAndAssetCtxs,
    fetchMetaAndAssetCtxs,
    fetchTradeData,
    openTradeStream,
    searchAndRank,
    searchMarkets,
    trendingMarkets,
    groupCandidates
  };
});
