#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const marketMaker = require("../src/lib/marketMaker");

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!match) {
      continue;
    }
    args[match[1]] = match[2] === undefined ? true : match[2];
  }
  return args;
}

function defaultSamples() {
  const history = (prices) => prices.map((p, index) => ({ t: 1780000000 + index * 60, p }));
  const book = (bid, ask, size = 1000) => ({
    bids: [{ price: bid, size }],
    asks: [{ price: ask, size }]
  });
  return [
    {
      id: "range-bound-50c",
      history: history([0.5, 0.49, 0.51, 0.5, 0.52, 0.5, 0.49, 0.51, 0.5]),
      book: book(0.49, 0.51)
    },
    {
      id: "slow-uptrend",
      history: history([0.42, 0.43, 0.44, 0.445, 0.45, 0.455, 0.46, 0.455]),
      book: book(0.44, 0.46, 800)
    },
    {
      id: "high-volatility",
      history: history([0.62, 0.58, 0.64, 0.57, 0.63, 0.6, 0.65, 0.59]),
      book: book(0.58, 0.62, 700)
    }
  ];
}

function loadSamples(inputPath) {
  if (!inputPath) {
    return defaultSamples();
  }
  const resolved = path.resolve(process.cwd(), inputPath);
  const payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.samples)) {
    return payload.samples;
  }
  throw new Error(`Expected ${resolved} to contain an array or { "samples": [...] }`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const samples = loadSamples(args.input);
  const result = marketMaker.tuneStrategy(samples, {
    keepTop: Number(args.top) || 5,
    baseConfig: {
      tickSize: Number(args.tickSize) || 0.01,
      maxInventory: Number(args.maxInventory) || 500,
      maxQuoteSize: Number(args.maxQuoteSize) || 100,
      maxNotionalPerQuote: Number(args.maxNotionalPerQuote) || 50
    }
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`Market-maker tuning: ${result.status}`);
  console.log(`Samples: ${samples.length}`);
  console.log(`Candidates evaluated: ${result.candidatesEvaluated}`);
  console.log("Best config:");
  for (const key of ["minEdge", "spreadCapture", "volatilityMultiplier", "inventorySkew", "maxInventory", "maxQuoteSize", "maxNotionalPerQuote"]) {
    console.log(`  ${key}: ${result.bestConfig[key]}`);
  }
  console.log("Best metrics:");
  for (const key of ["objective", "pnl", "quoteCount", "fillCount", "maxAbsInventory", "maxDrawdown"]) {
    console.log(`  ${key}: ${result.bestMetrics[key]}`);
  }
}

main();
