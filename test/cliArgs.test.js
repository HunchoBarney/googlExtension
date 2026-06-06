"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createArgReader } = require("../scripts/cliArgs");

test("createArgReader returns the first matching value by default", () => {
  const args = createArgReader([
    "node",
    "script.js",
    "--limit=4",
    "--limit=9"
  ]);

  assert.equal(args.argValue("limit", "0"), "4");
});

test("createArgReader can prefer the last matching value", () => {
  const args = createArgReader([
    "node",
    "script.js",
    "--limit=4",
    "--limit=9"
  ], {
    preferLastValue: true
  });

  assert.equal(args.argValue("limit", "0"), "9");
});

test("argNumber preserves existing positive-only validation when requested", () => {
  const args = createArgReader([
    "node",
    "script.js",
    "--limit=0",
    "--max-attempts=6",
    "--timeout-ms=2500"
  ], {
    preferLastValue: true
  });

  assert.equal(args.argNumber("limit", 8, { positiveOnly: true }), 8);
  assert.equal(args.argNumber("max-attempts", 3, { positiveOnly: true }), 6);
  assert.equal(args.argNumber("timeout-ms", 1000), 2500);
});

test("hasFlag reports bare boolean switches", () => {
  const args = createArgReader([
    "node",
    "script.js",
    "--save-failures"
  ]);

  assert.equal(args.hasFlag("save-failures"), true);
  assert.equal(args.hasFlag("headed"), false);
});
