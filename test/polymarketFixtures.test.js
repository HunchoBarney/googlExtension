const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const signals = require("../src/lib/articleSignals");
globalThis.PMArticleSignals = signals;
const polymarket = require("../src/lib/polymarket");

const fixturesDir = path.join(__dirname, "fixtures", "polymarket");

function loadFixture(file) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
}

test("normalizes saved public-search and event API response fixtures", () => {
  const publicSearch = polymarket.flattenPayload(loadFixture("public-search-bitcoin.json"), {
    query: "Bitcoin",
    source: "public-search"
  });
  const events = polymarket.flattenPayload(loadFixture("event-with-markets.json"), {
    query: "Fed interest rates",
    source: "events"
  });

  assert.equal(publicSearch.length, 1);
  assert.equal(publicSearch[0].id, "market-bitcoin-2026");
  assert.equal(publicSearch[0].primaryPercent, 42);
  assert.equal(publicSearch[0].movement.direction, "up");
  assert.equal(publicSearch[0].url, "https://polymarket.com/event/when-will-bitcoin-hit-150k");

  assert.equal(events.length, 2);
  assert.equal(events[0].id, "market-fed-cut");
  assert.equal(events[0].primaryOutcome, "Yes");
  assert.equal(events[1].closed, true);
});

test("normalizes saved market fixture with missing optional fields", () => {
  const candidates = polymarket.flattenPayload(loadFixture("missing-fields-market.json"), {
    query: "BTC Up Down",
    source: "markets"
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].primaryOutcome, "Up");
  assert.equal(candidates[0].secondaryOutcome, "Down");
  assert.equal(candidates[0].primaryPrice, null);
  assert.equal(candidates[0].movement.direction, "unknown");
  assert.equal(candidates[0].image, "");
});
