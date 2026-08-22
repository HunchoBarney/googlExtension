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
const MANROPE_FONT = path.join(ROOT, "src/popup/assets/fonts/manrope-latin-variable.woff2");

const FIXTURE_IMAGES = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAB80lEQVR42u3bwU3DMBQG4MyAGACJDThwYgfmYBLEbgwE4gDtoVKoWnDsFzuxvye9S+sq6v/VstO60+3Dy/ee++Pza9c9AQAAAAAAAAAAAAAAAAAAAAAAbBDg/um1agMAAAAAgH0AHCs12NSxABIB5pUSfupYAAkAlyol/BQEAGaANQCAXRAAAAAAAACwP4DSnRGAAoCIewMAmQBRd8c1AI5lBjSaAfOyBlReAy6VXdCKADdvz7/6Up2PARAAcB7qEoBaEF0CXAszB2BtiG4AUkIsAZi/FsAZwNIgcwHWWLR3D5ATZtRrABw6J9Co8cMD5IYaORZARrCR44Y9nFvy6Y4aE4HQHUBKeKXPDw9QutXMfW4NBAAA4sP/L8ylj6c2gESE1Fp6LQCBCDnXARCEkHuN7gG2Xu93j4t7En5bhEn4bRHMADPAGmAXFLQLAtD4PgBA4zthAI2/CxoCYKvfhuaEDwBAH7+I5YbfJUCL34SHBNjKqYiS8LsCaHUuaGiA1ifjSsPvAqDl2VAAhz6+iRanoyPC7wbghFDr/wFR4XcFMO81ACJD7x7gP4hae/zhAa5B1NjfA/ij19rRAMhEaBX+0AAnhJbhDw+whQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOgT4Ae2umEuuaN/rwAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFgklEQVR42u3c1XdUVxTH8fPaV7xoIxAj7kKUOFHi7i7EsJTg7u7uhOKS4sW1UFt1YbV96V/Qt1/P0AUL6CRMhjvd997ZD/spb5/vXWcmZ865YvqfzzDtj6eY+vvnmPr8CTqeP0bHb4/Q/utDtP/yAG0/30fbT/fQ+uNdtP5wBy3f30bLd7cx5dtbaP7mppzP0PT1DTR9dR2NX15D4xdX0fDsChqeXkb9k0tyPkXd4x7UPepB7cOLqHlwATX3z6P63jlU3z2LqjtnUHX7NCpvnULlzZOouHFCzicovy7n2nGUXe1G6ZVjKL18FCWXjqCk5zCKew6h+OJBFF04gKLz+1F4bh8Kz+5FwRk5p/cg/9Ru5J/chbwTO5F7fAdyu7cjp3sbco5tRfbRLcg+shlZhzch69BGZB6Uc2ADMvavR8a+dZi8dy3S96xB+u7VSNu1Cmk7VyJ1xwqkbl+OlG3LkLJ1GZK3LEXy5iVI2rQYSRsXYdKGhUhcvwCJ6+YjYe08JKyZi/hVc+TMRtzKLsSt6ELs8lmIXfYxYpZ2ImbJTEQvnoHoRdMhGJ8Of+LCaRCMT4cftWCqDMD4ZPhR8zsgGJ8OP3JeuwzA+GT4kXPbIBifDj9iTqsMwPhk+BGzZQDGp8MP72qRARifDD981hQIxqfDD+tslgEYnww/rLMJgvHp8ENnNsoAjE+GHzqjAYLx6fAnTK+HYHw6/JBpdYYAjE+FH9JRC8H4dPjBHTUyAOO/gf+B3ZhXY2n84PZqCMaf/wZ6b2MJ/KA2QwArxjcF/vVRGj+otQrCGvH7Qv4Lf7+at/+mNH5gS6UMwPj/ge8tgtL4gc0VENaO3xt8bxGUxA9oLjcEYHwq/ICmMgjGNw3/RQCF8f0bS2UAxn8n/MtRGt+/oQSC8d8Nbyl8v/piCMbvG94Sy85LfN/aIhmA8Y3DW+AD921839pCCMZ/c5T+nt8Xvk9NgQyg8+0FNeP7VOdDMD4dvneVIQDjk+F7V+ZB6HVLWQv4XhW5MoCV4BsLQI3vVZ4Dwfh0+J5l2YYA2v4Z0ZylRy34niVZEHrHN7qpphJ8j5JMGYDxyfA9ijMg9HB6wdSlR2347kWTIfSK/3/t578PvlthugzA+GT4bgVpEFo7sWbW0qNSfNe8VBlAZ/jGAqgV3zUvBYLx6fDH5xoCaOSgrDlLj9rxx+ckQ+gF32gAleO7ZCfJABo4Iq5XfJesSRBawjd56dEIvnNmogygcXxjAbSC75yRAKEVfFOffi3hO02OlwFUei3InKdfa/hO6XEQesF/EUBj+I5psTIA45PhO6bGQKgZvz8/rmsR3yElGkJr+MYCaBV/XPJEGUAl93CtEX9ckgzATz4d/thJUTKARvH/DaBt/LGJkRCMT4dvnxAhA6jgP9z+3lzRC759fDiEGm6gWyu+XVyYDKAQfn/Rzbkspzd8u9hQCAp8c66IGkZv+LYxE2QAC+CbAtzfO1t6xLeNDoFQ+k4W45uObzMxWAZQ8ANXaXw9rvmv49tEBUFQ4/f21FsD/keRgRBKnlJWAt6a8MdEBMgAFjqrac7XUj3s7fQHf0y4DKD0iTVzRqs/prwv/uhQfxnAgtsLfb78QkNHRyyFPzrUD0Lp92pa8gV3esMfNcFXBlDxS031jj8qxAeC8enwRwZ7ywCMT4Y/MsgLgvHp8EcEeMoAjE+GP8LfA4Lx6fCH+7vLAIxPhj/czw2C8enwP/R1hWB8OvxhPuNlAMYnwx/mLQMwPh3+UE8XGYDxyfCHejpDMD4d/hAPJ0MAxqfCH+LuCMH4dPiD3RxkAMYnwx/sOg6C8enwB7mMlQEYnwx/kLM9BOPT4Q90tpMBGJ8Mf6CTLQTj0+EPcLSRARifDH+Agw3+AaS9Uc6r/WIvAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACDklEQVR42u3cS24CMQyA4Vn3Gl33JuWevQ3b3oZqdhUaEuJH7MR/pGwQE4Q/nNeEOe6fX4+V68f3z9L1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAoz5+bwBEAJyBf64AAFAD4Cr4VggAkAEAAMAsiHUAAAAAYFXPAkAQwP8CAAD6GUzvGm2bJQAkc/jeNVZtWvfpowBaqO0BJAF99/0W2XJ47OP0rrFuMyKoVl1VmS4IgECAVsBGisdAXWYW5FVYBwinmBmC7wYg3fGUXBedAVPGAO89f829gujgu09DVwBoBWBmkSzWjuj7vtr7xa0gRJTW52+dAVdfNgpgJDumA7x6TTsGWP1ye69Zjw/TZkFSnNFB2BpAk1VlT0V4BVzSfsmDWdKBsnWt5jNKZYC227F4b+kuyHLmop1RlTyYpQ22FVpaAO/NOM1CSbvQCgOw/lX32t2hmAB49eutdncqSwKQAc5z+9F2S48BURnALGhhgC3XAbNnQayEk9+UHw3Mu7/8pfeCMgGU2w3NtBL2Cnj5Log7YoEA3BMOrJyKSJIB5c8FZT4bWuZkXObDuSXOhq7wL0mOp290PJ0MUABo93YAUIwBS/1LEgAATKehkf8rLp8BXgElA3haCgAAAMATswDgmXEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkqn+ijf7moaLldwAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFpklEQVR42u3c6VuOaRjH8fOPmDfzdl7MjNntu5SIaLWmtFBapMhSIirKHiVraEMRlZJQSrK0WBJlGzNm+T9+cz8vOo6OxkRz3Odzuu7jfHH+AX2+9SznfV3Ry7d/o//NX+h7/SdevPoDz1++R2//73jW9xt6XrzD0+fv8KT3VzzufYtHz96gu+c1up6+QueTl+h83I+OR/142N2HB10vcL/rOe519qK94xnuPuxB24Me3Ln/FK33nqCl/TFu332E5rZuNLV1oelOJ261duJmSwdu3H6IxuYHuN50Hw237uHazXbUW1N34y6uNrah9vod1DS0ovpaC6rrb+NKXTMuX21GVW0TLtXewsWam6isvoGKK424cPk6zlc14NylBpRfvIayynqUVtShpOIqSi7Uovh8Dc6eq8GZ8mqcLruCotLLOFVShZPFl3Ci+CKOn63EsTOVOHq6AoVFF3Dk1HkUnDyHghPlyD9ehsPWHDpWiryjJThYWIwDR85if8EZ7Ms/jb2Hi7DnUBF2551Cbt5J5Bw8gZwDx7Fr/zHs3HcU2XsLkbWnEJm7j2BHbgG25+aDFF8OPyPnMEjx5fC37ToEUnw5/K0780CKL4efnm0FUHw5/C1ZB0GKL4eflnkApPhy+Kk79oMUXw4/dfs+kOLL4W/O2AtSfDn8TRl7QIovh79x226Q4svhb9hqBVB8OfyU9FyQ4svhr9+SYwVQfDH8dWm7QIovh5+cuhOk+HL4SZuzQYovh792UxZI8eXwE10BFF8Of83GTJDiy+EnbNgBUnw5/ISU7SDFl8OPX58BUnw5/Lh120Ac+F98+ZURI40fm7wVxPGbb0oAafzVSekgjpcdUwJI48estQJwvOabEkAaPzpxC4jjDdeUANL4qxLTrAAMn3ZMCSCNv3JNKojjo6YpAaTxoxI2gzg+55sSQBo/Mn4TiONLlikBpPEj4jaCOL7hmhJAGj88dgOIY71gSgBp/BWrrQAcux1TAkjjh8WkgDgWa6YEkMYPi14P4thqDv1Bi+s7jBh344dGrwNxrJRNDeBu/OWrkkEc+3xTA7gbP2RlEojjYYqpAdyNvyxqLYjjSZYpb8ISr/mD8ZdGWgE4HiOaEkAaf0lEohWA4RmuKQEG44e8b3U7/uLwNSCOB+imBHCh/9e4A3/RigQQx+kFk+GHDif+wrB4EMfREafgDwwXfnBoHIjj3I7TAnDhB4XGgjgOTTkJf2A48AOXrwZxnFhzYgAO/IAQKwDHcUEnBnCN3fj+y2JAHGc1nYjvGrvx/ZdGgzgOyn6OuyA7AtiN77dkFYjjlPLnuoyzI4Kd+AsWrwRxHBF3agC78ecvigJxnM938l+Anfi+CyNBHJcjnPZFbPDYiT/PFYDjZoqTA9iJPzc4wgrAcC3IScu4f42N+D5B4SCO1mmr6I/NnbhzwlcAeK4EOeE5wHuwJ8dEAbiuI1oSgDXbuf/RLAL39s/FMRxFdSUAAO7nZEGsAt/lt9yEMc9XFMCDN7tjCSAXfheC0JAHJegTQkwdLfzqQHswvecbwXguIFuSoChi7WR/BXYge/puwzEcf3flAAf3O24EX+m71IQx/9eMCXAcIu1j0WwA99j3hKQk/7xhd2nF4YNYAP+jLmLQYo//G6HE3+6zyKQ4g+/2/lQALvwp81ZCFL8T1us2f2b78KfOjsYpPj27nZGgj/F2xVA8cXwJ88KAim+HP4kr0CQ4svhT/QKACm+HP4ET3+Q4svhj5/pB1J8OfxxHgtAii+HP3aGFUDx5fDHTp8PUnw5/DHTfEGKL4c/euo8kOLL4f8yZS5I8eXwf57sA1J8OfyfJs8BKb4c/o+TZlsBFF8M/4eJVgDFl8P/foI3SPHl8L8bPwuk+HL4o8Z5gRRfDv/bsZ4gxZfD/2bMTJDiy+F/PdoDpPhy+K75ByGmQkCTiP0TAAAAAElFTkSuQmCC"
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
  let css = fs.readFileSync(path.join(ROOT, "src/popup/popup.css"), "utf8");
  if (fs.existsSync(MANROPE_FONT)) {
    const embeddedFont = fs.readFileSync(MANROPE_FONT).toString("base64");
    css = css.replace(
      'url("./assets/fonts/manrope-latin-variable.woff2")',
      `url("data:font/woff2;base64,${embeddedFont}")`
    );
  }
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
        tradeDataState: "ready",
        tradeDataFetchedAt: Date.UTC(2026, 7, 19, 19, 30, 0),
        tradeBooksByOutcome: {
          yes: {
            bids: [[0.31, 120], [0.30, 240], [0.29, 360], [0.28, 480], [0.27, 600]],
            asks: [[0.32, 110], [0.33, 220], [0.34, 330], [0.35, 440], [0.36, 550]]
          },
          no: {
            bids: [[0.67, 105], [0.66, 205], [0.65, 305]],
            asks: [[0.68, 115], [0.69, 215], [0.70, 315]]
          }
        },
        tradeChartHistory: {
          "1M": [
            { t: 1782163200, p: 0.24 },
            { t: 1782422400, p: 0.27 },
            { t: 1782681600, p: 0.25 },
            { t: 1782940800, p: 0.31 },
            { t: 1783200000, p: 0.29 },
            { t: 1783459200, p: 0.34 },
            { t: 1783718400, p: 0.32 }
          ]
        },
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
        tradeDataState: "ready",
        tradeDataFetchedAt: Date.UTC(2026, 7, 19, 19, 30, 0),
        tradeBooksByOutcome: {
          long: {
            bids: [[95.11, 18.5], [95.10, 31.25], [95.09, 42], [95.08, 50], [95.07, 65]],
            asks: [[95.12, 20], [95.13, 28.75], [95.14, 39.5], [95.15, 51], [95.16, 63]]
          },
          short: {
            bids: [[95.11, 20], [95.10, 30]],
            asks: [[95.12, 22], [95.13, 32]]
          }
        },
        tradeChartHistoryByOutcome: {
          long: {
            "1M": [
              { t: Date.UTC(2026, 6, 20), p: 92.4 },
              { t: Date.UTC(2026, 6, 24), p: 93.1 },
              { t: Date.UTC(2026, 6, 28), p: 92.8 },
              { t: Date.UTC(2026, 7, 1), p: 94.0 },
              { t: Date.UTC(2026, 7, 5), p: 94.6 },
              { t: Date.UTC(2026, 7, 9), p: 95.12 }
            ]
          },
          short: {
            "1M": [
              { t: Date.UTC(2026, 6, 20), p: 92.4 },
              { t: Date.UTC(2026, 6, 24), p: 93.1 },
              { t: Date.UTC(2026, 6, 28), p: 92.8 },
              { t: Date.UTC(2026, 7, 1), p: 94.0 },
              { t: Date.UTC(2026, 7, 5), p: 94.6 },
              { t: Date.UTC(2026, 7, 9), p: 95.12 }
            ]
          }
        },
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
    document.documentElement.dataset.viewMode = "trade";
    const shell = document.querySelector(".popup-shell");
    const results = document.getElementById("results-region");
    if (shell) {
      shell.classList.add("is-trade-view");
    }
    const candidate = window.__LAYOUT_CANDIDATES[index];
    window.PMRender.renderTradeView(results, candidate);
    const activeSide = results.querySelector(".trade-side-button.is-active");
    window.PMKLineChart.mountTradeChart(results, candidate, {
      range: "1M",
      outcome: activeSide ? {
        label: activeSide.dataset.tradeLabel || activeSide.textContent.trim(),
        clobTokenId: activeSide.dataset.tradeTokenId || ""
      } : undefined
    });
  }, candidateIndex);
  await page.waitForFunction(() => {
    const state = document.querySelector("[data-kline-chart]")?.dataset.klineState;
    return state === "ready" || state === "unavailable" || state === "error";
  });
}

async function inspectTradeLayout(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".popup-shell");
    const view = document.querySelector(".trade-view");
    const tradeTitle = document.querySelector(".trade-hero h2");
    const book = document.querySelector(".trade-order-book");
    const ticket = document.querySelector(".trade-ticket");
    const chart = document.querySelector(".trade-chart-card");
    const chartHost = document.querySelector("[data-kline-chart]");
    const heroCopy = document.querySelector(".trade-hero-copy");
    const imageWrap = document.querySelector(".trade-image-wrap");
    const backButton = document.querySelector("[data-trade-back]");
    const moreButton = document.querySelector("[data-trade-menu]");
    const rangeButton = document.querySelector(".trade-range-button");
    const bookHeading = document.querySelector(".trade-book-column h3");
    const bookHeader = document.querySelector(".trade-book-header");
    const firstBookRow = document.querySelector(".trade-book-row");
    const results = document.getElementById("results-region");
    const sourceBadge = document.querySelector(".trade-view .source-badge");
    const sourceMark = document.querySelector(".trade-image-wrap .source-mark");
    const sourceMarkStyle = sourceMark ? getComputedStyle(sourceMark) : null;
    const shellRect = shell ? shell.getBoundingClientRect() : null;
    const viewRect = view ? view.getBoundingClientRect() : null;
    const bookRect = book ? book.getBoundingClientRect() : null;
    const ticketRect = ticket ? ticket.getBoundingClientRect() : null;
    const chartRect = chart ? chart.getBoundingClientRect() : null;
    const chartHostRect = chartHost ? chartHost.getBoundingClientRect() : null;
    const heroCopyRect = heroCopy ? heroCopy.getBoundingClientRect() : null;
    const imageWrapRect = imageWrap ? imageWrap.getBoundingClientRect() : null;
    const backButtonRect = backButton ? backButton.getBoundingClientRect() : null;
    const moreButtonRect = moreButton ? moreButton.getBoundingClientRect() : null;
    const titleRect = tradeTitle ? tradeTitle.getBoundingClientRect() : null;
    const visibleOrderBookRows = shellRect ? [...document.querySelectorAll(".trade-book-row")]
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top >= shellRect.top && rect.bottom <= shellRect.bottom;
      }).length : 0;
    const upperBookRatio = viewRect && ticketRect && bookRect
      ? (ticketRect.bottom - viewRect.top) / bookRect.height
      : 0;
    return {
      bodyText: document.body.textContent.replace(/\s+/g, " ").trim(),
      uiFontFamily: getComputedStyle(document.body).fontFamily,
      manropeLoaded: [...document.fonts].some((face) => face.family.replace(/["']/g, "") === "Manrope" && face.status === "loaded"),
      viewMode: document.documentElement.dataset.viewMode || "",
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      shellRect: shellRect ? shellRect.toJSON() : null,
      viewRect: viewRect ? viewRect.toJSON() : null,
      chartRect: chartRect ? chartRect.toJSON() : null,
      chartHostRect: chartHostRect ? chartHostRect.toJSON() : null,
      heroCopyRect: heroCopyRect ? heroCopyRect.toJSON() : null,
      imageWrapRect: imageWrapRect ? imageWrapRect.toJSON() : null,
      backButtonRect: backButtonRect ? backButtonRect.toJSON() : null,
      moreButtonRect: moreButtonRect ? moreButtonRect.toJSON() : null,
      chartState: chartHost?.dataset.klineState || "",
      chartRange: chartHost?.dataset.klineRange || "",
      chartPointCount: Number(chartHost?.dataset.klinePoints || 0),
      chartCanvasCount: chartHost ? chartHost.querySelectorAll("canvas").length : 0,
      ticketRect: ticketRect ? ticketRect.toJSON() : null,
      bookRect: bookRect ? bookRect.toJSON() : null,
      upperBookRatio,
      resultsClientHeight: results?.clientHeight || 0,
      resultsScrollHeight: results?.scrollHeight || 0,
      tradeViewCount: document.querySelectorAll(".trade-view").length,
      activeRange: document.querySelector(".trade-range-button.is-active")?.textContent.trim() || "",
      tradeTitle: tradeTitle?.textContent.trim() || "",
      tradeTitleFontSize: tradeTitle ? Number.parseFloat(getComputedStyle(tradeTitle).fontSize) : 0,
      tradeMetaFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".trade-meta")).fontSize),
      tradeTitleRect: titleRect ? titleRect.toJSON() : null,
      tradeMeta: document.querySelector(".trade-meta")?.textContent.replace(/\s+/g, " ").trim() || "",
      sourceLabel: sourceBadge?.getAttribute("aria-label") || "",
      sourceMarkBackground: sourceMarkStyle ? `${sourceMarkStyle.backgroundImage} ${sourceMarkStyle.backgroundColor}` : "",
      tradeActionLabels: [...document.querySelectorAll("[data-trade-action]")].map((node) => node.textContent.trim()),
      sideLabels: [...document.querySelectorAll(".trade-side-button")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
      executionControlCount: document.querySelectorAll("[data-trade-amount], [data-trade-max], [data-trade-buy], [data-trade-estimate]").length,
      tradeDataState: book?.dataset.tradeDataState || "",
      bookStateText: document.querySelector(".trade-book-state")?.textContent.trim() || "",
      orderBookRows: document.querySelectorAll(".trade-book-row").length,
      visibleOrderBookRows,
      sourceBadgeCount: document.querySelectorAll(".trade-view .source-badge").length,
      rangeButtonRect: rangeButton?.getBoundingClientRect().toJSON() || null,
      bookHeadingFontSize: bookHeading ? Number.parseFloat(getComputedStyle(bookHeading).fontSize) : 0,
      bookHeaderFontSize: bookHeader ? Number.parseFloat(getComputedStyle(bookHeader).fontSize) : 0,
      bookRowFontSize: firstBookRow ? Number.parseFloat(getComputedStyle(firstBookRow).fontSize) : 0,
      bookRowRect: firstBookRow?.getBoundingClientRect().toJSON() || null
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
      uiFontFamily: getComputedStyle(document.body).fontFamily,
      manropeLoaded: [...document.fonts].some((face) => face.family.replace(/["']/g, "") === "Manrope" && face.status === "loaded"),
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
      footerCount: document.querySelectorAll(".privacy-footer").length,
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
          return true;
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
        return [...firstRow.querySelectorAll(".scenario-label, .scenario-value-wrap")].some((node) => {
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
          return false;
        }
        return title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 4;
      })(),
      leadTitleMenuOverlap: (() => {
        const title = document.querySelector(".market-card .event-parent-title, .market-card .market-title");
        const menu = document.querySelector(".action-menu");
        if (!title || !menu) {
          return false;
        }
        const titleRect = title.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        return titleRect.right > menuRect.left - 4 &&
          titleRect.left < menuRect.right &&
          titleRect.top < menuRect.bottom &&
          titleRect.bottom > menuRect.top;
      })(),
      topicPillCount: document.querySelectorAll(".detected-topic-pill, #detected-topic-text").length,
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
      searchRect: document.querySelector(".market-search")?.getBoundingClientRect().toJSON(),
      searchFontSize: Number.parseFloat(getComputedStyle(document.querySelector("#market-search-input")).fontSize),
      tabRowRect: document.querySelector(".market-tabs")?.getBoundingClientRect().toJSON(),
      tabButtonRects: [...document.querySelectorAll(".tab-button")].map((node) => node.getBoundingClientRect().toJSON()),
      tabsOverlap: (() => {
        const tabs = [...document.querySelectorAll(".tab-button")].map((node) => node.getBoundingClientRect());
        return tabs.some((tab, index) => index > 0 && tab.left < tabs[index - 1].right - 1);
      })(),
      tabTextOverflowing: [...document.querySelectorAll(".tab-button")]
        .some((node) => node.scrollWidth > node.clientWidth + 1),
      menuButtonRect: document.querySelector(".menu-button")?.getBoundingClientRect().toJSON(),
      leadTitleRect: document.querySelector(".market-card .event-parent-title, .market-card .market-title")?.getBoundingClientRect().toJSON(),
      leadTitleFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".market-card .event-parent-title, .market-card .market-title")).fontSize),
      leadQuoteFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".market-card .market-quote strong")).fontSize),
      leadCardRect: document.querySelector(".market-card")?.getBoundingClientRect().toJSON(),
      leadImageRect: document.querySelector(".market-card .market-image, .market-card .market-image-fallback")?.getBoundingClientRect().toJSON(),
      expandedCaretCount: document.querySelectorAll(".market-expanded-caret").length,
      expandedCaretRect: document.querySelector(".market-expanded-caret")?.getBoundingClientRect().toJSON(),
      shellRect: document.querySelector(".popup-shell")?.getBoundingClientRect().toJSON(),
      resultsRect: document.querySelector("#results-region")?.getBoundingClientRect().toJSON(),
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
          leadCard: readRadius(".market-card"),
          compactCard: readRadius(".market-card:not(.market-card-expanded)"),
          actionMenu: readRadius(".action-menu")
        };
      })(),
      firstCardVisible: (() => {
        const card = document.querySelector(".market-card");
        const results = document.querySelector("#results-region");
        if (!card || !results) {
          return false;
        }
        const rect = card.getBoundingClientRect();
        const resultsRect = results.getBoundingClientRect();
        return rect.bottom > resultsRect.top + 48 && rect.top < resultsRect.bottom - 48;
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
          const results = document.querySelector("#results-region").getBoundingClientRect();
          return rect.top < results.bottom - 40 && rect.bottom <= results.bottom + 1;
        }).length,
      visibleCompactCardSources: [...document.querySelectorAll(".market-card:not(.market-card-expanded)")]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          const results = document.querySelector("#results-region").getBoundingClientRect();
          return rect.top < results.bottom - 40 && rect.bottom <= results.bottom + 1;
        })
        .map((card) => ({
          source: card.dataset.marketSource || "",
          title: card.querySelector(".market-title, .event-parent-title")?.textContent.trim() || "",
          href: card.dataset.marketUrl || card.href
        })),
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
      await page.addScriptTag({ path: path.join(ROOT, "src/vendor/klinecharts/klinecharts.min.js") });
      await page.addScriptTag({ path: path.join(ROOT, "src/popup/klinecharts.js") });
      if (viewport.name === "popup") {
        await page.evaluate(() => {
          document.documentElement.dataset.viewMode = "expanded";
        });
      }
      await renderFixture(page);
      await page.evaluate(() => document.fonts.ready);
      const screenshot = artifactPath(`popup-layout-${viewport.name}`, "png");
      await page.screenshot({ path: screenshot, fullPage: true });
      const layout = await inspectLayout(page);
      let tradeView = null;
      let hyperliquidTradeView = null;
      if (viewport.name === "popup") {
        await page.setViewportSize({ width: 500, height: 600 });
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
      if (!/Manrope/.test(layout.uiFontFamily) || !layout.manropeLoaded) {
        throw new Error(`${viewport.name} layout did not render with the bundled Manrope font: ${JSON.stringify({ family: layout.uiFontFamily, loaded: layout.manropeLoaded })}`);
      }
      if (layout.tabsOverlap || layout.tabTextOverflowing || layout.tabButtonRects.length !== 3) {
        throw new Error(`${viewport.name} market tabs overlapped instead of keeping three equal columns: ${JSON.stringify(layout.tabButtonRects)}`);
      }
      if (layout.resultsRect && layout.shellRect && layout.resultsRect.bottom > layout.shellRect.bottom + 1) {
        throw new Error(`${viewport.name} scrolling results region exceeded the shell: results bottom ${layout.resultsRect.bottom}, shell bottom ${layout.shellRect.bottom}`);
      }
      if (layout.overflowingElements.length) {
        throw new Error(`${viewport.name} layout has overflowing elements: ${JSON.stringify(layout.overflowingElements.slice(0, 3))}`);
      }
      if (layout.cardCount !== 4) {
        throw new Error(`${viewport.name} layout rendered ${layout.cardCount} parent cards instead of 4.`);
      }
      if (layout.expandedCaretCount !== 0 || layout.scenarioLabels.length !== 0 || layout.scenarioValues.length !== 0) {
        throw new Error(`${viewport.name} layout should start with every market card collapsed: ${JSON.stringify({ caretCount: layout.expandedCaretCount, labels: layout.scenarioLabels, values: layout.scenarioValues })}`);
      }
      if (viewport.name === "popup" && (!layout.shellRect || layout.shellRect.height < 566 || layout.shellRect.height > 570)) {
        throw new Error(`${viewport.name} layout shell height drifted from the reference aspect target: ${layout.shellRect && layout.shellRect.height}`);
      }
      if (viewport.name === "popup") {
        if (!tradeView || tradeView.tradeViewCount !== 1 || !/Will the US and Iran reach a permanent peace deal in 2026/.test(tradeView.tradeTitle)) {
          throw new Error(`${viewport.name} trade view did not render the target Iran market: ${JSON.stringify(tradeView)}`);
        }
        if (!/\$261M Vol/.test(tradeView.tradeMeta) || !/Ends Dec 31, 2026/.test(tradeView.tradeMeta)) {
          throw new Error(`${viewport.name} trade view meta drifted from the target market: ${JSON.stringify(tradeView)}`);
        }
        if (tradeView.activeRange !== "1M" || tradeView.executionControlCount !== 0 || tradeView.tradeDataState !== "ready" || tradeView.orderBookRows !== 10 || tradeView.visibleOrderBookRows !== 10 || tradeView.sourceBadgeCount !== 1) {
          throw new Error(`${viewport.name} trade view controls were incomplete: ${JSON.stringify(tradeView)}`);
        }
        if (!/Live Polymarket depth · 19:30:00 UTC/.test(tradeView.bookStateText)) {
          throw new Error(`${viewport.name} trade view did not identify the live depth snapshot: ${JSON.stringify(tradeView)}`);
        }
        if (!/Yes 32¢/.test(tradeView.bodyText) || !/No 68¢/.test(tradeView.bodyText) || /No 1¢/.test(tradeView.bodyText)) {
          throw new Error(`${viewport.name} trade view rendered incorrect Yes/No prices: ${JSON.stringify(tradeView)}`);
        }
        if (tradeView.viewMode !== "trade" || tradeView.viewportWidth !== 500 || tradeView.viewportHeight !== 600 || !tradeView.shellRect || tradeView.shellRect.width < 498 || tradeView.shellRect.width > 502 || tradeView.shellRect.height < 598 || tradeView.shellRect.height > 602) {
          throw new Error(`${viewport.name} trade view did not fill the 500x600 action popup: ${JSON.stringify(tradeView)}`);
        }
        if (!tradeView.viewRect || !tradeView.bookRect || !tradeView.ticketRect || !tradeView.chartRect || tradeView.viewRect.bottom > tradeView.shellRect.bottom + 1 || tradeView.bookRect.bottom > tradeView.shellRect.bottom + 1 || tradeView.bookRect.top <= tradeView.ticketRect.bottom || Math.abs(tradeView.bookRect.left - tradeView.chartRect.left) > 1 || Math.abs(tradeView.bookRect.width - tradeView.chartRect.width) > 2 || tradeView.upperBookRatio < 2.14 || tradeView.upperBookRatio > 2.24 || tradeView.resultsScrollHeight > tradeView.resultsClientHeight + 1) {
          throw new Error(`${viewport.name} trade view did not keep every panel visible without scrolling: ${JSON.stringify(tradeView)}`);
        }
        if (JSON.stringify(tradeView.tradeActionLabels) !== JSON.stringify(["Refresh data", "Open on Polymarket"])) {
          throw new Error(`${viewport.name} trade action menu labels drifted from the reference: ${JSON.stringify(tradeView.tradeActionLabels)}`);
        }
        if (!/Manrope/.test(tradeView.uiFontFamily) || !tradeView.manropeLoaded || tradeView.tradeTitleFontSize < 13.5 || tradeView.tradeTitleFontSize > 14.5 || tradeView.tradeMetaFontSize < 10.5 || tradeView.tradeMetaFontSize > 11.5 || !tradeView.tradeTitleRect || tradeView.tradeTitleRect.height < 29 || tradeView.tradeTitleRect.height > 33 || !tradeView.imageWrapRect || tradeView.imageWrapRect.width < 43 || tradeView.imageWrapRect.width > 45 || !tradeView.heroCopyRect || !tradeView.backButtonRect || !tradeView.moreButtonRect || tradeView.backButtonRect.width < 39 || tradeView.backButtonRect.width > 41 || tradeView.imageWrapRect.left - tradeView.backButtonRect.right < 4 || tradeView.imageWrapRect.left - tradeView.backButtonRect.right > 10 || tradeView.heroCopyRect.left - tradeView.imageWrapRect.right < 7 || tradeView.heroCopyRect.left - tradeView.imageWrapRect.right > 9) {
          throw new Error(`${viewport.name} trade header spacing drifted from the compact reference: ${JSON.stringify(tradeView)}`);
        }
        if (!tradeView.chartRect || !tradeView.chartHostRect || tradeView.chartState !== "ready" || tradeView.chartRange !== "1M" || tradeView.chartPointCount < 2 || tradeView.chartCanvasCount < 1 || tradeView.chartRect.height < 280 || tradeView.chartRect.height > 286 || tradeView.chartHostRect.width < tradeView.chartRect.width - 4 || tradeView.chartHostRect.height < 235) {
          throw new Error(`${viewport.name} KLineCharts line chart was not ready or did not fill its card: ${JSON.stringify({ chart: tradeView.chartRect, host: tradeView.chartHostRect, state: tradeView.chartState, range: tradeView.chartRange, points: tradeView.chartPointCount, canvases: tradeView.chartCanvasCount })}`);
        }
        if (tradeView.ticketRect.height < 40 || tradeView.ticketRect.height > 42 || tradeView.bookRect.height < 174 || tradeView.bookRect.height > 180 || tradeView.bookHeadingFontSize < 14.5 || tradeView.bookHeadingFontSize > 15.5 || tradeView.bookHeaderFontSize < 10 || tradeView.bookHeaderFontSize > 11.5 || tradeView.bookRowFontSize < 11 || tradeView.bookRowFontSize > 12 || !tradeView.bookRowRect || tradeView.bookRowRect.height < 17.5 || tradeView.bookRowRect.height > 18.5) {
          throw new Error(`${viewport.name} trade ticket or orderbook density drifted from the compact reference: ${JSON.stringify(tradeView)}`);
        }
        if (!hyperliquidTradeView || hyperliquidTradeView.sourceLabel !== "Hyperliquid" || hyperliquidTradeView.executionControlCount !== 0 || hyperliquidTradeView.tradeDataState !== "ready" || hyperliquidTradeView.orderBookRows !== 10 || hyperliquidTradeView.visibleOrderBookRows !== 10 || hyperliquidTradeView.resultsScrollHeight > hyperliquidTradeView.resultsClientHeight + 1 || JSON.stringify(hyperliquidTradeView.sideLabels) !== JSON.stringify(["Long $95.12", "Short $95.12"])) {
          throw new Error(`${viewport.name} Hyperliquid trade view controls were incomplete: ${JSON.stringify(hyperliquidTradeView)}`);
        }
        if (hyperliquidTradeView.chartState !== "ready" || hyperliquidTradeView.chartPointCount < 2 || hyperliquidTradeView.chartCanvasCount < 1) {
          throw new Error(`${viewport.name} Hyperliquid line chart was not ready: ${JSON.stringify(hyperliquidTradeView)}`);
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
      if (layout.searchPlaceholder !== "Search markets") {
        throw new Error(`${viewport.name} layout missing target search placeholder: ${layout.searchPlaceholder}`);
      }
      if (layout.activeTabText !== "Relevant Markets") {
        throw new Error(`${viewport.name} layout active tab was ${layout.activeTabText} instead of Relevant Markets.`);
      }
      if (layout.menuOpen || layout.menuExpanded !== "false") {
        throw new Error(`${viewport.name} layout should start with the action menu closed: ${JSON.stringify({ menuOpen: layout.menuOpen, menuExpanded: layout.menuExpanded })}`);
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
      if (layout.topicPillCount !== 0) {
        throw new Error(`${viewport.name} still rendered the removed detected-topic pill.`);
      }
      if (layout.menuOpen && !layout.smallMenuClearsLeadCard) {
        throw new Error(`${viewport.name} open action menu overlapped the lead card on a small viewport.`);
      }
      if (layout.footerCount !== 0 || /Insights by Rainbow|Updated just now/i.test(layout.bodyText)) {
        throw new Error(`${viewport.name} still rendered the removed bottom footer bar.`);
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
        /Detected topic:/i.test(layout.bodyText) ||
        !/US x Iran permanent peace deal by/.test(layout.bodyText) ||
        !/Brent crude above \$95 by Jul 31/.test(layout.bodyText) ||
        !/China invades Taiwan before 2027/.test(layout.bodyText) ||
        /June 15|December 31|68%/.test(layout.bodyText)
      ) {
        throw new Error(`${viewport.name} layout drifted from the target Iran market composition: ${JSON.stringify({ text: layout.bodyText, labels: layout.scenarioLabels, values: layout.scenarioValues })}`);
      }
      if (viewport.name === "compact" && !layout.firstCardVisible) {
        throw new Error(`${viewport.name} layout did not show enough of the lead market card inside the results region.`);
      }
      if ((viewport.name === "mid" || viewport.name === "narrow") && !layout.firstCardVisible) {
        throw new Error(`${viewport.name} default-closed layout did not show the lead market content inside the results region: ${JSON.stringify({ lead: layout.leadCardRect, results: layout.resultsRect })}`);
      }
      if (viewport.name === "popup" && layout.visibleCompactCardCount < 2) {
        throw new Error(`${viewport.name} layout did not show two compact cards inside the results region: ${JSON.stringify({ visibleCompactCardCount: layout.visibleCompactCardCount, compactCardRects: layout.compactCardRects, results: layout.resultsRect })}`);
      }
      if (viewport.name === "popup" && !layout.visibleCompactCardSources.some((card) => card.source === "Hyperliquid" && /hyperliquid\.xyz/.test(card.href))) {
        throw new Error(`${viewport.name} layout did not show a visible compact Hyperliquid card inside the results region: ${JSON.stringify(layout.visibleCompactCardSources)}`);
      }
      if (layout.menuOpen && viewport.name === "popup" && (!layout.actionMenuRect || layout.actionMenuRect.width < 176 || layout.actionMenuRect.width > 180)) {
        throw new Error(`${viewport.name} action menu was too narrow for the reference overlay: ${layout.actionMenuRect && layout.actionMenuRect.width}`);
      }
      if (layout.menuOpen && layout.actionMenuTextClipped) {
        throw new Error(`${viewport.name} action menu text was clipped.`);
      }
      if (
        layout.menuOpen &&
        viewport.name === "popup" &&
        (!layout.actionMenuRect ||
          !layout.shellRect ||
          layout.actionMenuRect.right < layout.shellRect.right + 8 ||
          layout.actionMenuRect.right > viewport.width - 4)
      ) {
        throw new Error(`${viewport.name} action menu was not anchored to the reference-style right edge: ${JSON.stringify({ menu: layout.actionMenuRect, shell: layout.shellRect })}`);
      }
      if (layout.menuOpen && viewport.name === "popup" && (!layout.actionMenuRect || layout.actionMenuRect.height < 156 || layout.actionMenuRect.height > 174)) {
        throw new Error(`${viewport.name} action menu height drifted from the compact reference overlay: ${JSON.stringify(layout.actionMenuRect)}`);
      }
      if (viewport.name === "popup" && (!layout.searchRect || layout.searchRect.top < 30 || layout.searchRect.top > 32)) {
        throw new Error(`${viewport.name} search control vertical placement drifted from the reference header: ${JSON.stringify(layout.searchRect)}`);
      }
      if (viewport.name === "popup" && (!layout.searchRect || layout.searchRect.width < 380 || layout.searchRect.width > 392 || layout.searchRect.height < 35 || layout.searchRect.height > 37 || layout.searchFontSize < 12.5 || layout.searchFontSize > 13.5)) {
        throw new Error(`${viewport.name} search control size drifted from the reference header: ${JSON.stringify(layout.searchRect)}`);
      }
      if (viewport.name === "popup" && (!layout.menuButtonRect || layout.menuButtonRect.top < 28 || layout.menuButtonRect.top > 30)) {
        throw new Error(`${viewport.name} menu button vertical placement drifted from the reference header: ${JSON.stringify(layout.menuButtonRect)}`);
      }
      if (viewport.name === "popup" && (!layout.menuButtonRect || layout.menuButtonRect.width < 39 || layout.menuButtonRect.width > 41 || layout.menuButtonRect.height < 39 || layout.menuButtonRect.height > 41)) {
        throw new Error(`${viewport.name} menu button size drifted from the reference header: ${JSON.stringify(layout.menuButtonRect)}`);
      }
      if (layout.menuOpen && viewport.name === "popup" && (!layout.actionMenuRect || layout.actionMenuRect.top > 90 || layout.actionMenuRect.top < 84)) {
        throw new Error(`${viewport.name} action menu vertical placement drifted from the reference overlay: ${JSON.stringify(layout.actionMenuRect)}`);
      }
      if (
        viewport.name === "popup" &&
        (!layout.tabRowRect ||
          !layout.leadCardRect ||
          layout.leadCardRect.top - layout.tabRowRect.bottom < 7 ||
          layout.leadCardRect.top - layout.tabRowRect.bottom > 9)
      ) {
        throw new Error(`${viewport.name} tabs-to-card spacing drifted from the compact header rhythm: ${JSON.stringify({ tabs: layout.tabRowRect, lead: layout.leadCardRect })}`);
      }
      if (viewport.name === "popup" && (!layout.shellRect || layout.shellRect.left < 15 || layout.shellRect.left > 17 || layout.shellRect.width < 466 || layout.shellRect.width > 470)) {
        throw new Error(`${viewport.name} expanded shell inset drifted from the reference image: ${JSON.stringify(layout.shellRect)}`);
      }
      if (viewport.name === "popup" && (!layout.tabRowRect || layout.tabRowRect.left < 31 || layout.tabRowRect.left > 33)) {
        throw new Error(`${viewport.name} tab content was too inset for the reference shell: ${JSON.stringify(layout.tabRowRect)}`);
      }
      if (viewport.name === "popup" && (!layout.leadCardRect || layout.leadCardRect.left < 27 || layout.leadCardRect.left > 29 || layout.leadCardRect.width < 442 || layout.leadCardRect.width > 446)) {
        throw new Error(`${viewport.name} lead card did not use the reference-width shell rhythm: ${JSON.stringify(layout.leadCardRect)}`);
      }
      if (viewport.name === "popup" && (!layout.leadCardRect || layout.leadCardRect.height < 72 || layout.leadCardRect.height > 76 || layout.leadTitleFontSize < 12.5 || layout.leadTitleFontSize > 13.5 || layout.leadQuoteFontSize < 14.5 || layout.leadQuoteFontSize > 15.5)) {
        throw new Error(`${viewport.name} lead card height drifted from the closed reference rhythm: ${layout.leadCardRect && layout.leadCardRect.height}`);
      }
      if (viewport.name === "popup" && (!layout.leadImageRect || layout.leadImageRect.left > 42 || layout.leadImageRect.width < 52 || layout.leadImageRect.width > 56 || layout.leadImageRect.height < 52 || layout.leadImageRect.height > 56)) {
        throw new Error(`${viewport.name} lead market image was too small for the reference card: ${JSON.stringify(layout.leadImageRect)}`);
      }
      if (
        viewport.name === "popup" &&
        (!layout.visualRadii ||
          layout.visualRadii.shell < 15 ||
          layout.visualRadii.shell > 17 ||
          layout.visualRadii.leadCard < 13 ||
          layout.visualRadii.leadCard > 15 ||
          layout.visualRadii.compactCard < 13 ||
          layout.visualRadii.compactCard > 15 ||
          layout.visualRadii.actionMenu < 11 ||
          layout.visualRadii.actionMenu > 13)
      ) {
        throw new Error(`${viewport.name} reference-style radii drifted: ${JSON.stringify(layout.visualRadii)}`);
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
