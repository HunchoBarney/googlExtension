(function attachMarketMaker(global, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMMarketMaker = api;
})(typeof window !== "undefined" ? window : globalThis, function createMarketMaker() {
  "use strict";

  const DEFAULT_CONFIG = {
    tickSize: 0.01,
    minPrice: 0.01,
    maxPrice: 0.99,
    minEdge: 0.01,
    spreadCapture: 0.55,
    volatilityMultiplier: 1.0,
    inventorySkew: 0.035,
    maxInventory: 1000,
    maxQuoteSize: 100,
    minQuoteSize: 1,
    maxNotionalPerQuote: 50,
    depthParticipation: 0.15,
    syntheticSpread: 0.04,
    fillToleranceTicks: 1,
    inventoryPenalty: 0.0005,
    drawdownPenalty: 0.2
  };

  function toNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeProbability(value, config = DEFAULT_CONFIG) {
    const number = toNumber(value);
    if (number === null) {
      return null;
    }
    const probability = number > 1 && number <= 100 ? number / 100 : number;
    if (!Number.isFinite(probability)) {
      return null;
    }
    return clamp(probability, config.minPrice, config.maxPrice);
  }

  function mergeConfig(config = {}) {
    const merged = { ...DEFAULT_CONFIG, ...(config || {}) };
    merged.tickSize = Math.max(0.001, Number(merged.tickSize) || DEFAULT_CONFIG.tickSize);
    merged.minPrice = normalizeProbability(merged.minPrice, DEFAULT_CONFIG) || DEFAULT_CONFIG.minPrice;
    merged.maxPrice = normalizeProbability(merged.maxPrice, DEFAULT_CONFIG) || DEFAULT_CONFIG.maxPrice;
    merged.minEdge = Math.max(0, Number(merged.minEdge) || DEFAULT_CONFIG.minEdge);
    merged.spreadCapture = clamp(Number(merged.spreadCapture) || DEFAULT_CONFIG.spreadCapture, 0.1, 2);
    merged.volatilityMultiplier = clamp(Number(merged.volatilityMultiplier) || DEFAULT_CONFIG.volatilityMultiplier, 0, 5);
    merged.inventorySkew = Math.max(0, Number(merged.inventorySkew) || DEFAULT_CONFIG.inventorySkew);
    merged.maxInventory = Math.max(1, Number(merged.maxInventory) || DEFAULT_CONFIG.maxInventory);
    merged.maxQuoteSize = Math.max(0, Number(merged.maxQuoteSize) || DEFAULT_CONFIG.maxQuoteSize);
    merged.minQuoteSize = Math.max(0, Number(merged.minQuoteSize) || DEFAULT_CONFIG.minQuoteSize);
    merged.maxNotionalPerQuote = Math.max(0, Number(merged.maxNotionalPerQuote) || DEFAULT_CONFIG.maxNotionalPerQuote);
    merged.depthParticipation = clamp(Number(merged.depthParticipation) || DEFAULT_CONFIG.depthParticipation, 0.01, 1);
    merged.syntheticSpread = Math.max(merged.tickSize * 2, Number(merged.syntheticSpread) || DEFAULT_CONFIG.syntheticSpread);
    merged.fillToleranceTicks = Math.max(0, Number(merged.fillToleranceTicks) || DEFAULT_CONFIG.fillToleranceTicks);
    merged.inventoryPenalty = Math.max(0, Number(merged.inventoryPenalty) || DEFAULT_CONFIG.inventoryPenalty);
    merged.drawdownPenalty = Math.max(0, Number(merged.drawdownPenalty) || DEFAULT_CONFIG.drawdownPenalty);
    return merged;
  }

  function normalizeOrderRow(row, config) {
    const price = Array.isArray(row) ? normalizeProbability(row[0], config) : normalizeProbability(row && row.price, config);
    const size = Array.isArray(row) ? toNumber(row[1]) : toNumber(row && (row.size || row.shares || row.quantity));
    return price !== null && size !== null && size > 0
      ? { price, size }
      : null;
  }

  function normalizeBook(book, configInput = {}) {
    const config = mergeConfig(configInput);
    const raw = book && book.book ? book.book : book;
    if (!raw || typeof raw !== "object") {
      return { bids: [], asks: [] };
    }

    const bids = (Array.isArray(raw.bids) ? raw.bids : [])
      .map((row) => normalizeOrderRow(row, config))
      .filter(Boolean)
      .sort((a, b) => b.price - a.price);
    const asks = (Array.isArray(raw.asks) ? raw.asks : [])
      .map((row) => normalizeOrderRow(row, config))
      .filter(Boolean)
      .sort((a, b) => a.price - b.price);

    return { bids, asks };
  }

  function topDepth(rows, levels = 3) {
    return rows.slice(0, levels).reduce((sum, row) => sum + row.size, 0);
  }

  function summarizeBook(book, configInput = {}) {
    const config = mergeConfig(configInput);
    const normalized = normalizeBook(book, config);
    const bestBid = normalized.bids[0] || null;
    const bestAsk = normalized.asks[0] || null;
    const bidDepth = topDepth(normalized.bids);
    const askDepth = topDepth(normalized.asks);
    const spread = bestBid && bestAsk ? Math.max(0, bestAsk.price - bestBid.price) : null;
    const mid = bestBid && bestAsk
      ? (bestBid.price + bestAsk.price) / 2
      : bestBid
        ? bestBid.price
        : bestAsk
          ? bestAsk.price
          : null;
    const microprice = bestBid && bestAsk && bidDepth + askDepth > 0
      ? ((bestAsk.price * bidDepth) + (bestBid.price * askDepth)) / (bidDepth + askDepth)
      : mid;
    const imbalance = bidDepth + askDepth > 0
      ? (bidDepth - askDepth) / (bidDepth + askDepth)
      : 0;

    return {
      bids: normalized.bids,
      asks: normalized.asks,
      bestBid,
      bestAsk,
      bidDepth,
      askDepth,
      spread,
      mid,
      microprice,
      imbalance
    };
  }

  function normalizeHistory(history, configInput = {}) {
    const config = mergeConfig(configInput);
    return (Array.isArray(history) ? history : [])
      .map((point, index) => {
        const t = Array.isArray(point)
          ? toNumber(point[0])
          : toNumber(point && (point.t || point.timestamp || point.time)) ?? index;
        const p = Array.isArray(point)
          ? normalizeProbability(point[1], config)
          : normalizeProbability(point && (point.p || point.price || point.value), config);
        return p !== null ? { t, p } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);
  }

  function estimateVolatility(history, configInput = {}) {
    const points = normalizeHistory(history, configInput);
    if (points.length < 3) {
      return 0;
    }
    const tail = points.slice(-24);
    const diffs = [];
    for (let index = 1; index < tail.length; index += 1) {
      diffs.push(tail[index].p - tail[index - 1].p);
    }
    if (!diffs.length) {
      return 0;
    }
    const mean = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
    const variance = diffs.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / diffs.length;
    return Math.sqrt(variance);
  }

  function estimateMomentum(history, configInput = {}) {
    const points = normalizeHistory(history, configInput);
    if (points.length < 3) {
      return 0;
    }
    const tail = points.slice(-8);
    return tail[tail.length - 1].p - tail[0].p;
  }

  function estimateFairValue({ book, history, fallbackPrice = null, config = {} } = {}) {
    const merged = mergeConfig(config);
    const summary = summarizeBook(book, merged);
    const points = normalizeHistory(history, merged);
    const last = points.length ? points[points.length - 1].p : normalizeProbability(fallbackPrice, merged);
    const bookValue = summary.microprice !== null ? summary.microprice : null;
    let fairValue = bookValue !== null && last !== null
      ? (bookValue * 0.75) + (last * 0.25)
      : bookValue !== null
        ? bookValue
        : last;

    if (fairValue === null) {
      return null;
    }

    const momentum = clamp(estimateMomentum(points, merged) * 0.2, -0.02, 0.02);
    fairValue = clamp(fairValue + momentum, merged.minPrice, merged.maxPrice);
    return fairValue;
  }

  function roundToTick(price, tickSize, mode) {
    const scaled = price / tickSize;
    const rounded = mode === "ceil"
      ? Math.ceil(scaled)
      : mode === "floor"
        ? Math.floor(scaled)
        : Math.round(scaled);
    return Number((rounded * tickSize).toFixed(6));
  }

  function sideSize({ price, topSize, inventoryRatio, side, config }) {
    if (!price || price <= 0) {
      return 0;
    }
    const notionalCap = config.maxNotionalPerQuote > 0
      ? config.maxNotionalPerQuote / price
      : config.maxQuoteSize;
    const depthCap = topSize > 0
      ? Math.max(config.minQuoteSize, topSize * config.depthParticipation)
      : config.maxQuoteSize;
    const base = Math.min(config.maxQuoteSize, notionalCap, depthCap);
    const inventoryMultiplier = side === "bid"
      ? clamp(1 - inventoryRatio, 0.1, 1.5)
      : clamp(1 + inventoryRatio, 0.1, 1.5);
    const size = Math.floor(base * inventoryMultiplier * 100) / 100;
    return size >= config.minQuoteSize ? size : 0;
  }

  function makeSideQuote(side, price, size, fairValue) {
    if (!price || !size) {
      return null;
    }
    return {
      side,
      price,
      size,
      notional: Number((price * size).toFixed(4))
    };
  }

  function makeQuotePlan(input = {}) {
    const config = mergeConfig(input.config);
    const summary = summarizeBook(input.book, config);
    const fallbackPrice = input.fallbackPrice ?? input.candidate?.primaryPrice ?? input.candidate?.yesPrice ?? null;
    const fairValue = estimateFairValue({
      book: input.book,
      history: input.history,
      fallbackPrice,
      config
    });

    if (fairValue === null) {
      return {
        status: "skip",
        reason: "missing-fair-value",
        tokenId: input.tokenId || "",
        config
      };
    }

    const shares = toNumber(input.inventory && input.inventory.shares) || 0;
    const inventoryRatio = clamp(shares / config.maxInventory, -1.5, 1.5);
    const reservationPrice = clamp(fairValue - (inventoryRatio * config.inventorySkew), config.minPrice, config.maxPrice);
    const observedSpread = summary.spread !== null && summary.spread > 0
      ? summary.spread
      : config.syntheticSpread;
    const volatility = estimateVolatility(input.history, config);
    const halfSpread = Math.max(
      config.minEdge,
      (observedSpread * config.spreadCapture) / 2,
      volatility * config.volatilityMultiplier
    );

    const bidCeiling = summary.bestAsk
      ? Math.min(summary.bestAsk.price - config.tickSize, fairValue - config.minEdge)
      : fairValue - config.minEdge;
    const askFloor = summary.bestBid
      ? Math.max(summary.bestBid.price + config.tickSize, fairValue + config.minEdge)
      : fairValue + config.minEdge;

    const bidRaw = Math.min(reservationPrice - halfSpread, bidCeiling);
    const askRaw = Math.max(reservationPrice + halfSpread, askFloor);
    const bidPrice = clamp(roundToTick(bidRaw, config.tickSize, "floor"), config.minPrice, config.maxPrice);
    const askPrice = clamp(roundToTick(askRaw, config.tickSize, "ceil"), config.minPrice, config.maxPrice);

    const canBid = shares < config.maxInventory && bidPrice < askPrice && fairValue - bidPrice >= config.minEdge;
    const canAsk = shares > -config.maxInventory && askPrice > bidPrice && askPrice - fairValue >= config.minEdge;
    const bidSize = canBid
      ? sideSize({
        price: bidPrice,
        topSize: summary.bidDepth,
        inventoryRatio,
        side: "bid",
        config
      })
      : 0;
    const askSize = canAsk
      ? sideSize({
        price: askPrice,
        topSize: summary.askDepth,
        inventoryRatio,
        side: "ask",
        config
      })
      : 0;

    const bid = makeSideQuote("bid", bidPrice, bidSize, fairValue);
    const ask = makeSideQuote("ask", askPrice, askSize, fairValue);
    const oneSided = bid && ask
      ? null
      : bid
        ? "bid"
        : ask
          ? "ask"
          : null;

    if (!bid && !ask) {
      return {
        status: "skip",
        reason: "risk-limits",
        tokenId: input.tokenId || "",
        fairValue,
        reservationPrice,
        config,
        book: summary
      };
    }

    return {
      status: "quote",
      tokenId: input.tokenId || "",
      fairValue,
      reservationPrice,
      volatility,
      halfSpread,
      bid,
      ask,
      edge: {
        bid: bid ? Number((fairValue - bid.price).toFixed(6)) : null,
        ask: ask ? Number((ask.price - fairValue).toFixed(6)) : null
      },
      risk: {
        inventory: shares,
        inventoryRatio,
        oneSided
      },
      book: summary,
      config
    };
  }

  function firstHistoryRange(historyByRange) {
    if (!historyByRange || typeof historyByRange !== "object") {
      return [];
    }
    for (const key of ["1D", "1W", "1M", "1Y", "ALL"]) {
      if (Array.isArray(historyByRange[key]) && historyByRange[key].length) {
        return historyByRange[key];
      }
    }
    const first = Object.values(historyByRange).find((value) => Array.isArray(value) && value.length);
    return first || [];
  }

  function candidateTokenIds(candidate = {}, tradeData = {}) {
    const tokens = [];
    const add = (value) => {
      if (value === null || value === undefined || value === "") {
        return;
      }
      const token = String(value);
      if (!tokens.includes(token)) {
        tokens.push(token);
      }
    };
    for (const outcome of Array.isArray(candidate.outcomeOptions) ? candidate.outcomeOptions : []) {
      add(outcome && (outcome.clobTokenId || outcome.tokenId || outcome.assetId));
    }
    for (const token of Array.isArray(candidate.clobTokenIds) ? candidate.clobTokenIds : []) {
      add(token);
    }
    for (const token of Object.keys(tradeData.tradeBooksByTokenId || {})) {
      add(token);
    }
    return tokens;
  }

  function makeMarketMakingPlan({ candidate = {}, tradeData = {}, inventoryByTokenId = {}, config = {} } = {}) {
    const tokenIds = candidateTokenIds(candidate, tradeData);
    const quotes = tokenIds.map((tokenId) => {
      const book = (tradeData.tradeBooksByTokenId || {})[tokenId] || null;
      const history = firstHistoryRange((tradeData.tradeChartHistoryByTokenId || {})[tokenId]);
      return makeQuotePlan({
        tokenId,
        candidate,
        book,
        history,
        inventory: inventoryByTokenId[tokenId] || { shares: 0 },
        config
      });
    });
    const liveQuotes = quotes.filter((quote) => quote.status === "quote");
    return {
      status: liveQuotes.length ? "quote" : "skip",
      marketId: candidate.id || candidate.conditionId || "",
      quotes,
      liveQuotes
    };
  }

  function syntheticBook(price, config) {
    const halfSpread = config.syntheticSpread / 2;
    return {
      bids: [{ price: clamp(price - halfSpread, config.minPrice, config.maxPrice), size: 1000 }],
      asks: [{ price: clamp(price + halfSpread, config.minPrice, config.maxPrice), size: 1000 }]
    };
  }

  function markToMarket(cash, shares, price) {
    return cash + (shares * price);
  }

  function simulateStrategy(sample = {}, configInput = {}) {
    const config = mergeConfig(configInput);
    const points = normalizeHistory(sample.history, config);
    if (points.length < 2) {
      return {
        status: "skip",
        reason: "not-enough-history",
        quoteCount: 0,
        fillCount: 0,
        pnl: 0,
        objective: Number.NEGATIVE_INFINITY,
        maxAbsInventory: 0
      };
    }

    let cash = toNumber(sample.initialCash) || 0;
    let shares = toNumber(sample.initialInventory && sample.initialInventory.shares) || 0;
    let quoteCount = 0;
    let fillCount = 0;
    let maxAbsInventory = Math.abs(shares);
    let peakEquity = markToMarket(cash, shares, points[0].p);
    let maxDrawdown = 0;

    for (let index = 1; index < points.length; index += 1) {
      const current = points[index - 1].p;
      const next = points[index].p;
      const historyWindow = points.slice(0, index + 1);
      const sourceBook = Array.isArray(sample.books) && sample.books[index - 1]
        ? sample.books[index - 1]
        : sample.book || syntheticBook(current, config);
      const plan = makeQuotePlan({
        tokenId: sample.tokenId || "sample",
        book: sourceBook,
        history: historyWindow,
        inventory: { shares, cash },
        config
      });
      if (plan.status !== "quote") {
        continue;
      }

      if (plan.bid) {
        quoteCount += 1;
      }
      if (plan.ask) {
        quoteCount += 1;
      }

      const tolerance = config.tickSize * config.fillToleranceTicks;
      if (plan.bid && next <= plan.bid.price + tolerance) {
        shares += plan.bid.size;
        cash -= plan.bid.notional;
        fillCount += 1;
      }
      if (plan.ask && next >= plan.ask.price - tolerance) {
        shares -= plan.ask.size;
        cash += plan.ask.notional;
        fillCount += 1;
      }

      maxAbsInventory = Math.max(maxAbsInventory, Math.abs(shares));
      const equity = markToMarket(cash, shares, next);
      peakEquity = Math.max(peakEquity, equity);
      maxDrawdown = Math.max(maxDrawdown, peakEquity - equity);
    }

    const finalPrice = points[points.length - 1].p;
    const pnl = markToMarket(cash, shares, finalPrice);
    const objective = pnl -
      (maxAbsInventory * config.inventoryPenalty) -
      (maxDrawdown * config.drawdownPenalty);

    return {
      status: "simulated",
      quoteCount,
      fillCount,
      pnl: Number(pnl.toFixed(6)),
      objective: Number(objective.toFixed(6)),
      maxAbsInventory: Number(maxAbsInventory.toFixed(6)),
      maxDrawdown: Number(maxDrawdown.toFixed(6)),
      endingInventory: Number(shares.toFixed(6)),
      endingCash: Number(cash.toFixed(6))
    };
  }

  function cartesianGrid(grid = {}) {
    const entries = Object.entries(grid)
      .filter(([, values]) => Array.isArray(values) && values.length);
    if (!entries.length) {
      return [{}];
    }
    return entries.reduce((configs, [key, values]) => {
      const next = [];
      for (const config of configs) {
        for (const value of values) {
          next.push({ ...config, [key]: value });
        }
      }
      return next;
    }, [{}]);
  }

  function aggregateMetrics(metrics) {
    const live = metrics.filter((metric) => metric.status === "simulated");
    if (!live.length) {
      return {
        quoteCount: 0,
        fillCount: 0,
        pnl: 0,
        objective: Number.NEGATIVE_INFINITY,
        maxAbsInventory: 0,
        maxDrawdown: 0
      };
    }
    return {
      quoteCount: live.reduce((sum, metric) => sum + metric.quoteCount, 0),
      fillCount: live.reduce((sum, metric) => sum + metric.fillCount, 0),
      pnl: Number(live.reduce((sum, metric) => sum + metric.pnl, 0).toFixed(6)),
      objective: Number(live.reduce((sum, metric) => sum + metric.objective, 0).toFixed(6)),
      maxAbsInventory: Math.max(...live.map((metric) => metric.maxAbsInventory)),
      maxDrawdown: Math.max(...live.map((metric) => metric.maxDrawdown))
    };
  }

  function tuneStrategy(samples = [], options = {}) {
    const grid = options.grid || {
      minEdge: [0.01, 0.015, 0.02],
      spreadCapture: [0.45, 0.6, 0.75],
      volatilityMultiplier: [0.8, 1.2, 1.6],
      inventorySkew: [0.02, 0.035, 0.05]
    };
    const baseConfig = mergeConfig(options.baseConfig || {});
    const candidates = cartesianGrid(grid);
    let best = null;
    const results = [];

    for (const candidate of candidates) {
      const config = mergeConfig({ ...baseConfig, ...candidate });
      const sampleMetrics = samples.map((sample) => simulateStrategy(sample, config));
      const metrics = aggregateMetrics(sampleMetrics);
      const result = { config, metrics };
      results.push(result);
      if (!best || metrics.objective > best.metrics.objective) {
        best = result;
      }
    }

    if (!best) {
      return {
        status: "skip",
        reason: "no-candidates",
        candidatesEvaluated: 0,
        results: []
      };
    }

    return {
      status: "tuned",
      bestConfig: best.config,
      bestMetrics: best.metrics,
      candidatesEvaluated: candidates.length,
      results: results
        .sort((a, b) => b.metrics.objective - a.metrics.objective)
        .slice(0, Number(options.keepTop) || 10)
    };
  }

  return {
    DEFAULT_CONFIG,
    toNumber,
    clamp,
    normalizeProbability,
    normalizeBook,
    summarizeBook,
    normalizeHistory,
    estimateVolatility,
    estimateMomentum,
    estimateFairValue,
    makeQuotePlan,
    makeMarketMakingPlan,
    simulateStrategy,
    tuneStrategy
  };
});
