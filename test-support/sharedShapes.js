"use strict";

/** @typedef {import("../src/lib/sharedTypes").PMAnalyzedArticle} PMAnalyzedArticle */
/** @typedef {import("../src/lib/sharedTypes").PMMarketCandidate} PMMarketCandidate */
/** @typedef {import("../src/lib/sharedTypes").PMMovement} PMMovement */
/** @typedef {import("../src/lib/sharedTypes").PMOutcomeOption} PMOutcomeOption */

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * @param {Partial<PMAnalyzedArticle>} [overrides]
 * @returns {PMAnalyzedArticle}
 */
function makeArticleContext(overrides = {}) {
  return {
    title: "Bitcoin rallies as ETF inflows accelerate",
    cleanText: "Bitcoin rose as ETF inflows accelerated.",
    text: "Bitcoin rose as ETF inflows accelerated.",
    analysisStrategy: "classifier",
    keywordAlgorithm: "local-keyword",
    topic: { label: "crypto" },
    classifier: {
      topic: "crypto",
      primaryTopic: "crypto",
      marketAngles: ["price target"],
      relevantEntityTypes: ["crypto"],
      subtopics: [],
      excludeAngles: [],
      confidence: 0.8,
      queryHints: [],
      scores: {},
      matchedTerms: [],
      matchedEntityTypes: [],
      modelVersion: "test",
      mode: "assistive"
    },
    keywords: [{ text: "bitcoin", algorithm: "local-keyword" }],
    namedEntities: { top: [{ text: "Bitcoin", type: "crypto" }] },
    entities: { top: [{ text: "Bitcoin", type: "crypto" }] },
    centralEntities: [{ text: "Bitcoin", type: "crypto" }],
    queries: ["Bitcoin"],
    ...overrides
  };
}

/**
 * @param {string} label
 * @param {?number} price
 * @param {?number} [percent]
 * @returns {PMOutcomeOption}
 */
function makeOutcome(label, price, percent) {
  return {
    label,
    price,
    percent: percent !== undefined ? percent : (price === null || price === undefined ? null : price * 100)
  };
}

/**
 * @param {PMMovement["direction"]} [direction]
 * @param {?number} [value]
 * @returns {PMMovement}
 */
function makeMovement(direction = "flat", value = 0) {
  return { direction, value };
}

/**
 * @param {Partial<PMMarketCandidate>} [overrides]
 * @returns {PMMarketCandidate}
 */
function makeBinaryCandidate(overrides = {}) {
  const primaryOutcome = hasOwn(overrides, "primaryOutcome") ? overrides.primaryOutcome : "Yes";
  const secondaryOutcome = hasOwn(overrides, "secondaryOutcome") ? overrides.secondaryOutcome : "No";
  const primaryPrice = hasOwn(overrides, "primaryPrice") ? overrides.primaryPrice : 0.44;
  const secondaryPrice = hasOwn(overrides, "secondaryPrice") ? overrides.secondaryPrice : 0.56;
  const primaryPercent = hasOwn(overrides, "primaryPercent")
    ? overrides.primaryPercent
    : (primaryPrice === null || primaryPrice === undefined ? null : primaryPrice * 100);
  const outcomeOptions = hasOwn(overrides, "outcomeOptions")
    ? overrides.outcomeOptions
    : [
      makeOutcome(primaryOutcome, primaryPrice, primaryPercent),
      makeOutcome(secondaryOutcome, secondaryPrice)
    ];
  const movement = hasOwn(overrides, "movement") ? overrides.movement : makeMovement();

  return {
    id: "btc",
    title: "Will Bitcoin hit $150k in 2026?",
    url: "https://polymarket.com/event/bitcoin-targets",
    primaryOutcome,
    secondaryOutcome,
    primaryPrice,
    secondaryPrice,
    primaryPercent,
    outcomeOptions,
    movement,
    confidence: 70,
    ...overrides
  };
}

module.exports = {
  makeArticleContext,
  makeBinaryCandidate,
  makeMovement,
  makeOutcome
};
