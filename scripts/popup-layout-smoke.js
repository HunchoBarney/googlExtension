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
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAB80lEQVR42u3bwU3DMBQG4MyAGACJDThwYgfmYBLEbgwE4gDtoVKoWnDsFzuxvye9S+sq6v/VstO60+3Dy/ee++Pza9c9AQAAAAAAAAAAAAAAAAAAAAAAbBDg/um1agMAAAAAgH0AHCs12NSxABIB5pUSfupYAAkAlyol/BQEAGaANQCAXRAAAAAAAACwP4DSnRGAAoCIewMAmQBRd8c1AI5lBjSaAfOyBlReAy6VXdCKADdvz7/6Up2PARAAcB7qEoBaEF0CXAszB2BtiG4AUkIsAZi/FsAZwNIgcwHWWLR3D5ATZtRrABw6J9Co8cMD5IYaORZARrCR44Y9nFvy6Y4aE4HQHUBKeKXPDw9QutXMfW4NBAAA4sP/L8ylj6c2gESE1Fp6LQCBCDnXARCEkHuN7gG2Xu93j4t7En5bhEn4bRHMADPAGmAXFLQLAtD4PgBA4zthAI2/CxoCYKvfhuaEDwBAH7+I5YbfJUCL34SHBNjKqYiS8LsCaHUuaGiA1ifjSsPvAqDl2VAAhz6+iRanoyPC7wbghFDr/wFR4XcFMO81ACJD7x7gP4hae/zhAa5B1NjfA/ij19rRAMhEaBX+0AAnhJbhDw+whQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOgT4Ae2umEuuaN/rwAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFgklEQVR42u3c1XdUVxTH8fPaV7xoIxAj7kKUOFHi7i7EsJTg7u7uhOKS4sW1UFt1YbV96V/Qt1/P0AUL6CRMhjvd997ZD/spb5/vXWcmZ865YvqfzzDtj6eY+vvnmPr8CTqeP0bHb4/Q/utDtP/yAG0/30fbT/fQ+uNdtP5wBy3f30bLd7cx5dtbaP7mppzP0PT1DTR9dR2NX15D4xdX0fDsChqeXkb9k0tyPkXd4x7UPepB7cOLqHlwATX3z6P63jlU3z2LqjtnUHX7NCpvnULlzZOouHFCzicovy7n2nGUXe1G6ZVjKL18FCWXjqCk5zCKew6h+OJBFF04gKLz+1F4bh8Kz+5FwRk5p/cg/9Ru5J/chbwTO5F7fAdyu7cjp3sbco5tRfbRLcg+shlZhzch69BGZB6Uc2ADMvavR8a+dZi8dy3S96xB+u7VSNu1Cmk7VyJ1xwqkbl+OlG3LkLJ1GZK3LEXy5iVI2rQYSRsXYdKGhUhcvwCJ6+YjYe08JKyZi/hVc+TMRtzKLsSt6ELs8lmIXfYxYpZ2ImbJTEQvnoHoRdMhGJ8Of+LCaRCMT4cftWCqDMD4ZPhR8zsgGJ8OP3JeuwzA+GT4kXPbIBifDj9iTqsMwPhk+BGzZQDGp8MP72qRARifDD981hQIxqfDD+tslgEYnww/rLMJgvHp8ENnNsoAjE+GHzqjAYLx6fAnTK+HYHw6/JBpdYYAjE+FH9JRC8H4dPjBHTUyAOO/gf+B3ZhXY2n84PZqCMaf/wZ6b2MJ/KA2QwArxjcF/vVRGj+otQrCGvH7Qv4Lf7+at/+mNH5gS6UMwPj/ge8tgtL4gc0VENaO3xt8bxGUxA9oLjcEYHwq/ICmMgjGNw3/RQCF8f0bS2UAxn8n/MtRGt+/oQSC8d8Nbyl8v/piCMbvG94Sy85LfN/aIhmA8Y3DW+AD921839pCCMZ/c5T+nt8Xvk9NgQyg8+0FNeP7VOdDMD4dvneVIQDjk+F7V+ZB6HVLWQv4XhW5MoCV4BsLQI3vVZ4Dwfh0+J5l2YYA2v4Z0ZylRy34niVZEHrHN7qpphJ8j5JMGYDxyfA9ijMg9HB6wdSlR2347kWTIfSK/3/t578PvlthugzA+GT4bgVpEFo7sWbW0qNSfNe8VBlAZ/jGAqgV3zUvBYLx6fDH5xoCaOSgrDlLj9rxx+ckQ+gF32gAleO7ZCfJABo4Iq5XfJesSRBawjd56dEIvnNmogygcXxjAbSC75yRAKEVfFOffi3hO02OlwFUei3InKdfa/hO6XEQesF/EUBj+I5psTIA45PhO6bGQKgZvz8/rmsR3yElGkJr+MYCaBV/XPJEGUAl93CtEX9ckgzATz4d/thJUTKARvH/DaBt/LGJkRCMT4dvnxAhA6jgP9z+3lzRC759fDiEGm6gWyu+XVyYDKAQfn/Rzbkspzd8u9hQCAp8c66IGkZv+LYxE2QAC+CbAtzfO1t6xLeNDoFQ+k4W45uObzMxWAZQ8ANXaXw9rvmv49tEBUFQ4/f21FsD/keRgRBKnlJWAt6a8MdEBMgAFjqrac7XUj3s7fQHf0y4DKD0iTVzRqs/prwv/uhQfxnAgtsLfb78QkNHRyyFPzrUD0Lp92pa8gV3esMfNcFXBlDxS031jj8qxAeC8enwRwZ7ywCMT4Y/MsgLgvHp8EcEeMoAjE+GP8LfA4Lx6fCH+7vLAIxPhj/czw2C8enwP/R1hWB8OvxhPuNlAMYnwx/mLQMwPh3+UE8XGYDxyfCHejpDMD4d/hAPJ0MAxqfCH+LuCMH4dPiD3RxkAMYnwx/sOg6C8enwB7mMlQEYnwx/kLM9BOPT4Q90tpMBGJ8Mf6CTLQTj0+EPcLSRARifDH+Agw3+AaS9Uc6r/WIvAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACDklEQVR42u3cS24CMQyA4Vn3Gl33JuWevQ3b3oZqdhUaEuJH7MR/pGwQE4Q/nNeEOe6fX4+V68f3z9L1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAoz5+bwBEAJyBf64AAFAD4Cr4VggAkAEAAMAsiHUAAAAAYFXPAkAQwP8CAAD6GUzvGm2bJQAkc/jeNVZtWvfpowBaqO0BJAF99/0W2XJ47OP0rrFuMyKoVl1VmS4IgECAVsBGisdAXWYW5FVYBwinmBmC7wYg3fGUXBedAVPGAO89f829gujgu09DVwBoBWBmkSzWjuj7vtr7xa0gRJTW52+dAVdfNgpgJDumA7x6TTsGWP1ye69Zjw/TZkFSnNFB2BpAk1VlT0V4BVzSfsmDWdKBsnWt5jNKZYC227F4b+kuyHLmop1RlTyYpQ22FVpaAO/NOM1CSbvQCgOw/lX32t2hmAB49eutdncqSwKQAc5z+9F2S48BURnALGhhgC3XAbNnQayEk9+UHw3Mu7/8pfeCMgGU2w3NtBL2Cnj5Log7YoEA3BMOrJyKSJIB5c8FZT4bWuZkXObDuSXOhq7wL0mOp290PJ0MUABo93YAUIwBS/1LEgAATKehkf8rLp8BXgElA3haCgAAAMATswDgmXEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkqn+ijf7moaLldwAAAABJRU5ErkJggg==",
  "data:image/png;base64,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"
];
const VIEWPORTS = [
  { name: "popup", width: 500, height: 850 },
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
  const popup = fs.readFileSync(path.join(ROOT, "src/popup/popup.html"), "utf8");
  return popup
    .replace('<link rel="stylesheet" href="./popup.css">', `<style>${css}</style>`)
    .replace(/\s*<script src="[^"]+"><\/script>/g, "")
    .replace("</body>", () => `<script>${render}</script></body>`);
}

async function renderFixture(page) {
  await page.evaluate((fixtureImages) => {
    const renderer = window.PMRender;
    const status = document.getElementById("status-region");
    const results = document.getElementById("results-region");
    renderer.renderStatus(status, "complete", "Local scan complete", "4 related events found");
    renderer.renderArticleContext(results, {
      title: "US and Iran negotiations continue after permanent peace deal talks",
      cleanText: "Iran negotiations, diplomacy, ceasefire talks, and a permanent peace deal are the central market angle.",
      topic: { label: "politics" },
      entities: { top: [{ text: "Iran" }, { text: "United States" }] },
      keywords: [{ text: "iran negotiations" }, { text: "peace deal" }]
    });
    const candidates = [
      {
        id: "iran-peace-deal",
        eventId: "iran-peace-deal-event",
        eventTitle: "US x Iran permanent peace deal by...?",
        title: "US x Iran permanent peace deal by...?",
        question: "Will the US and Iran reach a permanent peace deal in 2026?",
        url: "https://polymarket.com/event/us-x-iran-permanent-peace-deal-by",
        image: fixtureImages[0],
        category: "Politics",
        endDate: "2026-12-31T23:59:00Z",
        confidence: 92,
        traderCount: 12600,
        volume: 261000000,
        markets: [
          {
            title: "US x Iran permanent peace deal by June 15?",
            endDate: "2026-06-15T23:59:00Z",
            outcomeOptions: [{ label: "Yes", price: 0.08, percent: 8 }],
            movement: { direction: "down", value: 0.02 }
          },
          {
            title: "US x Iran permanent peace deal by June 30?",
            endDate: "2026-06-30T23:59:00Z",
            outcomeOptions: [{ label: "Yes", price: 0.18, percent: 18 }],
            movement: { direction: "up", value: 0.03 }
          },
          {
            title: "US x Iran permanent peace deal by July 31?",
            endDate: "2026-07-31T23:59:00Z",
            outcomeOptions: [{ label: "Yes", price: 0.29, percent: 29 }],
            movement: { direction: "down", value: 0.21 }
          },
          {
            title: "US x Iran permanent peace deal by August 31?",
            endDate: "2026-08-31T23:59:00Z",
            outcomeOptions: [{ label: "Yes", price: 0.43, percent: 43 }],
            movement: { direction: "up", value: 0.02 }
          },
          {
            title: "US x Iran permanent peace deal by December 31?",
            endDate: "2026-12-31T23:59:00Z",
            outcomeOptions: [{ label: "Yes", price: 0.68, percent: 68 }],
            movement: { direction: "up", value: 0.04 }
          }
        ]
      },
      {
        id: "brent-crude-july",
        eventId: "brent-crude-event",
        eventTitle: "Brent crude above $95 by Jul 31?",
        title: "Brent crude above $95 by Jul 31?",
        url: "https://app.hyperliquid.xyz/trade/BRENT",
        image: fixtureImages[1],
        displayValue: "$95.12",
        displayDetail: "$28M 24h volume",
        markPrice: 95.12,
        primaryOutcome: "Mark",
        secondaryOutcome: "24h",
        primaryPrice: null,
        secondaryPrice: null,
        primaryPercent: null,
        outcomeOptions: [],
        category: "Energy",
        marketSource: "Hyperliquid",
        sourceLabel: "Hyperliquid",
        source: "hyperliquid",
        endDate: "2026-07-31T23:59:00Z",
        movement: { direction: "up", value: 0.05 },
        confidence: 78,
        traderCount: 8700,
        volume: 1800000,
        raw: {
          context: {
            markPx: "95.12"
          }
        }
      },
      {
        id: "china-taiwan-2027",
        eventId: "china-taiwan-event",
        eventTitle: "China invades Taiwan before 2027?",
        title: "China invades Taiwan before 2027?",
        url: "https://polymarket.com/event/china-invades-taiwan-before-2027",
        image: fixtureImages[2],
        primaryOutcome: "Yes",
        secondaryOutcome: "No",
        primaryPrice: 0.12,
        secondaryPrice: 0.88,
        primaryPercent: 12,
        outcomeOptions: [
          { label: "Yes", price: 0.12, percent: 12 },
          { label: "No", price: 0.88, percent: 88 }
        ],
        category: "Geopolitics",
        endDate: "2026-12-31T23:59:00Z",
        movement: { direction: "down", value: 0.01 },
        confidence: 71,
        traderCount: 9300,
        volume: 1200000
      },
      {
        id: "hormuz-traffic",
        eventId: "hormuz-traffic-event",
        eventTitle: "Strait of Hormuz traffic normal by end of June?",
        title: "Strait of Hormuz traffic normal by end of June?",
        url: "https://polymarket.com/event/strait-of-hormuz-traffic-normal-by-end-of-june",
        image: fixtureImages[3],
        primaryOutcome: "Yes",
        secondaryOutcome: "No",
        primaryPrice: 0.32,
        secondaryPrice: 0.68,
        primaryPercent: 32,
        outcomeOptions: [
          { label: "Yes", price: 0.32, percent: 32 },
          { label: "No", price: 0.68, percent: 68 }
        ],
        category: "Energy",
        endDate: "2026-06-30T23:59:00Z",
        movement: { direction: "up", value: 0.02 },
        confidence: 56,
        traderCount: 6100,
        volume: 892000
      }
    ];
    window.__LAYOUT_CANDIDATES = candidates;
    renderer.renderResults(results, candidates, {
      title: "Related markets",
      detail: "Best match",
      showMatchLimitNote: false
    });
  }, FIXTURE_IMAGES);
}

async function renderTradeFixture(page, candidateIndex = 0) {
  await page.evaluate((index) => {
    const shell = document.querySelector(".popup-shell");
    const results = document.getElementById("results-region");
    if (shell) {
      shell.classList.add("is-trade-view");
    }
    window.PMRender.renderTradeView(results, window.__LAYOUT_CANDIDATES[index]);
  }, candidateIndex);
}

async function inspectTradeLayout(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".popup-shell");
    const view = document.querySelector(".trade-view");
    const tradeTitle = document.querySelector(".trade-hero h2");
    const book = document.querySelector(".trade-order-book");
    const ticket = document.querySelector(".trade-ticket");
    const buy = document.querySelector(".trade-buy-button");
    const chart = document.querySelector(".trade-chart-card");
    const chartPrice = document.querySelector(".trade-chart-price");
    const chartMarkerDot = document.querySelector(".trade-chart-marker-dot");
    const sourceBadge = document.querySelector(".trade-view .source-badge");
    const sourceMark = document.querySelector(".trade-image-wrap .source-mark");
    const sourceMarkStyle = sourceMark ? getComputedStyle(sourceMark) : null;
    const shellRect = shell ? shell.getBoundingClientRect() : null;
    const viewRect = view ? view.getBoundingClientRect() : null;
    const bookRect = book ? book.getBoundingClientRect() : null;
    const ticketRect = ticket ? ticket.getBoundingClientRect() : null;
    const buyRect = buy ? buy.getBoundingClientRect() : null;
    const chartRect = chart ? chart.getBoundingClientRect() : null;
    const chartPriceRect = chartPrice ? chartPrice.getBoundingClientRect() : null;
    const titleRect = tradeTitle ? tradeTitle.getBoundingClientRect() : null;
    const visibleOrderBookRows = shellRect ? [...document.querySelectorAll(".trade-book-row")]
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top < shellRect.bottom && rect.bottom > shellRect.top;
      }).length : 0;
    return {
      bodyText: document.body.textContent.replace(/\s+/g, " ").trim(),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      shellRect: shellRect ? shellRect.toJSON() : null,
      viewRect: viewRect ? viewRect.toJSON() : null,
      chartRect: chartRect ? chartRect.toJSON() : null,
      chartPriceRect: chartPriceRect ? chartPriceRect.toJSON() : null,
      chartMarkerCx: chartMarkerDot ? Number(chartMarkerDot.getAttribute("cx")) : null,
      chartMarkerCy: chartMarkerDot ? Number(chartMarkerDot.getAttribute("cy")) : null,
      ticketRect: ticketRect ? ticketRect.toJSON() : null,
      buyRect: buyRect ? buyRect.toJSON() : null,
      bookRect: bookRect ? bookRect.toJSON() : null,
      tradeViewCount: document.querySelectorAll(".trade-view").length,
      activeRange: document.querySelector(".trade-range-button.is-active")?.textContent.trim() || "",
      tradeTitle: tradeTitle?.textContent.trim() || "",
      tradeTitleFontSize: tradeTitle ? Number.parseFloat(getComputedStyle(tradeTitle).fontSize) : 0,
      tradeTitleRect: titleRect ? titleRect.toJSON() : null,
      tradeMeta: document.querySelector(".trade-meta")?.textContent.replace(/\s+/g, " ").trim() || "",
      sourceLabel: sourceBadge?.getAttribute("aria-label") || "",
      sourceMarkBackground: sourceMarkStyle ? `${sourceMarkStyle.backgroundImage} ${sourceMarkStyle.backgroundColor}` : "",
      tradeActionLabels: [...document.querySelectorAll("[data-trade-action]")].map((node) => node.textContent.trim()),
      buyText: buy?.textContent.trim() || "",
      estimateText: document.querySelector(".trade-estimate")?.textContent.trim() || "",
      orderBookRows: document.querySelectorAll(".trade-book-row").length,
      visibleOrderBookRows,
      sourceBadgeCount: document.querySelectorAll(".trade-view .source-badge").length
    };
  });
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflowingElements = [...document.querySelectorAll("body *")]
      .filter((node) => {
        if (node.closest(".status-region, .utility-control")) {
          return false;
        }
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
      menuOpen: document.querySelector(".popup-shell")?.classList.contains("is-menu-open") || false,
      menuExpanded: document.querySelector("#menu-button")?.getAttribute("aria-expanded") || "",
      sourceBadgeCount: document.querySelectorAll(".source-badge").length,
      sourcePolymarketCount: document.querySelectorAll(".source-badge.source-polymarket").length,
      sourceHyperliquidCount: document.querySelectorAll(".source-badge.source-hyperliquid").length,
      scenarioLabels: [...document.querySelectorAll(".scenario-label")].map((node) => node.textContent.trim()),
      scenarioValues: [...document.querySelectorAll(".scenario-value")].map((node) => node.textContent.trim()),
      venueLinks: [...document.querySelectorAll("a.market-card")].map((card) => ({
        href: card.dataset.marketUrl || card.href,
        source: card.dataset.marketSource || ""
      })),
      expandedTopBeforeRows: (() => {
        const top = document.querySelector(".market-card-expanded .market-expanded-top");
        const firstRow = document.querySelector(".market-card-expanded .market-scenario-row");
        if (!top || !firstRow) {
          return false;
        }
        return top.getBoundingClientRect().bottom <= firstRow.getBoundingClientRect().top + 1;
      })(),
      expandedSourceLabelRowOverlap: (() => {
        const label = document.querySelector(".market-card-expanded .source-label");
        const firstRow = document.querySelector(".market-card-expanded .market-scenario-row");
        if (!label || !firstRow) {
          return false;
        }
        const labelRect = label.getBoundingClientRect();
        return [...firstRow.querySelectorAll(".scenario-dot, .scenario-label, .scenario-value-wrap")].some((node) => {
          const nodeRect = node.getBoundingClientRect();
          return labelRect.left < nodeRect.right &&
            labelRect.right > nodeRect.left &&
            labelRect.top < nodeRect.bottom &&
            labelRect.bottom > nodeRect.top;
        });
      })(),
      leadTitleClipped: (() => {
        const title = document.querySelector(".market-card-expanded .event-parent-title");
        if (!title) {
          return true;
        }
        return title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 4;
      })(),
      leadTitleMenuOverlap: (() => {
        const title = document.querySelector(".market-card-expanded .event-parent-title");
        const menu = document.querySelector(".action-menu");
        if (!title || !menu) {
          return true;
        }
        const titleRect = title.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        return titleRect.right > menuRect.left - 4 &&
          titleRect.left < menuRect.right &&
          titleRect.top < menuRect.bottom &&
          titleRect.bottom > menuRect.top;
      })(),
      topicMenuOverlap: (() => {
        const topic = document.querySelector(".detected-topic-pill");
        const menu = document.querySelector(".action-menu");
        if (!topic || !menu) {
          return true;
        }
        const topicRect = topic.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        return topicRect.left < menuRect.right &&
          topicRect.right > menuRect.left &&
          topicRect.top < menuRect.bottom &&
          topicRect.bottom > menuRect.top;
      })(),
      smallMenuClearsLeadCard: (() => {
        if (viewportWidth > 430) {
          return true;
        }
        const menu = document.querySelector(".action-menu");
        const card = document.querySelector(".market-card");
        if (!menu || !card) {
          return false;
        }
        const menuRect = menu.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        return menuRect.bottom <= cardRect.top + 6;
      })(),
      actionMenuRect: document.querySelector(".action-menu")?.getBoundingClientRect().toJSON(),
      actionMenuTextClipped: [...document.querySelectorAll(".action-menu-item span")].some((node) => node.scrollWidth > node.clientWidth + 1),
      tradeToggleRect: document.querySelector(".trade-toggle")?.getBoundingClientRect().toJSON(),
      menuButtonRect: document.querySelector(".menu-button")?.getBoundingClientRect().toJSON(),
      heroTitleRect: document.querySelector(".hero-region h1")?.getBoundingClientRect().toJSON(),
      topicPillRect: document.querySelector(".detected-topic-pill")?.getBoundingClientRect().toJSON(),
      leadTitleRect: document.querySelector(".market-card-expanded .event-parent-title")?.getBoundingClientRect().toJSON(),
      leadCardRect: document.querySelector(".market-card-expanded")?.getBoundingClientRect().toJSON(),
      leadImageRect: document.querySelector(".market-card-expanded .market-image, .market-card-expanded .market-image-fallback")?.getBoundingClientRect().toJSON(),
      expandedCaretCount: document.querySelectorAll(".market-expanded-caret").length,
      expandedCaretRect: document.querySelector(".market-expanded-caret")?.getBoundingClientRect().toJSON(),
      shellRect: document.querySelector(".popup-shell")?.getBoundingClientRect().toJSON(),
      resultsRect: document.querySelector("#results-region")?.getBoundingClientRect().toJSON(),
      footerRect: document.querySelector(".privacy-footer")?.getBoundingClientRect().toJSON(),
      visualRadii: (() => {
        const readRadius = (selector) => {
          const node = document.querySelector(selector);
          if (!node) {
            return null;
          }
          const value = getComputedStyle(node).borderTopLeftRadius;
          return Number.parseFloat(value);
        };
        return {
          shell: readRadius(".popup-shell"),
          leadCard: readRadius(".market-card-expanded"),
          compactCard: readRadius(".market-card:not(.market-card-expanded)"),
          actionMenu: readRadius(".action-menu")
        };
      })(),
      firstCardVisible: (() => {
        const card = document.querySelector(".market-card");
        const results = document.querySelector("#results-region");
        const footer = document.querySelector(".privacy-footer");
        if (!card || !results || !footer) {
          return false;
        }
        const rect = card.getBoundingClientRect();
        const resultsRect = results.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        return rect.bottom > resultsRect.top + 80 && rect.top < footerRect.top - 80;
      })(),
      visibleCardCount: [...document.querySelectorAll(".market-card")]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          const results = document.querySelector("#results-region").getBoundingClientRect();
          return rect.top >= results.top - 1 && rect.bottom <= results.bottom + 1;
        }).length,
      visibleCompactCardCount: [...document.querySelectorAll(".market-card:not(.market-card-expanded)")]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          const footer = document.querySelector(".privacy-footer").getBoundingClientRect();
          return rect.top < footer.top - 40 && rect.bottom <= footer.top + 1;
        }).length,
      visibleCompactCardSources: [...document.querySelectorAll(".market-card:not(.market-card-expanded)")]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          const footer = document.querySelector(".privacy-footer").getBoundingClientRect();
          return rect.top < footer.top - 40 && rect.bottom <= footer.top + 1;
        })
        .map((card) => ({
          source: card.dataset.marketSource || "",
          title: card.querySelector(".market-title, .event-parent-title")?.textContent.trim() || "",
          href: card.dataset.marketUrl || card.href
        })),
      partialCompactAboveFooterCount: [...document.querySelectorAll(".market-card:not(.market-card-expanded)")]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          const footer = document.querySelector(".privacy-footer").getBoundingClientRect();
          return rect.top < footer.top && rect.bottom > footer.top + 1;
        }).length,
      compactCardRects: [...document.querySelectorAll(".market-card:not(.market-card-expanded)")]
        .map((card) => card.getBoundingClientRect().toJSON()),
      statusText: document.querySelector("#status-region").innerText,
      bodyText: document.body.innerText.slice(0, 900)
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
      if (viewport.name === "popup") {
        await page.evaluate(() => {
          document.documentElement.dataset.viewMode = "expanded";
        });
      }
      await renderFixture(page);
      const screenshot = artifactPath(`popup-layout-${viewport.name}`, "png");
      await page.screenshot({ path: screenshot, fullPage: true });
      const layout = await inspectLayout(page);
      let tradeView = null;
      let hyperliquidTradeView = null;
      if (viewport.name === "popup") {
        await renderTradeFixture(page);
        const tradeScreenshot = artifactPath("popup-layout-trade", "png");
        await page.screenshot({ path: tradeScreenshot, fullPage: true });
        tradeView = {
          screenshot: tradeScreenshot,
          ...await inspectTradeLayout(page)
        };
        await renderTradeFixture(page, 1);
        const hyperliquidTradeScreenshot = artifactPath("popup-layout-trade-hyperliquid", "png");
        await page.screenshot({ path: hyperliquidTradeScreenshot, fullPage: true });
        hyperliquidTradeView = {
          screenshot: hyperliquidTradeScreenshot,
          ...await inspectTradeLayout(page)
        };
      }
      report.viewports.push({
        ...viewport,
        screenshot,
        tradeView,
        hyperliquidTradeView,
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
      if (layout.expandedCaretCount !== 1 || !layout.expandedCaretRect || !layout.leadCardRect || layout.expandedCaretRect.left < layout.leadCardRect.left || layout.expandedCaretRect.right > layout.leadCardRect.right || layout.expandedCaretRect.top < layout.leadCardRect.top + 80 || layout.expandedCaretRect.bottom > layout.leadCardRect.bottom - 120) {
        throw new Error(`${viewport.name} layout missing the expanded-card caret in the target card area: ${JSON.stringify({ caretCount: layout.expandedCaretCount, caret: layout.expandedCaretRect, card: layout.leadCardRect })}`);
      }
      if (viewport.name === "popup" && (!layout.shellRect || layout.shellRect.height < 812 || layout.shellRect.height > 816)) {
        throw new Error(`${viewport.name} layout shell height drifted from the reference aspect target: ${layout.shellRect && layout.shellRect.height}`);
      }
      if (viewport.name === "popup") {
        if (!tradeView || tradeView.tradeViewCount !== 1 || !/Will the US and Iran reach a permanent peace deal in 2026/.test(tradeView.tradeTitle)) {
          throw new Error(`${viewport.name} trade view did not render the target Iran market: ${JSON.stringify(tradeView)}`);
        }
        if (!/\$261M Vol/.test(tradeView.tradeMeta) || !/Ends Dec 31, 2026/.test(tradeView.tradeMeta)) {
          throw new Error(`${viewport.name} trade view meta drifted from the target market: ${JSON.stringify(tradeView)}`);
        }
        if (tradeView.activeRange !== "1M" || !/^Buy\s+Yes/.test(tradeView.buyText) || !/Est\. shares:/.test(tradeView.estimateText) || tradeView.orderBookRows < 10 || tradeView.sourceBadgeCount !== 1) {
          throw new Error(`${viewport.name} trade view controls were incomplete: ${JSON.stringify(tradeView)}`);
        }
        if (!/Yes 32¢/.test(tradeView.bodyText) || !/No 68¢/.test(tradeView.bodyText) || /No 1¢/.test(tradeView.bodyText)) {
          throw new Error(`${viewport.name} trade view rendered incorrect Yes/No prices: ${JSON.stringify(tradeView)}`);
        }
        if (!tradeView.shellRect || !tradeView.bookRect || !tradeView.buyRect || tradeView.bookRect.top > tradeView.shellRect.bottom - 90 || tradeView.buyRect.bottom > tradeView.shellRect.bottom + 1) {
          throw new Error(`${viewport.name} trade view pushed the order book out of the first screen: ${JSON.stringify(tradeView)}`);
        }
        if (!tradeView.ticketRect || tradeView.ticketRect.height < 184 || tradeView.ticketRect.height > 198 || !tradeView.bookRect || tradeView.bookRect.top < 646 || tradeView.bookRect.top > 666) {
          throw new Error(`${viewport.name} trade view ticket rhythm drifted from the reference: ${JSON.stringify({ ticket: tradeView.ticketRect, book: tradeView.bookRect })}`);
        }
        if (tradeView.visibleOrderBookRows < 10) {
          throw new Error(`${viewport.name} trade view did not expose all first-screen order-book rows: ${JSON.stringify(tradeView)}`);
        }
        if (JSON.stringify(tradeView.tradeActionLabels) !== JSON.stringify(["Settings", "Connect", "Information"])) {
          throw new Error(`${viewport.name} trade action menu labels drifted from the reference: ${JSON.stringify(tradeView.tradeActionLabels)}`);
        }
        if (tradeView.tradeTitleFontSize < 21.5 || tradeView.tradeTitleFontSize > 22.5 || !tradeView.tradeTitleRect || tradeView.tradeTitleRect.height < 45 || tradeView.tradeTitleRect.height > 54) {
          throw new Error(`${viewport.name} trade title font size drifted from the reference scale: ${tradeView.tradeTitleFontSize}`);
        }
        if (!tradeView.chartRect || !tradeView.chartPriceRect || tradeView.chartPriceRect.top > tradeView.chartRect.top + 48 || tradeView.chartMarkerCx === null || tradeView.chartMarkerCx < 300 || tradeView.chartMarkerCx > 355 || tradeView.chartMarkerCy === null || tradeView.chartMarkerCy > 98) {
          throw new Error(`${viewport.name} trade chart marker drifted from the reference peak placement: ${JSON.stringify({ chart: tradeView.chartRect, price: tradeView.chartPriceRect, markerCx: tradeView.chartMarkerCx, markerCy: tradeView.chartMarkerCy })}`);
        }
        if (!hyperliquidTradeView || hyperliquidTradeView.sourceLabel !== "Hyperliquid" || !/^Buy\s+Long/.test(hyperliquidTradeView.buyText) || !/Est\. contracts:/.test(hyperliquidTradeView.estimateText)) {
          throw new Error(`${viewport.name} Hyperliquid trade view controls were incomplete: ${JSON.stringify(hyperliquidTradeView)}`);
        }
        if (!/Long\s+\$95\.12/.test(hyperliquidTradeView.bodyText) || !/Short\s+\$95\.12/.test(hyperliquidTradeView.bodyText)) {
          throw new Error(`${viewport.name} Hyperliquid trade view rendered incorrect Long/Short prices: ${JSON.stringify(hyperliquidTradeView)}`);
        }
        if (!/83,\s*224,\s*195|14,\s*108,\s*97/.test(hyperliquidTradeView.sourceMarkBackground)) {
          throw new Error(`${viewport.name} Hyperliquid trade badge lost its venue color: ${hyperliquidTradeView.sourceMarkBackground}`);
        }
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
      if (!layout.menuOpen || layout.menuExpanded !== "true") {
        throw new Error(`${viewport.name} layout did not render the target open menu state.`);
      }
      if (!layout.expandedTopBeforeRows) {
        throw new Error(`${viewport.name} expanded card header overlapped its scenario rows.`);
      }
      if (layout.expandedSourceLabelRowOverlap) {
        throw new Error(`${viewport.name} expanded source label overlapped the first scenario row.`);
      }
      if (layout.leadTitleClipped) {
        throw new Error(`${viewport.name} expanded lead title was visually clipped.`);
      }
      if (layout.leadTitleMenuOverlap) {
        throw new Error(`${viewport.name} expanded lead title overlapped the open action menu: ${JSON.stringify({ title: layout.leadTitleRect, menu: layout.actionMenuRect })}`);
      }
      if (layout.topicMenuOverlap) {
        throw new Error(`${viewport.name} detected-topic pill overlapped the open action menu.`);
      }
      if (!layout.smallMenuClearsLeadCard) {
        throw new Error(`${viewport.name} open action menu overlapped the lead card on a small viewport.`);
      }
      if (
        layout.sourceBadgeCount !== layout.cardCount ||
        layout.sourcePolymarketCount < 1 ||
        layout.sourceHyperliquidCount < 1 ||
        !layout.venueLinks.some((link) => link.source === "Hyperliquid" && /hyperliquid\.xyz/.test(link.href))
      ) {
        throw new Error(`${viewport.name} layout missing required venue badges or Hyperliquid link: ${JSON.stringify(layout.venueLinks)}`);
      }
      if (
        !/Detected topic:\s*Iran negotiations/.test(layout.bodyText) ||
        !/US x Iran permanent peace deal by/.test(layout.bodyText) ||
        !/Brent crude above \$95 by Jul 31/.test(layout.bodyText) ||
        !/China invades Taiwan before 2027/.test(layout.bodyText) ||
        !layout.scenarioLabels.includes("June 15") ||
        !layout.scenarioLabels.includes("December 31") ||
        !layout.scenarioValues.includes("8%") ||
        !layout.scenarioValues.includes("68%")
      ) {
        throw new Error(`${viewport.name} layout drifted from the target Iran market composition: ${JSON.stringify({ text: layout.bodyText, labels: layout.scenarioLabels, values: layout.scenarioValues })}`);
      }
      if (viewport.name === "compact" && !layout.firstCardVisible) {
        throw new Error(`${viewport.name} layout did not show enough of the lead market card above the footer.`);
      }
      if (viewport.name === "popup" && layout.visibleCompactCardCount < 2) {
        throw new Error(`${viewport.name} layout did not show two compact cards above the footer: ${JSON.stringify({ visibleCompactCardCount: layout.visibleCompactCardCount, compactCardRects: layout.compactCardRects, footer: layout.footerRect })}`);
      }
      if (viewport.name === "popup" && !layout.visibleCompactCardSources.some((card) => card.source === "Hyperliquid" && /hyperliquid\.xyz/.test(card.href))) {
        throw new Error(`${viewport.name} layout did not show a visible compact Hyperliquid card above the footer: ${JSON.stringify(layout.visibleCompactCardSources)}`);
      }
      if (viewport.name === "popup" && layout.partialCompactAboveFooterCount !== 0) {
        throw new Error(`${viewport.name} layout showed a partial compact card above the footer: ${JSON.stringify(layout.compactCardRects)}`);
      }
      if (viewport.name === "popup" && (!layout.actionMenuRect || layout.actionMenuRect.width < 176 || layout.actionMenuRect.width > 180)) {
        throw new Error(`${viewport.name} action menu was too narrow for the reference overlay: ${layout.actionMenuRect && layout.actionMenuRect.width}`);
      }
      if (layout.actionMenuTextClipped) {
        throw new Error(`${viewport.name} action menu text was clipped.`);
      }
      if (
        viewport.name === "popup" &&
        (!layout.actionMenuRect ||
          !layout.shellRect ||
          layout.actionMenuRect.right < layout.shellRect.right + 8 ||
          layout.actionMenuRect.right > viewport.width - 4)
      ) {
        throw new Error(`${viewport.name} action menu was not anchored to the reference-style right edge: ${JSON.stringify({ menu: layout.actionMenuRect, shell: layout.shellRect })}`);
      }
      if (viewport.name === "popup" && (!layout.actionMenuRect || layout.actionMenuRect.height < 156 || layout.actionMenuRect.height > 174)) {
        throw new Error(`${viewport.name} action menu height drifted from the compact reference overlay: ${JSON.stringify(layout.actionMenuRect)}`);
      }
      if (viewport.name === "popup" && (!layout.tradeToggleRect || layout.tradeToggleRect.top < 38 || layout.tradeToggleRect.top > 48)) {
        throw new Error(`${viewport.name} trade control vertical placement drifted from the reference header: ${JSON.stringify(layout.tradeToggleRect)}`);
      }
      if (viewport.name === "popup" && (!layout.tradeToggleRect || layout.tradeToggleRect.width < 108 || layout.tradeToggleRect.width > 120 || layout.tradeToggleRect.height < 40 || layout.tradeToggleRect.height > 44)) {
        throw new Error(`${viewport.name} trade control width drifted from the reference header: ${JSON.stringify(layout.tradeToggleRect)}`);
      }
      if (viewport.name === "popup" && (!layout.menuButtonRect || layout.menuButtonRect.top < 38 || layout.menuButtonRect.top > 48)) {
        throw new Error(`${viewport.name} menu button vertical placement drifted from the reference header: ${JSON.stringify(layout.menuButtonRect)}`);
      }
      if (viewport.name === "popup" && (!layout.menuButtonRect || layout.menuButtonRect.width < 40 || layout.menuButtonRect.width > 44 || layout.menuButtonRect.height < 40 || layout.menuButtonRect.height > 44)) {
        throw new Error(`${viewport.name} menu button size drifted from the reference header: ${JSON.stringify(layout.menuButtonRect)}`);
      }
      if (viewport.name === "popup" && (!layout.actionMenuRect || layout.actionMenuRect.top > 90 || layout.actionMenuRect.top < 84)) {
        throw new Error(`${viewport.name} action menu vertical placement drifted from the reference overlay: ${JSON.stringify(layout.actionMenuRect)}`);
      }
      if (
        viewport.name === "popup" &&
        (!layout.topicPillRect ||
          !layout.leadCardRect ||
          layout.leadCardRect.top - layout.topicPillRect.bottom < 16 ||
          layout.leadCardRect.top - layout.topicPillRect.bottom > 24)
      ) {
        throw new Error(`${viewport.name} topic-to-card spacing drifted from the reference rhythm: ${JSON.stringify({ topic: layout.topicPillRect, lead: layout.leadCardRect })}`);
      }
      if (viewport.name === "popup" && (!layout.shellRect || layout.shellRect.left < 21 || layout.shellRect.left > 23 || layout.shellRect.width < 454 || layout.shellRect.width > 458)) {
        throw new Error(`${viewport.name} expanded shell inset drifted from the reference image: ${JSON.stringify(layout.shellRect)}`);
      }
      if (viewport.name === "popup" && (!layout.heroTitleRect || layout.heroTitleRect.left < 45 || layout.heroTitleRect.left > 49)) {
        throw new Error(`${viewport.name} hero content was too inset for the reference shell: ${JSON.stringify(layout.heroTitleRect)}`);
      }
      if (viewport.name === "popup" && (!layout.leadCardRect || layout.leadCardRect.left < 34 || layout.leadCardRect.left > 36 || layout.leadCardRect.width < 430 || layout.leadCardRect.width > 434)) {
        throw new Error(`${viewport.name} lead card did not use the reference-width shell rhythm: ${JSON.stringify(layout.leadCardRect)}`);
      }
      if (viewport.name === "popup" && (!layout.leadCardRect || layout.leadCardRect.height < 372 || layout.leadCardRect.height > 388)) {
        throw new Error(`${viewport.name} lead card height drifted from the shorter reference rhythm: ${layout.leadCardRect && layout.leadCardRect.height}`);
      }
      if (viewport.name === "popup" && (!layout.leadImageRect || layout.leadImageRect.left > 50 || layout.leadImageRect.width < 86 || layout.leadImageRect.height < 86)) {
        throw new Error(`${viewport.name} lead market image was too small for the reference card: ${JSON.stringify(layout.leadImageRect)}`);
      }
      if (viewport.name === "popup" && layout.footerRect && layout.footerRect.height > 48) {
        throw new Error(`${viewport.name} footer was taller than the reference-style compact status bar: ${layout.footerRect.height}`);
      }
      if (
        viewport.name === "popup" &&
        (!layout.visualRadii ||
          layout.visualRadii.shell < 29 ||
          layout.visualRadii.shell > 31 ||
          layout.visualRadii.leadCard < 16 ||
          layout.visualRadii.leadCard > 18 ||
          layout.visualRadii.compactCard < 15 ||
          layout.visualRadii.compactCard > 17 ||
          layout.visualRadii.actionMenu < 15 ||
          layout.visualRadii.actionMenu > 17)
      ) {
        throw new Error(`${viewport.name} reference-style radii drifted: ${JSON.stringify(layout.visualRadii)}`);
      }
      if (!/Insights by Rainbow\s+Updated just now/.test(layout.privacyText)) {
        throw new Error(`${viewport.name} layout missing target Rainbow footer copy: ${layout.privacyText}`);
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
