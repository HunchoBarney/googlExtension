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
  const DEFAULT_MAX_RESULTS = 4;
  const DEFAULT_TIMEOUT_MS = 3500;
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

  async function fetchMetaAndAssetCtxs(options = {}) {
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
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
        signal: controller ? controller.signal : undefined
      });
      if (!response || !response.ok) {
        throw new Error(`Hyperliquid API returned ${response ? response.status : "no response"}`);
      }
      return normalizeMetaAndAssetCtxs(await response.json());
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
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
    normalizeMetaAndAssetCtxs,
    fetchMetaAndAssetCtxs,
    searchAndRank,
    searchMarkets,
    trendingMarkets,
    groupCandidates
  };
});
