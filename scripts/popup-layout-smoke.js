#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const {
  artifactPath,
  writeJsonReport
} = require("./qaUtils");

const ROOT = path.join(__dirname, "..");
const FIXTURE_IMAGES = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY+AWUPgPAAGgATv/K5mwAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY+C1rvgPAALZAcCrGfZEAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXYzjpx/EfAAUiAh8zVE9NAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY+C1rvgPAALZAcCrGfZEAAAAAElFTkSuQmCC"
];
const VIEWPORTS = [
  { name: "popup", width: 500, height: 900 },
  { name: "compact", width: 500, height: 510 },
  { name: "mid", width: 390, height: 800 },
  { name: "narrow", width: 320, height: 840 }
];

function chromeExecutable() {
  let bundledChromium = "";
  try {
    bundledChromium = chromium.executablePath();
  } catch (error) {
    bundledChromium = "";
  }
  return [process.env.CHROME_PATH, bundledChromium].filter(Boolean).find((candidate) => fs.existsSync(candidate));
}

function pageHtml() {
  const css = fs.readFileSync(path.join(ROOT, "src/popup/popup.css"), "utf8");
  const render = fs.readFileSync(path.join(ROOT, "src/popup/render.js"), "utf8");
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Popup Layout Smoke</title>
        <style>${css}</style>
      </head>
      <body>
        <main class="popup-shell">
          <header class="popup-header">
            <div class="brand-lockup">
              <svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
                <path d="M8 9.8 30.4 3.5c1.2-.3 2.3.6 2.3 1.8v29.4c0 1.2-1.2 2.1-2.4 1.7L8 28.9V9.8Z" />
                <path d="M8.4 19.7h23.8M8.5 10l23.6 9.7" />
              </svg>
              <div>
                <h1>Polymarket</h1>
                <p>Article Matcher</p>
              </div>
            </div>
            <div class="header-actions">
              <button class="icon-button" id="refresh-button" type="button" title="Run again" aria-label="Run again">
                <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 11a8.1 8.1 0 1 0-2.4 5.8" />
                  <path d="M20 4.8V11h-6.2" />
                </svg>
              </button>
              <button class="icon-button" id="settings-button" type="button" title="Settings" aria-label="Settings">
                <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.3a2 2 0 0 1-4 0V21a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.1 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.7a2 2 0 0 1 0-4H3a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.1l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V2.7a2 2 0 0 1 4 0V3a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.9 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h.3a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
                </svg>
              </button>
            </div>
          </header>
          <form class="market-search" id="market-search-form" role="search">
            <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.2 16.2 4.3 4.3" />
            </svg>
            <input id="market-search-input" type="search" placeholder="Search any market" autocomplete="off" spellcheck="false" aria-label="Search Polymarket markets">
            <button class="search-filter-button" id="market-search-button" type="submit" title="Search markets" aria-label="Search markets">
              <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M4 17h16" />
                <path d="M9 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" />
                <path d="M19 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" />
              </svg>
            </button>
          </form>
          <section id="status-region" class="status-region" aria-live="polite"></section>
          <nav class="market-tabs" aria-label="Market views">
            <button class="tab-button is-active" id="related-tab" type="button" data-tab="related">
              <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="7" />
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
              </svg>
              Related
            </button>
            <button class="tab-button" id="trending-tab" type="button" data-tab="trending">
              <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13.5 2.6C10 5.5 8.3 8.5 8.3 11.5c0 .7.1 1.4.4 2-.8-.5-1.3-1.3-1.5-2.5C5.8 12.5 5 14.1 5 16a7 7 0 0 0 14 0c0-2.8-1.7-4.5-3.1-6.1-1.2-1.4-2.2-2.8-2.4-7.3Z" />
                <path d="M11.1 17.7a2.9 2.9 0 0 0 5.3-1.6c0-1.4-.9-2.3-1.7-3.2-.6-.7-1.1-1.4-1.2-2.7-1.5 1.3-2.3 2.6-2.3 3.9 0 .5.1.9.3 1.3-.5-.3-.9-.8-1-1.5-.7.7-1 1.4-1 2.2 0 .6.2 1.2.6 1.6Z" />
              </svg>
              Trending
            </button>
            <button class="tab-button" id="search-tab" type="button" data-tab="search">
              <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.3 4.3" />
              </svg>
              Search
            </button>
          </nav>
          <section id="results-region" class="results-region" aria-label="Prediction market matches"></section>
          <footer class="privacy-footer">
            <span class="footer-shield" aria-hidden="true"></span>
            <span>Read only <span class="footer-dot">&bull;</span> Matched locally <span class="footer-dot">&bull;</span> No data leaves device</span>
            <button class="footer-info" id="privacy-info-button" type="button" title="Privacy details" aria-label="Privacy details">i</button>
          </footer>
        </main>
        <script>${render}</script>
      </body>
    </html>`;
}

async function renderFixture(page) {
  await page.evaluate((fixtureImages) => {
    const renderer = window.PMRender;
    const status = document.getElementById("status-region");
    const results = document.getElementById("results-region");
    renderer.renderStatus(status, "complete", "Local scan complete", "4 related events found");
    renderer.renderArticleContext(results, {
      title: "Bitcoin preps 3% May downside, but US PMI data may boost BTC price",
      topic: { label: "crypto" },
      entities: { top: [{ text: "Bitcoin" }, { text: "US PMI" }] },
      keywords: [{ text: "bitcoin" }, { text: "pmi data" }]
    });
    renderer.renderResults(results, [
      {
        id: "bitcoin-may-31",
        eventId: "bitcoin-may-event",
        eventTitle: "Bitcoin above __ on May 31?",
        title: "Bitcoin above __ on May 31?",
        url: "https://polymarket.com/event/bitcoin-above-on-may-31",
        image: fixtureImages[0],
        primaryOutcome: "Yes",
        secondaryOutcome: "No",
        primaryPrice: 0.71,
        secondaryPrice: 0.29,
        primaryPercent: 71,
        outcomeOptions: [
          { label: "Yes", price: 0.71, percent: 71 },
          { label: "No", price: 0.29, percent: 29 }
        ],
        category: "Price",
        endDate: "2025-05-31T23:59:00Z",
        movement: { direction: "up", value: 0.03 },
        confidence: 92,
        traderCount: 12600,
        volume: 2400000
      },
      {
        id: "us-pmi-may",
        eventId: "pmi-may-event",
        eventTitle: "US PMI (May) above 50?",
        title: "US PMI (May) above 50?",
        url: "https://polymarket.com/event/us-pmi-may-above-50",
        image: fixtureImages[1],
        primaryOutcome: "Yes",
        secondaryOutcome: "No",
        primaryPrice: 0.64,
        secondaryPrice: 0.36,
        primaryPercent: 64,
        outcomeOptions: [
          { label: "Yes", price: 0.64, percent: 64 },
          { label: "No", price: 0.36, percent: 36 }
        ],
        category: "Macro",
        endDate: "2025-05-31T23:59:00Z",
        movement: { direction: "flat", value: 0 },
        confidence: 78,
        traderCount: 8700,
        volume: 1800000
      },
      {
        id: "bitcoin-price-may",
        eventId: "bitcoin-price-may-event",
        eventTitle: "Bitcoin price on May 31?",
        title: "Bitcoin price on May 31?",
        url: "https://polymarket.com/event/bitcoin-price-on-may-31",
        image: fixtureImages[2],
        primaryOutcome: "Yes",
        secondaryOutcome: "No",
        primaryPrice: 0.58,
        secondaryPrice: 0.42,
        primaryPercent: 58,
        outcomeOptions: [
          { label: "Yes", price: 0.58, percent: 58 },
          { label: "No", price: 0.42, percent: 42 }
        ],
        category: "Price",
        endDate: "2025-05-31T23:59:00Z",
        movement: { direction: "flat", value: 0 },
        confidence: 71,
        traderCount: 9300,
        volume: 1200000
      },
      {
        id: "fed-cuts-june",
        eventId: "fed-cuts-event",
        eventTitle: "Will Fed cut rates by June 18?",
        title: "Will Fed cut rates by June 18?",
        url: "https://polymarket.com/event/fed-cuts-rates-by-june-2025",
        image: fixtureImages[3],
        primaryOutcome: "Yes",
        secondaryOutcome: "No",
        primaryPrice: 0.43,
        secondaryPrice: 0.57,
        primaryPercent: 43,
        outcomeOptions: [
          { label: "Yes", price: 0.43, percent: 43 },
          { label: "No", price: 0.57, percent: 57 }
        ],
        category: "Rates",
        endDate: "2025-06-18T23:59:00Z",
        movement: { direction: "flat", value: 0 },
        confidence: 56,
        traderCount: 6100,
        volume: 892000
      }
    ], {
      title: "Related markets",
      detail: "Best match",
      showMatchLimitNote: false
    });
  }, FIXTURE_IMAGES);
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflowingElements = [...document.querySelectorAll("body *")]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.right > viewportWidth + 1 || rect.left < -1;
      })
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        className: node.className,
        text: node.textContent.trim().slice(0, 80),
        left: node.getBoundingClientRect().left,
        right: node.getBoundingClientRect().right
      }));
    return {
      viewportWidth,
      viewportHeight: window.innerHeight,
      documentWidth,
      documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      overflowingElements,
      cardCount: document.querySelectorAll(".market-card").length,
      groupCount: document.querySelectorAll(".event-group").length,
      childCardCount: document.querySelectorAll(".event-child-cards .market-card").length,
      articlePreviewCount: document.querySelectorAll(".article-context").length,
      fallbackIconCount: document.querySelectorAll(".market-card .market-image-fallback").length,
      remoteImageCount: document.querySelectorAll(".market-card img.market-image").length,
      loadedRemoteImageCount: [...document.querySelectorAll(".market-card img.market-image")].filter((image) => image.complete && image.naturalWidth > 0).length,
      matchLimitCount: document.querySelectorAll(".match-limit-note").length,
      searchPlaceholder: document.querySelector("#market-search-input")?.getAttribute("placeholder") || "",
      activeTabText: document.querySelector(".tab-button.is-active")?.textContent.trim() || "",
      privacyText: document.querySelector(".privacy-footer")?.textContent.replace(/\s+/g, " ").trim() || "",
      shellRect: document.querySelector(".popup-shell")?.getBoundingClientRect().toJSON(),
      resultsRect: document.querySelector("#results-region")?.getBoundingClientRect().toJSON(),
      footerRect: document.querySelector(".privacy-footer")?.getBoundingClientRect().toJSON(),
      visibleCardCount: [...document.querySelectorAll(".market-card")]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          const results = document.querySelector("#results-region").getBoundingClientRect();
          return rect.top >= results.top - 1 && rect.bottom <= results.bottom + 1;
        }).length,
      statusText: document.querySelector("#status-region").innerText,
      bodyText: document.body.innerText.slice(0, 500)
    };
  });
}

async function main() {
  const chromePath = chromeExecutable();
  if (!chromePath) {
    throw new Error("Chrome/Chromium was not found. Run `npx playwright-core install chromium` or set CHROME_PATH.");
  }

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const report = {
    generatedAt: new Date().toISOString(),
    chromePath,
    viewports: []
  };

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: {
          width: viewport.width,
          height: viewport.height
        }
      });
      await page.setContent(pageHtml(), { waitUntil: "domcontentloaded" });
      await renderFixture(page);
      const screenshot = artifactPath(`popup-layout-${viewport.name}`, "png");
      await page.screenshot({ path: screenshot, fullPage: true });
      const layout = await inspectLayout(page);
      report.viewports.push({
        ...viewport,
        screenshot,
        ...layout
      });
      await page.close();

      if (layout.documentWidth > viewport.width) {
        throw new Error(`${viewport.name} layout overflowed horizontally: document width ${layout.documentWidth}, viewport ${viewport.width}`);
      }
      if (layout.footerRect && layout.footerRect.bottom > layout.shellRect.bottom + 1) {
        throw new Error(`${viewport.name} footer was clipped vertically: footer bottom ${layout.footerRect.bottom}, shell bottom ${layout.shellRect.bottom}`);
      }
      if (layout.resultsRect && layout.footerRect && layout.resultsRect.bottom > layout.footerRect.top + 1) {
        throw new Error(`${viewport.name} scrolling results region overlaps footer: results bottom ${layout.resultsRect.bottom}, footer top ${layout.footerRect.top}`);
      }
      if (layout.overflowingElements.length) {
        throw new Error(`${viewport.name} layout has overflowing elements: ${JSON.stringify(layout.overflowingElements.slice(0, 3))}`);
      }
      if (layout.cardCount !== 4) {
        throw new Error(`${viewport.name} layout rendered ${layout.cardCount} parent cards instead of 4.`);
      }
      if (viewport.name === "popup" && layout.shellRect.height < 700) {
        throw new Error(`${viewport.name} layout shell was too short for the target popup surface: ${layout.shellRect.height}`);
      }
      if (layout.articlePreviewCount !== 0) {
        throw new Error(`${viewport.name} layout repeated article preview content.`);
      }
      if (layout.remoteImageCount !== layout.cardCount || layout.loadedRemoteImageCount !== layout.cardCount || layout.fallbackIconCount !== 0) {
        throw new Error(`${viewport.name} layout did not use loaded API images for every market card: ${JSON.stringify({ fallbackIconCount: layout.fallbackIconCount, remoteImageCount: layout.remoteImageCount, loadedRemoteImageCount: layout.loadedRemoteImageCount, cardCount: layout.cardCount })}`);
      }
      if (layout.matchLimitCount !== 0) {
        throw new Error(`${viewport.name} layout rendered ${layout.matchLimitCount} no-strong-match rows instead of 0.`);
      }
      if (layout.searchPlaceholder !== "Search any market") {
        throw new Error(`${viewport.name} layout missing target search placeholder: ${layout.searchPlaceholder}`);
      }
      if (layout.activeTabText !== "Related") {
        throw new Error(`${viewport.name} layout active tab was ${layout.activeTabText} instead of Related.`);
      }
      if (viewport.name === "compact" && layout.visibleCardCount < 2) {
        throw new Error(`${viewport.name} layout only showed ${layout.visibleCardCount} full market card(s) above the footer.`);
      }
      if (!/Read only\s+.\s+Matched locally\s+.\s+No data leaves device/.test(layout.privacyText)) {
        throw new Error(`${viewport.name} layout missing target privacy footer copy: ${layout.privacyText}`);
      }
      if (!/Local scan complete/.test(layout.statusText)) {
        throw new Error(`${viewport.name} layout missing target local scan copy: ${layout.statusText}`);
      }
      if (layout.groupCount !== 0 || layout.childCardCount !== 0) {
        throw new Error(`${viewport.name} layout rendered child-market dropdown content.`);
      }
    }
  } finally {
    await browser.close();
  }

  const file = writeJsonReport("popup-layout-smoke", report);
  console.log(`Wrote ${file}`);
  for (const viewport of report.viewports) {
    console.log(`${viewport.name}: ${viewport.width}px wide, screenshot ${viewport.screenshot}`);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
