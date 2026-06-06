(function attachRenderer(global, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMRender = api;
})(typeof window !== "undefined" ? window : globalThis, function createRenderer() {
  "use strict";

  function clear(node) {
    node.replaceChildren();
  }

  function text(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }
    return String(value);
  }

  function renderStatus(root, phase, title, detail) {
    clear(root);
    const status = document.createElement("div");
    status.className = "scan-status";
    status.dataset.phase = phase;

    if (phase !== "complete" && phase !== "error") {
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      spinner.setAttribute("aria-hidden", "true");
      status.append(spinner);
    } else {
      const dot = document.createElement("span");
      dot.className = "scan-dot";
      dot.setAttribute("aria-hidden", "true");
      status.append(dot);
    }

    const strong = document.createElement("strong");
    strong.textContent = title;
    status.append(strong);

    if (detail) {
      const divider = document.createElement("span");
      divider.className = "scan-divider";
      divider.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      span.className = "scan-detail";
      if (/market|related|found/i.test(detail)) {
        span.append(createUsersIcon());
      }
      span.append(document.createTextNode(detail));
      status.append(divider, span);
    }

    root.append(status);
  }

  function renderArticleContext(root) {
    for (const existing of root.querySelectorAll(".article-context")) {
      existing.remove();
    }
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") {
      return "n/a";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "n/a";
    }
    return `${Math.round(numeric)}%`;
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") {
      return "n/a";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "n/a";
    }
    return `${Math.round(numeric * 100)}c`;
  }

  function formatProbability(value) {
    if (value === null || value === undefined || value === "") {
      return "n/a";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "n/a";
    }
    return `${Math.round(numeric * 100)}%`;
  }

  function formatExpiry(candidate) {
    const raw = candidate.raw || {};
    const event = candidate.event || {};
    const value = candidate.endDate || candidate.endDateIso || raw.endDate || raw.endDateIso || raw.endDateTime || event.endDate || event.endDateIso || event.endDateTime;
    if (!value) {
      return "Active market";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Active market";
    }
    return `Expires ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }

  function fallbackGlyph(candidate) {
    const key = `${candidate.title || ""} ${candidate.eventTitle || ""} ${candidate.category || ""}`.toLowerCase();
    if (/\bbitcoin|btc\b/.test(key)) {
      return "bitcoin";
    }
    if (/\bfed|rates|cpi|pmi|macro\b/.test(key)) {
      return /\bfed|rates\b/.test(key) ? "rates" : "macro";
    }
    if (/\bnba|nfl|mlb|nhl|sports\b/.test(key)) {
      return "sports";
    }
    return "market";
  }

  function appendIconSvg(root, glyph) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "2.3");

    if (glyph === "macro" || glyph === "rates") {
      path.setAttribute("d", glyph === "rates"
        ? "M7 22h18M9 20l5-6 4 3 6-8M21 9h3v3"
        : "M7 23V9M7 23h18M11 20v-5M16 20v-8M21 20v-11");
      svg.append(path);
      root.append(svg);
      return;
    }

    if (glyph === "sports") {
      path.setAttribute("d", "M10 8h12v5a6 6 0 0 1-12 0V8ZM8 10H5v2a4 4 0 0 0 4 4M24 10h3v2a4 4 0 0 1-4 4M13 25h6M16 19v6");
      svg.append(path);
      root.append(svg);
    }
  }

  function createInlineIcon(className, paths) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const d of paths) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-width", "2");
      svg.append(path);
    }
    return svg;
  }

  function createCalendarIcon(className = "detail-icon") {
    return createInlineIcon(className, [
      "M8 2v4M16 2v4M4 9h16",
      "M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
    ]);
  }

  function createUsersIcon(className = "scan-detail-icon") {
    return createInlineIcon(className, [
      "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2",
      "M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
      "M22 21v-2a4 4 0 0 0-3-3.87",
      "M16 3.13a4 4 0 0 1 0 7.75"
    ]);
  }

  function createFallbackImage(candidate = {}) {
    const fallback = document.createElement("div");
    const glyph = fallbackGlyph(candidate);
    fallback.className = "market-image-fallback";
    fallback.dataset.glyph = glyph;
    if (glyph === "bitcoin") {
      fallback.textContent = "\u20bf";
    } else if (glyph === "market") {
      fallback.textContent = "%";
    } else {
      appendIconSvg(fallback, glyph);
    }
    fallback.setAttribute("aria-hidden", "true");
    return fallback;
  }

  function marketImageUrl(candidate = {}) {
    const value = text(candidate.image || candidate.icon || "").trim();
    if (!value) {
      return "";
    }
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) {
      return value;
    }
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function createMarketImage(candidate = {}) {
    const url = marketImageUrl(candidate);
    if (!url) {
      return createFallbackImage(candidate);
    }

    const image = document.createElement("img");
    image.className = "market-image";
    image.src = url;
    image.alt = "";
    image.decoding = "async";
    image.loading = "eager";
    image.fetchPriority = "high";
    image.referrerPolicy = "no-referrer";
    image.setAttribute("aria-hidden", "true");
    image.addEventListener("error", () => {
      image.replaceWith(createFallbackImage(candidate));
    }, { once: true });
    return image;
  }

  function groupRenderCandidates(candidates) {
    if (candidates.some((candidate) => Array.isArray(candidate.markets))) {
      return candidates;
    }

    const groups = new Map();
    for (const candidate of candidates) {
      const key = candidate.eventId || candidate.eventSlug || candidate.eventTitle || candidate.id || candidate.title;
      if (!groups.has(key)) {
        groups.set(key, {
          ...candidate,
          type: "eventGroup",
          title: candidate.eventTitle || candidate.title,
          eventTitle: candidate.eventTitle || candidate.title,
          markets: []
        });
      }
      groups.get(key).markets.push(candidate);
    }

    return Array.from(groups.values()).map((group) => {
      const markets = group.markets.sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (b.volume || 0) - (a.volume || 0));
      const primary = markets[0] || group;
      return {
        ...group,
        primaryOutcome: primary.primaryOutcome,
        secondaryOutcome: primary.secondaryOutcome,
        primaryPrice: primary.primaryPrice,
        secondaryPrice: primary.secondaryPrice,
        primaryPercent: primary.primaryPercent,
        outcomeOptions: primary.outcomeOptions,
        movement: primary.movement,
        category: primary.category || group.category,
        tags: primary.tags || group.tags,
        image: group.image || primary.image,
        endDate: primary.endDate || group.endDate,
        raw: primary.raw || group.raw,
        event: primary.event || group.event,
        url: group.eventSlug ? `https://polymarket.com/event/${group.eventSlug}` : primary.url,
        markets
      };
    });
  }

  function candidateOutcomeOptions(candidate) {
    const direct = Array.isArray(candidate.outcomeOptions) ? candidate.outcomeOptions : [];
    const options = direct
      .filter((option) => option && option.label)
      .map((option) => ({
        label: option.label,
        price: option.price,
        percent: option.percent
      }));

    if (!options.length) {
      options.push(
        {
          label: candidate.primaryOutcome || "Yes",
          price: candidate.primaryPrice,
          percent: candidate.primaryPercent
        },
        {
          label: candidate.secondaryOutcome || "No",
          price: candidate.secondaryPrice,
          percent: candidate.secondaryPrice === null || candidate.secondaryPrice === undefined
            ? null
            : Number(candidate.secondaryPrice) * 100
        }
      );
    }

    const seen = new Set();
    return options
      .filter((option) => {
        const key = option.label.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }

  function percentNumber(outcome) {
    if (!outcome) {
      return null;
    }
    const percent = Number(outcome.percent);
    if (Number.isFinite(percent)) {
      return Math.max(0, Math.min(100, percent));
    }
    const price = Number(outcome.price);
    if (Number.isFinite(price)) {
      return Math.max(0, Math.min(100, price * 100));
    }
    return null;
  }

  function outcomeValue(outcome) {
    if (!outcome || outcome.percent === null || outcome.percent === undefined || outcome.percent === "") {
      return formatProbability(outcome && outcome.price);
    }
    const percent = Number(outcome.percent);
    if (Number.isFinite(percent)) {
      return formatPercent(percent);
    }
    return formatProbability(outcome && outcome.price);
  }

  function appendOutcomeRows(main, candidate) {
    const outcomes = candidateOutcomeOptions(candidate);
    const primary = outcomes[0] || { label: "Yes", price: null, percent: null };
    const secondary = outcomes[1] || { label: "No", price: null, percent: null };
    const primaryPercent = percentNumber(primary);
    const secondaryPercent = percentNumber(secondary);
    const primaryShare = primaryPercent === null ? 50 : Math.max(3, primaryPercent);
    const secondaryShare = secondaryPercent === null ? 50 : Math.max(3, secondaryPercent);

    const odds = document.createElement("div");
    odds.className = "odds-row";
    for (const [index, outcome] of [primary, secondary].entries()) {
      const odd = document.createElement("div");
      odd.className = index === 0 ? "odd odd-primary" : "odd odd-secondary";
      const label = document.createElement("span");
      label.className = "odd-label";
      label.textContent = outcome.label;
      const value = document.createElement("strong");
      value.textContent = outcomeValue(outcome);
      odd.append(label, value);
      odds.append(odd);
    }

    const track = document.createElement("div");
    track.className = "probability-track";
    track.style.setProperty("--primary-share", `${primaryShare}fr`);
    track.style.setProperty("--secondary-share", `${secondaryShare}fr`);
    const primaryBar = document.createElement("div");
    primaryBar.className = "probability-primary";
    const secondaryBar = document.createElement("div");
    secondaryBar.className = "probability-secondary";
    track.append(primaryBar, secondaryBar);

    main.append(odds, track);
    return outcomes.slice(2);
  }

  function appendCardContents(card, candidate, options = {}) {
    const titleText = options.titleText || candidate.eventTitle || candidate.title || candidate.question || "Untitled market";

    card.append(createMarketImage(candidate));

    const main = document.createElement("div");
    main.className = "market-main";

    const title = document.createElement("p");
    title.className = options.parent ? "event-parent-title" : "market-title";
    title.textContent = titleText;
    main.append(title);

    const details = document.createElement("div");
    details.className = "market-detail-row";
    const expiry = document.createElement("span");
    expiry.className = "expiry-meta";
    const expiryText = document.createElement("span");
    expiryText.className = "expiry-text";
    expiryText.textContent = formatExpiry(candidate);
    expiry.append(createCalendarIcon(), expiryText);
    details.append(expiry);
    main.append(details);

    const extraOutcomes = appendOutcomeRows(main, candidate);

    if (extraOutcomes.length) {
      const footer = document.createElement("div");
      footer.className = "market-footer";
      const extra = document.createElement("span");
      extra.textContent = extraOutcomes.map((outcome) => `${outcome.label} ${outcomeValue(outcome)}`).join(" / ");
      footer.append(extra);
      main.append(footer);
    }

    card.append(main);
  }

  function createMarketCard(candidate, options = {}) {
    const card = document.createElement("a");
    card.className = `market-card${options.parent ? " parent-event-card" : ""}`;
    card.href = candidate.url || "https://polymarket.com";
    card.target = "_blank";
    card.rel = "noreferrer";
    appendCardContents(card, candidate, options);
    return card;
  }

  function createParentEventCard(candidate) {
    const childCount = Array.isArray(candidate.markets) ? candidate.markets.length : 0;
    const card = createMarketCard(candidate, {
      parent: true,
      titleText: candidate.eventTitle || candidate.title || candidate.question || "Untitled event",
      childCount
    });
    card.setAttribute("aria-label", `Open ${candidate.eventTitle || candidate.title || "Polymarket event"}`);
    return card;
  }

  function createMatchLimitNote() {
    const note = document.createElement("div");
    note.className = "match-limit-note";
    const icon = document.createElement("span");
    icon.className = "match-limit-icon";
    icon.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = "No strong match";
    const paragraph = document.createElement("p");
    paragraph.textContent = "We only show high-confidence related markets.";
    copy.append(strong, paragraph);
    note.append(icon, copy);
    return note;
  }

  function clearMarketSurface(root) {
    for (const existing of root.querySelectorAll(".markets-heading, .market-card, .match-limit-note, .empty-state, .error-state")) {
      existing.remove();
    }
  }

  function renderHeading(root, title, detail) {
    const heading = document.createElement("div");
    heading.className = "markets-heading";
    const label = document.createElement("h2");
    label.textContent = title || "Related markets";
    const right = document.createElement("button");
    right.className = "sort-button";
    right.type = "button";
    right.dataset.sortControl = "true";
    const sortLabel = document.createElement("span");
    sortLabel.textContent = detail || "Best match";
    const chevron = document.createElement("span");
    chevron.className = "sort-chevron";
    chevron.setAttribute("aria-hidden", "true");
    right.append(sortLabel, chevron);
    heading.append(label, right);
    root.append(heading);
  }

  function renderResults(root, candidates, options = {}) {
    clearMarketSurface(root);
    const groups = groupRenderCandidates(candidates);
    const matchLimit = Number.isFinite(Number(options.matchLimit)) ? Number(options.matchLimit) : 3;
    renderHeading(root, options.title || "Related markets", options.detail || "Best match");
    const fragment = document.createDocumentFragment();
    for (const candidate of groups) {
      fragment.append(createParentEventCard(candidate));
    }
    if (groups.length >= matchLimit && options.showMatchLimitNote !== false) {
      fragment.append(createMatchLimitNote());
    }
    root.append(fragment);
  }

  function renderEmpty(root, title, detail, options = {}) {
    clearMarketSurface(root);
    renderHeading(root, options.title || "Related markets", options.detail || "Best match");
    const state = document.createElement("div");
    state.className = "empty-state";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = detail;
    state.append(strong, paragraph);
    root.append(state);
  }

  function renderError(root, message, options = {}) {
    clearMarketSurface(root);
    renderHeading(root, options.title || "Related markets", options.detail || "Best match");
    const state = document.createElement("div");
    state.className = "error-state";
    const strong = document.createElement("strong");
    strong.textContent = "Could not search Polymarket";
    const paragraph = document.createElement("p");
    paragraph.textContent = text(message, "Network error");
    state.append(strong, paragraph);
    root.append(state);
  }

  return {
    renderStatus,
    renderArticleContext,
    renderResults,
    renderEmpty,
    renderError,
    formatPercent,
    formatPrice,
    formatProbability
  };
});
