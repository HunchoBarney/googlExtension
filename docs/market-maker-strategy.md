# Market-Making Strategy

This repo now includes an offline quote-planning strategy in `src/lib/marketMaker.js`.
It does not place orders, sign transactions, or require trading credentials.

## Inputs

- Polymarket CLOB-style book rows: `{ bids: [{ price, size }], asks: [{ price, size }] }`
- Price history rows: `{ t, p }`
- Current token inventory: `{ shares, cash }`
- Risk/tuning config such as `minEdge`, `spreadCapture`, `inventorySkew`, and `maxInventory`

## Quote Logic

1. Normalize bid/ask depth and recent price history.
2. Estimate fair value from top-of-book microprice plus recent history and a bounded momentum adjustment.
3. Build a reservation price by skewing fair value against inventory:
   - Long inventory shifts quotes lower, reducing bid size and making asks more aggressive.
   - Short inventory shifts quotes higher, reducing ask size and making bids more aggressive.
4. Set bid/ask prices around reservation value using the largest of:
   - configured minimum edge,
   - captured share of observed spread,
   - recent volatility buffer.
5. Clamp quotes to valid prediction-market prices and tick size.
6. Enforce risk limits:
   - no crossing quotes,
   - per-quote notional cap,
   - max quote size,
   - top-of-book depth participation cap,
   - one-sided liquidation behavior near max inventory.

## Tuning

Run:

```sh
npm run tune:market-maker
```

Optional JSON input:

```sh
node scripts/tune-market-maker.js --input=path/to/samples.json --json
```

The input may be either an array of samples or `{ "samples": [...] }`. Each sample can contain:

```json
{
  "id": "example-market",
  "history": [{ "t": 1780000000, "p": 0.5 }],
  "book": {
    "bids": [{ "price": 0.49, "size": 1000 }],
    "asks": [{ "price": 0.51, "size": 1000 }]
  }
}
```

The tuner grid-searches strategy parameters and scores each candidate with a deterministic fill simulator. The objective rewards mark-to-market PnL and penalizes drawdown plus inventory accumulation. It is useful for comparing parameter sets, not for proving live profitability.
