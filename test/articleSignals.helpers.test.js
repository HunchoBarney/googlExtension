"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const signals = require("../src/lib/articleSignals");

test("articleSignals exposes shared token helpers", () => {
  assert.equal(typeof signals.tokenSequenceIncludes, "function");
  assert.equal(typeof signals.entitySearchKeys, "function");
});

test("tokenSequenceIncludes only matches contiguous sequences", () => {
  assert.equal(
    signals.tokenSequenceIncludes(["fed", "cuts", "rates"], ["cuts", "rates"]),
    true
  );
  assert.equal(
    signals.tokenSequenceIncludes(["fed", "cuts", "rates"], ["fed", "rates"]),
    false
  );
});

test("entitySearchKeys canonicalizes and deduplicates aliases", () => {
  assert.deepEqual(
    signals.entitySearchKeys({
      text: " Federal Reserve ",
      aliases: ["Fed", "federal reserve", "Fed"]
    }),
    ["federal reserve", "fed"]
  );
});
