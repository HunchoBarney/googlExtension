const test = require("node:test");
const assert = require("node:assert/strict");
const qaUtils = require("../scripts/qaUtils");

test("requested KLine verification rejects a smoke run that opened no trade view", () => {
  assert.equal(typeof qaUtils.assertRequestedVerifications, "function");
  assert.throws(
    () => qaUtils.assertRequestedVerifications({
      clickedLinkCheck: { skipped: true, reason: "no matching cards" }
    }, { verifyKline: true }),
    /KLineCharts verification was requested but no trade view was opened/
  );
});

test("requested KLine verification accepts real ready chart evidence", () => {
  assert.equal(typeof qaUtils.assertRequestedVerifications, "function");
  assert.doesNotThrow(() => qaUtils.assertRequestedVerifications({
    clickedLinkCheck: {
      internalTradeView: true,
      controls: {
        klineChart: {
          state: "ready",
          ready: true,
          pointCount: 2,
          canvasCount: 1
        }
      }
    }
  }, { verifyKline: true }));
});

test("requested KLine verification rejects incomplete chart evidence", () => {
  assert.equal(typeof qaUtils.assertRequestedVerifications, "function");
  assert.throws(() => qaUtils.assertRequestedVerifications({
    clickedLinkCheck: {
      internalTradeView: true,
      controls: {
        klineChart: {
          state: "ready",
          ready: true,
          pointCount: 1,
          canvasCount: 0
        }
      }
    }
  }, { verifyKline: true }), /KLineCharts verification did not produce a ready real-data canvas/);
});
