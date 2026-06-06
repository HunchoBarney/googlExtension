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
  const resultsRegion = document.getElementById("results-region");
  const refreshButton = document.getElementById("refresh-button");
  const settingsButton = document.getElementById("settings-button");
  const privacyInfoButton = document.getElementById("privacy-info-button");
  const searchForm = document.getElementById("market-search-form");
  const searchInput = document.getElementById("market-search-input");
  const searchButton = document.getElementById("market-search-button");
  const relatedTab = document.getElementById("related-tab");
  const trendingTab = document.getElementById("trending-tab");
  const searchTab = document.getElementById("search-tab");
  const renderer = global.PMRender;
  const signals = global.PMArticleSignals;
  const polymarket = global.PMPolymarket;
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
  let sortModeIndex = 0;
  let relatedScrollObserver = null;

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

  function renderStatus(phase, title, detail) {
    global.__PM_POPUP_PHASES = global.__PM_POPUP_PHASES || [];
    global.__PM_POPUP_PHASES.push({ phase, title, detail, at: Date.now() });
    renderer.renderStatus(statusRegion, phase, title, detail);
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
      })().catch(() => null);
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
      scoreBreakdown: candidate.scoreBreakdown,
      sourceQueries: candidate.sourceQueries
    }));
    global.__PM_DISPLAY_GROUPS = (resultGroups || []).map((group) => ({
      id: group.id,
      title: group.title,
      eventTitle: group.eventTitle,
      confidence: group.confidence,
      image: group.image || "",
      volume: group.volume || 0,
      traderCount: group.traderCount || 0,
      traderCountCapped: Boolean(group.traderCountCapped),
      childMarketCount: Array.isArray(group.markets) ? group.markets.length : 0,
      url: group.url
    }));
  }

  async function enrichTraderCounts(groups) {
    if (!polymarket.enrichGroupsWithTraderCounts || !Array.isArray(groups) || !groups.length) {
      return groups;
    }
    return polymarket.enrichGroupsWithTraderCounts(groups, {
      fetchImpl: fetch.bind(global),
      timeoutMs: 2500,
      limit: 500
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
        height: 932,
        focused: true
      });
    } catch (error) {
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
      return "No related markets found";
    }
    return `${count} related market${count === 1 ? "" : "s"} found`;
  }

  function sortLabel() {
    return SORT_MODES[sortModeIndex].label;
  }

  function scoreForSort(group) {
    const score = Number(group.parentConfidence || group.confidence || 0);
    return Number.isFinite(score) ? score : 0;
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

  function renderGroups(groups, options = {}) {
    clearRelatedPagination();
    latestRenderedGroups = groups.slice();
    latestRenderOptions = { ...options };
    const sorted = sortedGroups(groups);
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

  function groupIdentity(group) {
    return [
      group && group.id,
      group && group.eventSlug,
      group && group.url,
      group && (group.eventTitle || group.title)
    ].filter(Boolean).join("|").toLowerCase();
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
      searchLimitPerType: 8,
      similarLimit: 20,
      maxResults: MAX_RELATED_RANKED_MARKETS
    });
    let resultGroups = polymarket.groupCandidatesByEvent
      ? polymarket.groupCandidatesByEvent(candidates, {
        maxGroups: MAX_RELATED_RESULT_GROUPS,
        article,
        minParentConfidence: MIN_CONFIDENCE
      })
      : candidates.slice(0, MAX_RELATED_RESULT_GROUPS);

    if (resultGroups.length >= MAX_RELATED_RESULT_GROUPS || MAYBE_MIN_CONFIDENCE >= MIN_CONFIDENCE) {
      return { candidates, resultGroups };
    }

    try {
      const fillerCandidates = await polymarket.searchAndRank(article, {
        fetchImpl: fetch.bind(global),
        minConfidence: MAYBE_MIN_CONFIDENCE,
        includeMaybe: true,
        includeSimilar: true,
        searchLimitPerType: 8,
        similarLimit: 20,
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
      return {
        candidates: mergeGroups(candidates, fillerCandidates, MAX_RELATED_RANKED_MARKETS),
        resultGroups
      };
    } catch (error) {
      return { candidates, resultGroups };
    }
  }

  async function run() {
    setControlsDisabled(true);
    clearRelatedPagination();
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

      renderStatus("searching", "Searching Polymarket", "Checking related events and markets.");
      const { candidates, resultGroups } = await searchRelatedGroups(enrichedArticle);
      const enrichedResultGroups = await enrichTraderCounts(resultGroups);
      latestRelatedGroups = enrichedResultGroups;
      exposeDebugContext(enrichedArticle, candidates, enrichedResultGroups);

      if (!enrichedResultGroups.length) {
        renderStatus("complete", "Local scan complete", "No related markets found");
        renderer.renderEmpty(resultsRegion, "No strong Polymarket match was found.", "The article was readable, but the related markets were weak or unavailable.", {
          title: "Related markets"
        });
        return;
      }

      renderStatus("complete", "Local scan complete", relatedDetail(enrichedResultGroups.length));
      renderGroups(enrichedResultGroups, {
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

      if (!enrichedResultGroups.length) {
        renderStatus("complete", "Search complete", "No markets found");
        renderer.renderEmpty(resultsRegion, "No markets found", "Try a company, token, event, or topic.", {
          title: "Search results",
          detail: normalized
        });
        return;
      }

      renderStatus("complete", "Search complete", `${enrichedResultGroups.length} market${enrichedResultGroups.length === 1 ? "" : "s"} found`);
      renderGroups(enrichedResultGroups, {
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
    setActiveTab("trending");
    renderStatus("searching", "Loading trending", "Checking active Polymarket events.");

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

      if (!enrichedResultGroups.length) {
        renderStatus("complete", "Trending loaded", "No markets found");
        renderer.renderEmpty(resultsRegion, "No trending markets found", "Try search instead.", {
          title: "Trending markets",
          detail: "Live"
        });
        return;
      }

      renderStatus("complete", "Trending loaded", `${enrichedResultGroups.length} market${enrichedResultGroups.length === 1 ? "" : "s"} found`);
      renderGroups(enrichedResultGroups, {
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

  refreshButton.addEventListener("click", run);
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
      renderStatus("complete", "Local scan complete", "No related markets found");
      renderer.renderEmpty(resultsRegion, "No strong Polymarket match was found.", "The article was readable, but the related markets were weak or unavailable.", {
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
  });
  resultsRegion.addEventListener("click", (event) => {
    const sortButton = event.target.closest("[data-sort-control]");
    if (!sortButton) {
      return;
    }
    event.preventDefault();
    sortModeIndex = (sortModeIndex + 1) % SORT_MODES.length;
    if (latestRenderedGroups.length) {
      if (latestRenderOptions.progressive) {
        latestRelatedVisibleCount = Math.min(RELATED_INITIAL_VISIBLE_GROUPS, latestRelatedGroups.length || RELATED_INITIAL_VISIBLE_GROUPS);
      }
      renderGroups(latestRenderedGroups, latestRenderOptions);
    }
  });
  if (settingsButton) {
    settingsButton.addEventListener("click", () => {
      openExpandedView();
    });
  }
  if (privacyInfoButton) {
    privacyInfoButton.addEventListener("click", () => {
      renderStatus("complete", "Read only", "Matched locally. No data leaves device.");
    });
  }
  document.addEventListener("DOMContentLoaded", run, { once: true });
})(window);
