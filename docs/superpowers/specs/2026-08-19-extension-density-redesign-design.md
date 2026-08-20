# Extension-Wide Density Redesign

Date: 2026-08-19

Status: Visual direction selected; ready for implementation planning after user review

## Selected Direction

Direction 1 is the visual source of truth:

[Open the selected visual](assets/2026-08-19-extension-density-direction-1.png)

The redesign preserves the extension's existing dark trading identity while making the interface feel approximately 35% less zoomed in. It uses Manrope, compact rounded panels, a disciplined 4px and 8px spacing rhythm, a chart-dominant trade layout, and denser market data.

The 35% value is an optical density target, not a blanket CSS transform. Small text and interactive targets keep readability and usability floors rather than shrinking mathematically.

## Goals

1. Apply one coherent typography, spacing, radius, and control system to every existing extension screen and state.
2. Make the UI feel calmer and less enlarged while preserving clear hierarchy.
3. Give live charts materially more room without hiding orderbook rows or introducing trade-view scrolling.
4. Fit more useful market information on screen at 500px, 390px, and 320px widths.
5. Preserve all current Polymarket and Hyperliquid data, streaming, interactions, labels, and venue behavior.

## Non-Goals

- No changes to market discovery, ranking, WebSocket, chart-series, pricing, or orderbook logic.
- No new screens, routes, tabs, controls, or trading features.
- No change to the 500px trade-popup width or 600px trade-popup height.
- No remote font requests or new runtime UI framework.
- No broad rewrite of `popup.js`, `render.js`, or `klinecharts.js`.

## Scope

The system applies to every currently rendered popup surface:

| Surface | Included states |
| --- | --- |
| Shared chrome | Search, profile/menu button, action menu, tabs, focus, hover, pressed, and disabled states |
| Relevant Markets | Loading, scan status, collapsed cards, expanded cards, grouped outcome rows, pagination, and no-match state |
| Trending | Loading, populated results, empty results, and errors |
| Watchlist | Populated results, empty state, and errors |
| Utility feedback | Refresh, profile, settings, privacy/information, status messages, and API failure messages |
| Polymarket trade | Loading, live, unavailable, and error chart/book states; Yes/No selection; range selection; trade action menu |
| Hyperliquid trade | Loading, live, unavailable, and error chart/book states; Long/Short selection; range selection; trade action menu |
| Responsive layouts | 500px popup, 500px compact height, 390px mid width, 320px narrow width, and 500x600 trade mode |

## Design System

### Typography

Manrope becomes the only visible UI family. It is bundled locally as a variable WOFF2 asset so the Manifest V3 popup makes no remote font request.

```css
font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

The implementation will define a small type scale instead of individually tuning every selector:

| Token | Target | Use |
| --- | ---: | --- |
| `--text-2xs` | 10px | Secondary timestamps and low-priority metadata |
| `--text-xs` | 11px | Table headers, badges, and status details |
| `--text-sm` | 12px | Body copy, card metadata, and orderbook values |
| `--text-md` | 13px | Tabs, buttons, and market titles |
| `--text-lg` | 15px | Section headings and primary quotes |
| `--text-xl` | 17px | Highest-level popup heading when present |

Market prices and depth values use tabular numerals. Persistent data text does not fall below 11px. Font weights stay within the bundled variable range and use hierarchy before raw size.

### Spacing

All spacing resolves to the following rhythm:

| Token | Value |
| --- | ---: |
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |

Major groups use 12px to 16px separation. Controls and data rows use 4px to 8px internal spacing. Optical alignment may use a 1px correction where icon geometry requires it.

### Shape and Surfaces

| Token | Value | Use |
| --- | ---: | --- |
| `--radius-sm` | 8px | Small controls and data fills |
| `--radius-md` | 12px | Menus and compact grouped controls |
| `--radius-lg` | 14px | Market, chart, ticket, and orderbook panels |
| `--radius-pill` | 999px | Segmented selections and circular actions only |

The current dark charcoal palette, lime bid/positive color, red ask/negative color, and venue badge colors remain unchanged. Panels use subtle one-pixel borders and low-contrast surface separation. Heavy shadows and nested-card appearance are removed.

### Interaction Targets

Visible icons shrink to roughly 16px to 18px, but primary icon-button hit areas remain at least 40x40px. Other desktop popup controls remain at least 36px high. Focus rings, keyboard order, ARIA labels, and menu semantics remain intact.

## Screen Design

### Shared Popup Chrome

- Preserve the 500px outer width and current dark shell.
- Reduce outer insets to a consistent 16px system and internal gaps to 8px or 12px.
- Use a 36px search field with 13px Manrope text.
- Use a 40px profile/menu target with an 18px visible icon.
- Keep the three tabs on one row at every supported width. Each tab owns one equal grid column so labels cannot overlap at 320px.
- Reduce menu row height, icon size, padding, and radius while preserving menu text and behavior.

### Loading, Status, Empty, and Error States

- Use the same compact type and spacing tokens as populated views.
- Preserve existing state wording and semantics.
- Keep loading animation behavior and reduced-motion fallback.
- Avoid oversized empty-state padding. Keep the primary message visually distinct from supporting detail.

### Market Results

- Reduce a normal collapsed card from the current oversized treatment to approximately 72px to 76px tall at 500px width.
- Use approximately 52px to 56px market artwork, a 13px two-line title, a 15px primary quote, and 11px movement text.
- Use 8px gaps between cards and a 14px card radius.
- Keep the chevron and source badge visually smaller while preserving their clickable region.
- Apply the same density to Polymarket and Hyperliquid cards.
- Expanded cards retain the current information order and animation but use the compact tokens for artwork, outcome rows, labels, and spacing.

### Trade View

Trade mode remains exactly 500x600 and keeps the orderbook directly underneath the chart and side selector.

Target vertical composition:

| Region | Target height |
| --- | ---: |
| Market header | 52px |
| Chart card including ranges | 280px to 286px |
| Yes/No or Long/Short selector | 40px to 42px |
| Orderbook | 174px to 180px |
| Inter-panel gaps | 8px |

These ranges fill the existing 578px trade content box. The exact CSS grid values may adjust by a few pixels during visual verification, but the chart plot must be at least 235px tall and all ten orderbook rows must remain visible without scrolling.

Trade details:

- Use approximately 44px market artwork, a 14px title, and 11px metadata.
- Preserve Back and More as 40px targets with smaller visible glyphs.
- Keep the live-state label legible but visually secondary.
- Keep range buttons in one slim segmented row.
- Keep the selected Yes/No or Long/Short side clear through color, border, and weight, not oversized height.
- Use 15px Bids/Asks headings, 10px to 11px headers, 11px to 12px tabular values, and approximately 18px rows.
- Preserve real depth-bar animation and reduced-motion behavior.
- Preserve red chart styling for No and Short outcomes.

## Responsive Behavior

The redesign is authored from shared tokens and then adjusted at existing breakpoints. It must not create a separate visual system per width.

- **500px:** full compact layout and four useful result rows visible without visual crowding.
- **390px:** artwork and quote columns tighten while titles retain two readable lines.
- **320px:** tabs remain separated, search and menu remain usable, cards use the smaller artwork tier, and no text or chevron overlaps.
- **500x600 trade:** no horizontal or vertical document overflow; chart, selector, and all ten book rows remain visible.

The UI must reflow through grid sizing and token overrides. A global `transform: scale()` or browser zoom is not allowed because it would blur text, break hit testing, and distort popup dimensions.

## Implementation Boundaries

The expected production diff is `src/popup/popup.css` plus a local Manrope WOFF2 asset and its license. Existing markup and renderer output are reused. No separate token module, styling runtime, component layer, or UI dependency is introduced.

Do not edit `popup.html`, `popup.js`, `render.js`, or `klinecharts.js` unless a failing acceptance test proves CSS cannot meet a requirement. Any such exception must be smaller than duplicating layout logic and must not alter data flow, event wiring, labels, URLs, or state behavior.

No new styling dependency is needed. The existing native CSS architecture remains the foundation.

## Testing Strategy

Implementation follows test-driven development.

1. Extend `scripts/popup-layout-smoke.js` first and verify it fails against the current UI.
2. Assert computed Manrope usage and the shared compact metrics on representative elements.
3. Assert cards, tabs, menus, empty/error/loading states, and expanded results do not clip or overlap at 500px, 390px, and 320px.
4. Assert the 500x600 trade chart plot is at least 235px tall, all ten book rows are visible, and the results region does not scroll.
5. Preserve existing Polymarket and Hyperliquid functional assertions.
6. Run the full unit suite, layout smoke suite, and packaged Chrome smoke flow with a real KLine chart.
7. Compare fresh screenshots of the implemented main and trade screens against the selected Direction 1 visual at matching states and dimensions.

## Acceptance Criteria

- Every existing popup screen and state uses locally bundled Manrope.
- The visible UI is approximately 35% more compact while persistent text remains readable.
- Spacing consistently follows the 4px and 8px rhythm.
- Shared panels use the compact 8px, 12px, and 14px radius system.
- Main results, menus, loading, empty, error, expanded, Polymarket, and Hyperliquid surfaces share the same density system.
- No tab, title, value, chevron, menu, or market artwork overlaps at supported widths.
- Trade mode remains 500x600, has a materially larger chart, displays five bids and five asks, and needs no scrolling.
- Streaming, chart, orderbook, selection, range, menu, refresh, Back, and venue-link behavior is unchanged.
- Automated layout, unit, and packaged-browser verification pass with fresh evidence.
