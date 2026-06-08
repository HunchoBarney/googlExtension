#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { chromium } = require("playwright-core");
const { createArgReader } = require("./cliArgs");
const {
  artifactPath,
  discoverArticleLinks
} = require("./qaUtils");

const ACTION_COMMAND_NAME = "_execute_action";
const { argValue, argNumber, hasFlag } = createArgReader(process.argv);

function chromeExecutable() {
  let bundledChromium = "";
  try {
    bundledChromium = chromium.executablePath();
  } catch (error) {
    bundledChromium = "";
  }

  const candidates = [
    process.env.CHROME_PATH,
    bundledChromium,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function runVisualReferenceCheck(referencePath, screenshotPath) {
  if (!referencePath) {
    return null;
  }
  if (!screenshotPath) {
    throw new Error("A visual reference was provided, but no popup screenshot was captured. Remove --no-artifacts.");
  }

  const root = path.join(__dirname, "..");
  const actualPath = path.resolve(root, screenshotPath);
  const args = [
    path.join(__dirname, "compare-popup-reference.js"),
    `--reference=${referencePath}`,
    `--actual=${actualPath}`
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new Error(`Visual reference comparison failed.${output ? `\n${output}` : ""}`);
  }

  return result.stdout.trim();
}

async function chooseArticleUrl() {
  const explicit = argValue("url", process.env.BROWSER_SMOKE_URL || "");
  if (explicit) {
    return {
      url: explicit,
      source: "argument"
    };
  }

  const discovered = await discoverArticleLinks({ limit: 10, perFeed: 4 });
  const preferredCategories = [
    "politics/elections",
    "economy/markets",
    "entertainment",
    "AI/technology",
    "crypto",
    "sports",
    "geopolitics",
    "weather/climate"
  ];
  const preferred = preferredCategories
    .map((category) => discovered.articles.find((article) => article.category === category))
    .find(Boolean) ||
    discovered.articles.find((article) => article.expectedStrongMatch) ||
    discovered.articles[0];

  if (!preferred) {
    throw new Error("Could not discover a current article URL for browser smoke.");
  }

  return {
    url: preferred.url,
    source: `${preferred.source} ${preferred.category}`,
    feedTitle: preferred.feedTitle
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function actionCommandKey() {
  if (process.platform === "darwin") {
    return {
      label: "MacCtrl+Shift+P",
      display: "Control+Shift+P",
      key: "P",
      code: "KeyP",
      keyCode: 80,
      modifiers: 2 | 8
    };
  }

  return {
    label: "Ctrl+Shift+Y",
    display: "Ctrl+Shift+Y",
    key: "Y",
    code: "KeyY",
    keyCode: 89,
    modifiers: 2 | 8
  };
}

function assertActionCommand(commands) {
  const command = commands.find((item) => item.name === ACTION_COMMAND_NAME);
  if (!command) {
    throw new Error(`Chrome did not register the ${ACTION_COMMAND_NAME} extension command.`);
  }
  if (!command.shortcut) {
    throw new Error(`Chrome registered ${ACTION_COMMAND_NAME}, but no keyboard shortcut is assigned.`);
  }
  return command;
}

async function dispatchActionCommand(root, commandKey) {
  const params = {
    type: "rawKeyDown",
    windowsVirtualKeyCode: commandKey.keyCode,
    nativeVirtualKeyCode: commandKey.keyCode,
    code: commandKey.code,
    key: commandKey.key,
    modifiers: commandKey.modifiers
  };
  await root.send("Input.dispatchKeyEvent", params);
  await root.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

async function probePreActivationAccess(worker) {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      return {
        blocked: false,
        tabId: null,
        error: "No active tab was available before activation."
      };
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.title
      });
      return {
        blocked: false,
        tabId: tab.id,
        error: ""
      };
    } catch (error) {
      return {
        blocked: true,
        tabId: tab.id,
        error: error && error.message ? error.message : String(error)
      };
    }
  });
}

async function waitForPopupTarget(root, extensionId) {
  const popupPrefix = `chrome-extension://${extensionId}/src/popup/popup.html`;
  for (let index = 0; index < 40; index += 1) {
    const targets = await root.send("Target.getTargets");
    const popup = targets.targetInfos.find((target) => (
      target.url === popupPrefix || target.url.startsWith(`${popupPrefix}?`)
    ));
    if (popup) {
      return popup;
    }
    await delay(250);
  }
  throw new Error("The extension action popup target did not appear.");
}

async function sendToTarget(root, sessionId, method, params = {}, timeoutMs = 20000) {
  const id = Math.floor(Math.random() * 1e9);
  const resultPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      root.off("Target.receivedMessageFromTarget", onMessage);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);

    function onMessage(event) {
      if (event.sessionId !== sessionId) {
        return;
      }
      const message = JSON.parse(event.message);
      if (message.id !== id) {
        return;
      }
      clearTimeout(timeout);
      root.off("Target.receivedMessageFromTarget", onMessage);
      if (message.error) {
        reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
        return;
      }
      resolve(message.result);
    }

    root.on("Target.receivedMessageFromTarget", onMessage);
  });

  await root.send("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({ id, method, params })
  });
  return resultPromise;
}

async function attachPopup(root, popupTarget) {
  const { sessionId } = await root.send("Target.attachToTarget", {
    targetId: popupTarget.targetId,
    flatten: false
  });
  await sendToTarget(root, sessionId, "Runtime.enable");
  await sendToTarget(root, sessionId, "Page.enable");
  return sessionId;
}

async function evaluatePopup(root, sessionId, expression) {
  const result = await sendToTarget(root, sessionId, "Runtime.evaluate", {
    expression,
    returnByValue: true
  });
  return result.result.value;
}

async function readPopupState(root, sessionId) {
  return evaluatePopup(root, sessionId, `(() => {
    const status = document.querySelector("#status-region .scan-status, #status-region .status");
    return {
      url: location.href,
      expanded: document.documentElement.dataset.viewMode === "expanded" || new URLSearchParams(location.search).get("expanded") === "1",
      readyState: document.readyState,
      phase: status && status.dataset.phase,
      statusText: document.querySelector("#status-region")?.innerText || "",
      bodyText: document.body?.innerText || "",
      phases: globalThis.__PM_POPUP_PHASES || [],
      articleContext: globalThis.__PM_ARTICLE_CONTEXT || null,
      polymarketCandidates: globalThis.__PM_POLYMARKET_CANDIDATES || [],
      displayGroups: globalThis.__PM_DISPLAY_GROUPS || [],
      cardLinks: [...document.querySelectorAll("a.market-card")].map((card) => card.dataset.marketUrl || card.href),
      cardTitles: [...document.querySelectorAll("a.market-card .market-title, a.market-card .event-parent-title")].map((node) => node.textContent),
      visual: {
        articlePreviewCount: document.querySelectorAll(".article-context").length,
        fallbackIconCount: document.querySelectorAll(".market-card .market-image-fallback").length,
        remoteImageCount: document.querySelectorAll(".market-card img.market-image").length,
        loadedRemoteImageCount: [...document.querySelectorAll(".market-card img.market-image")].filter((image) => image.complete && image.naturalWidth > 0).length,
        remoteImageSources: [...document.querySelectorAll(".market-card img.market-image")].map((image) => image.currentSrc || image.src),
        traderMetaCount: [...document.querySelectorAll(".market-meta-item")].filter((node) => /traders/i.test(node.textContent || "")).length,
        volumeMetaCount: [...document.querySelectorAll(".market-meta-item")].filter((node) => /volume/i.test(node.textContent || "")).length,
        metaText: [...document.querySelectorAll(".market-meta-row")].map((node) => node.textContent.replace(/\\s+/g, " ").trim()),
        brandDividerWidth: parseFloat(getComputedStyle(document.querySelector(".brand-lockup > div") || document.body).borderLeftWidth) || 0,
        tabCount: document.querySelectorAll(".tab-button").length,
        hiddenUtilityTabStopCount: [...document.querySelectorAll(".utility-control input, .utility-control button, .utility-control a, .utility-control select, .utility-control textarea")]
          .filter((node) => node.tabIndex >= 0).length,
        scoreBadgeCount: document.querySelectorAll(".market-score").length,
        openLinkCount: document.querySelectorAll(".open-link").length,
        searchHeight: document.querySelector(".market-search")?.getBoundingClientRect().height || 0,
        matchLimitCount: document.querySelectorAll(".match-limit-note").length,
        decisionTextCount: [...document.querySelectorAll("body *")].filter((node) => /decision|high confidence/i.test(node.textContent || "")).length,
        searchPlaceholder: document.querySelector("#market-search-input")?.getAttribute("placeholder") || "",
        activeTabText: document.querySelector(".tab-button.is-active")?.textContent.trim() || "",
        activeElementId: document.activeElement?.id || "",
        sortLabel: document.querySelector(".sort-button span")?.textContent.trim() || "",
        privacyText: document.querySelector(".privacy-footer")?.textContent.replace(/\\s+/g, " ").trim() || "",
        statusText: document.querySelector("#status-region")?.innerText.replace(/\\s+/g, " ").trim() || "",
        surfaceText: document.querySelector("#surface-message:not([hidden])")?.textContent.replace(/\\s+/g, " ").trim() || "",
        tradeToggleCount: document.querySelectorAll(".trade-toggle").length,
        tradePressed: document.querySelector("#trade-toggle-button")?.getAttribute("aria-pressed") || "",
        menuButtonCount: document.querySelectorAll(".menu-button").length,
        menuOpen: document.querySelector(".popup-shell")?.classList.contains("is-menu-open") || false,
        menuExpanded: document.querySelector("#menu-button")?.getAttribute("aria-expanded") || "",
        actionMenuItemCount: document.querySelectorAll(".action-menu-item").length,
        sourceBadgeCount: document.querySelectorAll(".source-badge").length,
        sourcePolymarketCount: document.querySelectorAll(".source-badge.source-polymarket").length,
        sourceHyperliquidCount: document.querySelectorAll(".source-badge.source-hyperliquid").length,
        sourceBadgeLabels: [...document.querySelectorAll(".source-badge")].map((badge) => badge.getAttribute("aria-label") || badge.textContent.trim()),
        tradeViewCount: document.querySelectorAll(".trade-view").length,
        tradeViewTitle: document.querySelector(".trade-hero h2")?.textContent.trim() || "",
        tradeMarketSource: document.querySelector(".trade-view .source-badge")?.getAttribute("aria-label") || "",
        tradeBuyText: document.querySelector(".trade-buy-button")?.textContent.trim() || "",
        tradeOrderBookRows: document.querySelectorAll(".trade-book-row").length,
        tradeBackButtonCount: document.querySelectorAll("[data-trade-back]").length,
        tradeAmountValue: document.querySelector("[data-trade-amount]")?.value || "",
        tradeEstimateText: document.querySelector("[data-trade-estimate]")?.textContent.trim() || "",
        tradeActiveRange: document.querySelector(".trade-range-button.is-active")?.textContent.trim() || "",
        tradeChartDate: document.querySelector(".trade-chart-date")?.textContent.trim() || "",
        tradeChartPath: document.querySelector(".trade-chart-line")?.getAttribute("d") || "",
        tradeActiveSide: document.querySelector(".trade-side-button.is-active")?.dataset.tradeSide || "",
        tradeActionOpen: Boolean(document.querySelector("[data-trade-actions]:not([hidden])")),
        tradeActionCount: document.querySelectorAll("[data-trade-action]").length,
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
        scenarioRowCount: document.querySelectorAll(".market-scenario-row").length,
        expandedCardCount: document.querySelectorAll(".market-card-expanded").length
      },
      layout: (() => {
        const shell = document.querySelector(".popup-shell");
        const firstCard = document.querySelector("a.market-card");
        const results = document.querySelector("#results-region");
        const footer = document.querySelector(".privacy-footer");
        const shellRect = shell ? shell.getBoundingClientRect() : null;
        const cardRect = firstCard ? firstCard.getBoundingClientRect() : null;
        const resultsRect = results ? results.getBoundingClientRect() : null;
        const footerRect = footer ? footer.getBoundingClientRect() : null;
        return {
          innerWidth,
          innerHeight,
          bodyWidth: document.body.getBoundingClientRect().width,
          bodyHeight: document.body.getBoundingClientRect().height,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
          shellWidth: shellRect ? shellRect.width : 0,
          shellHeight: shellRect ? shellRect.height : 0,
          shellBottom: shellRect ? shellRect.bottom : 0,
          resultsBottom: resultsRect ? resultsRect.bottom : 0,
          footerTop: footerRect ? footerRect.top : 0,
          footerBottom: footerRect ? footerRect.bottom : 0,
          firstCardWidth: cardRect ? cardRect.width : 0,
          visibleCardCount: [...document.querySelectorAll("a.market-card")]
            .filter((card) => {
              if (!resultsRect) {
                return false;
              }
              const rect = card.getBoundingClientRect();
              return rect.top >= resultsRect.top - 1 && rect.bottom <= resultsRect.bottom + 1;
            }).length
        };
      })(),
      emptyText: document.querySelector(".empty-state")?.innerText || "",
      errorText: document.querySelector(".error-state")?.innerText || ""
    };
  })()`);
}

async function waitForFinalPopupState(root, sessionId) {
  for (let index = 0; index < 90; index += 1) {
    const state = await readPopupState(root, sessionId);
    if (["complete", "error"].includes(state.phase)) {
      return state;
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for the popup to reach a final state.");
}

async function waitForPopupImages(root, sessionId) {
  for (let index = 0; index < 20; index += 1) {
    const complete = await evaluatePopup(root, sessionId, `(() => {
      const images = [...document.querySelectorAll("img.market-image")];
      return images.length === 0 || images.every((image) => image.complete && image.naturalWidth > 0);
    })()`);
    if (complete) {
      return;
    }
    await delay(150);
  }
}

async function waitForPopupCondition(root, sessionId, predicate, label, timeoutMs = 45000) {
  const start = Date.now();
  let latest = null;
  while (Date.now() - start < timeoutMs) {
    latest = await readPopupState(root, sessionId);
    if (predicate(latest)) {
      return latest;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for popup condition "${label}". Last state: ${JSON.stringify({
    phase: latest && latest.phase,
    activeTab: latest && latest.visual && latest.visual.activeTabText,
    status: latest && latest.visual && latest.visual.statusText,
    emptyText: latest && latest.emptyText,
    errorText: latest && latest.errorText
  })}`);
}

async function capturePopupScreenshot(root, sessionId, prefix) {
  const shellClip = await evaluatePopup(root, sessionId, `(() => {
    const shell = document.querySelector(".popup-shell");
    if (!shell) {
      return null;
    }
    const rect = shell.getBoundingClientRect();
    return {
      x: Math.max(0, rect.left),
      y: Math.max(0, rect.top),
      width: rect.width,
      height: rect.height,
      scale: 1
    };
  })()`).catch(() => null);
  const params = {
    format: "png",
    captureBeyondViewport: true
  };
  if (shellClip && shellClip.width > 0 && shellClip.height > 0) {
    params.clip = shellClip;
  }
  const result = await sendToTarget(root, sessionId, "Page.captureScreenshot", params);
  const file = artifactPath(prefix, "png");
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  return path.relative(path.join(__dirname, ".."), file);
}

async function clickFirstPopupCard(root, sessionId) {
  const card = await evaluatePopup(root, sessionId, `(() => {
    const node = document.querySelector('a.market-card[data-market-source="Polymarket"]') || document.querySelector("a.market-card");
    if (!node) {
      return null;
    }
    node.scrollIntoView({ block: "center", inline: "center" });
    const rect = node.getBoundingClientRect();
    return {
      href: node.dataset.marketUrl || node.href,
      x: rect.left + (rect.width / 2),
      y: rect.top + (rect.height / 2)
    };
  })()`);

  if (!card || !card.href) {
    throw new Error("The popup did not render a clickable market card.");
  }

  await sendToTarget(root, sessionId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: card.x,
    y: card.y,
    button: "none"
  });
  await sendToTarget(root, sessionId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: card.x,
    y: card.y,
    button: "left",
    clickCount: 1
  });
  await sendToTarget(root, sessionId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: card.x,
    y: card.y,
    button: "left",
    clickCount: 1
  });

  return card.href;
}

async function clickPopupSelector(root, sessionId, selector) {
  const target = await evaluatePopup(root, sessionId, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + (rect.width / 2),
      y: rect.top + (rect.height / 2)
    };
  })()`);

  if (!target) {
    throw new Error(`Could not find popup control ${selector}.`);
  }

  await sendToTarget(root, sessionId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: target.x,
    y: target.y,
    button: "none"
  });
  await sendToTarget(root, sessionId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: target.x,
    y: target.y,
    button: "left",
    clickCount: 1
  });
  await sendToTarget(root, sessionId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: target.x,
    y: target.y,
    button: "left",
    clickCount: 1
  });
}

async function ensurePopupMenuOpen(root, sessionId) {
  await evaluatePopup(root, sessionId, `(() => {
    const shell = document.querySelector(".popup-shell");
    const button = document.querySelector("#menu-button");
    if (shell) {
      shell.classList.add("is-menu-open");
    }
    if (button) {
      button.setAttribute("aria-expanded", "true");
    }
    return true;
  })()`);
}

async function waitForExpandedFinalState(page) {
  await page.waitForFunction(() => {
    const status = document.querySelector("#status-region .scan-status");
    return status && ["complete", "error"].includes(status.dataset.phase);
  }, { timeout: 45000 });
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll("img.market-image")];
    return images.length === 0 || images.every((image) => image.complete && image.naturalWidth > 0);
  }, { timeout: 10000 }).catch(() => {});
}

async function readExpandedPageState(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".popup-shell");
    const results = document.querySelector("#results-region");
    const footer = document.querySelector(".privacy-footer");
    const shellRect = shell ? shell.getBoundingClientRect() : null;
    const resultsRect = results ? results.getBoundingClientRect() : null;
    const footerRect = footer ? footer.getBoundingClientRect() : null;
    return {
      url: location.href,
      phase: document.querySelector("#status-region .scan-status")?.dataset.phase || "",
      finalStatus: document.querySelector("#status-region")?.innerText.replace(/\s+/g, " ").trim() || "",
      emptyText: document.querySelector(".empty-state")?.innerText.replace(/\s+/g, " ").trim() || "",
      errorText: document.querySelector(".error-state")?.innerText.replace(/\s+/g, " ").trim() || "",
      cardLinks: [...document.querySelectorAll("a.market-card")].map((card) => card.dataset.marketUrl || card.href),
      cardTitles: [...document.querySelectorAll("a.market-card .market-title, a.market-card .event-parent-title")].map((node) => node.textContent),
      visual: {
        articlePreviewCount: document.querySelectorAll(".article-context").length,
        fallbackIconCount: document.querySelectorAll(".market-card .market-image-fallback").length,
        remoteImageCount: document.querySelectorAll(".market-card img.market-image").length,
        loadedRemoteImageCount: [...document.querySelectorAll(".market-card img.market-image")].filter((image) => image.complete && image.naturalWidth > 0).length,
        traderMetaCount: [...document.querySelectorAll(".market-meta-item")].filter((node) => /traders/i.test(node.textContent || "")).length,
        volumeMetaCount: [...document.querySelectorAll(".market-meta-item")].filter((node) => /volume/i.test(node.textContent || "")).length,
        metaText: [...document.querySelectorAll(".market-meta-row")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
        brandDividerWidth: parseFloat(getComputedStyle(document.querySelector(".brand-lockup > div") || document.body).borderLeftWidth) || 0,
        tabCount: document.querySelectorAll(".tab-button").length,
        hiddenUtilityTabStopCount: [...document.querySelectorAll(".utility-control input, .utility-control button, .utility-control a, .utility-control select, .utility-control textarea")]
          .filter((node) => node.tabIndex >= 0).length,
        scoreBadgeCount: document.querySelectorAll(".market-score").length,
        openLinkCount: document.querySelectorAll(".open-link").length,
        searchHeight: document.querySelector(".market-search")?.getBoundingClientRect().height || 0,
        privacyText: document.querySelector(".privacy-footer")?.textContent.replace(/\s+/g, " ").trim() || "",
        surfaceText: document.querySelector("#surface-message:not([hidden])")?.textContent.replace(/\s+/g, " ").trim() || "",
        activeTabText: document.querySelector(".tab-button.is-active")?.textContent.trim() || "",
        activeElementId: document.activeElement?.id || "",
        tradeToggleCount: document.querySelectorAll(".trade-toggle").length,
        tradePressed: document.querySelector("#trade-toggle-button")?.getAttribute("aria-pressed") || "",
        menuButtonCount: document.querySelectorAll(".menu-button").length,
        menuOpen: document.querySelector(".popup-shell")?.classList.contains("is-menu-open") || false,
        menuExpanded: document.querySelector("#menu-button")?.getAttribute("aria-expanded") || "",
        actionMenuItemCount: document.querySelectorAll(".action-menu-item").length,
        sourceBadgeCount: document.querySelectorAll(".source-badge").length,
        sourcePolymarketCount: document.querySelectorAll(".source-badge.source-polymarket").length,
        sourceHyperliquidCount: document.querySelectorAll(".source-badge.source-hyperliquid").length,
        sourceBadgeLabels: [...document.querySelectorAll(".source-badge")].map((badge) => badge.getAttribute("aria-label") || badge.textContent.trim()),
        tradeViewCount: document.querySelectorAll(".trade-view").length,
        tradeViewTitle: document.querySelector(".trade-hero h2")?.textContent.trim() || "",
        tradeMarketSource: document.querySelector(".trade-view .source-badge")?.getAttribute("aria-label") || "",
        tradeBuyText: document.querySelector(".trade-buy-button")?.textContent.trim() || "",
        tradeOrderBookRows: document.querySelectorAll(".trade-book-row").length,
        tradeBackButtonCount: document.querySelectorAll("[data-trade-back]").length,
        tradeAmountValue: document.querySelector("[data-trade-amount]")?.value || "",
        tradeEstimateText: document.querySelector("[data-trade-estimate]")?.textContent.trim() || "",
        tradeActiveRange: document.querySelector(".trade-range-button.is-active")?.textContent.trim() || "",
        tradeChartDate: document.querySelector(".trade-chart-date")?.textContent.trim() || "",
        tradeChartPath: document.querySelector(".trade-chart-line")?.getAttribute("d") || "",
        tradeActiveSide: document.querySelector(".trade-side-button.is-active")?.dataset.tradeSide || "",
        tradeActionOpen: Boolean(document.querySelector("[data-trade-actions]:not([hidden])")),
        tradeActionCount: document.querySelectorAll("[data-trade-action]").length,
        scenarioRowCount: document.querySelectorAll(".market-scenario-row").length,
        expandedCardCount: document.querySelectorAll(".market-card-expanded").length
      },
      layout: {
        innerWidth,
        innerHeight,
        bodyWidth: document.body.getBoundingClientRect().width,
        bodyHeight: document.body.getBoundingClientRect().height,
        shellWidth: shellRect ? shellRect.width : 0,
        shellHeight: shellRect ? shellRect.height : 0,
        resultsBottom: resultsRect ? resultsRect.bottom : 0,
        footerTop: footerRect ? footerRect.top : 0,
        footerBottom: footerRect ? footerRect.bottom : 0,
        shellBottom: shellRect ? shellRect.bottom : 0,
        visibleCardCount: [...document.querySelectorAll("a.market-card")]
          .filter((card) => {
            if (!resultsRect) {
              return false;
            }
            const rect = card.getBoundingClientRect();
            return rect.top >= resultsRect.top - 1 && rect.bottom <= resultsRect.bottom + 1;
          }).length
      }
    };
  });
}

function isSupportedVenueHost(hostname) {
  return [
    "polymarket.com",
    "www.polymarket.com",
    "app.hyperliquid.xyz",
    "hyperliquid.xyz",
    "www.hyperliquid.xyz"
  ].includes(hostname);
}

function assertSupportedVenueLinks(cardLinks, label) {
  if (!cardLinks.length) {
    throw new Error(`${label} rendered no market cards.`);
  }
  for (const href of cardLinks) {
    const url = new URL(href);
    if (url.protocol !== "https:" || !isSupportedVenueHost(url.hostname)) {
      throw new Error(`${label} rendered an invalid venue link: ${href}`);
    }
  }
}

function validateExpandedState(expandedState, report, label = "Larger view") {
  const finalStatus = expandedState.finalStatus || expandedState.statusText || "";
  if (!expandedState.url.includes("/src/popup/popup.html?expanded=1&sourceTabId=")) {
    throw new Error(`${label} opened the wrong extension URL: ${expandedState.url}`);
  }
  if (expandedState.phase === "error") {
    throw new Error(`${label} reached an error state: ${expandedState.errorText || finalStatus}`);
  }
  if (!expandedState.cardLinks.length && report.cardCount > 0) {
    throw new Error(`${label} rendered no Polymarket cards even though the source popup rendered ${report.cardCount}: ${finalStatus}`);
  }
  if (!expandedState.cardLinks.length && !/No related|No strong|No readable/i.test(`${finalStatus} ${expandedState.emptyText}`)) {
    throw new Error(`${label} rendered no cards without a valid no-match state: ${finalStatus} ${expandedState.emptyText}`);
  }
  if (
    expandedState.layout.innerWidth < 480 ||
    expandedState.layout.innerHeight < 760 ||
    expandedState.layout.bodyWidth < 480 ||
    expandedState.layout.shellWidth < 450 ||
    expandedState.layout.shellHeight < 810 ||
    expandedState.layout.shellHeight > 820 ||
    expandedState.layout.footerBottom > expandedState.layout.shellBottom + 1 ||
    expandedState.layout.resultsBottom > expandedState.layout.footerTop + 1 ||
    (expandedState.cardLinks.length >= 4 && expandedState.layout.visibleCardCount < 3) ||
    (expandedState.cardLinks.length === 3 && expandedState.layout.visibleCardCount < 3)
  ) {
    throw new Error(`${label} rendered outside target bounds: ${JSON.stringify(expandedState.layout)}`);
  }
  if (expandedState.visual.articlePreviewCount !== 0) {
    throw new Error(`${label} repeated article preview content.`);
  }
  if (
    expandedState.visual.tradeToggleCount !== 1 ||
    expandedState.visual.menuOpen !== true ||
    expandedState.visual.menuExpanded !== "true" ||
    expandedState.visual.menuButtonCount !== 1 ||
    expandedState.visual.actionMenuItemCount !== 3 ||
    expandedState.visual.hiddenUtilityTabStopCount !== 0 ||
    expandedState.visual.scoreBadgeCount !== 0 ||
    expandedState.visual.openLinkCount !== 0 ||
    (expandedState.cardLinks.length > 0 && (
      expandedState.visual.sourceBadgeCount !== expandedState.cardLinks.length ||
      expandedState.visual.sourcePolymarketCount + expandedState.visual.sourceHyperliquidCount !== expandedState.cardLinks.length ||
      expandedState.visual.expandedCardCount !== 1 ||
      expandedState.visual.scenarioRowCount === 0
    ))
  ) {
    throw new Error(`${label} missing target visual structure: ${JSON.stringify(expandedState.visual)}`);
  }
  if (expandedState.cardLinks.length > 0 && (
    expandedState.visual.remoteImageCount + expandedState.visual.fallbackIconCount !== expandedState.cardLinks.length ||
    expandedState.visual.remoteImageCount === 0 ||
    expandedState.visual.loadedRemoteImageCount === 0 ||
    expandedState.visual.loadedRemoteImageCount !== expandedState.visual.remoteImageCount
  )) {
    throw new Error(`${label} did not use loaded Polymarket images: ${JSON.stringify(expandedState.visual)}`);
  }
  if (
    expandedState.visual.traderMetaCount !== 0 ||
    expandedState.visual.volumeMetaCount !== 0 ||
    expandedState.visual.metaText.length !== 0
  ) {
    throw new Error(`${label} rendered removed trader/volume metadata: ${JSON.stringify(expandedState.visual)}`);
  }
  if (expandedState.visual.activeTabText !== "Related") {
    throw new Error(`${label} active tab drifted from target: ${expandedState.visual.activeTabText}`);
  }
  if (!/Insights by Rainbow\s+Updated just now/.test(expandedState.visual.privacyText)) {
    throw new Error(`${label} missing target Rainbow footer copy: ${expandedState.visual.privacyText}`);
  }
}

async function verifyExpandedPopup({
  context,
  root,
  popupSessionId,
  captureArtifacts,
  report
}) {
  const expandedPagePromise = context.waitForEvent("page", { timeout: 15000 }).then(
    (page) => ({ page }),
    (error) => ({ error })
  );

  await ensurePopupMenuOpen(root, popupSessionId);
  await clickPopupSelector(root, popupSessionId, "#settings-button");
  const expandedPageResult = await expandedPagePromise;
  if (expandedPageResult.error) {
    throw new Error(`Opening the larger extension view did not create a popup window: ${expandedPageResult.error.message}`);
  }

  const expandedPage = expandedPageResult.page;
  try {
    await expandedPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await waitForExpandedFinalState(expandedPage);
    const expandedState = await readExpandedPageState(expandedPage);
    const expandedScreenshot = captureArtifacts
      ? artifactPath("browser-smoke-expanded-popup", "png")
      : "";
    if (expandedScreenshot) {
      await expandedPage.locator(".popup-shell").screenshot({ path: expandedScreenshot });
    }

    report.expandedPopup = {
      ...expandedState,
      screenshot: expandedScreenshot ? path.relative(path.join(__dirname, ".."), expandedScreenshot) : ""
    };

    for (const href of expandedState.cardLinks) {
      const url = new URL(href);
      if (url.protocol !== "https:" || !isSupportedVenueHost(url.hostname)) {
        throw new Error(`Invalid venue link rendered in larger view: ${href}`);
      }
    }

    validateExpandedState(expandedState, report);

    await expandedPage.click("#settings-button");
    await expandedPage.waitForFunction(() => /Settings/i.test(document.querySelector("#surface-message:not([hidden])")?.textContent || ""), null, { timeout: 5000 });
    report.expandedPopup.settingsSurface = await expandedPage.evaluate(() => (
      document.querySelector("#surface-message:not([hidden])")?.textContent.replace(/\s+/g, " ").trim() || ""
    ));
  } finally {
    await expandedPage.close().catch(() => {});
  }
}

async function verifyPopupInteractions({
  root,
  popupSessionId,
  report
}) {
  report.interactionChecks = {
    trending: null,
    search: null,
    relatedRestore: null,
    sort: null,
    menuClosed: null,
    menuOpen: null,
    menuArrow: null,
    menuEnd: null,
    menuEscape: null,
    menuOutside: null,
    footerInfo: null,
    tradeToggle: null,
    tradeToggleOff: null,
    refresh: null
  };

  await evaluatePopup(root, popupSessionId, `(() => {
    document.querySelector("#trending-tab").click();
    return true;
  })()`);
  const trendingState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.activeTabText === "Trending" && /Trending loaded/i.test(state.visual.statusText),
    "trending tab complete"
  );
  await waitForPopupImages(root, popupSessionId);
  const trendingFinal = await readPopupState(root, popupSessionId);
  assertSupportedVenueLinks(trendingFinal.cardLinks, "Trending tab");
  report.interactionChecks.trending = {
    status: trendingFinal.visual.statusText,
    cardCount: trendingFinal.cardLinks.length,
    firstTitle: trendingFinal.cardTitles[0] || "",
    loadedRemoteImageCount: trendingFinal.visual.loadedRemoteImageCount
  };
  if (trendingState.phase === "error" || trendingFinal.visual.articlePreviewCount !== 0) {
    throw new Error(`Trending tab failed target behavior: ${JSON.stringify(trendingFinal.visual)}`);
  }

  await evaluatePopup(root, popupSessionId, `(() => {
    const input = document.querySelector("#market-search-input");
    const form = document.querySelector("#market-search-form");
    input.value = "bitcoin";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  })()`);
  await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.activeTabText === "Search" && /Search complete/i.test(state.visual.statusText),
    "market search complete"
  );
  await waitForPopupImages(root, popupSessionId);
  const searchFinal = await readPopupState(root, popupSessionId);
  assertSupportedVenueLinks(searchFinal.cardLinks, "Search tab");
  report.interactionChecks.search = {
    status: searchFinal.visual.statusText,
    cardCount: searchFinal.cardLinks.length,
    firstTitle: searchFinal.cardTitles[0] || "",
    loadedRemoteImageCount: searchFinal.visual.loadedRemoteImageCount
  };
  if (searchFinal.visual.articlePreviewCount !== 0) {
    throw new Error(`Search tab repeated article preview content: ${JSON.stringify(searchFinal.visual)}`);
  }

  await evaluatePopup(root, popupSessionId, `(() => {
    document.querySelector("#related-tab").click();
    return true;
  })()`);
  const relatedState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.activeTabText === "Related" && /Local scan complete/i.test(state.visual.statusText),
    "related tab restored"
  );
  report.interactionChecks.relatedRestore = {
    status: relatedState.visual.statusText,
    cardCount: relatedState.cardLinks.length
  };

  if (relatedState.cardLinks.length > 0) {
    await evaluatePopup(root, popupSessionId, `(() => {
      document.querySelector("[data-sort-control]").click();
      return true;
    })()`);
    const sortedState = await waitForPopupCondition(
      root,
      popupSessionId,
      (state) => state.visual.activeTabText === "Related" && state.visual.sortLabel === "Volume",
      "sort control changed to volume"
    );
    report.interactionChecks.sort = {
      label: sortedState.visual.sortLabel,
      cardCount: sortedState.cardLinks.length,
      firstTitle: sortedState.cardTitles[0] || ""
    };
  } else {
    report.interactionChecks.sort = {
      skipped: true,
      reason: "related tab had no market cards to sort"
    };
  }

  await ensurePopupMenuOpen(root, popupSessionId);
  await clickPopupSelector(root, popupSessionId, "#menu-button");
  const menuClosedState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => !state.visual.menuOpen && state.visual.menuExpanded === "false",
    "menu closed"
  );
  report.interactionChecks.menuClosed = {
    menuOpen: menuClosedState.visual.menuOpen,
    menuExpanded: menuClosedState.visual.menuExpanded
  };

  await clickPopupSelector(root, popupSessionId, "#menu-button");
  const menuOpenState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.menuOpen && state.visual.menuExpanded === "true" && state.visual.activeElementId === "settings-button",
    "menu opened"
  );
  report.interactionChecks.menuOpen = {
    menuOpen: menuOpenState.visual.menuOpen,
    menuExpanded: menuOpenState.visual.menuExpanded,
    activeElementId: menuOpenState.visual.activeElementId
  };

  await sendToTarget(root, popupSessionId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40
  });
  await sendToTarget(root, popupSessionId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40
  });
  const menuArrowState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.menuOpen && state.visual.activeElementId === "refresh-button",
    "menu arrow navigation"
  );
  report.interactionChecks.menuArrow = {
    activeElementId: menuArrowState.visual.activeElementId
  };

  await sendToTarget(root, popupSessionId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "End",
    code: "End",
    windowsVirtualKeyCode: 35,
    nativeVirtualKeyCode: 35
  });
  await sendToTarget(root, popupSessionId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "End",
    code: "End",
    windowsVirtualKeyCode: 35,
    nativeVirtualKeyCode: 35
  });
  const menuEndState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.menuOpen && state.visual.activeElementId === "privacy-info-button",
    "menu end navigation"
  );
  report.interactionChecks.menuEnd = {
    activeElementId: menuEndState.visual.activeElementId
  };

  await sendToTarget(root, popupSessionId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27
  });
  await sendToTarget(root, popupSessionId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27
  });
  const menuEscapeState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => !state.visual.menuOpen && state.visual.menuExpanded === "false" && state.visual.activeElementId === "menu-button",
    "menu closed by escape"
  );
  report.interactionChecks.menuEscape = {
    menuOpen: menuEscapeState.visual.menuOpen,
    menuExpanded: menuEscapeState.visual.menuExpanded,
    activeElementId: menuEscapeState.visual.activeElementId
  };

  await clickPopupSelector(root, popupSessionId, "#menu-button");
  await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.menuOpen && state.visual.menuExpanded === "true",
    "menu reopened before outside click"
  );
  await clickPopupSelector(root, popupSessionId, ".hero-region h1");
  const menuOutsideState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => !state.visual.menuOpen && state.visual.menuExpanded === "false",
    "menu closed by outside click"
  );
  report.interactionChecks.menuOutside = {
    menuOpen: menuOutsideState.visual.menuOpen,
    menuExpanded: menuOutsideState.visual.menuExpanded
  };

  await clickPopupSelector(root, popupSessionId, "#menu-button");
  await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.menuOpen && state.visual.menuExpanded === "true",
    "menu reopened before footer info"
  );
  await clickPopupSelector(root, popupSessionId, "#privacy-info-button");
  const footerState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => /Information/i.test(state.visual.surfaceText) && /No data leaves device/i.test(state.visual.surfaceText),
    "privacy footer info"
  );
  report.interactionChecks.footerInfo = {
    status: footerState.visual.statusText,
    surface: footerState.visual.surfaceText
  };

  await clickPopupSelector(root, popupSessionId, "#trade-toggle-button");
  const tradeState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => /Trade mode on/i.test(state.visual.surfaceText) && state.visual.tradePressed === "true",
    "trade toggle status"
  );
  report.interactionChecks.tradeToggle = {
    status: tradeState.visual.statusText,
    surface: tradeState.visual.surfaceText,
    pressed: tradeState.visual.tradePressed
  };

  await clickPopupSelector(root, popupSessionId, "#trade-toggle-button");
  const tradeOffState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => /Trade mode off/i.test(state.visual.surfaceText) && state.visual.tradePressed === "false",
    "trade toggle off status"
  );
  report.interactionChecks.tradeToggleOff = {
    status: tradeOffState.visual.statusText,
    surface: tradeOffState.visual.surfaceText,
    pressed: tradeOffState.visual.tradePressed
  };

  await ensurePopupMenuOpen(root, popupSessionId);
  await clickPopupSelector(root, popupSessionId, "#refresh-button");
  const refreshedState = await waitForPopupCondition(
    root,
    popupSessionId,
    (state) => state.visual.activeTabText === "Related" && /Local scan complete|No readable article/i.test(state.visual.statusText),
    "refresh complete"
  );
  report.interactionChecks.refresh = {
    status: refreshedState.visual.statusText,
    surface: refreshedState.visual.surfaceText,
    cardCount: refreshedState.cardLinks.length
  };
}

async function verifyVenuePage(page, href) {
  await page.waitForLoadState("domcontentloaded", { timeout: 45000 }).catch(() => {});
  const finalUrl = page.url();
  const finalHost = new URL(finalUrl).hostname;
  if (!isSupportedVenueHost(finalHost)) {
    throw new Error(`Venue link navigated to unexpected host: ${finalUrl}`);
  }

  return {
    href,
    finalUrl,
    status: null,
    title: await page.title()
  };
}

async function runActionPopupSmoke({
  extensionPath,
  article,
  chromePath,
  headless = true,
  pauseBeforeClickMs = 0,
  keepOpenMs = 0,
  leaveOpen = false,
  skipClicks = false,
  captureArtifacts = true,
  verifyExpanded = false,
  verifyInteractions = false
}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "predmarket-extension-smoke-"));
  const commandKey = actionCommandKey();
  const report = {
    mode: headless ? "headless-live-chrome-user-activation" : "headed-live-chrome-user-activation",
    activationMethod: `${ACTION_COMMAND_NAME} via ${commandKey.display} CDP key event`,
    chromePath,
    extensionPath,
    userDataDir,
    pauseBeforeClickMs,
    keepOpenMs,
    leaveOpen,
    skipClicks,
    captureArtifacts,
    verifyExpanded,
    verifyInteractions,
    extensionId: "",
    extensionCommand: null,
    preActivationAccess: null,
    popupOpenedInBrowser: false,
    finalStatus: "",
    phases: [],
    cardCount: 0,
    cardLinks: [],
    cardTitles: [],
    articleContext: null,
    polymarketCandidates: [],
    displayGroups: [],
    popupLayout: null,
    screenshot: "",
    expandedPopup: null,
    interactionChecks: null,
    openedLinkChecks: [],
    clickedLinkCheck: null,
    emptyText: "",
    errorText: "",
    ok: false
  };

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: chromePath,
      headless,
      viewport: {
        width: 1400,
        height: 1200
      },
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--window-size=1400,1200",
        "--no-first-run",
        "--no-default-browser-check"
      ]
    });

    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent("serviceworker", { timeout: 10000 });
    }
    report.extensionId = new URL(worker.url()).host;
    report.extensionCommand = assertActionCommand(await worker.evaluate(() => chrome.commands.getAll()));

    const articlePage = await context.newPage();
    await articlePage.goto(article.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await articlePage.bringToFront();

    const root = await context.newCDPSession(articlePage);
    await root.send("Target.setDiscoverTargets", { discover: true });
    report.preActivationAccess = await probePreActivationAccess(worker);
    if (!report.preActivationAccess.blocked) {
      throw new Error("The extension could read the active tab before user-style activation.");
    }

    await dispatchActionCommand(root, commandKey);

    const popupTarget = await waitForPopupTarget(root, report.extensionId);
    report.popupOpenedInBrowser = true;
    const popupSessionId = await attachPopup(root, popupTarget);
    await waitForFinalPopupState(root, popupSessionId);
    await waitForPopupImages(root, popupSessionId);
    const popupState = await readPopupState(root, popupSessionId);

    report.finalStatus = popupState.statusText;
    report.phases = popupState.phases.map((status) => status.phase);
    report.cardLinks = popupState.cardLinks;
    report.cardTitles = popupState.cardTitles;
    report.visual = popupState.visual;
    report.articleContext = popupState.articleContext;
    report.polymarketCandidates = popupState.polymarketCandidates;
    report.displayGroups = popupState.displayGroups;
    report.cardCount = popupState.cardLinks.length;
    report.popupLayout = popupState.layout;
    report.emptyText = popupState.emptyText;
    report.errorText = popupState.errorText;
    report.screenshot = captureArtifacts
      ? await capturePopupScreenshot(root, popupSessionId, "browser-smoke-popup")
      : "";
    if (popupState.expanded) {
      report.expandedPopup = {
        ...popupState,
        finalStatus: popupState.statusText,
        screenshot: report.screenshot
      };
    }
    for (const href of report.cardLinks) {
      const url = new URL(href);
      if (url.protocol !== "https:" || !isSupportedVenueHost(url.hostname)) {
        throw new Error(`Invalid venue link rendered: ${href}`);
      }
    }

    if (popupState.phase === "error") {
      throw new Error(popupState.errorText || popupState.statusText || "Popup reached an error state.");
    }
    if (!popupState.expanded) {
      throw new Error(`Extension action did not open the target full-height matcher view: ${popupState.url}`);
    }

    if (
      !report.popupLayout ||
      report.popupLayout.innerWidth < 320 ||
      report.popupLayout.bodyWidth < 320 ||
      report.popupLayout.documentWidth < 320 ||
      report.popupLayout.shellWidth < 320 ||
      report.popupLayout.shellHeight < 580 ||
      report.popupLayout.footerBottom > report.popupLayout.shellBottom + 1 ||
      report.popupLayout.resultsBottom > report.popupLayout.footerTop + 1 ||
      (report.cardLinks.length > 0 && report.popupLayout.firstCardWidth < 300) ||
      (report.cardLinks.length >= 2 && report.popupLayout.visibleCardCount < 2)
    ) {
      throw new Error(`Extension popup rendered outside target bounds: ${JSON.stringify(report.popupLayout)}`);
    }

    if (report.visual.articlePreviewCount !== 0) {
      throw new Error("Extension popup repeated article preview content.");
    }
    if (
      report.visual.tradeToggleCount !== 1 ||
      report.visual.menuOpen !== true ||
      report.visual.menuExpanded !== "true" ||
      report.visual.menuButtonCount !== 1 ||
      report.visual.actionMenuItemCount !== 3 ||
      report.visual.hiddenUtilityTabStopCount !== 0 ||
      report.visual.scoreBadgeCount !== 0 ||
      report.visual.openLinkCount !== 0 ||
      (report.cardLinks.length > 0 && (
        report.visual.sourceBadgeCount !== report.cardLinks.length ||
        report.visual.sourcePolymarketCount + report.visual.sourceHyperliquidCount !== report.cardLinks.length ||
        report.visual.expandedCardCount !== 1 ||
        report.visual.scenarioRowCount === 0 ||
        report.visual.expandedSourceLabelRowOverlap
      ))
    ) {
      throw new Error(`Extension popup missing target visual structure: ${JSON.stringify(report.visual)}`);
    }
    const displayGroupsWithImages = (report.displayGroups || []).filter((group) => group && group.image).length;
    if (report.cardLinks.length > 0 && (
      report.visual.remoteImageCount + report.visual.fallbackIconCount !== report.cardLinks.length ||
      (displayGroupsWithImages > 0 && report.visual.remoteImageCount === 0) ||
      (displayGroupsWithImages > 0 && report.visual.loadedRemoteImageCount === 0) ||
      report.visual.loadedRemoteImageCount !== report.visual.remoteImageCount ||
      report.visual.matchLimitCount !== 0 ||
      report.visual.traderMetaCount !== 0 ||
      report.visual.volumeMetaCount !== 0 ||
      report.visual.metaText.length !== 0
    )) {
      throw new Error(`Extension popup card surface drifted from target visuals: ${JSON.stringify(report.visual)}`);
    }
    if (report.cardLinks.length > 0 && report.visual.activeTabText !== "Related") {
      throw new Error(`Extension popup active tab drifted from target: ${report.visual.activeTabText}`);
    }
    if (report.visual.decisionTextCount !== 0) {
      throw new Error(`Extension popup still contains the removed decision/high-confidence surface: ${JSON.stringify(report.visual)}`);
    }
    if (!/Insights by Rainbow\s+Updated just now/.test(report.visual.privacyText)) {
      throw new Error(`Extension popup missing target Rainbow footer copy: ${report.visual.privacyText}`);
    }
    if (report.cardLinks.length > 0 && !/Local scan complete/.test(report.visual.statusText)) {
      throw new Error(`Extension popup missing target local scan copy: ${report.visual.statusText}`);
    }

    const expectedPhases = ["reading", "extracting", "searching", "complete"];
    for (const phase of expectedPhases) {
      if (!report.phases.includes(phase)) {
        throw new Error(`Popup phase history did not include ${phase}. Saw: ${report.phases.join(", ")}`);
      }
    }

    if (verifyInteractions) {
      await verifyPopupInteractions({
        root,
        popupSessionId,
        report
      });
    }

    if (verifyExpanded) {
      if (!skipClicks) {
        throw new Error("The expanded-popup smoke must be run with --skip-clicks because opening a second extension window closes the action popup.");
      }
      if (popupState.expanded) {
        validateExpandedState(report.expandedPopup, report, "Primary extension view");
      } else {
        await verifyExpandedPopup({
          context,
          root,
          popupSessionId,
          captureArtifacts,
          report
        });
      }
    }

    if (skipClicks) {
      report.clickedLinkCheck = {
        skipped: true,
        reason: "demo mode leaves the popup open without clicking result cards"
      };
    } else if (!report.cardLinks.length) {
      if (!/No strong/i.test(report.finalStatus) && !/No strong Polymarket match/i.test(report.emptyText)) {
        throw new Error("The browser smoke rendered no clickable cards without reaching the no-match state.");
      }
      report.clickedLinkCheck = {
        skipped: true,
        reason: "no high-confidence venue cards rendered"
      };
    } else {
      if (pauseBeforeClickMs > 0) {
        await delay(pauseBeforeClickMs);
      }
      let clickedHref = "";
      try {
        clickedHref = await clickFirstPopupCard(root, popupSessionId);
      } catch (error) {
        throw error;
      }
      const tradeState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => state.visual.tradeViewCount === 1 &&
          state.visual.tradeBackButtonCount === 1 &&
          state.visual.tradeOrderBookRows >= 10 &&
          /^Buy\s+/.test(state.visual.tradeBuyText),
        "card click trade view"
      );
      await waitForPopupImages(root, popupSessionId);
      const tradeScreenshot = captureArtifacts
        ? await capturePopupScreenshot(root, popupSessionId, "browser-smoke-trade")
        : "";
      const initialChartPath = tradeState.visual.tradeChartPath;
      const hyperliquidTrade = tradeState.visual.tradeMarketSource === "Hyperliquid";
      await clickPopupSelector(root, popupSessionId, "[data-trade-range='1Y']");
      const rangeState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => state.visual.tradeActiveRange === "1Y" &&
          state.visual.tradeChartPath &&
          state.visual.tradeChartPath !== initialChartPath,
        "trade range chart update"
      );

      await clickPopupSelector(root, popupSessionId, "[data-trade-side='no']");
      const sideState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => state.visual.tradeActiveSide === "no" &&
          (hyperliquidTrade ? /^Buy\s+Short/.test(state.visual.tradeBuyText) : /^Buy\s+No/.test(state.visual.tradeBuyText)),
        "trade side update"
      );

      await clickPopupSelector(root, popupSessionId, "[data-trade-max]");
      const maxState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => state.visual.tradeAmountValue === "$1,000" &&
          (hyperliquidTrade ? /Est\. contracts:/.test(state.visual.tradeEstimateText) : /Est\. shares:/.test(state.visual.tradeEstimateText)),
        "trade max amount update"
      );

      await clickPopupSelector(root, popupSessionId, "[data-trade-menu]");
      const actionsState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => state.visual.tradeActionOpen === true &&
          state.visual.tradeActionCount >= 2,
        "trade action popover"
      );

      await clickPopupSelector(root, popupSessionId, "[data-trade-action='info']");
      const infoState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => /Information/i.test(state.visual.surfaceText) &&
          state.visual.tradeActionOpen === false,
        "trade information action"
      );

      await clickPopupSelector(root, popupSessionId, "[data-trade-buy]");
      const buyState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => /Trade preview/i.test(state.visual.surfaceText),
        "trade buy preview"
      );

      await clickPopupSelector(root, popupSessionId, "[data-trade-back]");
      const backState = await waitForPopupCondition(
        root,
        popupSessionId,
        (state) => state.visual.tradeViewCount === 0 &&
          state.cardLinks.length > 0,
        "trade back to market list"
      );
      report.clickedLinkCheck = {
        href: clickedHref,
        internalTradeView: true,
        title: tradeState.visual.tradeViewTitle,
        buyButton: tradeState.visual.tradeBuyText,
        amount: tradeState.visual.tradeAmountValue,
        orderBookRows: tradeState.visual.tradeOrderBookRows,
        controls: {
          range: rangeState.visual.tradeActiveRange,
          chartDate: rangeState.visual.tradeChartDate,
          side: sideState.visual.tradeActiveSide,
          sideBuyButton: sideState.visual.tradeBuyText,
          maxAmount: maxState.visual.tradeAmountValue,
          maxEstimate: maxState.visual.tradeEstimateText,
          actionsOpen: actionsState.visual.tradeActionOpen,
          informationSurface: infoState.visual.surfaceText,
          buySurface: buyState.visual.surfaceText,
          backCardCount: backState.cardLinks.length
        },
        screenshot: tradeScreenshot
      };
      report.openedLinkChecks.push({
        method: "popup-card-click",
        ...report.clickedLinkCheck
      });
    }

    for (const href of skipClicks ? [] : report.cardLinks.slice(1, 3)) {
      const linkPage = await context.newPage();
      try {
        const response = await linkPage.goto(href, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });
        const finalUrl = linkPage.url();
        const finalHost = new URL(finalUrl).hostname;
        if (!isSupportedVenueHost(finalHost)) {
          throw new Error(`Venue link navigated to unexpected host: ${finalUrl}`);
        }
        report.openedLinkChecks.push({
          method: "direct-open",
          href,
          finalUrl,
          status: response ? response.status() : null,
          title: await linkPage.title()
        });
      } finally {
        await linkPage.close();
      }
    }

    report.ok = true;
    if (keepOpenMs > 0) {
      await delay(keepOpenMs);
    }
    return report;
  } finally {
    if (context && !leaveOpen) {
      await context.close();
    }
    if (!leaveOpen) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  const chromePath = chromeExecutable();
  if (!chromePath) {
    throw new Error("Chrome/Chromium was not found. Run `npx playwright-core install chromium` or set CHROME_PATH.");
  }

  const sourceRoot = path.join(__dirname, "..");
  const extensionPath = path.resolve(argValue("extension-path", sourceRoot));
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
    throw new Error(`Extension path does not contain manifest.json: ${extensionPath}`);
  }
  const article = await chooseArticleUrl();
  const demoMode = hasFlag("demo");
  const headless = demoMode ? false : !hasFlag("headed");
  const pauseBeforeClickMs = argNumber("pause-before-click-ms", 0);
  const keepOpenMs = argNumber("keep-open-ms", 0);
  const leaveOpen = demoMode || hasFlag("leave-open");
  const skipClicks = demoMode || hasFlag("skip-clicks");
  const captureArtifacts = !demoMode && !hasFlag("no-artifacts");
  const verifyExpanded = hasFlag("verify-expanded");
  const verifyInteractions = hasFlag("verify-interactions");
  const visualReference = argValue("visual-reference", "");
  const result = await runActionPopupSmoke({
    extensionPath,
    article,
    chromePath,
    headless,
    pauseBeforeClickMs,
    keepOpenMs,
    leaveOpen,
    skipClicks,
    captureArtifacts,
    verifyExpanded,
    verifyInteractions
  });
  const visualReport = runVisualReferenceCheck(
    visualReference,
    result.expandedPopup && result.expandedPopup.screenshot ? result.expandedPopup.screenshot : result.screenshot
  );

  console.log(`Opened ${article.url}`);
  console.log(`Activation: ${result.activationMethod}`);
  console.log(`Pre-activation tab access blocked: ${result.preActivationAccess.blocked}`);
  console.log(`Popup phases: ${result.phases.join(" -> ")}`);
  console.log(`Final popup status: ${result.finalStatus.replace(/\s+/g, " ")}`);
  if (result.articleContext) {
    const articleContext = result.articleContext;
    const classifier = articleContext.classifier || {};
    const topic = (articleContext.topic && articleContext.topic.label) || classifier.topic || "general";
    const angles = (classifier.marketAngles || []).slice(0, 3).join(", ") || "no angle";
    const keywords = (articleContext.keywords || []).slice(0, 6).map((keyword) => keyword.text).join(", ") || "none";
    const queries = (articleContext.queries || []).slice(0, 5).join(" | ") || "none";
    const parentEvents = (result.displayGroups || []).map((group) => group.eventTitle || group.title).filter(Boolean).slice(0, 5).join(" | ") || "none";
    console.log(`Article: ${articleContext.title || "Untitled article"}`);
    console.log(`Model: ${topic} / ${angles} (${classifier.confidence ?? "n/a"})`);
    console.log(`Keywords: ${keywords}`);
    console.log(`Queries: ${queries}`);
    console.log(`Displayed parent events: ${parentEvents}`);
  }
  console.log(`Rendered ${result.cardCount} venue card link(s).`);
  if (result.interactionChecks) {
    console.log(`Trending tab: ${result.interactionChecks.trending.cardCount} card(s), first "${result.interactionChecks.trending.firstTitle}"`);
    console.log(`Search flow: ${result.interactionChecks.search.cardCount} card(s), first "${result.interactionChecks.search.firstTitle}"`);
    if (result.interactionChecks.sort && result.interactionChecks.sort.skipped) {
      console.log(`Sort skipped: ${result.interactionChecks.sort.reason}`);
    } else if (result.interactionChecks.sort) {
      console.log(`Sort control: ${result.interactionChecks.sort.label}, first "${result.interactionChecks.sort.firstTitle}"`);
    }
    console.log(`Footer info: ${result.interactionChecks.footerInfo.status}`);
    console.log(`Refresh: ${result.interactionChecks.refresh.status.replace(/\s+/g, " ")}`);
  }
  if (result.expandedPopup) {
    console.log(`Expanded view: ${result.expandedPopup.layout.shellWidth}x${result.expandedPopup.layout.shellHeight} shell, ${result.expandedPopup.layout.visibleCardCount} full card(s) visible, screenshot ${result.expandedPopup.screenshot}`);
  }
  if (visualReport) {
    console.log(`Visual reference comparison passed:\n${visualReport}`);
  }
  if (result.clickedLinkCheck.skipped) {
    console.log(`Click skipped: ${result.clickedLinkCheck.reason}`);
  } else if (result.clickedLinkCheck.internalTradeView) {
    console.log(`Clicked ${result.clickedLinkCheck.href} into trade view "${result.clickedLinkCheck.title}"`);
  } else {
    console.log(`Clicked ${result.clickedLinkCheck.finalUrl}`);
  }
  if (leaveOpen) {
    console.log(`Leaving Chrome open with profile ${result.userDataDir}. Stop this process when you are done.`);
    setInterval(() => {}, 2 ** 30);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
