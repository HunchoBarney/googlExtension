#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const signals = require("../src/lib/articleSignals");
globalThis.PMArticleSignals = signals;
const polymarket = require("../src/lib/polymarket");
const { createArgReader } = require("./cliArgs");
const {
  artifactPath,
  FEEDS,
  discoverArticleLinks,
  extractArticleFromHtml,
  fetchText,
  normalizeWhitespace
} = require("./qaUtils");

const { argNumber, hasFlag } = createArgReader(process.argv, {
  preferLastValue: true
});

function compactEntityList(article) {
  const entities = article.entities && article.entities.top ? article.entities.top : [];
  return entities.slice(0, 8).map((entity) => ({
    type: entity.type,
    text: entity.text,
    aliases: entity.aliases || []
  }));
}

function compactMatch(match) {
  return {
    id: match.id,
    title: match.title,
    eventTitle: match.eventTitle,
    confidence: match.confidence,
    primaryOutcome: match.primaryOutcome,
    primaryPrice: match.primaryPrice,
    primaryPercent: match.primaryPercent,
    outcomeOptions: Array.isArray(match.outcomeOptions) ? match.outcomeOptions.slice(0, 3) : [],
    movement: match.movement,
    childMarketCount: Array.isArray(match.markets) ? match.markets.length : 0,
    volume: match.volume,
    liquidity: match.liquidity,
    url: match.url,
    sourceQueries: match.sourceQueries
  };
}

function writeFailureCandidate(record, html) {
  const file = artifactPath(`live-article-failure-${record.index}`, "html");
  fs.writeFileSync(file, html);
  return path.relative(path.join(__dirname, ".."), file);
}

async function main() {
  const limit = argNumber("limit", 8, { positiveOnly: true });
  const maxAttempts = argNumber("max-attempts", Math.max(limit * 3, FEEDS.length * 3), { positiveOnly: true });
  const minConfidence = argNumber("min-confidence", 55, { positiveOnly: true });
  const saveFailures = hasFlag("save-failures");
  const enforceReleaseGates = !hasFlag("no-release-gates");
  const requiredCategories = FEEDS.map((feed) => feed.category);
  const discovered = await discoverArticleLinks({
    limit: maxAttempts,
    perFeed: 5
  });
  const report = {
    generatedAt: new Date().toISOString(),
    minConfidence,
    discoveredCount: discovered.articles.length,
    feedReports: discovered.feedReports,
    processedReadableCount: 0,
    expectedStrongArticles: 0,
    expectedNoStrongArticles: 0,
    records: []
  };

  const readableCategories = new Set();
  let matchedArticleCount = 0;
  let noMatchArticleCount = 0;

  for (const item of discovered.articles) {
    const enoughRecords = report.processedReadableCount >= limit;
    const coveredCategories = requiredCategories.every((category) => readableCategories.has(category));
    if (
      enoughRecords &&
      (!enforceReleaseGates || (matchedArticleCount > 0 && noMatchArticleCount > 0 && coveredCategories))
    ) {
      break;
    }

    const record = {
      index: report.records.length + 1,
      category: item.category,
      source: item.source,
      feedUrl: item.feedUrl,
      feedTitle: item.feedTitle,
      url: item.url,
      expectedStrongMatch: item.expectedStrongMatch,
      readable: false,
      articleTitle: "",
      detectedTopic: "",
      detectedEntities: [],
      classifier: null,
      generatedQueries: [],
      matchCount: 0,
      matches: [],
      judgedRelevant: false,
      judgment: "not-run"
    };

    let html = "";
    try {
      const response = await fetchText(item.url, { timeoutMs: 20000 });
      record.finalUrl = response.url;
      html = response.text;

      const article = extractArticleFromHtml(html, response.url);
      if (!article.readable) {
        record.error = article.error;
        record.judgment = item.expectedStrongMatch ? "extraction-failed-for-expected-strong-topic" : "no-readable-article";
        if (saveFailures) {
          record.failureCandidate = writeFailureCandidate(record, html);
        }
        report.records.push(record);
        continue;
      }

      const enriched = signals.analyzeArticle(article);
      const matches = await polymarket.searchAndRank(enriched, {
        minConfidence,
        maxResults: 12
      });
      const displayMatches = polymarket.groupCandidatesByEvent(matches, {
        maxGroups: 5,
        article: enriched,
        minParentConfidence: minConfidence
      });

      record.readable = true;
      record.articleTitle = normalizeWhitespace(enriched.title);
      record.detectedTopic = enriched.topic && enriched.topic.label;
      record.detectedEntities = compactEntityList(enriched);
      record.classifier = enriched.classifier;
      record.modelKeywords = (enriched.keywords || []).slice(0, 8).map((keyword) => keyword.text);
      record.generatedQueries = enriched.queries;
      record.matchCount = displayMatches.length;
      record.matches = displayMatches.map(compactMatch);
      record.judgedRelevant = displayMatches.length > 0;
      record.judgment = displayMatches.length
        ? "relevant-by-confidence-threshold"
        : (item.expectedStrongMatch ? "no-strong-match-found" : "no-strong-match-expected");
      report.processedReadableCount += 1;
      readableCategories.add(item.category);
      if (displayMatches.length) {
        matchedArticleCount += 1;
      } else {
        noMatchArticleCount += 1;
      }
      if (item.expectedStrongMatch) {
        report.expectedStrongArticles += 1;
      } else {
        report.expectedNoStrongArticles += 1;
      }
    } catch (error) {
      record.error = error && error.message ? error.message : String(error);
      record.judgment = "runtime-error";
      if (saveFailures && html) {
        record.failureCandidate = writeFailureCandidate(record, html);
      }
    }

    report.records.push(record);
  }

  console.log(`Processed ${report.records.length} discovered articles; ${report.processedReadableCount} were readable.`);
  console.log(`Displayed parent event matches for ${matchedArticleCount} articles; no-match state for ${noMatchArticleCount} articles.`);
  console.log(`Readable categories: ${Array.from(readableCategories).sort().join(", ") || "none"}.`);

  for (const record of report.records.filter((item) => item.readable)) {
    const title = record.articleTitle || record.feedTitle || record.url;
    const model = record.classifier
      ? `${record.classifier.topic || "general"} / ${(record.classifier.marketAngles || []).slice(0, 2).join(", ") || "no angle"} (${record.classifier.confidence})`
      : "no model";
    const keywords = (record.modelKeywords || []).slice(0, 4).join(", ") || "none";
    const queries = (record.generatedQueries || []).slice(0, 3).join(" | ") || "none";
    const events = record.matches.map((match) => match.eventTitle || match.title).slice(0, 3).join(" | ") || "No strong Polymarket match";
    console.log(`[${record.index}] ${record.category}: ${title}`);
    console.log(`    model: ${model}; keywords: ${keywords}`);
    console.log(`    queries: ${queries}`);
    console.log(`    displayed parent events: ${events}`);
  }

  if (!report.records.length || report.processedReadableCount === 0) {
    console.error("Live article QA failed because no readable current articles were processed.");
    process.exitCode = 1;
    return;
  }

  if (enforceReleaseGates) {
    const missingCategories = requiredCategories.filter((category) => !readableCategories.has(category));
    const failures = [];
    if (matchedArticleCount === 0) {
      failures.push("no live article produced a strong parent event candidate");
    }
    if (noMatchArticleCount === 0) {
      failures.push("no live article produced the required no-match state");
    }
    if (missingCategories.length) {
      failures.push(`missing readable category coverage: ${missingCategories.join(", ")}`);
    }
    if (failures.length) {
      console.error(`Live article QA failed release gates: ${failures.join("; ")}.`);
      console.error("Use --no-release-gates only for quick exploratory checks.");
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
