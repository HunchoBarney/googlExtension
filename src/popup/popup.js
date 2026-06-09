(function initPopup(global) {
  "use strict";

  const MIN_CONFIDENCE = 55;
  const MAYBE_MIN_CONFIDENCE = 35;
  const MAX_RESULT_GROUPS = 4;
  const MAX_RANKED_MARKETS = 12;
  const MAX_RELATED_RANKED_MARKETS = 160;
  const MAX_RELATED_RESULT_GROUPS = 160;
  const RELATED_INITIAL_VISIBLE_GROUPS = 8;
  const RELATED_BATCH_SIZE = 8;
  const LOCAL_MODEL_STRATEGY = "classifier";
  const CLASSIFIER_MODEL_FILE = "src/lib/articleAngleClassifierData.json";
  const READABILITY_FILE = "src/vendor/Readability.js";
  const EXTRACTOR_FILE = "src/lib/articleExtractor.js";
  const RUNNER_FILE = "src/content/runExtraction.js";

  const statusRegion = document.getElementById("status-region");
  const surfaceMessage = document.getElementById("surface-message");
  const resultsRegion = document.getElementById("results-region");
  const refreshButton = document.getElementById("refresh-button");
  const settingsButton = document.getElementById("settings-button");
  const privacyInfoButton = document.getElementById("privacy-info-button");
  const menuButton = document.getElementById("menu-button");
  const actionMenu = document.getElementById("action-menu");
  const tradeToggleButton = document.getElementById("trade-toggle-button");
  const searchForm = document.getElementById("market-search-form");
  const searchInput = document.getElementById("market-search-input");
  const searchButton = document.getElementById("market-search-button");
  const relatedTab = document.getElementById("related-tab");
  const trendingTab = document.getElementById("trending-tab");
  const searchTab = document.getElementById("search-tab");
  const renderer = global.PMRender;
  const signals = global.PMArticleSignals;
  const polymarket = global.PMPolymarket;
  const hyperliquid = global.PMHyperliquid || null;
  const params = new URLSearchParams(global.location.search || "");
  const expandedMode = params.get("expanded") === "1";
  const sourceTabId = Number(params.get("sourceTabId"));
  if (expandedMode) {
    document.documentElement.dataset.viewMode = "expanded";
  }
  const SORT_MODES = [
    { key: "best", label: "Best match" },
    { key: "volume", label: "Volume" },
    { key: "expiry", label: "Ending soon" }
  ];
  let classifierModelPromise = null;
  let latestRelatedGroups = [];
  let latestRelatedArticle = null;
  let latestRelatedVisibleCount = RELATED_INITIAL_VISIBLE_GROUPS;
  let latestRenderedGroups = [];
  let latestRenderOptions = { title: "Related markets" };
  let latestTradeCandidate = null;
  let sortModeIndex = 0;
  let relatedScrollObserver = null;
  let surfaceMessageTimer = null;

  function setControlsDisabled(disabled) {
    refreshButton.disabled = disabled;
    searchButton.disabled = disabled;
    searchInput.disabled = disabled;
    if (settingsButton) {
      settingsButton.disabled = disabled;
    }
    if (privacyInfoButton) {
      privacyInfoButton.disabled = disabled;
    }
    if (tradeToggleButton) {
      tradeToggleButton.disabled = disabled;
    }
  }

  function renderStatus(phase, title, detail) {
    global.__PM_POPUP_PHASES = global.__PM_POPUP_PHASES || [];
    global.__PM_POPUP_PHASES.push({ phase, title, detail, at: Date.now() });
    renderer.renderStatus(statusRegion, phase, title, detail);
  }

  function shellElement() {
    return document.querySelector(".popup-shell");
  }

  function setTradeViewOpen(open) {
    const shell = shellElement();
    if (shell) {
      shell.classList.toggle("is-trade-view", open);
    }
    latestTradeCandidate = open ? latestTradeCandidate : null;
  }

  function showSurfaceMessage(title, detail, options = {}) {
    if (!surfaceMessage) {
      return;
    }
    if (surfaceMessageTimer) {
      clearTimeout(surfaceMessageTimer);
      surfaceMessageTimer = null;
    }

    surfaceMessage.innerHTML = "";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = detail;
    surfaceMessage.append(heading, copy);
    surfaceMessage.hidden = false;

    const timeoutMs = Number(options.timeoutMs);
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      surfaceMessageTimer = setTimeout(() => {
        surfaceMessage.hidden = true;
        surfaceMessageTimer = null;
      }, timeoutMs);
    }
  }

  function warnNonFatal(message, error) {
    if (global.console && typeof global.console.warn === "function") {
      global.console.warn(message, error);
    }
  }

  async function loadClassifierModel() {
    if (!classifierModelPromise) {
      classifierModelPromise = (async () => {
        if (!chrome.runtime || !chrome.runtime.getURL || !global.fetch) {
          return null;
        }
        const response = await global.fetch(chrome.runtime.getURL(CLASSIFIER_MODEL_FILE));
        if (!response.ok) {
          throw new Error(`Could not load local classifier model: ${response.status}`);
        }
        return response.json();
      })().catch((error) => {
        warnNonFatal("Falling back to built-in classifier rules because the local classifier model could not be loaded.", error);
        return null;
      });
    }
    return classifierModelPromise;
  }

  function exposeDebugContext(article, candidates, resultGroups) {
    global.__PM_ARTICLE_CONTEXT = {
      title: article.title,
      keywordAlgorithm: article.keywordAlgorithm,
      analysisStrategy: article.analysisStrategy,
      topic: article.topic,
      classifier: article.classifier,
      keywords: (article.keywords || []).slice(0, 12).map((keyword) => ({
        text: keyword.text,
        score: keyword.score,
        algorithm: keyword.algorithm
      })),
      entities: article.entities && article.entities.top ? article.entities.top.slice(0, 12) : [],
      centralEntities: article.centralEntities ? article.centralEntities.slice(0, 12) : [],
      queries: article.queries || []
    };
    global.__PM_POLYMARKET_CANDIDATES = (candidates || []).slice(0, 20).map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      eventTitle: candidate.eventTitle,
      confidence: candidate.confidence,
      image: candidate.image || "",
      marketSource: candidate.marketSource || candidate.sourceLabel || "Polymarket",
      scoreBreakdown: candidate.scoreBreakdown,
      sourceQueries: candidate.sourceQueries
    }));
    global.__PM_DISPLAY_GROUPS = (resultGroups || []).map((group) => ({
      id: group.id,
      title: group.title,
      eventTitle: group.eventTitle,
      confidence: group.confidence,
      image: group.image || "",
      marketSource: group.marketSource || group.sourceLabel || "Polymarket",
      volume: group.volume || 0,
      traderCount: group.traderCount || 0,
      traderCountCapped: Boolean(group.traderCountCapped),
      childMarketCount: Array.isArray(group.markets) ? group.markets.length : 0,
      url: group.url
    }));
  }

  async function searchHyperliquidRelatedGroups(article, maxGroups = MAX_RELATED_RESULT_GROUPS) {
    if (!hyperliquid || !hyperliquid.searchAndRank || !hyperliquid.groupCandidates) {
      return { candidates: [], resultGroups: [] };
    }
    try {
      const candidates = await hyperliquid.searchAndRank(article, {
        fetchImpl: fetch.bind(global),
        minConfidence: MAYBE_MIN_CONFIDENCE,
        maxResults: Math.min(12, maxGroups)
      });
      return {
        candidates,
        resultGroups: hyperliquid.groupCandidates(candidates, { maxGroups })
      };
    } catch (error) {
      warnNonFatal("Hyperliquid related-market query failed; keeping the other venue results.", error);
      return { candidates: [], resultGroups: [] };
    }
  }

  async function searchHyperliquidMarkets(query, maxGroups = MAX_RESULT_GROUPS) {
    if (!hyperliquid || !hyperliquid.searchMarkets || !hyperliquid.groupCandidates) {
      return { candidates: [], resultGroups: [] };
    }
    try {
      const candidates = await hyperliquid.searchMarkets(query, {
        fetchImpl: fetch.bind(global),
        maxResults: Math.min(8, maxGroups)
      });
      return {
        candidates,
        resultGroups: hyperliquid.groupCandidates(candidates, { maxGroups })
      };
    } catch (error) {
      warnNonFatal("Hyperliquid market search failed; keeping the other venue results.", error);
      return { candidates: [], resultGroups: [] };
    }
  }

  async function trendingHyperliquidGroups(maxGroups = MAX_RESULT_GROUPS) {
    if (!hyperliquid || !hyperliquid.trendingMarkets || !hyperliquid.groupCandidates) {
      return { candidates: [], resultGroups: [] };
    }
    try {
      const candidates = await hyperliquid.trendingMarkets({
        fetchImpl: fetch.bind(global),
        maxResults: Math.min(4, maxGroups)
      });
      return {
        candidates,
        resultGroups: hyperliquid.groupCandidates(candidates, { maxGroups })
      };
    } catch (error) {
      warnNonFatal("Hyperliquid trending query failed; keeping the other venue results.", error);
      return { candidates: [], resultGroups: [] };
    }
  }

  async function enrichTraderCounts(groups) {
    if (!polymarket.enrichGroupsWithTraderCounts || !Array.isArray(groups) || !groups.length) {
      return groups;
    }

    const polymarketGroups = groups.filter((group) => !isHyperliquidGroup(group));
    if (!polymarketGroups.length) {
      return groups;
    }

    const enrichedPolymarketGroups = await polymarket.enrichGroupsWithTraderCounts(polymarketGroups, {
      fetchImpl: fetch.bind(global),
      timeoutMs: 2500,
      limit: 500
    });
    const enrichedByKey = new Map(enrichedPolymarketGroups.map((group) => [groupIdentity(group), group]));
    return groups.map((group) => {
      if (isHyperliquidGroup(group)) {
        return group;
      }
      return enrichedByKey.get(groupIdentity(group)) || group;
    });
  }

  async function getActiveTab() {
    if (expandedMode && Number.isInteger(sourceTabId) && sourceTabId > 0) {
      return { id: sourceTabId };
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      throw new Error("No active tab is available.");
    }
    return tab;
  }

  async function openExpandedView() {
    if (expandedMode) {
      searchInput.focus();
      return;
    }
    if (!chrome.windows || !chrome.windows.create || !chrome.runtime || !chrome.runtime.getURL) {
      searchInput.focus();
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        searchInput.focus();
        return;
      }
      const url = chrome.runtime.getURL(`src/popup/popup.html?expanded=1&sourceTabId=${encodeURIComponent(String(tab.id))}`);
      await chrome.windows.create({
        url,
        type: "popup",
        width: 500,
        height: 850,
        focused: true
      });
    } catch (error) {
      warnNonFatal("Could not open the expanded popup view.", error);
      searchInput.focus();
    }
  }

  async function extractArticle(tabId) {
    renderStatus("reading", "Reading page", "Accessing the active tab.");
    const injections = await chrome.scripting.executeScript({
      target: { tabId },
      files: [READABILITY_FILE, EXTRACTOR_FILE, RUNNER_FILE]
    });
    const result = injections && injections[0] && injections[0].result;
    if (!result || !result.ok) {
      throw new ArticleError(result && result.error ? result.error : "No readable article was found.");
    }
    return result.article;
  }

  class ArticleError extends Error {
    constructor(message) {
      super(message);
      this.name = "ArticleError";
    }
  }

  function setActiveTab(tabName) {
    for (const button of [relatedTab, trendingTab, searchTab]) {
      if (!button) {
        continue;
      }
      button.classList.toggle("is-active", button.dataset.tab === tabName);
    }
  }

  function relatedDetail(count) {
    if (!count) {
      return "No related events found";
    }
    return `${count} related event${count === 1 ? "" : "s"} found`;
  }

  function sortLabel() {
    return SORT_MODES[sortModeIndex].label;
  }

  function scoreForSort(group) {
    const score = Number(group.parentConfidence || group.confidence || 0);
    if (!Number.isFinite(score)) {
      return 0;
    }
    return isHyperliquidGroup(group) ? score - 25 : score;
  }

  function volumeForSort(group) {
    const volume = Number(group.volume || group.volume24hr || group.volume1wk || 0);
    return Number.isFinite(volume) ? volume : 0;
  }

  function expiryForSort(group) {
    const raw = group.raw || {};
    const event = group.event || {};
    const value = group.endDate || group.endDateIso || raw.endDate || raw.endDateIso || raw.endDateTime || event.endDate || event.endDateIso || event.endDateTime;
    if (!value) {
      return Number.POSITIVE_INFINITY;
    }
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  }

  function sortedGroups(groups) {
    const mode = SORT_MODES[sortModeIndex].key;
    const copy = groups.slice();
    if (mode === "volume") {
      return copy.sort((a, b) => volumeForSort(b) - volumeForSort(a) || scoreForSort(b) - scoreForSort(a));
    }
    if (mode === "expiry") {
      return copy.sort((a, b) => expiryForSort(a) - expiryForSort(b) || scoreForSort(b) - scoreForSort(a));
    }
    return copy.sort((a, b) => scoreForSort(b) - scoreForSort(a) || volumeForSort(b) - volumeForSort(a));
  }

  function disconnectRelatedScroller() {
    if (relatedScrollObserver && relatedScrollObserver.disconnect) {
      relatedScrollObserver.disconnect();
    }
    relatedScrollObserver = null;
  }

  function clearRelatedPagination() {
    disconnectRelatedScroller();
    for (const node of Array.from(resultsRegion.querySelectorAll("[data-related-pagination]"))) {
      node.remove();
    }
  }

  function loadMoreRelatedGroups() {
    if (!latestRelatedGroups.length || latestRelatedVisibleCount >= latestRelatedGroups.length) {
      return;
    }
    latestRelatedVisibleCount = Math.min(latestRelatedVisibleCount + RELATED_BATCH_SIZE, latestRelatedGroups.length);
    renderGroups(latestRelatedGroups, latestRenderOptions);
  }

  function installRelatedPagination(totalCount) {
    if (latestRelatedVisibleCount >= totalCount) {
      return;
    }

    const remaining = totalCount - latestRelatedVisibleCount;
    const row = document.createElement("div");
    row.className = "related-pagination";
    row.dataset.relatedPagination = "true";

    const button = document.createElement("button");
    button.className = "related-load-more";
    button.type = "button";
    button.dataset.relatedLoadMore = "true";
    button.textContent = `Show ${Math.min(RELATED_BATCH_SIZE, remaining)} more`;
    button.addEventListener("click", loadMoreRelatedGroups);

    const sentinel = document.createElement("div");
    sentinel.className = "related-scroll-sentinel";
    sentinel.dataset.relatedScrollSentinel = "true";
    sentinel.setAttribute("aria-hidden", "true");

    row.append(button, sentinel);
    resultsRegion.append(row);

    if (typeof global.IntersectionObserver === "function") {
      relatedScrollObserver = new global.IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRelatedGroups();
        }
      }, { root: null, rootMargin: "360px 0px" });
      relatedScrollObserver.observe(sentinel);
    }
  }

  function booleanish(value) {
    if (value === true || value === false) {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }
    return null;
  }

  function groupEndDateValue(group = {}) {
    const raw = group.raw || {};
    const event = group.event || {};
    return group.endDate || group.endDateIso || raw.endDate || raw.endDateIso || raw.endDateTime || event.endDate || event.endDateIso || event.endDateTime || "";
  }

  function hasPastEndDate(group = {}) {
    const value = groupEndDateValue(group);
    if (!value) {
      return false;
    }
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time < Date.now();
  }

  function hasClosedDisplayFlag(group = {}) {
    const raw = group.raw || {};
    const event = group.event || {};
    for (const source of [group, raw, event]) {
      if (!source) {
        continue;
      }
      if (["closed", "archived", "resolved", "unavailable"].some((field) => booleanish(source[field]) === true)) {
        return true;
      }
      if (booleanish(source.active) === false) {
        return true;
      }
    }
    return false;
  }

  function isDisplayableGroup(group = {}) {
    return !hasClosedDisplayFlag(group) && !hasPastEndDate(group);
  }

  function filterDisplayableGroups(groups = []) {
    return groups
      .map((group) => {
        const markets = Array.isArray(group.markets)
          ? group.markets.filter(isDisplayableGroup)
          : null;
        if (markets && !markets.length) {
          return null;
        }
        if (markets && markets.length !== group.markets.length) {
          return { ...group, markets };
        }
        return group;
      })
      .filter((group) => group && (Array.isArray(group.markets) ? !hasClosedDisplayFlag(group) : isDisplayableGroup(group)));
  }

  function renderGroups(groups, options = {}) {
    clearRelatedPagination();
    setTradeViewOpen(false);
    const displayableGroups = filterDisplayableGroups(groups);
    latestRenderedGroups = displayableGroups.slice();
    latestRenderOptions = { ...options };
    const sorted = sortedGroups(displayableGroups);
    const progressive = Boolean(options.progressive);
    const visibleCount = progressive
      ? Math.min(latestRelatedVisibleCount, sorted.length)
      : sorted.length;
    renderer.renderResults(resultsRegion, sorted.slice(0, visibleCount), {
      ...options,
      detail: sortLabel(),
      showMatchLimitNote: false
    });
    if (progressive) {
      installRelatedPagination(sorted.length);
    }
  }

  function renderSearchReadyState() {
    clearRelatedPagination();
    setTradeViewOpen(false);
    latestRenderedGroups = [];
    latestRenderOptions = { title: "Search results" };
    renderStatus("complete", "Search ready", "Type a query to search markets.");
    renderer.renderEmpty(resultsRegion, "Search markets", "Type a market, token, event, or topic.", {
      title: "Search results",
      detail: "Ready"
    });
  }

  function showRefreshOutcome() {
    const latestPhase = global.__PM_POPUP_PHASES && global.__PM_POPUP_PHASES.at
      ? global.__PM_POPUP_PHASES.at(-1)
      : null;
    if (!latestPhase || latestPhase.phase === "error") {
      return;
    }
    if (latestPhase.title === "No readable article") {
      showSurfaceMessage("No readable article", "The current page does not expose enough article text.");
      return;
    }
    if (latestPhase.title === "Local scan complete" && /no related/i.test(String(latestPhase.detail || ""))) {
      showSurfaceMessage("No related markets", "The article was scanned, but no related markets were found.");
      return;
    }
    showSurfaceMessage("Connected", "Latest article matches are loaded.");
  }

  function menuIsOpen() {
    const shell = document.querySelector(".popup-shell");
    return Boolean(shell && shell.classList.contains("is-menu-open"));
  }

  function menuItems() {
    return actionMenu
      ? Array.from(actionMenu.querySelectorAll(".action-menu-item")).filter((item) => !item.disabled)
      : [];
  }

  function focusMenuItem(index) {
    const items = menuItems();
    if (!items.length) {
      return;
    }
    const nextIndex = ((index % items.length) + items.length) % items.length;
    items[nextIndex].focus();
  }

  function setMenuOpen(open, options = {}) {
    const shell = shellElement();
    if (shell) {
      shell.classList.toggle("is-menu-open", open);
    }
    if (actionMenu) {
      actionMenu.setAttribute("aria-hidden", String(!open));
    }
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", String(open));
      if (!open && options.focusButton) {
        menuButton.focus();
      }
    }
    if (open && options.focusFirst) {
      focusMenuItem(options.focusLast ? -1 : 0);
    }
  }

  function groupIdentity(group) {
    return [
      group && group.id,
      group && group.eventSlug,
      group && group.url,
      group && (group.eventTitle || group.title)
    ].filter(Boolean).join("|").toLowerCase();
  }

  function marketKey(candidate = {}) {
    if (renderer && typeof renderer.marketKey === "function") {
      return renderer.marketKey(candidate);
    }
    return [
      candidate.id,
      candidate.eventId,
      candidate.eventSlug,
      candidate.url,
      candidate.eventTitle || candidate.title || candidate.question
    ].filter(Boolean).join("|").toLowerCase();
  }

  function allKnownMarketGroups() {
    return [
      ...latestRenderedGroups,
      ...latestRelatedGroups
    ];
  }

  function findMarketCandidateByKey(key) {
    if (!key) {
      return null;
    }
    const seen = new Set();
    for (const group of allKnownMarketGroups()) {
      if (!group || seen.has(group)) {
        continue;
      }
      seen.add(group);
      if (marketKey(group) === key) {
        return group;
      }
      const markets = Array.isArray(group.markets) ? group.markets : [];
      for (const market of markets) {
        if (marketKey(market) === key) {
          return market;
        }
      }
    }
    return null;
  }

  function restoreMarketList() {
    setMenuOpen(false);
    setTradeViewOpen(false);
    if (latestRenderedGroups.length) {
      renderGroups(latestRenderedGroups, latestRenderOptions);
    } else if (latestRelatedArticle) {
      renderer.renderEmpty(resultsRegion, "No strong market match was found.", "The article was readable, but the related markets were weak or unavailable.", {
        title: latestRenderOptions.title || "Related markets"
      });
    } else {
      renderSearchReadyState();
    }
    const activeTab = document.querySelector(".tab-button.is-active");
    const tabName = activeTab && activeTab.dataset ? activeTab.dataset.tab : "";
    if (tabName === "search") {
      renderStatus("complete", latestRenderedGroups.length ? "Search complete" : "Search ready", latestRenderedGroups.length ? `${latestRenderedGroups.length} market${latestRenderedGroups.length === 1 ? "" : "s"} found` : "Type a query to search markets.");
    } else if (tabName === "trending") {
      renderStatus("complete", "Trending loaded", latestRenderedGroups.length ? `${latestRenderedGroups.length} market${latestRenderedGroups.length === 1 ? "" : "s"} found` : "No markets found");
    } else {
      renderStatus("complete", "Local scan complete", relatedDetail(latestRelatedGroups.length || latestRenderedGroups.length));
    }
  }

  function openTradeView(candidate) {
    if (!candidate || !renderer || typeof renderer.renderTradeView !== "function") {
      return;
    }
    clearRelatedPagination();
    setMenuOpen(false);
    latestTradeCandidate = candidate;
    setTradeViewOpen(true);
    renderer.renderTradeView(resultsRegion, candidate);
    renderStatus("complete", "Trade view", "Review market and order details.");
    const backButton = resultsRegion.querySelector("[data-trade-back]");
    if (backButton && typeof backButton.focus === "function") {
      backButton.focus({ preventScroll: true });
    }
    hydrateTradeViewData(candidate);
  }

  async function hydrateTradeViewData(candidate) {
    if (!candidate || !polymarket || typeof polymarket.fetchClobTradeData !== "function" || isHyperliquidGroup(candidate) || !global.fetch) {
      return;
    }
    const key = marketKey(candidate);
    try {
      const tradeData = await polymarket.fetchClobTradeData(candidate, {
        fetchImpl: global.fetch.bind(global),
        timeoutMs: 6500
      });
      if (!tradeData || !latestTradeCandidate || marketKey(latestTradeCandidate) !== key || !resultsRegion.querySelector(".trade-view")) {
        return;
      }
      const enriched = {
        ...candidate,
        ...tradeData
      };
      latestTradeCandidate = enriched;
      renderer.renderTradeView(resultsRegion, enriched);
      renderStatus("complete", "Trade view", tradeData.tradeDataSource === "clob" ? "Live depth loaded." : "Review market and order details.");
    } catch (error) {
      warnNonFatal("Polymarket trade data query failed; keeping preview trade data.", error);
    }
  }

  function parseTradeAmount(value) {
    const numeric = Number(String(value || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function updateTradeTicket() {
    const activeSide = resultsRegion.querySelector(".trade-side-button.is-active");
    const input = resultsRegion.querySelector("[data-trade-amount]");
    const buyButton = resultsRegion.querySelector("[data-trade-buy]");
    const estimate = resultsRegion.querySelector("[data-trade-estimate]");
    if (!activeSide || !input || !buyButton || !estimate) {
      return;
    }
    const label = activeSide.dataset.tradeLabel || activeSide.textContent.trim().split(/\s+/)[0] || "Yes";
    const unit = activeSide.dataset.tradeUnit || "shares";
    const price = Number(activeSide.dataset.tradePrice);
    const amount = parseTradeAmount(input.value);
    buyButton.textContent = `Buy ${label}`;
    estimate.textContent = Number.isFinite(price) && price > 0
      ? `Est. ${unit}: ${(amount / price).toLocaleString("en-US", { maximumFractionDigits: amount / price >= 1000 ? 0 : 1 })}`
      : `Est. ${unit}: 0`;
  }

  function currentTradePreviewDetail() {
    const activeSide = resultsRegion.querySelector(".trade-side-button.is-active");
    const input = resultsRegion.querySelector("[data-trade-amount]");
    const estimate = resultsRegion.querySelector("[data-trade-estimate]");
    const label = activeSide
      ? activeSide.dataset.tradeLabel || activeSide.textContent.trim().split(/\s+/)[0] || "Market"
      : "Market";
    const amount = input && input.value ? input.value : "$0";
    const estimateText = estimate ? estimate.textContent.trim() : "";
    return [label, amount, estimateText].filter(Boolean).join(" - ");
  }

  function formatTradeBookPrice(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "n/a";
    }
    if (numeric >= 1000) {
      return `$${Math.round(numeric).toLocaleString("en-US")}`;
    }
    if (numeric >= 1) {
      return `$${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${Math.round(numeric * 100)}\u00a2`;
  }

  function tradeBookRows(price, side) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return Array.from({ length: 5 }, () => ({
        price: "n/a",
        shares: "n/a",
        total: "n/a"
      }));
    }
    if (Number.isFinite(numericPrice) && numericPrice > 1) {
      const step = numericPrice >= 1000 ? Math.max(1, Math.round(numericPrice * 0.0005)) : numericPrice >= 10 ? 0.05 : 0.01;
      return Array.from({ length: 5 }, (_item, index) => {
        const level = side === "bid"
          ? Math.max(step, numericPrice - step * (index + 1))
          : numericPrice + step * (index + 1);
        const shares = 11200 + (Math.round(numericPrice) * 3) + (index * 2810) + (side === "ask" ? 980 : 0);
        return {
          price: formatTradeBookPrice(level),
          shares,
          total: shares + index * 15460
        };
      });
    }
    const center = Math.round(Math.max(0.01, Math.min(0.99, numericPrice || 0.5)) * 100);
    return Array.from({ length: 5 }, (_item, index) => {
      const cent = side === "bid"
        ? Math.max(1, center - index - 1)
        : Math.min(99, center + index + 1);
      const shares = 11200 + (center * 41) + (index * 2810) + (side === "ask" ? 980 : 0);
      return {
        price: `${cent}\u00a2`,
        shares,
        total: shares + index * 15460
      };
    });
  }

  function formatTradeBookCell(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? numeric.toLocaleString("en-US")
      : String(value || "n/a");
  }

  function tradeBookRowsFromButton(button, side) {
    if (!button || !button.dataset) {
      return null;
    }
    const raw = side === "bid"
      ? button.dataset.tradeBookBidRows
      : button.dataset.tradeBookAskRows;
    if (!raw) {
      return null;
    }
    try {
      const rows = JSON.parse(raw);
      return Array.isArray(rows) && rows.length ? rows : null;
    } catch (error) {
      return null;
    }
  }

  function updateTradeOrderBook(price, sideButton = null) {
    for (const rows of resultsRegion.querySelectorAll("[data-trade-book-side]")) {
      const side = rows.dataset.tradeBookSide;
      const rowData = tradeBookRowsFromButton(sideButton, side) || tradeBookRows(price, side);
      const maxShares = Math.max(1, ...rowData.map((row) => Number(row.shares)).filter((value) => Number.isFinite(value) && value > 0));
      for (const [index, line] of Array.from(rows.querySelectorAll(".trade-book-row")).entries()) {
        const row = rowData[index];
        if (!row) {
          continue;
        }
        const shares = Number(row.shares);
        const depth = Number.isFinite(shares) && shares > 0
          ? Math.max(22, Math.round((shares / maxShares) * 100))
          : 0;
        line.style.setProperty("--depth", `${depth}%`);
        const cells = line.querySelectorAll("span");
        const values = [row.price, formatTradeBookCell(row.shares), formatTradeBookCell(row.total)];
        for (const [cellIndex, cell] of Array.from(cells).entries()) {
          cell.textContent = values[cellIndex] || "";
        }
      }
    }
  }

  function selectTradeSide(button) {
    for (const side of resultsRegion.querySelectorAll(".trade-side-button")) {
      const active = side === button;
      side.classList.toggle("is-active", active);
      side.setAttribute("aria-pressed", String(active));
    }
    const price = Number(button.dataset.tradePrice);
    if (Number.isFinite(price)) {
      updateTradeOrderBook(price, button);
    }
    updateTradeTicket();
  }

  function selectTradeRange(button) {
    for (const range of resultsRegion.querySelectorAll(".trade-range-button")) {
      const active = range === button;
      range.classList.toggle("is-active", active);
      range.setAttribute("aria-pressed", String(active));
    }
    const path = button.dataset.chartPath;
    const markerX = Number(button.dataset.chartMarkerX);
    const markerY = Number(button.dataset.chartMarkerY);
    const line = resultsRegion.querySelector(".trade-chart-line");
    const markerLine = resultsRegion.querySelector(".trade-chart-marker-line");
    const markerDot = resultsRegion.querySelector(".trade-chart-marker-dot");
    const priceLabel = resultsRegion.querySelector(".trade-chart-price");
    const dateLabel = resultsRegion.querySelector(".trade-chart-date");
    if (line && path) {
      line.setAttribute("d", path);
    }
    if (Number.isFinite(markerX) && Number.isFinite(markerY)) {
      if (markerLine) {
        markerLine.setAttribute("x1", String(markerX));
        markerLine.setAttribute("x2", String(markerX));
        markerLine.setAttribute("y1", String(markerY));
      }
      if (markerDot) {
        markerDot.setAttribute("cx", String(markerX));
        markerDot.setAttribute("cy", String(markerY));
      }
      if (priceLabel) {
        priceLabel.style.left = `${(markerX / 420) * 100}%`;
        priceLabel.style.top = `${Math.max(10, markerY - 56)}px`;
      }
      if (dateLabel) {
        dateLabel.style.left = `${(markerX / 420) * 100}%`;
      }
    }
    if (priceLabel && button.dataset.chartPrice) {
      priceLabel.textContent = button.dataset.chartPrice;
    }
    if (dateLabel && button.dataset.chartDate) {
      dateLabel.textContent = button.dataset.chartDate;
    }
  }

  function setTradeActionsOpen(open) {
    const popover = resultsRegion.querySelector("[data-trade-actions]");
    const button = resultsRegion.querySelector("[data-trade-menu]");
    if (popover) {
      popover.hidden = !open;
      popover.classList.toggle("is-open", open);
    }
    if (button) {
      button.setAttribute("aria-expanded", String(open));
    }
  }

  function openExternalUrl(url) {
    if (!/^https?:\/\//i.test(url)) {
      return false;
    }
    if (chrome.tabs && typeof chrome.tabs.create === "function") {
      chrome.tabs.create({ url });
      return true;
    }
    if (typeof global.open === "function") {
      global.open(url, "_blank", "noreferrer");
      return true;
    }
    return false;
  }

  function isHyperliquidGroup(group = {}) {
    const raw = group.raw || {};
    const event = group.event || {};
    const sourceText = [
      group.id,
      group.marketSource,
      group.sourceLabel,
      group.source,
      group.url,
      raw.marketSource,
      raw.sourceLabel,
      raw.source,
      event.marketSource,
      event.sourceLabel,
      event.source
    ].filter(Boolean).join(" ").toLowerCase();
    return /\bhyper\s*liquid\b|hyperliquid/.test(sourceText);
  }

  function mergeGroups(primaryGroups, fillerGroups, maxGroups = Number.POSITIVE_INFINITY) {
    const seen = new Set();
    const merged = [];
    for (const group of [...primaryGroups, ...fillerGroups]) {
      const key = groupIdentity(group);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(group);
      if (merged.length >= maxGroups) {
        break;
      }
    }
    return merged;
  }

  async function searchRelatedGroups(article) {
    const candidates = await polymarket.searchAndRank(article, {
      fetchImpl: fetch.bind(global),
      minConfidence: MIN_CONFIDENCE,
      includeSimilar: true,
      includeTagExpansion: true,
      searchLimitPerType: 8,
      similarLimit: 20,
      maxTagExpansions: 3,
      tagEventLimit: 100,
      maxResults: MAX_RELATED_RANKED_MARKETS
    });
    let resultGroups = polymarket.groupCandidatesByEvent
      ? polymarket.groupCandidatesByEvent(candidates, {
        maxGroups: MAX_RELATED_RESULT_GROUPS,
        article,
        minParentConfidence: MIN_CONFIDENCE
      })
      : candidates.slice(0, MAX_RELATED_RESULT_GROUPS);

    let mergedCandidates = candidates;

    if (resultGroups.length < MAX_RELATED_RESULT_GROUPS && MAYBE_MIN_CONFIDENCE < MIN_CONFIDENCE) {
      try {
        const fillerCandidates = await polymarket.searchAndRank(article, {
          fetchImpl: fetch.bind(global),
          minConfidence: MAYBE_MIN_CONFIDENCE,
          includeMaybe: true,
          includeSimilar: true,
          includeTagExpansion: true,
          searchLimitPerType: 8,
          similarLimit: 20,
          maxTagExpansions: 3,
          tagEventLimit: 100,
          maxResults: MAX_RELATED_RANKED_MARKETS
        });
        const fillerGroups = polymarket.groupCandidatesByEvent
          ? polymarket.groupCandidatesByEvent(fillerCandidates, {
            maxGroups: MAX_RELATED_RESULT_GROUPS,
            article,
            minParentConfidence: MAYBE_MIN_CONFIDENCE
          })
          : fillerCandidates.slice(0, MAX_RELATED_RESULT_GROUPS);
        resultGroups = mergeGroups(resultGroups, fillerGroups, MAX_RELATED_RESULT_GROUPS);
        mergedCandidates = mergeGroups(mergedCandidates, fillerCandidates, MAX_RELATED_RANKED_MARKETS);
      } catch (error) {
        warnNonFatal("Secondary related-market query failed; keeping the primary results only.", error);
      }
    }

    const venue = await searchHyperliquidRelatedGroups(article, MAX_RELATED_RESULT_GROUPS);
    return {
      candidates: mergeGroups(mergedCandidates, venue.candidates, MAX_RELATED_RANKED_MARKETS),
      resultGroups: mergeGroups(resultGroups, venue.resultGroups, MAX_RELATED_RESULT_GROUPS + 2)
    };
  }

  async function run() {
    setControlsDisabled(true);
    clearRelatedPagination();
    setTradeViewOpen(false);
    latestRelatedGroups = [];
    latestRelatedArticle = null;
    latestRelatedVisibleCount = RELATED_INITIAL_VISIBLE_GROUPS;
    setActiveTab("related");

    try {
      const tab = await getActiveTab();
      const article = await extractArticle(tab.id);
      renderStatus("extracting", "Extracting article", "Identifying entities, keywords, and topic.");

      const classifierModel = await loadClassifierModel();
      const enrichedArticle = signals.analyzeArticle(article, {
        analysisStrategy: LOCAL_MODEL_STRATEGY,
        classifierModel
      });
      latestRelatedArticle = enrichedArticle;
      renderer.renderArticleContext(resultsRegion, enrichedArticle);

      renderStatus("searching", "Searching markets", "Checking related events and markets.");
      const { candidates, resultGroups } = await searchRelatedGroups(enrichedArticle);
      const enrichedResultGroups = await enrichTraderCounts(resultGroups);
      const displayableResultGroups = filterDisplayableGroups(enrichedResultGroups);
      latestRelatedGroups = displayableResultGroups;
      exposeDebugContext(enrichedArticle, candidates, displayableResultGroups);

      if (!displayableResultGroups.length) {
        renderStatus("complete", "Local scan complete", "No related events found");
        renderer.renderEmpty(resultsRegion, "No strong market match was found.", "The article was readable, but the related markets were weak or unavailable.", {
          title: "Related markets"
        });
        return;
      }

      renderStatus("complete", "Local scan complete", relatedDetail(displayableResultGroups.length));
      renderGroups(displayableResultGroups, {
        title: "Related markets",
        progressive: true
      });
    } catch (error) {
      if (error instanceof ArticleError) {
        renderStatus("complete", "No readable article", "The current page does not expose enough article text.");
        renderer.renderEmpty(resultsRegion, "No readable article", error.message, {
          title: "Related markets"
        });
        return;
      }

      renderStatus("error", "API or extension error", "The request could not be completed.");
      renderer.renderError(resultsRegion, error && error.message ? error.message : "Unexpected error.", {
        title: "Related markets"
      });
    } finally {
      setControlsDisabled(false);
    }
  }

  async function runMarketSearch(query) {
    const normalized = String(query || "").trim();
    if (normalized.length < 2) {
      searchInput.focus();
      renderStatus("complete", "Search ready", "Type at least 2 characters");
      return;
    }

    setControlsDisabled(true);
    clearRelatedPagination();
    setTradeViewOpen(false);
    setActiveTab("search");
    renderStatus("searching", "Searching markets", `Looking for "${normalized}".`);

    try {
      const matches = polymarket.searchMarkets
        ? await polymarket.searchMarkets(normalized, {
          maxResults: MAX_RANKED_MARKETS
        })
        : [];
      const resultGroups = polymarket.groupCandidatesByEvent
        ? polymarket.groupCandidatesByEvent(matches, {
          maxGroups: MAX_RESULT_GROUPS,
          minParentConfidence: 0
        })
        : matches.slice(0, MAX_RESULT_GROUPS);

      const enrichedResultGroups = await enrichTraderCounts(resultGroups);
      const venue = await searchHyperliquidMarkets(normalized, MAX_RESULT_GROUPS);
      const mergedResultGroups = filterDisplayableGroups(mergeGroups(enrichedResultGroups, venue.resultGroups, MAX_RESULT_GROUPS + 2));

      if (!mergedResultGroups.length) {
        renderStatus("complete", "Search complete", "No markets found");
        renderer.renderEmpty(resultsRegion, "No markets found", "Try a company, token, event, or topic.", {
          title: "Search results",
          detail: normalized
        });
        return;
      }

      renderStatus("complete", "Search complete", `${mergedResultGroups.length} market${mergedResultGroups.length === 1 ? "" : "s"} found`);
      renderGroups(mergedResultGroups, {
        title: "Search results"
      });
    } catch (error) {
      renderStatus("error", "Search failed", "The request could not be completed.");
      renderer.renderError(resultsRegion, error && error.message ? error.message : "Unexpected error.", {
        title: "Search results",
        detail: normalized
      });
    } finally {
      setControlsDisabled(false);
    }
  }

  async function runTrendingMarkets() {
    setControlsDisabled(true);
    clearRelatedPagination();
    setTradeViewOpen(false);
    setActiveTab("trending");
    renderStatus("searching", "Loading trending", "Checking active markets.");

    try {
      const matches = polymarket.trendingMarkets
        ? await polymarket.trendingMarkets({
          maxResults: MAX_RANKED_MARKETS
        })
        : [];
      const resultGroups = polymarket.groupCandidatesByEvent
        ? polymarket.groupCandidatesByEvent(matches, {
          maxGroups: MAX_RESULT_GROUPS,
          minParentConfidence: 0
        })
        : matches.slice(0, MAX_RESULT_GROUPS);

      const enrichedResultGroups = await enrichTraderCounts(resultGroups);
      const venue = await trendingHyperliquidGroups(MAX_RESULT_GROUPS);
      const mergedResultGroups = filterDisplayableGroups(mergeGroups(enrichedResultGroups, venue.resultGroups, MAX_RESULT_GROUPS + 2));

      if (!mergedResultGroups.length) {
        renderStatus("complete", "Trending loaded", "No markets found");
        renderer.renderEmpty(resultsRegion, "No trending markets found", "Try search instead.", {
          title: "Trending markets",
          detail: "Live"
        });
        return;
      }

      renderStatus("complete", "Trending loaded", `${mergedResultGroups.length} market${mergedResultGroups.length === 1 ? "" : "s"} found`);
      renderGroups(mergedResultGroups, {
        title: "Trending markets"
      });
    } catch (error) {
      renderStatus("error", "Trending failed", "The request could not be completed.");
      renderer.renderError(resultsRegion, error && error.message ? error.message : "Unexpected error.", {
        title: "Trending markets",
        detail: "Live"
      });
    } finally {
      setControlsDisabled(false);
    }
  }

  refreshButton.addEventListener("click", async () => {
    setMenuOpen(false, { focusButton: true });
    showSurfaceMessage("Connecting", "Refreshing matches from the active tab.");
    await run();
    showRefreshOutcome();
  });
  if (menuButton) {
    menuButton.addEventListener("click", () => {
      setMenuOpen(!menuIsOpen(), { focusFirst: true });
    });
    menuButton.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      event.preventDefault();
      setMenuOpen(true, {
        focusFirst: true,
        focusLast: event.key === "ArrowUp"
      });
    });
  }
  if (tradeToggleButton) {
    tradeToggleButton.addEventListener("click", () => {
      const pressed = tradeToggleButton.getAttribute("aria-pressed") === "true";
      tradeToggleButton.setAttribute("aria-pressed", String(!pressed));
      const shell = shellElement();
      if (shell) {
        shell.classList.toggle("is-trade-mode", !pressed);
      }
      showSurfaceMessage(!pressed ? "Trade mode on" : "Trade mode off", "Market cards open the in-extension trading view.");
      renderStatus("complete", !pressed ? "Trade mode on" : "Trade mode off", "Cards stay inside the trading view.");
    });
  }
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runMarketSearch(searchInput.value);
  });
  relatedTab.addEventListener("click", () => {
    setActiveTab("related");
    if (latestRelatedGroups.length) {
      renderStatus("complete", "Local scan complete", relatedDetail(latestRelatedGroups.length));
      renderGroups(latestRelatedGroups, {
        title: "Related markets",
        progressive: true
      });
      return;
    }
    if (latestRelatedArticle) {
      renderStatus("complete", "Local scan complete", "No related events found");
      renderer.renderEmpty(resultsRegion, "No strong market match was found.", "The article was readable, but the related markets were weak or unavailable.", {
        title: "Related markets"
      });
      return;
    }
    run();
  });
  trendingTab.addEventListener("click", runTrendingMarkets);
  searchTab.addEventListener("click", () => {
    setActiveTab("search");
    searchInput.focus();
    renderSearchReadyState();
  });
  resultsRegion.addEventListener("click", (event) => {
    const tradeBack = event.target.closest("[data-trade-back]");
    if (tradeBack) {
      event.preventDefault();
      setTradeActionsOpen(false);
      restoreMarketList();
      return;
    }

    const tradeMenu = event.target.closest("[data-trade-menu]");
    if (tradeMenu) {
      event.preventDefault();
      setTradeActionsOpen(!resultsRegion.querySelector("[data-trade-actions]:not([hidden])"));
      renderStatus("complete", "Market actions", "Choose a market action.");
      return;
    }

    const tradeAction = event.target.closest("[data-trade-action]");
    if (tradeAction) {
      event.preventDefault();
      const action = tradeAction.dataset.tradeAction;
      const url = resultsRegion.querySelector(".trade-view")?.dataset.marketUrl || "";
      setTradeActionsOpen(false);
      if (action === "settings") {
        showSurfaceMessage("Settings", "Read-only matching is active. Cards open the trading view.", { timeoutMs: 3000 });
        renderStatus("complete", "Settings", "Read-only matching is active.");
        return;
      }
      if (action === "connect") {
        showSurfaceMessage("Connecting", "Refreshing matches from the active tab.", { timeoutMs: 3000 });
        run();
        return;
      }
      if (action === "open-venue") {
        const opened = openExternalUrl(url);
        showSurfaceMessage(opened ? "Opening venue" : "Could not open venue", opened ? "The live market opened in a new tab." : "No valid market URL is available.", { timeoutMs: 3000 });
        renderStatus("complete", opened ? "Opening venue" : "Could not open venue", opened ? "Live venue opened externally." : "No valid market URL is available.");
        return;
      }
      if (action === "info") {
        const hasLiveData = latestTradeCandidate && latestTradeCandidate.tradeDataSource === "clob";
        showSurfaceMessage("Information", hasLiveData ? "Prices and depth are loaded from the matched venue when available." : "Prices and depth use a local preview until venue data loads.", { timeoutMs: 3000 });
        renderStatus("complete", "Information", hasLiveData ? "Live market depth is loaded." : "Preview values are calculated locally.");
      }
      return;
    }

    const rangeButton = event.target.closest("[data-trade-range]");
    if (rangeButton) {
      event.preventDefault();
      selectTradeRange(rangeButton);
      return;
    }

    const sideButton = event.target.closest("[data-trade-side]");
    if (sideButton) {
      event.preventDefault();
      selectTradeSide(sideButton);
      return;
    }

    const maxButton = event.target.closest("[data-trade-max]");
    if (maxButton) {
      event.preventDefault();
      const input = resultsRegion.querySelector("[data-trade-amount]");
      if (input) {
        input.value = "$1,000";
      }
      updateTradeTicket();
      return;
    }

    const buyButton = event.target.closest("[data-trade-buy]");
    if (buyButton) {
      event.preventDefault();
      const detail = currentTradePreviewDetail();
      showSurfaceMessage("Trade preview", `${detail}. Connect on the venue to place the live order.`, { timeoutMs: 3000 });
      renderStatus("complete", "Trade preview", detail || "Order details calculated locally.");
      return;
    }

    const sortButton = event.target.closest("[data-sort-control]");
    if (sortButton) {
      event.preventDefault();
      sortModeIndex = (sortModeIndex + 1) % SORT_MODES.length;
      if (latestRenderedGroups.length) {
        if (latestRenderOptions.progressive) {
          latestRelatedVisibleCount = Math.min(RELATED_INITIAL_VISIBLE_GROUPS, latestRelatedGroups.length || RELATED_INITIAL_VISIBLE_GROUPS);
        }
        renderGroups(latestRenderedGroups, latestRenderOptions);
      }
      return;
    }

    const marketCard = event.target.closest(".market-card");
    if (marketCard) {
      event.preventDefault();
      setTradeActionsOpen(false);
      const candidate = findMarketCandidateByKey(marketCard.dataset.marketKey);
      if (candidate) {
        openTradeView(candidate);
      }
    }
  });
  resultsRegion.addEventListener("input", (event) => {
    if (!event.target.closest("[data-trade-amount]")) {
      return;
    }
    updateTradeTicket();
  });
  if (settingsButton) {
    settingsButton.addEventListener("click", () => {
      setMenuOpen(false, { focusButton: true });
      if (expandedMode) {
        showSurfaceMessage("Settings", "Read-only matching is active. Cards open the trading view.");
        renderStatus("complete", "Settings", "Read-only matching is active.");
        return;
      }
      openExpandedView();
    });
  }
  if (privacyInfoButton) {
    privacyInfoButton.addEventListener("click", () => {
      setMenuOpen(false, { focusButton: true });
      showSurfaceMessage("Information", "Read only. Matched locally. No data leaves device.");
      renderStatus("complete", "Read only", "Matched locally. No data leaves device.");
    });
  }
  if (actionMenu) {
    actionMenu.addEventListener("keydown", (event) => {
      if (!menuIsOpen()) {
        return;
      }
      const items = menuItems();
      const currentIndex = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusMenuItem(currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusMenuItem(currentIndex - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusMenuItem(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusMenuItem(-1);
      }
    });
  }
  document.addEventListener("click", (event) => {
    if (event.target && event.target.closest && !event.target.closest("[data-trade-menu], [data-trade-actions]")) {
      setTradeActionsOpen(false);
    }
    if (!menuIsOpen() || (event.target && event.target.closest && event.target.closest(".menu-wrap"))) {
      return;
    }
    setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && resultsRegion.querySelector("[data-trade-actions]:not([hidden])")) {
      event.preventDefault();
      setTradeActionsOpen(false);
      return;
    }
    if (event.key !== "Escape" || !menuIsOpen()) {
      return;
    }
    event.preventDefault();
    setMenuOpen(false, { focusButton: true });
  });
  document.addEventListener("DOMContentLoaded", run, { once: true });
})(window);
