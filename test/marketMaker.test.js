const test = require("node:test");
const assert = require("node:assert/strict");
const marketMaker = require("../src/lib/marketMaker");

function book(bids, asks) {
  return {
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size }))
  };
}

function history(prices) {
  return prices.map((p, index) => ({ t: 1780000000 + index * 60, p }));
}

test("creates bounded two-sided quotes around CLOB fair value", () => {
  const plan = marketMaker.makeQuotePlan({
    tokenId: "yes-token",
    book: book([[0.48, 900], [0.47, 400]], [[0.52, 800], [0.53, 450]]),
    history: history([0.49, 0.5, 0.51, 0.5]),
    inventory: { shares: 0, cash: 1000 },
    config: {
      tickSize: 0.01,
      minEdge: 0.015,
      maxQuoteSize: 120,
      maxNotionalPerQuote: 40
    }
  });

  assert.equal(plan.status, "quote");
  assert.ok(plan.fairValue > 0.49 && plan.fairValue < 0.51);
  assert.ok(plan.bid.price < plan.fairValue);
  assert.ok(plan.ask.price > plan.fairValue);
  assert.ok(plan.bid.price < plan.ask.price);
  assert.ok(plan.bid.size <= 120);
  assert.ok(plan.ask.size <= 120);
  assert.ok(plan.bid.notional <= 40);
  assert.ok(plan.ask.notional <= 40);
  assert.ok(plan.edge.bid >= 0.015);
  assert.ok(plan.edge.ask >= 0.015);
});

test("inventory skew makes long books less eager to buy and more eager to sell", () => {
  const common = {
    tokenId: "yes-token",
    book: book([[0.48, 900]], [[0.52, 900]]),
    history: history([0.49, 0.5, 0.51, 0.5]),
    config: {
      tickSize: 0.01,
      minEdge: 0.01,
      maxInventory: 500,
      maxQuoteSize: 100,
      inventorySkew: 0.04
    }
  };

  const flat = marketMaker.makeQuotePlan({
    ...common,
    inventory: { shares: 0, cash: 1000 }
  });
  const long = marketMaker.makeQuotePlan({
    ...common,
    inventory: { shares: 450, cash: 1000 }
  });

  assert.equal(flat.status, "quote");
  assert.equal(long.status, "quote");
  assert.ok(long.reservationPrice < flat.reservationPrice);
  assert.ok(!long.bid || long.bid.price <= flat.bid.price);
  assert.ok(long.ask.price <= flat.ask.price);
  assert.ok(!long.bid || long.bid.size < flat.bid.size);
  assert.ok(long.ask.size >= flat.ask.size);
});

test("risk limits switch to one-sided liquidation quotes near max inventory", () => {
  const plan = marketMaker.makeQuotePlan({
    tokenId: "yes-token",
    book: book([[0.48, 900]], [[0.52, 900]]),
    history: history([0.49, 0.5, 0.51, 0.5]),
    inventory: { shares: 520, cash: 1000 },
    config: {
      tickSize: 0.01,
      minEdge: 0.01,
      maxInventory: 500,
      maxQuoteSize: 100
    }
  });

  assert.equal(plan.status, "quote");
  assert.equal(plan.bid, null);
  assert.ok(plan.ask);
  assert.equal(plan.risk.oneSided, "ask");
});

test("tunes strategy parameters against deterministic sample paths", () => {
  const samples = [
    {
      id: "range-bound",
      history: history([0.5, 0.49, 0.51, 0.5, 0.52, 0.5, 0.49, 0.51]),
      book: book([[0.49, 1000]], [[0.51, 1000]])
    },
    {
      id: "slow-trend",
      history: history([0.42, 0.43, 0.44, 0.445, 0.45, 0.455, 0.46]),
      book: book([[0.44, 800]], [[0.46, 800]])
    }
  ];

  const result = marketMaker.tuneStrategy(samples, {
    baseConfig: {
      tickSize: 0.01,
      maxInventory: 500,
      maxQuoteSize: 100,
      maxNotionalPerQuote: 50
    },
    grid: {
      minEdge: [0.01, 0.02],
      spreadCapture: [0.45, 0.65],
      volatilityMultiplier: [0.8, 1.2],
      inventorySkew: [0.02, 0.05]
    }
  });

  assert.equal(result.status, "tuned");
  assert.ok(result.bestConfig.minEdge >= 0.01);
  assert.ok(result.bestMetrics.quoteCount > 0);
  assert.ok(result.bestMetrics.maxAbsInventory <= 500);
  assert.equal(result.candidatesEvaluated, 16);
});
