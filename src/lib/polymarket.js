(function attachPolymarket(global, factory) {
  "use strict";

  const api = factory(global.PMArticleSignals);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMPolymarket = api;
})(typeof window !== "undefined" ? window : globalThis, function createPolymarket(signals) {
  "use strict";

  /** @typedef {import("./sharedTypes").PMAnalyzedArticle} PMAnalyzedArticle */
  /** @typedef {import("./sharedTypes").PMJsonObject} PMJsonObject */
  /** @typedef {import("./sharedTypes").PMJsonValue} PMJsonValue */
  /** @typedef {import("./sharedTypes").PMMarketCandidate} PMMarketCandidate */
  /** @typedef {import("./sharedTypes").PMMarketGroup} PMMarketGroup */
  /** @typedef {import("./sharedTypes").PMMovement} PMMovement */
  /** @typedef {{ ok: boolean, status: number, json(): Promise<PMJsonValue> }} PMFetchResponse */
  /** @typedef {(url: string, init?: { headers?: Record<string, string>, redirect?: string, signal?: AbortSignal }) => Promise<PMFetchResponse>} PMFetchLike */
  /** @typedef {{ query?: string }} PMSourceMeta */

  const GAMMA_API = "https://gamma-api.polymarket.com";
  const DATA_API = "https://data-api.polymarket.com";
  const POLYMARKET = "https://polymarket.com";
  const DEFAULT_MIN_CONFIDENCE = 55;
  const DEFAULT_MAX_RESULTS = 5;
  const DEFAULT_MAX_CHILD_MARKETS = 5;
  const STRONG_MATCH_CONFIDENCE = 55;
  const MAYBE_MATCH_CONFIDENCE = 35;
  const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "is", "it", "its", "of",
    "on", "or", "that", "the", "this", "to", "was", "will", "with", "before", "after", "over", "under"
  ]);
  const NON_LIVE_STATUS_PATTERN = /\b(review|reviewing|pending|approval|draft|staged|paused|halted|suspended|closed|resolved|archived|cancelled|canceled)\b/i;
  const LIVE_STATUS_PATTERN = /\b(approved|accepted|live|published|active|open|trading)\b/i;
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
  const tokenSequenceIncludes = signals && signals.tokenSequenceIncludes
    ? signals.tokenSequenceIncludes
    : function tokenSequenceIncludes(haystackTokens, needleTokens) {
      if (!haystackTokens.length || !needleTokens.length || needleTokens.length > haystackTokens.length) {
        return false;
      }
      for (let index = 0; index <= haystackTokens.length - needleTokens.length; index += 1) {
        let matched = true;
        for (let offset = 0; offset < needleTokens.length; offset += 1) {
          if (haystackTokens[index + offset] !== needleTokens[offset]) {
            matched = false;
            break;
          }
        }
        if (matched) {
          return true;
        }
      }
      return false;
    };
  const entitySearchKeys = signals && signals.entitySearchKeys
    ? signals.entitySearchKeys
    : function entitySearchKeys(entity) {
      return Array.from(new Set([entity && entity.text, ...((entity && entity.aliases) || [])]
        .map(canonicalKey)
        .filter((key) => key && key.length >= 2)));
    };

  function tokenize(value) {
    const matches = canonicalKey(value).match(/[a-z0-9][a-z0-9'$-]*/g);
    return matches ? matches.filter((token) => !STOPWORDS.has(token) && token.length > 1) : [];
  }

  function textHasTerm(text, term) {
    const needleTokens = tokenize(term);
    if (!needleTokens.length) {
      return false;
    }
    return tokenSequenceIncludes(tokenize(text), needleTokens);
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function safeJsonArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined || value === "") {
      return [];
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
      }
    }
    return [];
  }

  function firstNumber(...values) {
    for (const value of values) {
      const number = toNumber(value);
      if (number !== null) {
        return number;
      }
    }
    return null;
  }

  function getTags(raw, event) {
    const tags = [];
    for (const source of [raw && raw.tags, event && event.tags]) {
      if (!source) {
        continue;
      }
      const array = Array.isArray(source) ? source : safeJsonArray(source);
      for (const tag of array) {
        if (typeof tag === "string") {
          tags.push(tag);
        } else if (tag && (tag.label || tag.name || tag.slug)) {
          tags.push(tag.label || tag.name || tag.slug);
        }
      }
    }
    return Array.from(new Set(tags.map(normalizeWhitespace).filter(Boolean)));
  }

  function outcomeIndex(outcomes, preferred) {
    const lower = outcomes.map((outcome) => canonicalKey(outcome));
    for (const option of preferred) {
      const index = lower.findIndex((outcome) => outcome === option || outcome.includes(option));
      if (index >= 0) {
        return index;
      }
    }
    return -1;
  }

  function parseOutcomes(raw) {
    const outcomes = safeJsonArray(raw.outcomes).map((outcome) => normalizeWhitespace(outcome));
    const outcomePrices = safeJsonArray(raw.outcomePrices).map((price) => toNumber(price));
    const clobTokenIds = safeJsonArray(raw.clobTokenIds).map((id) => String(id));
    const outcomeOptions = outcomes.map((label, index) => {
      const price = outcomePrices[index] !== undefined ? outcomePrices[index] : null;
      return {
        label,
        price,
        percent: price === null ? null : price * 100,
        clobTokenId: clobTokenIds[index] || ""
      };
    });

    const yesIndex = outcomeIndex(outcomes, ["yes"]);
    const noIndex = outcomeIndex(outcomes, ["no"]);
    const upIndex = outcomeIndex(outcomes, ["up", "above", "over"]);
    const downIndex = outcomeIndex(outcomes, ["down", "below", "under"]);
    const preferredPrimaryIndex = outcomeIndex(outcomes, ["yes", "up", "above", "over", "win"]);
    const preferredSecondaryIndex = outcomeIndex(outcomes, ["no", "down", "below", "under", "lose"]);
    const primaryIndex = preferredPrimaryIndex >= 0
      ? preferredPrimaryIndex
      : 0;
    const secondaryIndex = preferredSecondaryIndex >= 0
      ? preferredSecondaryIndex
      : (primaryIndex === 0 ? 1 : 0);

    const primaryOutcome = outcomes[primaryIndex] || "Yes";
    const secondaryOutcome = outcomes[secondaryIndex] || (primaryOutcome.toLowerCase() === "up" ? "Down" : "No");
    const primaryPrice = outcomePrices[primaryIndex] !== undefined ? outcomePrices[primaryIndex] : firstNumber(raw.lastTradePrice, raw.bestBid);
    const secondaryPrice = outcomePrices[secondaryIndex] !== undefined ? outcomePrices[secondaryIndex] : (primaryPrice !== null ? Math.max(0, 1 - primaryPrice) : null);
    const yesPrice = yesIndex >= 0 && outcomePrices[yesIndex] !== undefined ? outcomePrices[yesIndex] : (primaryOutcome.toLowerCase() === "yes" ? primaryPrice : null);
    const noPrice = noIndex >= 0 && outcomePrices[noIndex] !== undefined ? outcomePrices[noIndex] : (secondaryOutcome.toLowerCase() === "no" ? secondaryPrice : null);
    const upPrice = upIndex >= 0 && outcomePrices[upIndex] !== undefined ? outcomePrices[upIndex] : (primaryOutcome.toLowerCase() === "up" ? primaryPrice : null);
    const downPrice = downIndex >= 0 && outcomePrices[downIndex] !== undefined ? outcomePrices[downIndex] : (secondaryOutcome.toLowerCase() === "down" ? secondaryPrice : null);

    return {
      outcomes,
      outcomePrices,
      clobTokenIds,
      outcomeOptions,
      primaryOutcome,
      secondaryOutcome,
      primaryPrice,
      secondaryPrice,
      yesPrice,
      noPrice,
      upPrice,
      downPrice,
      primaryPercent: primaryPrice === null ? null : primaryPrice * 100
    };
  }

  /**
   * @param {PMJsonObject} raw
   * @returns {PMMovement}
   */
  function parseMovement(raw) {
    const change = firstNumber(
      raw.oneDayPriceChange,
      raw.priceChange24hr,
      raw.priceChange24h,
      raw.priceChange,
      raw.oneHourPriceChange,
      raw.lastPriceChange
    );
    if (change === null) {
      return {
        direction: "unknown",
        value: null
      };
    }
    if (change > 0.002) {
      return {
        direction: "up",
        value: change
      };
    }
    if (change < -0.002) {
      return {
        direction: "down",
        value: change
      };
    }
    return {
      direction: "flat",
      value: change
    };
  }

  function isClosed(raw, event) {
    return Boolean(
      raw.closed ||
      raw.archived ||
      raw.resolved ||
      raw.umaResolutionStatus === "resolved" ||
      (event && (event.closed || event.archived || event.resolved))
    );
  }

  function statusValues(raw, event) {
    const fields = [
      "status",
      "state",
      "marketStatus",
      "reviewStatus",
      "approvalStatus",
      "resolutionStatus",
      "umaResolutionStatus"
    ];
    const values = [];
    for (const source of [raw, event]) {
      if (!source) {
        continue;
      }
      for (const field of fields) {
        if (typeof source[field] === "string" && source[field].trim()) {
          values.push(source[field]);
        }
      }
    }
    return values;
  }

  function hasUnavailableFlag(raw, event) {
    const unavailableWhenTrue = [
      "isReviewing",
      "reviewing",
      "inReview",
      "pendingReview",
      "pendingApproval",
      "pendingDeployment",
      "requiresApproval",
      "draft",
      "isDraft"
    ];
    const unavailableWhenFalse = [
      "published",
      "approved",
      "live",
      "acceptingOrders"
    ];

    for (const source of [raw, event]) {
      if (!source) {
        continue;
      }
      if (unavailableWhenTrue.some((field) => source[field] === true)) {
        return true;
      }
      if (unavailableWhenFalse.some((field) => source[field] === false)) {
        return true;
      }
    }
    return false;
  }

  function isUnavailable(raw, event) {
    if (hasUnavailableFlag(raw, event)) {
      return true;
    }

    return statusValues(raw, event).some((value) => (
      NON_LIVE_STATUS_PATTERN.test(value) && !LIVE_STATUS_PATTERN.test(value)
    ));
  }

  function isActive(raw, event) {
    if (isClosed(raw, event)) {
      return false;
    }
    if (isUnavailable(raw, event)) {
      return false;
    }
    if (raw.active === false || (event && event.active === false)) {
      return false;
    }
    return true;
  }

  function isDisplayableCandidate(candidate) {
    return Boolean(candidate && candidate.active && !candidate.closed && !candidate.unavailable);
  }

  function marketUrl(raw, event) {
    if (event && event.slug) {
      return `${POLYMARKET}/event/${event.slug}`;
    }
    if (raw.eventSlug) {
      return `${POLYMARKET}/event/${raw.eventSlug}`;
    }
    if (raw.slug) {
      return `${POLYMARKET}/event/${raw.slug}`;
    }
    return POLYMARKET;
  }

  function imageValue(value) {
    if (!value) {
      return "";
    }
    if (typeof value === "string") {
      return normalizeWhitespace(value);
    }
    if (typeof value === "object") {
      return imageValue(
        value.url ||
        value.src ||
        value.source ||
        value.image ||
        value.icon ||
        value.optimized ||
        value.large ||
        value.small ||
        value.original
      );
    }
    return "";
  }

  function marketImage(raw = {}, event = {}) {
    const sources = [
      raw.image,
      raw.icon,
      raw.imageUrl,
      raw.imageURL,
      raw.iconUrl,
      raw.iconURL,
      raw.imageOptimized,
      raw.iconOptimized,
      raw.thumbnail,
      raw.thumbnailUrl,
      raw.featuredImage,
      event.image,
      event.icon,
      event.imageUrl,
      event.imageURL,
      event.iconUrl,
      event.iconURL,
      event.imageOptimized,
      event.iconOptimized,
      event.thumbnail,
      event.thumbnailUrl,
      event.featuredImage,
      event.series && event.series.image,
      event.series && event.series.icon
    ];
    return sources.map(imageValue).find(Boolean) || "";
  }

  function traderCount(raw = {}, event = {}) {
    return firstNumber(
      raw.traderCount,
      raw.traders,
      raw.numTraders,
      raw.uniqueTraders,
      raw.userCount,
      raw.participantCount,
      raw.holderCount,
      raw.numHolders,
      event.traderCount,
      event.traders,
      event.numTraders,
      event.uniqueTraders,
      event.userCount,
      event.participantCount,
      event.holderCount,
      event.numHolders
    );
  }

  /**
   * @param {PMJsonObject} raw
   * @param {PMJsonObject} [event]
   * @param {PMSourceMeta} [meta]
   * @returns {PMMarketCandidate}
   */
  function normalizeMarket(raw, event = {}, meta = {}) {
    const outcomes = parseOutcomes(raw);
    const title = normalizeWhitespace(raw.question || raw.title || event.title || event.question || "");
    const eventTitle = normalizeWhitespace(event.title || event.question || "");
    const description = normalizeWhitespace([raw.description, event.description].filter(Boolean).join(" "));
    const category = normalizeWhitespace(raw.category || event.category || "");
    const tags = getTags(raw, event);
    const closed = isClosed(raw, event);
    const active = isActive(raw, event);
    const unavailable = isUnavailable(raw, event);
    const volume = firstNumber(raw.volumeNum, raw.volume, raw.volume24hr, event.volumeNum, event.volume, event.volume24hr);
    const volume24hr = firstNumber(raw.volume24hr, raw.volume24h, raw.oneDayVolume, raw.volume1d, event.volume24hr, event.volume24h, event.oneDayVolume, event.volume1d);
    const volume1wk = firstNumber(raw.volume1wk, raw.volume7d, raw.oneWeekVolume, event.volume1wk, event.volume7d, event.oneWeekVolume);
    const liquidity = firstNumber(raw.liquidityNum, raw.liquidity, raw.liquidityClob, event.liquidityNum, event.liquidity, event.liquidityClob);
    const traders = traderCount(raw, event);

    return {
      id: String(raw.id || raw.conditionId || raw.slug || `${event.id || "event"}:${title}`),
      conditionId: raw.conditionId || raw.condition_id || "",
      eventId: event && event.id ? String(event.id) : "",
      type: raw.question ? "market" : "event",
      slug: raw.slug || event.slug || "",
      eventSlug: event.slug || raw.eventSlug || "",
      title,
      eventTitle,
      description,
      category,
      tags,
      image: marketImage(raw, event),
      url: marketUrl(raw, event),
      active,
      closed,
      unavailable,
      volume,
      volume24hr,
      volume1wk,
      liquidity,
      traderCount: traders,
      endDate: raw.endDate || raw.endDateIso || raw.endDateTime || raw.closeTime || event.endDate || event.endDateIso || event.endDateTime || event.closeTime || "",
      movement: parseMovement(raw),
      sourceQueries: meta.query ? [meta.query] : [],
      raw,
      event,
      ...outcomes
    };
  }

  /**
   * @param {PMJsonObject} event
   * @param {PMSourceMeta} [meta]
   * @returns {PMMarketCandidate[]}
   */
  function normalizeEvent(event, meta = {}) {
    if (Array.isArray(event.markets) && event.markets.length) {
      return event.markets.map((market) => normalizeMarket(market, event, meta));
    }
    return [normalizeMarket({
      id: event.id,
      title: event.title,
      question: event.title,
      conditionId: event.conditionId || event.condition_id || "",
      slug: event.slug,
      image: marketImage(event, event),
      icon: event.icon || event.image,
      description: event.description,
      category: event.category,
      outcomes: event.outcomes,
      outcomePrices: event.outcomePrices,
      volume: event.volume,
      liquidity: event.liquidity,
      traderCount: event.traderCount || event.traders || event.numTraders || event.uniqueTraders || event.userCount || event.participantCount,
      active: event.active,
      closed: event.closed,
      archived: event.archived
    }, event, meta)];
  }

  /**
   * @param {PMJsonObject|PMJsonObject[]|null} payload
   * @param {PMSourceMeta} [meta]
   * @returns {PMMarketCandidate[]}
   */
  function flattenPayload(payload, meta = {}) {
    const candidates = [];
    if (!payload) {
      return candidates;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (item && Array.isArray(item.markets)) {
          candidates.push(...normalizeEvent(item, meta));
        } else if (item && (item.question || item.outcomes || item.conditionId)) {
          candidates.push(normalizeMarket(item, {}, meta));
        }
      }
      return candidates;
    }

    if (Array.isArray(payload.events)) {
      for (const event of payload.events) {
        candidates.push(...normalizeEvent(event, meta));
      }
    }
    if (Array.isArray(payload.markets)) {
      for (const market of payload.markets) {
        candidates.push(normalizeMarket(market, {}, meta));
      }
    }
    if (Array.isArray(payload.data)) {
      candidates.push(...flattenPayload(payload.data, meta));
    }

    return candidates;
  }

  function candidateKey(candidate) {
    return candidate.id || candidate.slug || canonicalKey(candidate.title);
  }

  /**
   * @param {PMMarketCandidate[]} candidates
   * @returns {PMMarketCandidate[]}
   */
  function dedupeCandidates(candidates) {
    const map = new Map();
    for (const candidate of candidates) {
      const key = candidateKey(candidate);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, candidate);
        continue;
      }

      existing.sourceQueries = Array.from(new Set([...(existing.sourceQueries || []), ...(candidate.sourceQueries || [])]));
      const candidateDisplayable = isDisplayableCandidate(candidate);
      const existingDisplayable = isDisplayableCandidate(existing);
      if (
        (candidateDisplayable && !existingDisplayable) ||
        (candidateDisplayable === existingDisplayable && (candidate.volume || 0) > (existing.volume || 0))
      ) {
        map.set(key, {
          ...candidate,
          sourceQueries: existing.sourceQueries
        });
      }
    }
    return Array.from(map.values());
  }

  function entityScore(candidate, article) {
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    const title = canonicalKey(`${candidate.title} ${candidate.eventTitle}`);
    const articleTitle = canonicalKey(article.title || "");
    const articleTopic = article.topic && article.topic.label;
    const articleTitleHasCryptoAngle = /\b(bitcoin|btc|ethereum|eth|crypto|token|blockchain|defi|stablecoin)\b/i.test(articleTitle);
    const hasCryptoEntities = Boolean(article.entities && article.entities.crypto && article.entities.crypto.length);
    const genericSoloEntities = new Set(["house", "senate", "congress", "us", "u.s.", "un", "eu"]);
    let score = 0;
    const entities = article.centralEntities && article.centralEntities.length
      ? article.centralEntities
      : (article.entities && article.entities.top ? article.entities.top : []);

    for (const entity of entities.slice(0, 12)) {
      const keys = entitySearchKeys(entity);
      if (!keys.length) {
        continue;
      }
      const inArticleTitle = keys.some((key) => textHasTerm(articleTitle, key));
      if (genericSoloEntities.has(canonicalKey(entity.text))) {
        continue;
      }
      if (entity.type === "person" && !inArticleTitle) {
        continue;
      }
      if (entity.type === "crypto" && !inArticleTitle && !articleTitleHasCryptoAngle) {
        continue;
      }
      if (entity.type === "company" && hasCryptoEntities && !inArticleTitle) {
        continue;
      }
      if (entity.type === "place" && !inArticleTitle && !["geopolitics", "weather/climate"].includes(articleTopic)) {
        continue;
      }
      const typeWeight = {
        crypto: 18,
        person: 15,
        company: 15,
        ticker: 14,
        institution: 13,
        sports: 15,
        place: 10,
        organization: 9,
        properNoun: 7,
        date: 4
      }[entity.type] || 6;

      if (keys.some((key) => textHasTerm(title, key))) {
        score += typeWeight;
      } else if (keys.some((key) => textHasTerm(text, key))) {
        score += Math.max(4, typeWeight * 0.55);
      }
    }

    return Math.min(score, 42);
  }

  function keywordScore(candidate, article) {
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description}`);
    const title = canonicalKey(`${candidate.title} ${candidate.eventTitle}`);
    let score = 0;
    for (const keyword of (article.keywords || []).slice(0, 12)) {
      const key = canonicalKey(keyword.text);
      if (!key || key.length < 3) {
        continue;
      }
      if (textHasTerm(title, key)) {
        score += 9;
      } else if (textHasTerm(text, key)) {
        score += 4;
      } else {
        const tokens = tokenize(key);
        const tokenHits = tokens.filter((token) => textHasTerm(text, token)).length;
        if (tokens.length > 1 && tokenHits >= Math.ceil(tokens.length * 0.67)) {
          score += 3;
        }
      }
    }
    return Math.min(score, 30);
  }

  function titleOverlapScore(candidate, article) {
    const articleTokens = new Set(tokenize(article.title || "").slice(0, 14));
    const marketTokens = new Set(tokenize(`${candidate.title} ${candidate.eventTitle}`));
    if (!articleTokens.size || !marketTokens.size) {
      return 0;
    }
    const hits = Array.from(articleTokens).filter((token) => marketTokens.has(token)).length;
    return Math.min(20, hits * 5);
  }

  const TOPIC_TERMS = {
    "politics/elections": ["election", "president", "senate", "trump", "biden", "harris", "vote", "tariff", "campaign", "poll"],
    crypto: ["crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "token", "defi", "stablecoin"],
    "economy/markets": ["fed", "inflation", "cpi", "rate", "interest rates", "bank of japan", "recession", "jobs", "gdp", "treasury", "tariff"],
    "companies/earnings": ["earnings", "revenue", "stock", "shares", "company", "nasdaq", "guidance"],
    "AI/technology": ["ai", "artificial intelligence", "chip", "semiconductor", "openai", "technology", "gpu", "model"],
    sports: ["nba", "nfl", "mlb", "nhl", "fifa", "world cup", "football", "soccer", "game", "championship", "league"],
    geopolitics: ["war", "ukraine", "russia", "china", "israel", "iran", "nato", "ceasefire", "military", "clash", "sanction"],
    entertainment: ["movie", "film", "tv", "show", "series", "actor", "actress", "james bond", "cannes", "palme", "album", "oscar", "grammy", "netflix", "music", "festival"],
    "weather/climate": ["weather", "hurricane", "storm", "climate", "temperature", "rain", "aurora", "wildfire", "flood"]
  };

  const COMPATIBLE_TOPICS = {
    "politics/elections": new Set(["economy/markets", "geopolitics"]),
    "economy/markets": new Set(["politics/elections", "companies/earnings", "crypto"]),
    "companies/earnings": new Set(["economy/markets", "AI/technology", "crypto"]),
    "AI/technology": new Set(["companies/earnings", "crypto"]),
    geopolitics: new Set(["politics/elections", "economy/markets"]),
    crypto: new Set(["economy/markets", "companies/earnings", "AI/technology"]),
    entertainment: new Set([]),
    sports: new Set([]),
    "weather/climate": new Set([])
  };

  function topicTermHits(text, terms) {
    return terms.reduce((score, term) => {
      const key = canonicalKey(term);
      if (!key) {
        return score;
      }
      if (textHasTerm(text, key)) {
        return score + (key.includes(" ") ? 3 : 1);
      }
      return score;
    }, 0);
  }

  function candidateTopicProfile(candidate) {
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    const scores = Object.fromEntries(Object.entries(TOPIC_TERMS).map(([topic, terms]) => [topic, topicTermHits(text, terms)]));
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [label, score] = sorted[0];
    const nextScore = sorted[1] ? sorted[1][1] : 0;
    return {
      label: score >= 2 && score >= nextScore + 1 ? label : "",
      score,
      scores
    };
  }

  function topicScore(candidate, article) {
    const topic = article.topic && article.topic.label;
    if (!topic || topic === "general") {
      return 0;
    }
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    const topicTerms = TOPIC_TERMS[topic] || [];
    return topicTerms.some((term) => textHasTerm(text, term)) ? 10 : 0;
  }

  function topicMismatchPenalty(candidate, article) {
    const articleTopic = article.topic && article.topic.label;
    if (!articleTopic || articleTopic === "general") {
      return 0;
    }

    const candidateTopic = candidateTopicProfile(candidate);
    if (!candidateTopic.label || candidateTopic.label === articleTopic) {
      return 0;
    }

    const compatible = COMPATIBLE_TOPICS[articleTopic];
    if (compatible && compatible.has(candidateTopic.label)) {
      return 0;
    }

    return -24;
  }

  function strictTopicSignalPenalty(candidate, article) {
    const articleTopic = article.topic && article.topic.label;
    const strictTopics = new Set(["weather/climate", "sports", "entertainment"]);
    if (!strictTopics.has(articleTopic)) {
      return 0;
    }

    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    const ownTopicHits = topicTermHits(text, TOPIC_TERMS[articleTopic] || []);
    if (ownTopicHits > 0) {
      return 0;
    }

    const profile = candidateTopicProfile(candidate);
    if (profile.label && profile.label !== articleTopic) {
      return -34;
    }

    const highSignalHits = highSignalEntityScore(candidate, article);
    if (highSignalHits > 0 && articleTopic !== "weather/climate") {
      return 0;
    }

    return -30;
  }

  function speechMentionPenalty(candidate, article) {
    const articleTopic = article.topic && article.topic.label;
    if (articleTopic !== "geopolitics") {
      return 0;
    }

    const candidateText = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description}`);
    const articleText = canonicalKey(`${article.title || ""} ${article.cleanText || article.text || ""}`);
    const isSpeechMarket = /\bwhat will .{0,60} say\b|\bwill .{0,60} say\b|\bsay [a-z0-9"']+ during\b|\bmention\b|\bword\b/.test(candidateText);
    if (!isSpeechMarket) {
      return 0;
    }

    const articleIsAboutSpeech = /\bspeech\b|\baddress\b|\bremarks\b|\bpress conference\b|\binterview\b|\bdebate\b|\bwill say\b|\bsaid\b/.test(articleText);
    if (articleIsAboutSpeech && !/\bwar\b|\bceasefire\b|\bpeace deal\b|\bmilitary\b|\bsanction\b|\bstrait\b|\bhormuz\b/.test(articleText)) {
      return 0;
    }

    return -45;
  }

  function classifierScore(candidate, article) {
    const classifier = article.classifier;
    if (!classifier || classifier.mode !== "assistive" || classifier.confidence < 0.45 || classifier.topic === "general") {
      return {
        boost: 0,
        penalty: 0,
        angleHits: 0,
        excludeHits: 0
      };
    }

    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    let boost = 0;
    let angleHits = 0;
    let excludeHits = 0;

    for (const angle of (classifier.marketAngles || []).slice(0, 5)) {
      const key = canonicalKey(angle);
      if (!key || key === "general") {
        continue;
      }
      if (textHasTerm(text, key)) {
        boost += 7;
        angleHits += 1;
      } else {
        const tokens = tokenize(key);
        const hits = tokens.filter((token) => textHasTerm(text, token)).length;
        if (tokens.length && hits === tokens.length) {
          boost += 5;
          angleHits += 1;
        }
      }
    }

    for (const subtopic of (classifier.subtopics || []).slice(0, 8)) {
      const key = canonicalKey(subtopic);
      if (key && key.length >= 3 && textHasTerm(text, key)) {
        boost += 2;
      }
    }

    const profile = candidateTopicProfile(candidate);
    if (profile.label && profile.label === classifier.topic) {
      boost += 6;
    }

    for (const excluded of classifier.excludeAngles || []) {
      const terms = TOPIC_TERMS[excluded] || [excluded];
      if (terms.some((term) => textHasTerm(text, canonicalKey(term)))) {
        excludeHits += 1;
      }
    }

    const confidenceFactor = clampNumber(classifier.confidence, 0.45, 0.96);
    const penalty = excludeHits ? -Math.min(24, excludeHits * 12) : 0;
    return {
      boost: Math.min(18, boost * confidenceFactor),
      penalty,
      angleHits,
      excludeHits
    };
  }

  function hasAnyTerm(text, terms) {
    return terms.some((term) => textHasTerm(text, term));
  }

  function candidateAngleProfile(candidate) {
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    const labels = new Set();
    const priceNumberPattern = /\b(hit|reach|reaches|above|below|over|under|at|to|move|moves|up|down)\b.{0,45}(?:\$|[0-9]+(?:k|m|,|\b)|all time high|ath)|(?:\$|[0-9]+(?:k|m|,|\b)).{0,35}\b(hit|reach|above|below|over|under|price|target)\b/i;

    if (
      hasAnyTerm(text, ["price target", "price", "hit", "reach", "above", "below", "over", "under", "all time high", "ath", "up or down"]) ||
      priceNumberPattern.test(text)
    ) {
      labels.add("price target");
    }
    if (hasAnyTerm(text, ["airdrop", "token unlock", "mainnet", "launch", "wallet", "security", "hack", "exploit", "adoption"])) {
      labels.add("company/adoption/security");
    }
    if (hasAnyTerm(text, ["microstrategy", "strategy", "coinbase", "treasury", "earnings", "revenue", "shares", "stock", "sell any bitcoin", "sells any bitcoin", "buy bitcoin", "buys bitcoin"])) {
      labels.add("company/adoption/security");
    }
    if (hasAnyTerm(text, ["tax", "capital gains", "regulation", "sec", "cftc", "bill", "law", "reserve", "etf approval"])) {
      labels.add("policy/regulation");
    }
    if (hasAnyTerm(text, ["prison", "sentenced", "sentence", "trial", "convicted", "guilty"])) {
      labels.add("legal/sentencing");
    }
    if (hasAnyTerm(text, ["election", "snap election", "president", "senate", "house", "campaign", "vote"])) {
      labels.add("politics/elections");
    }
    if (hasAnyTerm(text, ["gta", "movie", "album", "oscar", "grammy", "box office", "cannes", "netflix"])) {
      labels.add("entertainment");
    }
    if (hasAnyTerm(text, ["nba", "nfl", "mlb", "nhl", "fifa", "championship", "game"])) {
      labels.add("sports");
    }
    if (hasAnyTerm(text, ["war", "peace deal", "ceasefire", "sanction", "missile", "military"])) {
      labels.add("geopolitics");
    }
    if (hasAnyTerm(text, ["hurricane", "storm", "weather", "temperature", "wildfire", "flood"])) {
      labels.add("weather/climate");
    }

    return {
      labels: Array.from(labels),
      text
    };
  }

  function centralEntityHits(candidate, article) {
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    const title = canonicalKey(`${candidate.title} ${candidate.eventTitle}`);
    const highSignalTypes = new Set(["crypto", "person", "company", "ticker", "institution", "sports"]);
    const entities = article.centralEntities && article.centralEntities.length
      ? article.centralEntities
      : ((article.entities && article.entities.top) || []);
    const hits = [];

    for (const entity of entities.slice(0, 10)) {
      if (!highSignalTypes.has(entity.type)) {
        continue;
      }
      const keys = entitySearchKeys(entity);
      const inTitle = keys.some((key) => textHasTerm(title, key));
      const inText = inTitle || keys.some((key) => textHasTerm(text, key));
      if (inText) {
        hits.push({
          text: entity.text,
          type: entity.type,
          inTitle
        });
      }
    }

    return {
      hits,
      titleHits: hits.filter((hit) => hit.inTitle),
      hasHit: hits.length > 0,
      hasTitleHit: hits.some((hit) => hit.inTitle)
    };
  }

  function articleMarketAngles(article) {
    const classifier = article.classifier;
    if (!classifier || classifier.confidence < 0.45 || classifier.topic === "general") {
      return [];
    }
    return (classifier.marketAngles || []).filter((angle) => angle && angle !== "general");
  }

  function relevanceGate(candidate, article) {
    const classifier = article.classifier;
    const articleTopic = article.topic && article.topic.label;
    const angles = articleMarketAngles(article);
    const candidateAngles = candidateAngleProfile(candidate);
    const entityHits = centralEntityHits(candidate, article);
    const reasons = [];
    let penalty = 0;
    let boost = 0;
    let maxConfidence = null;

    if (classifier && classifier.confidence >= 0.45 && classifier.topic !== "general") {
      const candidateAngleSet = new Set(candidateAngles.labels);
      const primaryPriceArticle = angles[0] === "price target" || angles.includes("price target");
      const priceCandidate = candidateAngleSet.has("price target");

      if (primaryPriceArticle && articleTopic === "crypto") {
        if (priceCandidate) {
          boost += classifier.mode === "assistive" ? 8 : 5;
          reasons.push("price-angle-match");
        } else {
          penalty -= classifier.mode === "assistive" ? 46 : 38;
          maxConfidence = Math.min(maxConfidence === null ? 100 : maxConfidence, entityHits.hasHit ? 52 : 45);
          reasons.push("missing-price-angle");
        }

        if (!entityHits.hasHit && !candidateAngleSet.has("price target")) {
          penalty -= 12;
          maxConfidence = Math.min(maxConfidence === null ? 100 : maxConfidence, 45);
          reasons.push("missing-central-entity");
        } else if (!entityHits.hasHit && candidateAngleSet.has("price target")) {
          penalty -= 10;
          maxConfidence = Math.min(maxConfidence === null ? 100 : maxConfidence, 62);
          reasons.push("weak-central-entity");
        }
      }

      const excludedHits = (classifier.excludeAngles || []).filter((angle) => candidateAngleSet.has(angle));
      if (excludedHits.length && !entityHits.hasHit) {
        penalty -= Math.min(30, excludedHits.length * 15);
        maxConfidence = Math.min(maxConfidence === null ? 100 : maxConfidence, 48);
        reasons.push("excluded-angle-without-central-entity");
      }
    }

    return {
      boost,
      penalty,
      maxConfidence,
      reasons,
      candidateAngles: candidateAngles.labels,
      centralEntityHits: entityHits.hits.map((hit) => hit.text)
    };
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.max(min, Math.min(max, number));
  }

  function highSignalEntityScore(candidate, article) {
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    const title = canonicalKey(`${candidate.title} ${candidate.eventTitle}`);
    let score = 0;
    const highSignalTypes = new Set(["crypto", "person", "company", "ticker", "institution", "sports"]);
    const entities = article.centralEntities && article.centralEntities.length
      ? article.centralEntities
      : (article.entities && article.entities.top ? article.entities.top : []);

    for (const entity of entities.slice(0, 12)) {
      if (!highSignalTypes.has(entity.type)) {
        continue;
      }
      const keys = entitySearchKeys(entity);
      if (keys.some((key) => textHasTerm(title, key))) {
        score += 2;
      } else if (keys.some((key) => textHasTerm(text, key))) {
        score += 1;
      }
    }

    return score;
  }

  function marketQualityScore(candidate) {
    let score = 0;
    if (candidate.active) {
      score += 10;
    }
    if (candidate.closed) {
      score -= 45;
    }
    if (candidate.primaryPrice === null || candidate.secondaryPrice === null) {
      score -= 7;
    }
    if (candidate.volume) {
      score += Math.min(8, Math.log10(candidate.volume + 1) * 1.5);
    }
    if (candidate.liquidity) {
      score += Math.min(5, Math.log10(candidate.liquidity + 1) * 1.2);
    }
    return score;
  }

  function trendBoostScore(candidate, relevanceScore, topicMismatch) {
    if (relevanceScore < 16 || topicMismatch < 0) {
      return 0;
    }

    const recentVolume = firstNumber(candidate.volume24hr, candidate.volume1wk, candidate.volume);
    const liquidity = toNumber(candidate.liquidity);
    let score = 0;
    if (recentVolume) {
      score += Math.min(6, Math.log10(recentVolume + 1) * 1.1);
    }
    if (liquidity) {
      score += Math.min(3, Math.log10(liquidity + 1) * 0.65);
    }
    return Math.min(8, score);
  }

  function maybeRelatedByBreakdown(scoreBreakdown) {
    if (!scoreBreakdown) {
      return false;
    }
    const hasArticleOverlap = (
      scoreBreakdown.entities >= 8 ||
      scoreBreakdown.keywords >= 7 ||
      scoreBreakdown.overlap >= 5 ||
      (scoreBreakdown.centralEntityHits || []).length > 0
    );
    const hardPenalty = (
      scoreBreakdown.topicMismatch <= -24 ||
      scoreBreakdown.strictTopicPenalty <= -30 ||
      scoreBreakdown.speechPenalty <= -40 ||
      scoreBreakdown.relevanceGateCap === 45
    );
    return hasArticleOverlap && !hardPenalty;
  }

  function matchTierForConfidence(confidence, scoreBreakdown) {
    if (confidence >= STRONG_MATCH_CONFIDENCE) {
      return "strong";
    }
    if (confidence >= MAYBE_MATCH_CONFIDENCE && maybeRelatedByBreakdown(scoreBreakdown)) {
      return "maybe";
    }
    return "reject";
  }

  function specificArticlePhrases(article) {
    return (article.queries || [])
      .filter((query) => /\b(pixel watch|apple watch|iphone|galaxy watch|playstation|xbox)\b/i.test(query))
      .slice(0, 3);
  }

  /**
   * @param {PMMarketCandidate} candidate
   * @param {PMAnalyzedArticle} article
   * @returns {PMMarketCandidate}
   */
  function rankCandidate(candidate, article) {
    const entities = entityScore(candidate, article);
    const keywords = keywordScore(candidate, article);
    const overlap = titleOverlapScore(candidate, article);
    const topic = topicScore(candidate, article);
    const classifier = classifierScore(candidate, article);
    const quality = marketQualityScore(candidate);
    const topicMismatch = topicMismatchPenalty(candidate, article);
    const strictTopicPenalty = strictTopicSignalPenalty(candidate, article);
    const speechPenalty = speechMentionPenalty(candidate, article);
    const gate = relevanceGate(candidate, article);
    const relevanceScore = entities + keywords + overlap + topic + classifier.boost + gate.boost;
    const trending = trendBoostScore(candidate, relevanceScore, topicMismatch);
    const placeOnlyPenalty = entities > 0 && highSignalEntityScore(candidate, article) === 0 && keywords < 12 && overlap < 10 ? -16 : 0;
    const weakMatchPenalty = entities < 8 && keywords < 7 && overlap < 5 ? -20 : 0;
    let productSpecificityPenalty = 0;
    let productSpecificityCap = null;
    const specificPhrases = specificArticlePhrases(article);
    if (specificPhrases.length) {
      const candidateText = `${candidate.title} ${candidate.eventTitle} ${candidate.description}`;
      const hasSpecificPhrase = specificPhrases.some((phrase) => textHasTerm(candidateText, phrase));
      if (!hasSpecificPhrase && entities > 0) {
        productSpecificityPenalty = -8;
        productSpecificityCap = 54;
        gate.reasons.push("missing-specific-product");
      }
    }

    const confidenceCaps = [gate.maxConfidence, productSpecificityCap].filter((value) => value !== null);
    const maxConfidence = confidenceCaps.length ? Math.min(...confidenceCaps) : null;
    const uncappedConfidence = Math.max(0, Math.min(100, relevanceScore + quality + trending + topicMismatch + strictTopicPenalty + speechPenalty + classifier.penalty + gate.penalty + productSpecificityPenalty + placeOnlyPenalty + weakMatchPenalty));
    const confidence = maxConfidence === null
      ? uncappedConfidence
      : Math.min(uncappedConfidence, maxConfidence);
    const scoreBreakdown = {
      entities,
      keywords,
      overlap,
      topic,
      classifier: classifier.boost,
      classifierPenalty: classifier.penalty,
      classifierAngleHits: classifier.angleHits,
      classifierExcludeHits: classifier.excludeHits,
      relevanceGate: gate.boost + gate.penalty,
      relevanceGateCap: maxConfidence,
      relevanceGateReasons: gate.reasons,
      candidateAngles: gate.candidateAngles,
      centralEntityHits: gate.centralEntityHits,
      quality,
      trending,
      topicMismatch,
      strictTopicPenalty,
      speechPenalty,
      productSpecificityPenalty,
      placeOnlyPenalty,
      weakMatchPenalty
    };
    const matchTier = matchTierForConfidence(confidence, scoreBreakdown);

    return {
      ...candidate,
      confidence,
      matchTier,
      scoreBreakdown
    };
  }

  /**
   * @param {PMMarketCandidate[]} candidates
   * @param {PMAnalyzedArticle} article
   * @param {{ minConfidence?: number, maxResults?: number, includeMaybe?: boolean }} [options]
   * @returns {PMMarketCandidate[]}
   */
  function rankCandidates(candidates, article, options = {}) {
    const minConfidence = options.minConfidence === undefined ? DEFAULT_MIN_CONFIDENCE : options.minConfidence;
    const maxResults = options.maxResults || DEFAULT_MAX_RESULTS;
    return dedupeCandidates(candidates)
      .filter(isDisplayableCandidate)
      .map((candidate) => rankCandidate(candidate, article))
      .filter((candidate) => candidate.confidence >= minConfidence)
      .filter((candidate) => candidate.matchTier === "strong" || (options.includeMaybe && candidate.matchTier === "maybe"))
      .sort((a, b) => b.confidence - a.confidence || (b.volume24hr || 0) - (a.volume24hr || 0) || (b.volume || 0) - (a.volume || 0))
      .slice(0, maxResults);
  }

  function querySearchScore(candidate, query) {
    const queryTokens = tokenize(query);
    const title = canonicalKey(`${candidate.title} ${candidate.eventTitle}`);
    const text = canonicalKey(`${candidate.title} ${candidate.eventTitle} ${candidate.description} ${candidate.category} ${candidate.tags.join(" ")}`);
    let relevance = 0;

    for (const token of queryTokens) {
      if (textHasTerm(title, token)) {
        relevance += 10;
      } else if (textHasTerm(text, token)) {
        relevance += 4;
      }
    }

    if (queryTokens.length) {
      const titleHits = queryTokens.filter((token) => textHasTerm(title, token)).length;
      if (titleHits === queryTokens.length) {
        relevance += 18;
      } else if (titleHits >= Math.ceil(queryTokens.length * 0.6)) {
        relevance += 9;
      }
    }

    if (relevance <= 0) {
      return 0;
    }

    let score = 34 + relevance;

    if (candidate.volume) {
      score += Math.min(9, Math.log10(candidate.volume + 1) * 1.4);
    }
    if (candidate.volume24hr) {
      score += Math.min(7, Math.log10(candidate.volume24hr + 1) * 1.2);
    }
    if (candidate.liquidity) {
      score += Math.min(6, Math.log10(candidate.liquidity + 1));
    }
    if (candidate.primaryPrice === null && candidate.secondaryPrice === null) {
      score -= 6;
    }

    return Math.max(0, Math.min(99, Math.round(score)));
  }

  function trendingMarketScore(candidate) {
    let score = 54;
    if (candidate.volume24hr) {
      score += Math.min(18, Math.log10(candidate.volume24hr + 1) * 2.4);
    }
    if (candidate.volume1wk) {
      score += Math.min(11, Math.log10(candidate.volume1wk + 1) * 1.4);
    }
    if (candidate.volume) {
      score += Math.min(14, Math.log10(candidate.volume + 1) * 1.8);
    }
    if (candidate.liquidity) {
      score += Math.min(8, Math.log10(candidate.liquidity + 1));
    }
    if (candidate.primaryPrice === null && candidate.secondaryPrice === null) {
      score -= 8;
    }
    return Math.max(0, Math.min(99, Math.round(score)));
  }

  async function trendingMarkets(options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) {
      throw new Error("No fetch implementation is available.");
    }

    const maxResults = options.maxResults || DEFAULT_MAX_RESULTS;
    const limit = Math.max(12, Math.min(48, maxResults * 4));
    const payload = await fetchJson(fetchImpl, `${GAMMA_API}/events?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`);
    return dedupeCandidates(flattenPayload(payload, {
      query: "trending",
      source: "events"
    }))
      .filter(isDisplayableCandidate)
      .map((candidate) => ({
        ...candidate,
        confidence: trendingMarketScore(candidate)
      }))
      .sort((a, b) => b.confidence - a.confidence || (b.volume24hr || 0) - (a.volume24hr || 0) || (b.volume || 0) - (a.volume || 0))
      .slice(0, maxResults);
  }

  async function searchMarkets(query, options = {}) {
    const normalizedQuery = normalizeWhitespace(query);
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    const maxResults = options.maxResults || DEFAULT_MAX_RESULTS;
    const candidates = await fetchCandidates({
      queries: [normalizedQuery]
    }, options);

    return dedupeCandidates(candidates)
      .filter(isDisplayableCandidate)
      .map((candidate) => ({
        ...candidate,
        confidence: querySearchScore(candidate, normalizedQuery)
      }))
      .filter((candidate) => candidate.confidence >= (options.minSearchConfidence || 45))
      .sort((a, b) => b.confidence - a.confidence || (b.volume24hr || 0) - (a.volume24hr || 0) || (b.volume || 0) - (a.volume || 0))
      .slice(0, maxResults);
  }

  function eventGroupKey(candidate) {
    if (candidate.eventId) {
      return `id:${candidate.eventId}`;
    }
    if (candidate.eventSlug) {
      return `slug:${candidate.eventSlug}`;
    }
    if (candidate.eventTitle) {
      return `title:${canonicalKey(candidate.eventTitle)}`;
    }
    return `market:${candidateKey(candidate)}`;
  }

  function eventGroupTitle(candidate) {
    return normalizeWhitespace(candidate.eventTitle || candidate.title || candidate.question || "Untitled event");
  }

  function mergeGroupCandidate(group, candidate) {
    group.markets.push(candidate);
    group.confidence = Math.max(group.confidence || 0, candidate.confidence || 0);
    group.volume = (group.volume || 0) + (candidate.volume || 0);
    group.volume24hr = (group.volume24hr || 0) + (candidate.volume24hr || 0);
    group.volume1wk = (group.volume1wk || 0) + (candidate.volume1wk || 0);
    group.liquidity = Math.max(group.liquidity || 0, candidate.liquidity || 0);
    group.traderCount = Math.max(group.traderCount || 0, candidate.traderCount || 0);
    group.sourceQueries = Array.from(new Set([...(group.sourceQueries || []), ...(candidate.sourceQueries || [])]));
    if (candidate.matchTier === "strong" || group.matchTier !== "strong") {
      group.matchTier = candidate.matchTier || group.matchTier || "strong";
    }
    if (!group.image && candidate.image) {
      group.image = candidate.image;
    }
  }

  /**
   * @param {PMMarketCandidate[]} candidates
   * @param {{ maxGroups?: number, maxChildMarkets?: number, article?: PMAnalyzedArticle|null, minParentConfidence?: number }} [options]
   * @returns {PMMarketGroup[]}
   */
  function groupCandidatesByEvent(candidates, options = {}) {
    const maxGroups = options.maxGroups || DEFAULT_MAX_RESULTS;
    const maxChildMarkets = options.maxChildMarkets || DEFAULT_MAX_CHILD_MARKETS;
    const article = options.article || null;
    const minParentConfidence = options.minParentConfidence === undefined
      ? DEFAULT_MIN_CONFIDENCE
      : options.minParentConfidence;
    const groups = new Map();

    for (const candidate of candidates.filter(isDisplayableCandidate)) {
      const key = eventGroupKey(candidate);
      if (!groups.has(key)) {
        groups.set(key, {
          ...candidate,
          id: candidate.eventId ? `event:${candidate.eventId}` : `event:${key}`,
          type: "eventGroup",
          title: eventGroupTitle(candidate),
          eventTitle: eventGroupTitle(candidate),
          markets: [],
          sourceQueries: []
        });
      }
      mergeGroupCandidate(groups.get(key), candidate);
    }

    return Array.from(groups.values())
      .map((group) => {
        const markets = group.markets
          .sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (b.volume24hr || 0) - (a.volume24hr || 0) || (b.volume || 0) - (a.volume || 0))
          .slice(0, maxChildMarkets);
        const primary = markets[0] || group;
        const parentCandidate = {
          ...group,
          title: group.eventTitle || group.title,
          eventTitle: group.eventTitle || group.title,
          description: normalizeWhitespace([
            group.event && group.event.description,
            group.category,
            Array.isArray(group.tags) ? group.tags.join(" ") : ""
          ].filter(Boolean).join(" ")),
          primaryPrice: primary.primaryPrice,
          secondaryPrice: primary.secondaryPrice,
          active: true,
          closed: false,
          unavailable: false
        };
        const parentRank = article ? rankCandidate(parentCandidate, article) : null;
        return {
          ...group,
          primaryOutcome: primary.primaryOutcome,
          secondaryOutcome: primary.secondaryOutcome,
          primaryPrice: primary.primaryPrice,
          secondaryPrice: primary.secondaryPrice,
          primaryPercent: primary.primaryPercent,
          outcomeOptions: primary.outcomeOptions,
          movement: primary.movement,
          url: group.eventSlug ? `${POLYMARKET}/event/${group.eventSlug}` : primary.url,
          parentConfidence: parentRank ? parentRank.confidence : group.confidence,
          matchTier: parentRank ? parentRank.matchTier : (group.matchTier || "strong"),
          parentScoreBreakdown: parentRank ? parentRank.scoreBreakdown : null,
          markets
        };
      })
      .filter((group) => !article || group.parentConfidence >= minParentConfidence)
      .sort((a, b) => (b.parentConfidence || b.confidence || 0) - (a.parentConfidence || a.confidence || 0) || (b.volume24hr || 0) - (a.volume24hr || 0) || (b.volume || 0) - (a.volume || 0))
      .slice(0, maxGroups);
  }

  function publicSearchUrl(query, options = {}) {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("events_status", "active");
    params.set("limit_per_type", String(Math.max(3, Math.min(20, Number(options.limitPerType) || 8))));
    params.set("keep_closed_markets", "0");
    params.set("search_profiles", "false");
    params.set("search_tags", options.searchTags === true ? "true" : "false");
    return {
      url: `${GAMMA_API}/public-search?${params.toString()}`,
      source: "public-search"
    };
  }

  function searchUrls(query, _index, options = {}) {
    return [publicSearchUrl(query, options)];
  }

  function shouldFetchSimilarEvents(article, options = {}) {
    if (options.includeSimilar !== true) {
      return false;
    }
    const title = normalizeWhitespace(article && article.title);
    return title.length >= 12 && !/^untitled\b/i.test(title);
  }

  function similarEventRequest(article, options = {}) {
    const title = normalizeWhitespace(article && article.title);
    const params = new URLSearchParams();
    params.set("event_title", title);
    params.set("closed", "false");
    params.set("limit", String(Math.max(3, Math.min(20, Number(options.similarLimit) || 5))));
    return {
      url: `${GAMMA_API}/events/similar?${params.toString()}`,
      query: title,
      source: "events-similar"
    };
  }

  function payloadTags(payload) {
    if (!payload || !Array.isArray(payload.tags)) {
      return [];
    }
    return payload.tags
      .map((tag) => ({
        id: tag && tag.id ? String(tag.id) : "",
        label: normalizeWhitespace(tag && (tag.label || tag.name || tag.slug)),
        slug: normalizeWhitespace(tag && tag.slug)
      }))
      .filter((tag) => tag.id && (tag.label || tag.slug));
  }

  function tagText(tag) {
    return canonicalKey(`${tag.label || ""} ${String(tag.slug || "").replace(/-/g, " ")}`);
  }

  function articleTagEntityKeys(article) {
    const generic = new Set(["us", "u s", "u.s.", "un", "eu", "uk"]);
    const highSignalTypes = new Set(["place", "crypto", "company", "institution", "person", "organization"]);
    const entities = [
      ...((article && article.centralEntities) || []),
      ...((article && article.entities && article.entities.top) || [])
    ];
    const keys = [];
    for (const entity of entities) {
      if (!entity || !highSignalTypes.has(entity.type)) {
        continue;
      }
      for (const key of entitySearchKeys(entity)) {
        if (key.length > 2 && !generic.has(key)) {
          keys.push(key);
        }
      }
    }
    return Array.from(new Set(keys)).slice(0, 8);
  }

  function tagExpansionScore(tag, article) {
    const entityKeys = articleTagEntityKeys(article);
    if (!entityKeys.length) {
      return 0;
    }
    const labelKey = canonicalKey(tag.label);
    const slugKey = canonicalKey(String(tag.slug || "").replace(/-/g, " "));
    const combined = tagText(tag);
    let score = 0;

    for (const entityKey of entityKeys) {
      if (labelKey === entityKey || slugKey === entityKey) {
        score = Math.max(score, 100);
      } else if (textHasTerm(combined, entityKey)) {
        score = Math.max(score, 60);
      }
    }
    if (!score) {
      return 0;
    }

    const classifier = article && article.classifier;
    const angleHints = [
      ...((classifier && classifier.marketAngles) || []),
      ...((classifier && classifier.queryHints) || [])
    ];
    for (const hint of angleHints.slice(0, 8)) {
      if (hint && textHasTerm(combined, hint)) {
        score += 8;
      }
    }
    return score;
  }

  function selectTagExpansions(tags, article, options = {}) {
    const seen = new Set();
    const scored = [];
    for (const tag of tags) {
      if (!tag || !tag.id || seen.has(tag.id)) {
        continue;
      }
      seen.add(tag.id);
      const score = tagExpansionScore(tag, article);
      if (score > 0) {
        scored.push({ ...tag, score });
      }
    }
    return scored
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, Math.max(1, Math.min(5, Number(options.maxTagExpansions) || 2)));
  }

  function tagEventRequest(tag, options = {}) {
    const params = new URLSearchParams();
    params.set("tag_id", tag.id);
    params.set("active", "true");
    params.set("closed", "false");
    params.set("limit", String(Math.max(20, Math.min(200, Number(options.tagEventLimit) || 100))));
    return {
      url: `${GAMMA_API}/events?${params.toString()}`,
      query: tag.label || tag.slug,
      source: "events-tag"
    };
  }

  async function fetchJson(fetchImpl, url) {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Polymarket API returned ${response.status}`);
    }
    return response.json();
  }

  function groupConditionId(group = {}) {
    const candidates = [
      group,
      ...(Array.isArray(group.markets) ? group.markets : [])
    ];
    for (const candidate of candidates) {
      const raw = candidate && candidate.raw ? candidate.raw : {};
      const value = candidate && (
        candidate.conditionId ||
        candidate.condition_id ||
        raw.conditionId ||
        raw.condition_id
      );
      if (value) {
        return String(value);
      }
    }
    return "";
  }

  function positionWallet(position = {}) {
    const value = position.proxyWallet ||
      position.wallet ||
      position.user ||
      position.address ||
      position.owner ||
      position.account;
    return value ? String(value).toLowerCase() : "";
  }

  function parseMarketPositionSummary(payload, limit) {
    const tokens = Array.isArray(payload) ? payload : [];
    const wallets = new Set();
    let capped = false;
    let positionCount = 0;
    for (const token of tokens) {
      const positions = Array.isArray(token && token.positions) ? token.positions : [];
      if (positions.length >= limit) {
        capped = true;
      }
      for (const position of positions) {
        positionCount += 1;
        const wallet = positionWallet(position);
        if (wallet) {
          wallets.add(wallet);
        }
      }
    }
    return {
      traderCount: wallets.size || positionCount,
      traderCountCapped: capped,
      positionCount
    };
  }

  async function fetchMarketPositionSummary(conditionId, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
    if (!fetchImpl || !conditionId) {
      return null;
    }

    const limit = Math.max(50, Math.min(500, Number(options.limit) || 500));
    const encoded = encodeURIComponent(conditionId);
    const payload = await fetchJson(fetchImpl, `${DATA_API}/v1/market-positions?market=${encoded}&status=OPEN&sortBy=TOKENS&sortDirection=DESC&limit=${limit}`);
    return parseMarketPositionSummary(payload, limit);
  }

  function withTimeout(promise, timeoutMs) {
    if (!timeoutMs) {
      return promise;
    }
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
  }

  async function enrichGroupsWithTraderCounts(groups, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
    if (!fetchImpl || !Array.isArray(groups) || !groups.length) {
      return groups;
    }

    const timeoutMs = Number(options.timeoutMs) || 2500;
    const limit = Number(options.limit) || 500;
    const cache = new Map();
    const enriched = await Promise.all(groups.map(async (group) => {
      if (group.traderCount) {
        return group;
      }
      const conditionId = groupConditionId(group);
      if (!conditionId) {
        return group;
      }
      try {
        if (!cache.has(conditionId)) {
          cache.set(conditionId, withTimeout(fetchMarketPositionSummary(conditionId, {
            fetchImpl,
            limit
          }), timeoutMs));
        }
        const summary = await cache.get(conditionId);
        if (!summary || !summary.traderCount) {
          return group;
        }
        return {
          ...group,
          traderCount: summary.traderCount,
          traderCountCapped: summary.traderCountCapped,
          traderCountSource: "market-positions"
        };
      } catch (error) {
        return group;
      }
    }));
    return enriched;
  }

  /**
   * @param {PMAnalyzedArticle} article
   * @param {{ fetchImpl?: PMFetchLike, includeSimilar?: boolean, includeTagExpansion?: boolean, searchLimitPerType?: number, similarLimit?: number, maxTagExpansions?: number, tagEventLimit?: number }} [options]
   * @returns {Promise<PMMarketCandidate[]>}
   */
  async function fetchCandidates(article, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) {
      throw new Error("No fetch implementation is available.");
    }

    const queries = (article.queries && article.queries.length ? article.queries : []).slice(0, 8);
    if (!queries.length) {
      return [];
    }

    const searchOptions = {
      limitPerType: options.searchLimitPerType,
      searchTags: options.includeTagExpansion === true
    };
    const requests = queries.flatMap((query, index) => (
      searchUrls(query, index, searchOptions).map((item) => ({ ...item, query }))
    ));
    if (shouldFetchSimilarEvents(article, options)) {
      requests.push(similarEventRequest(article, options));
    }
    const results = await Promise.allSettled(requests.map(async (request) => {
      const payload = await fetchJson(fetchImpl, request.url);
      return {
        candidates: flattenPayload(payload, {
          query: request.query,
          source: request.source
        }),
        tags: payloadTags(payload)
      };
    }));

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    if (!fulfilled.length) {
      const firstError = results.find((result) => result.status === "rejected");
      throw (firstError && firstError.reason) || new Error("Polymarket API request failed.");
    }

    const candidates = fulfilled.flatMap((result) => result.value.candidates);
    if (options.includeTagExpansion === true) {
      const selectedTags = selectTagExpansions(fulfilled.flatMap((result) => result.value.tags), article, options);
      if (selectedTags.length) {
        const tagResults = await Promise.allSettled(selectedTags.map(async (tag) => {
          const request = tagEventRequest(tag, options);
          const payload = await fetchJson(fetchImpl, request.url);
          return flattenPayload(payload, {
            query: request.query,
            source: request.source
          });
        }));
        candidates.push(...tagResults
          .filter((result) => result.status === "fulfilled")
          .flatMap((result) => result.value));
      }
    }

    return dedupeCandidates(candidates);
  }

  /**
   * @param {PMAnalyzedArticle} article
   * @param {{ fetchImpl?: PMFetchLike, minConfidence?: number, maxResults?: number, includeMaybe?: boolean, includeSimilar?: boolean, includeTagExpansion?: boolean, searchLimitPerType?: number, similarLimit?: number, maxTagExpansions?: number, tagEventLimit?: number }} [options]
   * @returns {Promise<PMMarketCandidate[]>}
   */
  async function searchAndRank(article, options = {}) {
    const candidates = await fetchCandidates(article, options);
    return rankCandidates(candidates, article, options);
  }

  return {
    GAMMA_API,
    DATA_API,
    POLYMARKET,
    safeJsonArray,
    toNumber,
    parseOutcomes,
    parseMovement,
    normalizeMarket,
    normalizeEvent,
    flattenPayload,
    dedupeCandidates,
    isDisplayableCandidate,
    rankCandidate,
    rankCandidates,
    groupCandidatesByEvent,
    candidateTopicProfile,
    candidateAngleProfile,
    fetchCandidates,
    fetchMarketPositionSummary,
    enrichGroupsWithTraderCounts,
    trendingMarkets,
    searchMarkets,
    searchAndRank
  };
});
