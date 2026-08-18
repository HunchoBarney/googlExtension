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
  const OPTIONAL_POLYMARKET_TIMEOUT_MS = 2600;
  const OPTIONAL_HYPERLIQUID_TIMEOUT_MS = 1800;
  const OPTIONAL_TRADER_TIMEOUT_MS = 1400;
  const LOCAL_MODEL_STRATEGY = "classifier";
  const CLASSIFIER_MODEL_FILE = "src/lib/articleAngleClassifierData.json";
  const READABILITY_FILE = "src/vendor/Readability.js";
  const EXTRACTOR_FILE = "src/lib/articleExtractor.js";
  const RUNNER_FILE = "src/content/runExtraction.js";

  const statusRegion = document.getElementById("status-region");
  const surfaceMessage = document.getElementById("surface-message");
  const resultsRegion = document.getElementById("results-region");
  const refreshButton = document.getElementById("refresh-button");
  const profileButton = document.getElementById("profile-button");
  const settingsButton = document.getElementById("settings-button");
  const privacyInfoButton = document.getElementById("privacy-info-button");
  const menuButton = document.getElementById("menu-button");
  const actionMenu = document.getElementById("action-menu");
  const searchForm = document.getElementById("market-search-form");
  const searchInput = document.getElementById("market-search-input");
  const searchButton = document.getElementById("market-search-button");
  const relatedTab = document.getElementById("related-tab");
  const trendingTab = document.getElementById("trending-tab");
  const watchlistTab = document.getElementById("watchlist-tab");
  const renderer = global.PMRender;
  const tradingView = global.PMTradingView || null;
  const signals = global.PMArticleSignals;
  const polymarket = global.PMPolymarket;
  const hyperliquid = global.PMHyperliquid || null;
  const params = new URLSearchParams(global.location.search || "");
  const expandedMode = params.get("expanded") !== "0";
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
  let latestRawArticle = null;
  let latestRelatedVisibleCount = RELATED_INITIAL_VISIBLE_GROUPS;
  let latestRenderedGroups = [];
  let latestRenderOptions = { title: "Related markets" };
  let latestTradeCandidate = null;
  let expandedMarketKey;
  let expandedRowKeys = new Set();
  let sortModeIndex = 0;
  let relatedScrollObserver = null;
  let surfaceMessageTimer = null;
  let headerAnimationFrame = 0;
  let topbarExpandedHeight = 0;
  let heroExpandedHeight = 0;
  let latestSourceTabId = Number.isInteger(sourceTabId) && sourceTabId > 0 ? sourceTabId : null;
  let activeRelatedRunId = 0;
  const sessionPromiseCache = new Map();
  const HERO_COLLAPSE_FALLBACK_HEIGHT = 48;

  function nowMs() {
    return global.performance && typeof global.performance.now === "function"
      ? global.performance.now()
      : Date.now();
  }

  function resetTimings() {
    global.__PM_POPUP_TIMINGS = [];
    global.__PM_POPUP_TIMING_SUMMARY = {};
  }

  function recordTiming(label, startedAt, meta = {}, status = "ok", error = null) {
    const endedAt = nowMs();
    const entry = {
      label,
      status,
      startedAt,
      endedAt,
      durationMs: Math.max(0, Math.round((endedAt - startedAt) * 10) / 10),
      meta
    };
    if (error) {
      entry.error = error && error.message ? error.message : String(error);
    }
    global.__PM_POPUP_TIMINGS = global.__PM_POPUP_TIMINGS || [];
    global.__PM_POPUP_TIMINGS.push(entry);
    global.__PM_POPUP_TIMING_SUMMARY = {
      ...(global.__PM_POPUP_TIMING_SUMMARY || {}),
      [label]: entry.durationMs
    };
    return entry;
  }

  async function timed(label, work, meta = {}) {
    const startedAt = nowMs();
    try {
      const value = await work();
      recordTiming(label, startedAt, meta);
      return value;
    } catch (error) {
      recordTiming(label, startedAt, meta, "error", error);
      throw error;
    }
  }

  function timedSync(label, work, meta = {}) {
    const startedAt = nowMs();
    try {
      const value = work();
      recordTiming(label, startedAt, meta);
      return value;
    } catch (error) {
      recordTiming(label, startedAt, meta, "error", error);
      throw error;
    }
  }

  function delay(ms) {
    return new Promise((resolve) => {
      global.setTimeout(resolve, ms);
    });
  }

  async function settleWithin(label, promise, timeoutMs) {
    let timeoutId = 0;
    const startedAt = nowMs();
    const timeout = new Promise((resolve) => {
      timeoutId = global.setTimeout(() => {
        resolve({ status: "timeout" });
      }, timeoutMs);
    });
    const settled = await Promise.race([
      promise.then(
        (value) => ({ status: "fulfilled", value }),
        (error) => ({ status: "rejected", error })
      ),
      timeout
    ]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (settled.status === "timeout") {
      recordTiming(`${label}-timeout`, startedAt, { timeoutMs }, "timeout");
    }
    return settled;
  }

  function cachedPromise(key, factory) {
    if (sessionPromiseCache.has(key)) {
      return sessionPromiseCache.get(key);
    }
    const promise = Promise.resolve()
      .then(factory)
      .catch((error) => {
        sessionPromiseCache.delete(key);
        throw error;
      });
    sessionPromiseCache.set(key, promise);
    while (sessionPromiseCache.size > 32) {
      sessionPromiseCache.delete(sessionPromiseCache.keys().next().value);
    }
    return promise;
  }

  function articleCacheKey(article = {}) {
    return JSON.stringify({
      title: article.title || "",
      canonicalUrl: article.canonicalUrl || "",
      topic: article.topic && article.topic.label,
      classifierTopic: article.classifier && article.classifier.topic,
      queries: (article.queries || []).slice(0, 9)
    });
  }

  function searchCacheKey(stage, article, options = {}) {
    return JSON.stringify({
      stage,
      article: articleCacheKey(article),
      includeSimilar: Boolean(options.includeSimilar),
      includeTagExpansion: Boolean(options.includeTagExpansion),
      searchLimitPerType: options.searchLimitPerType,
      similarLimit: options.similarLimit,
      maxTagExpansions: options.maxTagExpansions,
      tagEventLimit: options.tagEventLimit
    });
  }

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
  }

  function invalidateRelatedUpdates() {
    activeRelatedRunId += 1;
  }

  function renderStatus(phase, title, detail) {
    global.__PM_POPUP_PHASES = global.__PM_POPUP_PHASES || [];
    global.__PM_POPUP_PHASES.push({ phase, title, detail, at: Date.now() });
    renderer.renderStatus(statusRegion, phase, title, detail);
  }

  function renderLoading() {
    if (renderer.renderLoading) {
      renderer.renderLoading(resultsRegion, "Finding related markets", "Reading the article before checking venues.");
    }
  }

  function manifestDefaultPopup() {
    const chromeApi = global.chrome || (typeof chrome !== "undefined" ? chrome : null);
    try {
      return chromeApi &&
        chromeApi.runtime &&
        typeof chromeApi.runtime.getManifest === "function"
        ? chromeApi.runtime.getManifest().action?.default_popup || ""
        : "";
    } catch (_error) {
      return "";
    }
  }

  function reloadStaleDetachedLauncher() {
    const chromeApi = global.chrome || (typeof chrome !== "undefined" ? chrome : null);
    const runtime = chromeApi && chromeApi.runtime;
    const openedByLegacyLauncher = params.get("expanded") === "1" && params.has("sourceTabId");
    if (
      !openedByLegacyLauncher ||
      manifestDefaultPopup() === "src/popup/popup.html" ||
      !runtime ||
      typeof runtime.reload !== "function"
    ) {
      return false;
    }

    renderStatus("reading", "Updating popup", "Reloading the toolbar popup.");
    if (renderer.renderLoading) {
      renderer.renderLoading(resultsRegion, "Updating popup");
    }
    global.setTimeout(() => runtime.reload(), 100);
    return true;
  }

  if (reloadStaleDetachedLauncher()) {
    return;
  }

  function shellElement() {
    return document.querySelector(".popup-shell");
  }

  function heroRegionElement() {
    return document.querySelector(".hero-region");
  }

  function topbarElement() {
    return document.querySelector(".rainbow-topbar");
  }

  function measureExpandedHeight(element, cachedHeight, fallbackHeight) {
    if (cachedHeight > 0) {
      return cachedHeight;
    }
    const measured = Math.round(Math.max(
      element.scrollHeight || 0,
      element.getBoundingClientRect ? element.getBoundingClientRect().height : 0,
      fallbackHeight
    ));
    return measured || fallbackHeight;
  }

  function measureTopbarExpandedHeight(topbar) {
    topbarExpandedHeight = measureExpandedHeight(topbar, topbarExpandedHeight, HERO_COLLAPSE_FALLBACK_HEIGHT);
    return topbarExpandedHeight;
  }

  function measureHeroExpandedHeight(hero) {
    heroExpandedHeight = measureExpandedHeight(hero, heroExpandedHeight, HERO_COLLAPSE_FALLBACK_HEIGHT);
    return heroExpandedHeight;
  }

  function applyCollapseState(element, prefix, expandedHeight, easedProgress, rawProgress) {
    const height = rawProgress >= 1 ? 0 : Math.max(0, Math.round(expandedHeight * (1 - easedProgress)));
    const opacity = rawProgress >= 1 ? 0 : Math.max(0, Math.round((1 - easedProgress) * 1000) / 1000);
    const translateY = Math.round(-18 * easedProgress * 1000) / 1000;

    element.style.setProperty(`--${prefix}-height`, `${height}px`);
    element.style.setProperty(`--${prefix}-open`, String(opacity));
    element.style.setProperty(`--${prefix}-opacity`, String(opacity));
    element.style.setProperty(`--${prefix}-translate-y`, `${translateY}px`);
  }

  function updateHeaderCollapse() {
    const shell = shellElement();
    const topbar = topbarElement();
    const hero = heroRegionElement();
    if (!shell || !topbar || !hero || !resultsRegion) {
      return;
    }

    const topbarHeight = measureTopbarExpandedHeight(topbar);
    const expandedHeight = measureHeroExpandedHeight(hero);
    const collapseRange = Math.max(topbarHeight, expandedHeight, HERO_COLLAPSE_FALLBACK_HEIGHT);
    const rawProgress = Math.min(1, Math.max(0, (resultsRegion.scrollTop || 0) / collapseRange));
    const easedProgress = rawProgress * rawProgress * (3 - (2 * rawProgress));

    applyCollapseState(topbar, "topbar", topbarHeight, easedProgress, rawProgress);
    applyCollapseState(hero, "hero", expandedHeight, easedProgress, rawProgress);
    shell.classList.toggle("is-results-scrolled", rawProgress >= 0.98);
  }

  function scheduleHeaderCollapseUpdate() {
    if (headerAnimationFrame) {
      return;
    }
    headerAnimationFrame = requestFrame(() => {
      headerAnimationFrame = 0;
      updateHeaderCollapse();
    });
  }

  function requestFrame(callback) {
    const request = typeof global.requestAnimationFrame === "function"
      ? global.requestAnimationFrame.bind(global)
      : (frameCallback) => global.setTimeout(frameCallback, 16);
    return request(callback);
  }

  function resetHeaderCollapseMetrics() {
    topbarExpandedHeight = 0;
    heroExpandedHeight = 0;
    scheduleHeaderCollapseUpdate();
  }

  function resetResultsScrollAndHeader() {
    if (resultsRegion) {
      resultsRegion.scrollTop = 0;
    }
    resetHeaderCollapseMetrics();
  }

  function setTradeViewOpen(open, options = {}) {
    const shell = shellElement();
    if (!open && tradingView && typeof tradingView.unmountAll === "function") {
      tradingView.unmountAll(resultsRegion);
    }
    if (shell) {
      shell.classList.toggle("is-trade-view", open);
    }
    latestTradeCandidate = open ? latestTradeCandidate : null;
    if (!open && options.resetScroll !== false) {
      resetResultsScrollAndHeader();
    }
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

  async function searchHyperliquidRelatedGroups(article, maxGroups = MAX_RELATED_RESULT_GROUPS, options = {}) {
    if (!hyperliquid || !hyperliquid.searchAndRank || !hyperliquid.groupCandidates) {
      return { candidates: [], resultGroups: [] };
    }
    try {
      const timeoutMs = Number(options.timeoutMs) || OPTIONAL_HYPERLIQUID_TIMEOUT_MS;
      const candidates = await timed("hyperliquid-fetch", () => hyperliquid.searchAndRank(article, {
        fetchImpl: fetch.bind(global),
        timeoutMs,
        minConfidence: MAYBE_MIN_CONFIDENCE,
        maxResults: Math.min(12, maxGroups)
      }), { maxGroups: Math.min(12, maxGroups), timeoutMs });
      return {
        candidates,
        resultGroups: timedSync("hyperliquid-grouping", () => hyperliquid.groupCandidates(candidates, { maxGroups }), {
          candidateCount: candidates.length,
          maxGroups
        })
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

  async function enrichTraderCounts(groups, options = {}) {
    if (!polymarket.enrichGroupsWithTraderCounts || !Array.isArray(groups) || !groups.length) {
      return groups;
    }

    const polymarketGroups = groups.filter((group) => !isHyperliquidGroup(group));
    if (!polymarketGroups.length) {
      return groups;
    }

    const timeoutMs = Number(options.timeoutMs) || OPTIONAL_TRADER_TIMEOUT_MS;
    const cacheKey = `traders:${polymarketGroups.map(groupIdentity).sort().join("|")}`;
    const enrichedPolymarketGroups = await timed("trader-enrichment", () => cachedPromise(cacheKey, () => polymarket.enrichGroupsWithTraderCounts(polymarketGroups, {
      fetchImpl: fetch.bind(global),
      timeoutMs,
      limit: 500
    })), { groupCount: polymarketGroups.length, timeoutMs });
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
    if (latestSourceTabId) {
      return { id: latestSourceTabId };
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (tab && tab.id && !isInternalChromeTab(tab)) {
      latestSourceTabId = tab.id;
      return tab;
    }
    if (latestSourceTabId) {
      return { id: latestSourceTabId };
    }
    if (!tab || !tab.id) {
      throw new Error("No active tab is available.");
    }
    return tab;
  }

  function isInternalChromeTab(tab = {}) {
    const url = String(tab.url || tab.pendingUrl || "");
    return /^(chrome|chrome-extension|edge|about|devtools):/i.test(url);
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
    for (const button of [relatedTab, trendingTab, watchlistTab]) {
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
    renderGroups(latestRelatedGroups, {
      ...latestRenderOptions,
      preserveScroll: true
    });
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
    const preserveScroll = Boolean(options.preserveScroll);
    const persistedOptions = { ...options };
    delete persistedOptions.preserveScroll;
    const previousScrollTop = preserveScroll ? resultsRegion.scrollTop || 0 : 0;

    clearRelatedPagination();
    setTradeViewOpen(false, { resetScroll: !preserveScroll });
    const displayableGroups = filterDisplayableGroups(groups);
    latestRenderedGroups = displayableGroups.slice();
    latestRenderOptions = { ...persistedOptions };
    const sorted = sortedGroups(displayableGroups);
    const progressive = Boolean(persistedOptions.progressive);
    const visibleCount = progressive
      ? Math.min(latestRelatedVisibleCount, sorted.length)
      : sorted.length;
    const renderOptions = {
      ...persistedOptions,
      detail: sortLabel(),
      showMatchLimitNote: false
    };
    if (expandedMarketKey !== undefined) {
      renderOptions.expandedMarketKey = expandedMarketKey;
    }
    if (expandedRowKeys.size) {
      renderOptions.expandedRowKeys = Array.from(expandedRowKeys);
    }
    timedSync("render-results", () => {
      renderer.renderResults(resultsRegion, sorted.slice(0, visibleCount), renderOptions);
    }, {
      totalCount: sorted.length,
      visibleCount,
      title: renderOptions.title || "Related markets"
    });
    if (progressive) {
      installRelatedPagination(sorted.length);
    }
    if (preserveScroll) {
      resultsRegion.scrollTop = previousScrollTop;
      scheduleHeaderCollapseUpdate();
    }
  }

  function renderSearchReadyState() {
    invalidateRelatedUpdates();
    clearRelatedPagination();
    setTradeViewOpen(false);
    expandedMarketKey = undefined;
    expandedRowKeys.clear();
    latestRenderedGroups = [];
    latestRenderOptions = { title: "Search results" };
    renderStatus("complete", "Search ready", "Type a query to search markets.");
    renderer.renderEmpty(resultsRegion, "Search markets", "Type a market, token, event, or topic.", {
      title: "Search results",
      detail: "Ready"
    });
  }

  function renderWatchlistEmptyState() {
    invalidateRelatedUpdates();
    clearRelatedPagination();
    setTradeViewOpen(false);
    expandedMarketKey = undefined;
    expandedRowKeys.clear();
    latestRenderedGroups = [];
    latestRenderOptions = { title: "Watchlist" };
    setActiveTab("watchlist");
    renderStatus("complete", "Watchlist", "No saved markets yet.");
    renderer.renderEmpty(resultsRegion, "No watchlist markets yet", "Saved markets will appear here.", {
      title: "Watchlist"
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

  function marketCardByKey(key) {
    return Array.from(resultsRegion.querySelectorAll(".market-card"))
      .find((node) => node.dataset && node.dataset.marketKey === key) || null;
  }

  function measuredCardHeight(card) {
    if (!card) {
      return 0;
    }
    const rect = card.getBoundingClientRect ? card.getBoundingClientRect() : null;
    const rectHeight = rect && Number.isFinite(rect.height) ? rect.height : 0;
    const scrollHeight = Number(card.scrollHeight);
    const offsetHeight = Number(card.offsetHeight);
    return Math.round(Math.max(rectHeight || 0, scrollHeight || 0, offsetHeight || 0));
  }

  function animateMarketCardReplacement(key, previousHeight, isExpanding) {
    const card = marketCardByKey(key);
    if (!card) {
      return;
    }
    const targetHeight = measuredCardHeight(card);
    if (!previousHeight || !targetHeight || Math.abs(targetHeight - previousHeight) < 2) {
      return;
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      card.classList.remove("market-card-height-transition", "is-expanding", "is-collapsing");
      card.style.height = "";
      card.style.overflow = "";
      card.style.willChange = "";
    };

    card.classList.add("market-card-height-transition", isExpanding ? "is-expanding" : "is-collapsing");
    card.style.height = `${previousHeight}px`;
    card.style.overflow = "hidden";
    card.style.willChange = "height";
    card.getBoundingClientRect();

    requestFrame(() => {
      card.style.height = `${targetHeight}px`;
    });

    card.addEventListener("transitionend", (event) => {
      if (event.propertyName === "height") {
        cleanup();
      }
    }, { once: true });
    global.setTimeout(cleanup, 360);
  }

  function toggleMarketCardExpansion(card) {
    if (!card || !card.dataset || !card.dataset.marketKey) {
      return;
    }
    const key = card.dataset.marketKey;
    const wasExpanded = card.classList.contains("market-card-expanded");
    const previousHeight = measuredCardHeight(card);
    if (wasExpanded) {
      expandedMarketKey = null;
      expandedRowKeys.delete(key);
    } else {
      if (expandedMarketKey !== key) {
        expandedRowKeys.clear();
      }
      expandedMarketKey = key;
    }
    renderGroups(latestRenderedGroups, {
      ...latestRenderOptions,
      preserveScroll: true
    });
    animateMarketCardReplacement(key, previousHeight, !wasExpanded);
  }

  function revealAllExpandedRows(showMoreNode) {
    const card = showMoreNode && showMoreNode.closest ? showMoreNode.closest(".market-card") : null;
    if (!card || !card.dataset || !card.dataset.marketKey) {
      return;
    }
    const key = showMoreNode.dataset.marketShowMoreKey || card.dataset.marketKey;
    const previousHeight = measuredCardHeight(card);
    expandedMarketKey = card.dataset.marketKey;
    expandedRowKeys.add(key);
    renderGroups(latestRenderedGroups, {
      ...latestRenderOptions,
      preserveScroll: true
    });
    animateMarketCardReplacement(card.dataset.marketKey, previousHeight, true);
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
    if (tabName === "watchlist") {
      renderStatus("complete", "Watchlist", "No saved markets yet.");
    } else if (tabName === "search") {
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
    mountTradingViewChart(candidate);
    resultsRegion.scrollTop = 0;
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
      const interactionState = currentTradeInteractionState();
      latestTradeCandidate = enriched;
      if (tradingView && typeof tradingView.unmountAll === "function") {
        tradingView.unmountAll(resultsRegion);
      }
      renderer.renderTradeView(resultsRegion, enriched);
      restoreTradeInteractionState(interactionState);
      mountTradingViewChart(enriched);
      renderStatus("complete", "Trade view", tradeData.tradeDataSource === "clob" ? "Live depth loaded." : "Review market and order details.");
    } catch (error) {
      warnNonFatal("Polymarket trade data query failed; keeping preview trade data.", error);
    }
  }

  function currentTradeInteractionState() {
    const activeRange = resultsRegion.querySelector(".trade-range-button.is-active");
    const activeSide = resultsRegion.querySelector(".trade-side-button.is-active");
    const amountInput = resultsRegion.querySelector("[data-trade-amount]");
    return {
      range: activeRange && activeRange.dataset ? activeRange.dataset.tradeRange || "" : "",
      side: activeSide && activeSide.dataset ? activeSide.dataset.tradeSide || "" : "",
      amount: amountInput ? amountInput.value : "",
      actionsOpen: Boolean(resultsRegion.querySelector("[data-trade-actions]:not([hidden])"))
    };
  }

  function mountTradingViewChart(candidate) {
    if (!tradingView || typeof tradingView.mountTradeChart !== "function") {
      return;
    }
    const rangeButton = resultsRegion.querySelector(".trade-range-button.is-active");
    tradingView.mountTradeChart(resultsRegion, candidate, {
      range: rangeButton && rangeButton.dataset ? rangeButton.dataset.tradeRange : "1M"
    }).catch((error) => {
      warnNonFatal("TradingView chart failed to mount; keeping fallback chart.", error);
    });
  }

  function restoreTradeInteractionState(state = {}) {
    if (state.range) {
      const rangeButton = resultsRegion.querySelector(`[data-trade-range='${state.range}']`);
      if (rangeButton) {
        selectTradeRange(rangeButton);
      }
    }
    if (state.side) {
      const sideButton = resultsRegion.querySelector(`[data-trade-side='${state.side}']`);
      if (sideButton) {
        selectTradeSide(sideButton);
      }
    }
    if (state.amount) {
      const amountInput = resultsRegion.querySelector("[data-trade-amount]");
      if (amountInput) {
        amountInput.value = state.amount;
      }
      updateTradeTicket();
    }
    setTradeActionsOpen(Boolean(state.actionsOpen));
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
    if (tradingView && typeof tradingView.setRange === "function") {
      tradingView.setRange(resultsRegion, button.dataset.tradeRange || "1M");
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

  function groupListSignature(groups = []) {
    return groups.map((group) => {
      const markets = Array.isArray(group.markets) ? group.markets.length : 0;
      return `${groupIdentity(group)}:${group.traderCount || ""}:${markets}`;
    }).join("|");
  }

  function polymarketStageOptions(options = {}) {
    return {
      fetchImpl: fetch.bind(global),
      minConfidence: options.minConfidence,
      includeMaybe: Boolean(options.includeMaybe),
      includeSimilar: true,
      includeTagExpansion: Boolean(options.includeTagExpansion),
      searchLimitPerType: 8,
      similarLimit: 20,
      maxTagExpansions: 3,
      tagEventLimit: 100,
      maxResults: MAX_RELATED_RANKED_MARKETS
    };
  }

  async function searchPolymarketRelatedStage(article, stage, options = {}) {
    const stageOptions = polymarketStageOptions(options);
    let candidates;

    if (polymarket.fetchCandidates && polymarket.rankCandidates) {
      const fetchedCandidates = await timed(`${stage}-fetch`, () => cachedPromise(
        searchCacheKey(stage, article, stageOptions),
        () => polymarket.fetchCandidates(article, stageOptions)
      ), {
        includeSimilar: stageOptions.includeSimilar,
        includeTagExpansion: stageOptions.includeTagExpansion
      });
      candidates = timedSync(`${stage}-ranking`, () => polymarket.rankCandidates(fetchedCandidates, article, {
        minConfidence: stageOptions.minConfidence,
        includeMaybe: stageOptions.includeMaybe,
        maxResults: stageOptions.maxResults
      }), {
        candidateCount: fetchedCandidates.length,
        minConfidence: stageOptions.minConfidence,
        includeMaybe: stageOptions.includeMaybe
      });
    } else {
      candidates = await timed(`${stage}-fetch`, () => polymarket.searchAndRank(article, stageOptions), {
        minConfidence: stageOptions.minConfidence,
        includeMaybe: stageOptions.includeMaybe,
        includeSimilar: stageOptions.includeSimilar,
        includeTagExpansion: stageOptions.includeTagExpansion
      });
    }

    const resultGroups = polymarket.groupCandidatesByEvent
      ? timedSync(`${stage}-grouping`, () => polymarket.groupCandidatesByEvent(candidates, {
        maxGroups: MAX_RELATED_RESULT_GROUPS,
        article,
        minParentConfidence: stageOptions.minConfidence
      }), {
        candidateCount: candidates.length,
        minParentConfidence: stageOptions.minConfidence
      })
      : candidates.slice(0, MAX_RELATED_RESULT_GROUPS);

    return { candidates, resultGroups };
  }

  function createRelatedState(candidates = [], groups = []) {
    return {
      candidates,
      groups,
      renderedSignature: "",
      enrichmentGeneration: 0
    };
  }

  function mergeRelatedState(state, candidates = [], groups = []) {
    const before = groupListSignature(state.groups);
    state.candidates = mergeGroups(state.candidates, candidates, MAX_RELATED_RANKED_MARKETS);
    state.groups = mergeGroups(state.groups, groups, MAX_RELATED_RESULT_GROUPS + 2);
    return groupListSignature(state.groups) !== before;
  }

  function publishRelatedState(runId, article, state, options = {}) {
    if (runId !== activeRelatedRunId) {
      return false;
    }
    const displayableResultGroups = filterDisplayableGroups(state.groups);
    const signature = groupListSignature(displayableResultGroups);
    if (!options.force && signature === state.renderedSignature) {
      return false;
    }
    state.renderedSignature = signature;
    latestRelatedGroups = displayableResultGroups;
    exposeDebugContext(article, state.candidates, displayableResultGroups);

    if (!displayableResultGroups.length) {
      return false;
    }

    if (options.preserveScroll) {
      const shell = shellElement();
      if (shell && shell.classList.contains("is-trade-view")) {
        latestRenderedGroups = displayableResultGroups.slice();
        latestRenderOptions = {
          title: "Related markets",
          progressive: true
        };
        return false;
      }
      if (relatedTab && !relatedTab.classList.contains("is-active")) {
        return false;
      }
    }

    renderStatus("complete", "Local scan complete", relatedDetail(displayableResultGroups.length));
    renderGroups(displayableResultGroups, {
      title: "Related markets",
      progressive: true,
      preserveScroll: Boolean(options.preserveScroll)
    });
    return true;
  }

  function applyEnrichedGroups(state, enrichedGroups) {
    const enrichedByKey = new Map((enrichedGroups || []).map((group) => [groupIdentity(group), group]));
    const before = groupListSignature(state.groups);
    state.groups = state.groups.map((group) => enrichedByKey.get(groupIdentity(group)) || group);
    return groupListSignature(state.groups) !== before;
  }

  function queueTraderEnrichment(runId, article, state) {
    const generation = state.enrichmentGeneration + 1;
    state.enrichmentGeneration = generation;
    const groupsSnapshot = state.groups.slice();
    void (async () => {
      const settled = await settleWithin(
        "trader-enrichment",
        enrichTraderCounts(groupsSnapshot, { timeoutMs: OPTIONAL_TRADER_TIMEOUT_MS }),
        OPTIONAL_TRADER_TIMEOUT_MS + 250
      );
      if (
        settled.status !== "fulfilled" ||
        runId !== activeRelatedRunId ||
        generation !== state.enrichmentGeneration
      ) {
        return;
      }
      if (applyEnrichedGroups(state, settled.value)) {
        publishRelatedState(runId, article, state, { preserveScroll: true });
      }
    })();
  }

  function queueRelatedLightUpdates(runId, article, state) {
    queueTraderEnrichment(runId, article, state);
  }

  async function searchRelatedGroups(article) {
    const primary = await searchPolymarketRelatedStage(article, "polymarket-primary", {
      minConfidence: MIN_CONFIDENCE,
      includeTagExpansion: false
    });
    let resultGroups = primary.resultGroups;
    let mergedCandidates = primary.candidates;

    if (resultGroups.length < MAX_RELATED_RESULT_GROUPS && MAYBE_MIN_CONFIDENCE < MIN_CONFIDENCE) {
      try {
        const filler = await searchPolymarketRelatedStage(article, "polymarket-secondary", {
          minConfidence: MAYBE_MIN_CONFIDENCE,
          includeMaybe: true,
          includeTagExpansion: true
        });
        resultGroups = mergeGroups(resultGroups, filler.resultGroups, MAX_RELATED_RESULT_GROUPS);
        mergedCandidates = mergeGroups(mergedCandidates, filler.candidates, MAX_RELATED_RANKED_MARKETS);
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
    const runId = activeRelatedRunId + 1;
    activeRelatedRunId = runId;
    resetTimings();
    setControlsDisabled(true);
    clearRelatedPagination();
    setTradeViewOpen(false);
    expandedMarketKey = undefined;
    expandedRowKeys.clear();
    latestRelatedGroups = [];
    latestRelatedArticle = null;
    latestRelatedVisibleCount = RELATED_INITIAL_VISIBLE_GROUPS;
    setActiveTab("related");
    renderLoading();

    try {
      const usedCachedArticle = Boolean(latestRawArticle);
      const article = latestRawArticle || await (async () => {
        const tab = await timed("active-tab", () => getActiveTab());
        const extracted = await timed("extraction", () => extractArticle(tab.id), { tabId: tab.id });
        latestRawArticle = extracted;
        return extracted;
      })();
      renderStatus(
        "extracting",
        usedCachedArticle ? "Refreshing article" : "Extracting article",
        "Identifying entities, keywords, and topic."
      );

      const classifierModel = await timed("classifier-model-load", () => loadClassifierModel());
      const enrichedArticle = timedSync("local-analysis", () => signals.analyzeArticle(article, {
        analysisStrategy: LOCAL_MODEL_STRATEGY,
        classifierModel
      }), {
        textLength: String(article.cleanText || article.text || "").length
      });
      latestRelatedArticle = enrichedArticle;
      renderer.renderArticleContext(resultsRegion, enrichedArticle);

      renderStatus("searching", "Searching Polymarket", "Checking first-pass related markets.");
      if (renderer.renderLoading) {
        renderer.renderLoading(resultsRegion, "Finding related markets", "Checking Polymarket first.");
      }
      const primary = await searchPolymarketRelatedStage(enrichedArticle, "polymarket-primary", {
        minConfidence: MIN_CONFIDENCE,
        includeTagExpansion: false
      });
      const relatedState = createRelatedState(primary.candidates, primary.resultGroups);
      const didRenderPrimary = publishRelatedState(runId, enrichedArticle, relatedState, { force: true });

      if (didRenderPrimary) {
        queueRelatedLightUpdates(runId, enrichedArticle, relatedState);
        return;
      }

      renderStatus("searching", "Checking broader matches", "No first-pass market cards yet.");
      if (renderer.renderLoading) {
        renderer.renderLoading(resultsRegion, "Checking broader matches", "Trying broader Polymarket and Hyperliquid matches.");
      }
      const [secondarySettled, hyperliquidSettled] = await Promise.all([
        settleWithin(
          "polymarket-secondary",
          searchPolymarketRelatedStage(enrichedArticle, "polymarket-secondary", {
            minConfidence: MAYBE_MIN_CONFIDENCE,
            includeMaybe: true,
            includeTagExpansion: true
          }),
          OPTIONAL_POLYMARKET_TIMEOUT_MS
        ),
        settleWithin(
          "hyperliquid",
          searchHyperliquidRelatedGroups(enrichedArticle, MAX_RELATED_RESULT_GROUPS, {
            timeoutMs: OPTIONAL_HYPERLIQUID_TIMEOUT_MS
          }),
          OPTIONAL_HYPERLIQUID_TIMEOUT_MS + 250
        )
      ]);

      if (secondarySettled.status === "fulfilled") {
        mergeRelatedState(relatedState, secondarySettled.value.candidates, secondarySettled.value.resultGroups);
      }
      if (hyperliquidSettled.status === "fulfilled") {
        mergeRelatedState(relatedState, hyperliquidSettled.value.candidates, hyperliquidSettled.value.resultGroups);
      }
      if (publishRelatedState(runId, enrichedArticle, relatedState, { force: true })) {
        queueTraderEnrichment(runId, enrichedArticle, relatedState);
        return;
      }

      latestRelatedGroups = [];
      exposeDebugContext(enrichedArticle, relatedState.candidates, []);
      renderStatus("complete", "Local scan complete", "No related events found");
      renderer.renderEmpty(resultsRegion, "No strong market match was found.", "The article was readable, but related markets were weak, unavailable, or slow to respond.", {
        title: "Related markets",
        detail: "Partial"
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
    invalidateRelatedUpdates();
    const normalized = String(query || "").trim();
    if (normalized.length < 2) {
      searchInput.focus();
      renderStatus("complete", "Search ready", "Type at least 2 characters");
      return;
    }

    setControlsDisabled(true);
    clearRelatedPagination();
    setTradeViewOpen(false);
    expandedMarketKey = undefined;
    expandedRowKeys.clear();
    setActiveTab("");
    renderStatus("searching", "Searching markets", `Looking for "${normalized}".`);
    renderLoading();

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
    invalidateRelatedUpdates();
    setControlsDisabled(true);
    clearRelatedPagination();
    setTradeViewOpen(false);
    expandedMarketKey = undefined;
    expandedRowKeys.clear();
    setActiveTab("trending");
    renderStatus("searching", "Loading trending", "Checking active markets.");
    renderLoading();

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
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runMarketSearch(searchInput.value);
  });
  relatedTab.addEventListener("click", () => {
    setActiveTab("related");
    expandedMarketKey = undefined;
    expandedRowKeys.clear();
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
  watchlistTab.addEventListener("click", renderWatchlistEmptyState);
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
      setTradeActionsOpen(false);
      if (action === "settings") {
        showSurfaceMessage("Settings", "Read-only matching is active. Date rows open the trading view.", { timeoutMs: 3000 });
        renderStatus("complete", "Settings", "Read-only matching is active.");
        return;
      }
      if (action === "connect") {
        showSurfaceMessage("Connecting", "Refreshing matches from the active tab.", { timeoutMs: 3000 });
        run();
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

    const showMoreRows = event.target.closest("[data-market-show-more-key]");
    if (showMoreRows) {
      event.preventDefault();
      event.stopPropagation();
      setTradeActionsOpen(false);
      revealAllExpandedRows(showMoreRows);
      return;
    }

    const marketRow = event.target.closest("[data-market-row-key]");
    if (marketRow) {
      event.preventDefault();
      event.stopPropagation();
      setTradeActionsOpen(false);
      const candidate = findMarketCandidateByKey(marketRow.dataset.marketRowKey);
      if (candidate) {
        openTradeView(candidate);
      }
      return;
    }

    const marketToggle = event.target.closest("[data-market-toggle]");
    if (marketToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleMarketCardExpansion(marketToggle.closest(".market-card"));
      return;
    }

    const marketCard = event.target.closest(".market-card");
    if (marketCard) {
      event.preventDefault();
      setTradeActionsOpen(false);
      toggleMarketCardExpansion(marketCard);
    }
  });
  resultsRegion.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const marketRow = event.target.closest("[data-market-row-key]");
    if (marketRow) {
      event.preventDefault();
      event.stopPropagation();
      setTradeActionsOpen(false);
      const candidate = findMarketCandidateByKey(marketRow.dataset.marketRowKey);
      if (candidate) {
        openTradeView(candidate);
      }
      return;
    }
    const showMoreRows = event.target.closest("[data-market-show-more-key]");
    if (showMoreRows) {
      event.preventDefault();
      event.stopPropagation();
      setTradeActionsOpen(false);
      revealAllExpandedRows(showMoreRows);
      return;
    }
    const marketToggle = event.target.closest("[data-market-toggle]");
    if (marketToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleMarketCardExpansion(marketToggle.closest(".market-card"));
      return;
    }
    const marketCard = event.target.closest(".market-card");
    if (marketCard) {
      event.preventDefault();
      event.stopPropagation();
      setTradeActionsOpen(false);
      toggleMarketCardExpansion(marketCard);
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
      showSurfaceMessage("Settings", "Read-only matching is active. Date rows open the trading view.");
      renderStatus("complete", "Settings", "Read-only matching is active.");
    });
  }
  if (profileButton) {
    profileButton.addEventListener("click", () => {
      setMenuOpen(false, { focusButton: true });
      showSurfaceMessage("Profile", "Default profile. Connect to personalize your market view.");
      renderStatus("complete", "Profile", "Default profile is active.");
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
  if (resultsRegion) {
    resultsRegion.addEventListener("scroll", scheduleHeaderCollapseUpdate, { passive: true });
  }
  if (typeof global.addEventListener === "function") {
    global.addEventListener("resize", resetHeaderCollapseMetrics);
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
  updateHeaderCollapse();
  document.addEventListener("DOMContentLoaded", run, { once: true });
})(window);
