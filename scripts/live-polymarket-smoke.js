#!/usr/bin/env node
"use strict";

const signals = require("../src/lib/articleSignals");
globalThis.PMArticleSignals = signals;
const polymarket = require("../src/lib/polymarket");

const QUERIES = [
  "Bitcoin",
  "Fed interest rates",
  "Trump China tariffs",
  "Nvidia AI earnings",
  "Lakers Celtics"
];

const ENDPOINTS = [
  {
    source: "public-search",
    url(query) {
      return `${polymarket.GAMMA_API}/public-search?q=${encodeURIComponent(query)}`;
    }
  },
  {
    source: "events",
    url(query) {
      return `${polymarket.GAMMA_API}/events?limit=8&active=true&closed=false&q=${encodeURIComponent(query)}`;
    }
  },
  {
    source: "markets",
    url(query) {
      return `${polymarket.GAMMA_API}/markets?limit=8&active=true&closed=false&q=${encodeURIComponent(query)}`;
    }
  }
];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PredMarketExtension QA/0.1"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return JSON.parse(text);
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    endpointCount: 0,
    parseableCandidateCount: 0,
    priceMappingChecks: 0,
    checks: []
  };

  for (const query of QUERIES) {
    for (const endpoint of ENDPOINTS) {
      const url = endpoint.url(query);
      const check = {
        query,
        source: endpoint.source,
        url,
        ok: false,
        candidateCount: 0,
        sample: null
      };

      try {
        const payload = await fetchJson(url);
        const candidates = polymarket.flattenPayload(payload, {
          query,
          source: endpoint.source
        });
        check.ok = true;
        check.candidateCount = candidates.length;
        report.endpointCount += 1;
        report.parseableCandidateCount += candidates.length;

        const sample = candidates.find((candidate) => candidate.primaryPrice !== null) || candidates[0];
        if (sample) {
          check.sample = {
            id: sample.id,
            title: sample.title,
            active: sample.active,
            closed: sample.closed,
            primaryOutcome: sample.primaryOutcome,
            primaryPrice: sample.primaryPrice,
            primaryPercent: sample.primaryPercent,
            url: sample.url
          };
          if (sample.primaryPrice !== null) {
            const expectedPercent = sample.primaryPrice * 100;
            if (Math.abs(sample.primaryPercent - expectedPercent) > 0.000001) {
              throw new Error(`Price mapping mismatch for ${sample.id}`);
            }
            report.priceMappingChecks += 1;
          }
        }
      } catch (error) {
        check.error = error && error.message ? error.message : String(error);
      }

      report.checks.push(check);
    }
  }

  console.log(`Checked ${report.endpointCount}/${QUERIES.length * ENDPOINTS.length} endpoints; parsed ${report.parseableCandidateCount} candidates.`);

  const failed = report.checks.filter((check) => !check.ok);
  if (failed.length || report.endpointCount === 0 || report.parseableCandidateCount === 0 || report.priceMappingChecks === 0) {
    console.error("Live Polymarket smoke failed.");
    for (const check of failed) {
      console.error(`${check.source} ${check.query}: ${check.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
