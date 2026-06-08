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

  function renderArticleContext(root, article = {}) {
    for (const existing of root.querySelectorAll(".article-context")) {
      existing.remove();
    }
    const topic = document.getElementById("detected-topic-text");
    if (!topic) {
      return;
    }
    const label = detectedTopicLabel(article);
    topic.textContent = `Detected topic: ${label}`;
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

  function compactDate(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }

  function detectedTopicLabel(article = {}) {
    const textParts = [
      article.title,
      article.cleanText,
      article.text,
      ...((article.queries || []).slice(0, 4))
    ].join(" ").toLowerCase();
    const entities = article.entities && Array.isArray(article.entities.top) ? article.entities.top : [];
    const entityText = entities.map((entity) => entity && entity.text).filter(Boolean).join(" ").toLowerCase();
    if (/\biran\b/.test(`${textParts} ${entityText}`) && /\b(negotiat|ceasefire|peace|deal|diplomat|talk)\b/.test(textParts)) {
      return "Iran negotiations";
    }
    if (entities[0] && entities[0].text) {
      const topic = article.topic && article.topic.label ? article.topic.label.replace(/[/_-]+/g, " ") : "";
      return topic ? `${entities[0].text} ${topic}` : entities[0].text;
    }
    if (article.classifier && article.classifier.topic) {
      return String(article.classifier.topic).replace(/[/_-]+/g, " ");
    }
    if (article.topic && article.topic.label) {
      return String(article.topic.label).replace(/[/_-]+/g, " ");
    }
    return "related markets";
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

  function candidateDisplayValue(candidate, outcome) {
    if (candidate && candidate.displayValue) {
      return String(candidate.displayValue);
    }
    return outcomeValue(outcome);
  }

  function marketDisplayDetailRows(candidate = {}) {
    const rows = [];
    if (candidate.displayValue) {
      rows.push({
        label: candidate.primaryOutcome || "Mark",
        value: String(candidate.displayValue),
        movement: candidate.movement
      });
    }
    if (candidate.displayDetail) {
      const detail = String(candidate.displayDetail);
      const volumeMatch = detail.match(/^(.+?)\s+24h volume$/i);
      rows.push({
        label: volumeMatch ? "24h volume" : "Detail",
        value: volumeMatch ? volumeMatch[1] : detail,
        movement: null
      });
    }
    return rows;
  }

  function movementValue(movement) {
    if (!movement || movement.value === null || movement.value === undefined || movement.value === "") {
      return null;
    }
    const value = Number(movement.value);
    if (!Number.isFinite(value)) {
      return null;
    }
    if (value === 0) {
      return "0%";
    }
    return `${value > 0 ? "+" : "-"} ${Math.round(Math.abs(value) * 100)}%`;
  }

  function appendMovement(root, movement, options = {}) {
    const value = movementValue(movement);
    if (!value) {
      if (options.reserveSpace) {
        const placeholder = document.createElement("span");
        placeholder.className = "market-move market-move-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        root.append(placeholder);
      }
      return;
    }
    const direction = movement.direction === "down" || /^-/.test(value) ? "down" : "up";
    const node = document.createElement("span");
    node.className = `market-move market-move-${direction}`;
    const arrow = document.createElement("span");
    arrow.className = "market-move-arrow";
    arrow.setAttribute("aria-hidden", "true");
    node.append(arrow, document.createTextNode(value.replace(/^[-+]\s*/, "")));
    root.append(node);
  }

  function sourceName(candidate = {}) {
    const raw = candidate.raw || {};
    const event = candidate.event || {};
    const value = candidate.sourceLabel ||
      candidate.marketSource ||
      candidate.source ||
      raw.sourceLabel ||
      raw.marketSource ||
      raw.source ||
      event.sourceLabel ||
      event.marketSource ||
      event.source ||
      "";
    const haystack = `${value} ${candidate.url || ""}`.toLowerCase();
    if (/\bhyper\s*liquid\b|hyperliquid/.test(haystack)) {
      return "Hyperliquid";
    }
    return "Polymarket";
  }

  function createSourceBadge(candidate = {}) {
    const source = sourceName(candidate);
    const badge = document.createElement("span");
    badge.className = `source-badge source-${source.toLowerCase()}`;
    badge.setAttribute("aria-label", source);
    badge.title = source;
    const mark = document.createElement("span");
    mark.className = "source-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.append(createSourceIcon(source));
    const label = document.createElement("span");
    label.className = "source-label";
    label.textContent = source;
    badge.append(mark, label);
    return badge;
  }

  function createSourceIcon(source) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-hidden", "true");
    if (source === "Hyperliquid") {
      const left = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      left.setAttribute("x", "6");
      left.setAttribute("y", "12");
      left.setAttribute("width", "13");
      left.setAttribute("height", "7");
      left.setAttribute("rx", "3.5");
      left.setAttribute("fill", "currentColor");
      left.setAttribute("transform", "rotate(42 12.5 15.5)");
      const right = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      right.setAttribute("x", "13");
      right.setAttribute("y", "12");
      right.setAttribute("width", "13");
      right.setAttribute("height", "7");
      right.setAttribute("rx", "3.5");
      right.setAttribute("fill", "currentColor");
      right.setAttribute("transform", "rotate(-42 19.5 15.5)");
      svg.append(left, right);
      return svg;
    }

    const outer = document.createElementNS("http://www.w3.org/2000/svg", "path");
    outer.setAttribute("d", "M8 7.5 23 3.5c.8-.2 1.5.4 1.5 1.2v22.6c0 .8-.8 1.4-1.5 1.1L8 23.5v-16Z");
    const cross = document.createElementNS("http://www.w3.org/2000/svg", "path");
    cross.setAttribute("d", "M8.5 15.8h15.4M8.7 7.8l15.2 8");
    for (const path of [outer, cross]) {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2.2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.append(path);
    }
    return svg;
  }

  function safeHttpUrl(value) {
    const raw = text(value).trim();
    if (!raw) {
      return "";
    }
    try {
      const url = new URL(raw);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function marketHref(candidate = {}) {
    const explicitUrl = safeHttpUrl(candidate.url);
    if (explicitUrl) {
      return explicitUrl;
    }
    return sourceName(candidate) === "Hyperliquid"
      ? "https://app.hyperliquid.xyz/trade"
      : "https://polymarket.com";
  }

  function compactMoney(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }
    if (numeric >= 1000000000) {
      return `$${(numeric / 1000000000).toFixed(numeric >= 10000000000 ? 0 : 1).replace(/\.0$/, "")}B`;
    }
    if (numeric >= 1000000) {
      return `$${(numeric / 1000000).toFixed(numeric >= 10000000 ? 0 : 1).replace(/\.0$/, "")}M`;
    }
    if (numeric >= 1000) {
      return `$${(numeric / 1000).toFixed(numeric >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
    }
    return `$${Math.round(numeric)}`;
  }

  function candidateVolume(candidate = {}) {
    const raw = candidate.raw || {};
    const event = candidate.event || {};
    const values = [
      candidate.volume,
      candidate.volume24hr,
      candidate.volume1wk,
      raw.volume,
      raw.volumeNum,
      raw.volume24hr,
      raw.volume1wk,
      event.volume,
      event.volumeNum,
      event.volume24hr,
      event.volume1wk
    ];
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
    return null;
  }

  function endDateValue(candidate = {}) {
    const raw = candidate.raw || {};
    const event = candidate.event || {};
    return candidate.endDate || candidate.endDateIso || raw.endDate || raw.endDateIso || raw.endDateTime || event.endDate || event.endDateIso || event.endDateTime || "";
  }

  function formatEndDate(candidate = {}) {
    const value = endDateValue(candidate);
    if (!value) {
      return "Active market";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Active market";
    }
    return `Ends ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }

  function keyPart(value) {
    return text(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96);
  }

  function marketKey(candidate = {}) {
    return keyPart(candidate.id) ||
      keyPart(candidate.eventId) ||
      keyPart(candidate.eventSlug) ||
      keyPart(candidate.url) ||
      keyPart(candidate.eventTitle || candidate.title || candidate.question) ||
      "market";
  }

  function marketTitle(candidate = {}) {
    return candidate.question || candidate.title || candidate.eventTitle || "Untitled market";
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.max(min, Math.min(max, numeric));
  }

  function outcomePrice(outcome, fallback) {
    if (outcome) {
      const hasPrice = outcome.price !== null && outcome.price !== undefined && outcome.price !== "";
      const price = Number(outcome.price);
      if (hasPrice && Number.isFinite(price)) {
        return clampNumber(price, 0.01, 0.99);
      }
      const hasPercent = outcome.percent !== null && outcome.percent !== undefined && outcome.percent !== "";
      const percent = Number(outcome.percent);
      if (hasPercent && Number.isFinite(percent)) {
        return clampNumber(percent / 100, 0.01, 0.99);
      }
    }
    return clampNumber(fallback, 0.01, 0.99);
  }

  function hasOutcomePrice(outcome) {
    if (!outcome) {
      return false;
    }
    const hasPrice = outcome.price !== null && outcome.price !== undefined && outcome.price !== "";
    const hasPercent = outcome.percent !== null && outcome.percent !== undefined && outcome.percent !== "";
    return (hasPrice && Number.isFinite(Number(outcome.price))) || (hasPercent && Number.isFinite(Number(outcome.percent)));
  }

  function displayPriceNumber(candidate = {}) {
    const raw = candidate.raw || {};
    const context = raw.context || {};
    const values = [
      candidate.markPrice,
      candidate.displayValue,
      context.markPx,
      context.midPx,
      context.oraclePx
    ];
    for (const value of values) {
      const cleaned = typeof value === "string" ? value.replace(/[$,\s]/g, "") : value;
      const numeric = Number(cleaned);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
    return null;
  }

  function formatAssetPrice(value) {
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
    return `$${numeric.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  }

  function chartBasisPrice(outcome) {
    const basis = Number(outcome && outcome.chartPrice);
    if (Number.isFinite(basis)) {
      return basis;
    }
    return Number(outcome && outcome.price);
  }

  function chartDisplayPrice(outcome) {
    if (outcome && outcome.displayValue) {
      return outcome.displayValue;
    }
    const price = Number(outcome && outcome.price);
    return Number.isFinite(price) ? `$${price.toFixed(4)}` : "n/a";
  }

  function tradeOutcomes(candidate = {}) {
    const outcomes = candidateOutcomeOptions(candidate);
    const primary = outcomes[0] || {
      label: candidate.primaryOutcome || "Yes",
      price: candidate.primaryPrice,
      percent: candidate.primaryPercent
    };
    const markPrice = displayPriceNumber(candidate);
    if (sourceName(candidate) === "Hyperliquid" && markPrice !== null && !hasOutcomePrice(primary) && !hasOutcomePrice(outcomes[1])) {
      const displayValue = formatAssetPrice(markPrice);
      return [
        {
          label: "Long",
          price: markPrice,
          chartPrice: 0.5,
          displayValue,
          unitName: "contracts"
        },
        {
          label: "Short",
          price: markPrice,
          chartPrice: 0.5,
          displayValue,
          unitName: "contracts"
        }
      ];
    }
    const fallbackPrimary = Number.isFinite(Number(candidate.primaryPrice))
      ? Number(candidate.primaryPrice)
      : Number.isFinite(Number(candidate.primaryPercent))
        ? Number(candidate.primaryPercent) / 100
        : 0.32;
    const yesPrice = outcomePrice(primary, fallbackPrimary);
    const secondary = outcomes[1] || {
      label: candidate.secondaryOutcome || "No",
      price: candidate.secondaryPrice,
      percent: candidate.secondaryPrice === null || candidate.secondaryPrice === undefined
        ? null
        : Number(candidate.secondaryPrice) * 100
    };
    const noPrice = outcomePrice(secondary, 1 - yesPrice);
    return [
      {
        label: primary.label || "Yes",
        price: yesPrice
      },
      {
        label: secondary.label || "No",
        price: noPrice
      }
    ];
  }

  function formatCents(value) {
    return `${Math.round(clampNumber(value, 0, 1) * 100)}\u00a2`;
  }

  function formatShareCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    return numeric.toLocaleString("en-US", {
      maximumFractionDigits: numeric >= 1000 ? 0 : 1
    });
  }

  function hashText(value) {
    const input = text(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function chartRangeConfig(range) {
    const key = text(range || "1M").toUpperCase();
    const date = new Date();
    const offsets = {
      "1D": 0,
      "1W": -7,
      "1M": -21,
      "1Y": -365,
      ALL: -730
    };
    date.setDate(date.getDate() + (offsets[key] === undefined ? offsets["1M"] : offsets[key]));
    return {
      key,
      label: key === "1D"
        ? "Today"
        : key === "ALL"
          ? "Start"
          : date.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
      amplitude: key === "1D" ? 12 : key === "1W" ? 18 : key === "1Y" ? 34 : key === "ALL" ? 42 : 28,
      drift: key === "1D" ? -2 : key === "1W" ? 3 : key === "1Y" ? 8 : key === "ALL" ? 13 : 0
    };
  }

  function chartPath(candidate, price, range = "1M") {
    const width = 420;
    const height = 190;
    const config = chartRangeConfig(range);
    const seed = hashText(`${marketKey(candidate)}:${price}:${config.key}`);
    const points = [];
    const base = height - clampNumber(price, 0.05, 0.95) * 122 - 32 + config.drift;
    for (let index = 0; index < 42; index += 1) {
      const x = (width / 41) * index;
      const wave = Math.sin((index + (seed % 9)) / 4.2) * config.amplitude;
      const counter = Math.cos((index + (seed % 13)) / 2.8) * Math.max(8, config.amplitude * 0.46);
      const jag = (((seed >> (index % 16)) & 7) - 3) * 3.2;
      const y = clampNumber(base + wave + counter + jag, 28, height - 30);
      points.push([x, y]);
    }
    return points.reduce((path, point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${path}${command}${point[0].toFixed(1)} ${point[1].toFixed(1)} `;
    }, "").trim();
  }

  function chartMarker(candidate, price, range = "1M") {
    const config = chartRangeConfig(range);
    const seed = hashText(`marker:${marketKey(candidate)}:${config.key}`);
    const x = 270 + (seed % 35);
    const y = clampNumber(170 - clampNumber(price, 0.05, 0.95) * 112 + ((seed % 15) - 7) + config.drift, 46, 132);
    return { x, y };
  }

  function appendChartDataset(button, candidate, primary, range) {
    const config = chartRangeConfig(range);
    const chartPrice = chartBasisPrice(primary);
    const marker = chartMarker(candidate, chartPrice, range);
    button.dataset.chartPath = chartPath(candidate, chartPrice, range);
    button.dataset.chartDate = config.label;
    button.dataset.chartMarkerX = String(marker.x);
    button.dataset.chartMarkerY = String(marker.y);
    button.dataset.chartPrice = chartDisplayPrice(primary);
  }

  function createTradeChart(candidate, primary) {
    const chart = document.createElement("section");
    chart.className = "trade-chart-card";
    chart.setAttribute("aria-label", "Market price chart");

    const frame = document.createElement("div");
    frame.className = "trade-chart-frame";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "trade-chart-svg");
    svg.setAttribute("viewBox", "0 0 420 190");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "trade-chart-line");
    const chartPrice = chartBasisPrice(primary);
    path.setAttribute("d", chartPath(candidate, chartPrice, "1M"));
    svg.append(path);

    const marker = chartMarker(candidate, chartPrice, "1M");
    const markerLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    markerLine.setAttribute("class", "trade-chart-marker-line");
    markerLine.setAttribute("x1", String(marker.x));
    markerLine.setAttribute("x2", String(marker.x));
    markerLine.setAttribute("y1", String(marker.y));
    markerLine.setAttribute("y2", "168");
    const markerDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    markerDot.setAttribute("class", "trade-chart-marker-dot");
    markerDot.setAttribute("cx", String(marker.x));
    markerDot.setAttribute("cy", String(marker.y));
    markerDot.setAttribute("r", "5.8");
    svg.append(markerLine, markerDot);

    const priceLabel = document.createElement("span");
    priceLabel.className = "trade-chart-price";
    priceLabel.textContent = chartDisplayPrice(primary);
    priceLabel.style.left = `${(marker.x / 420) * 100}%`;
    priceLabel.style.top = `${Math.max(10, marker.y - 56)}px`;

    const dateLabel = document.createElement("span");
    dateLabel.className = "trade-chart-date";
    dateLabel.textContent = chartRangeConfig("1M").label;
    dateLabel.style.left = `${(marker.x / 420) * 100}%`;

    frame.append(svg, priceLabel, dateLabel);

    const ranges = document.createElement("div");
    ranges.className = "trade-range-row";
    for (const label of ["1D", "1W", "1M", "1Y", "ALL"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `trade-range-button${label === "1M" ? " is-active" : ""}`;
      button.dataset.tradeRange = label;
      button.setAttribute("aria-pressed", String(label === "1M"));
      appendChartDataset(button, candidate, primary, label);
      button.textContent = label;
      ranges.append(button);
    }

    chart.append(frame, ranges);
    return chart;
  }

  function createOrderTicket(outcomes) {
    const ticket = document.createElement("section");
    ticket.className = "trade-ticket";
    ticket.setAttribute("aria-label", "Order ticket");

    const sideRow = document.createElement("div");
    sideRow.className = "trade-side-row";
    for (const [index, outcome] of outcomes.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `trade-side-button trade-side-${index === 0 ? "yes" : "no"}${index === 0 ? " is-active" : ""}`;
      button.dataset.tradeSide = index === 0 ? "yes" : "no";
      button.dataset.tradeLabel = outcome.label;
      button.dataset.tradePrice = String(outcome.price);
      button.dataset.tradeUnit = outcome.unitName || "shares";
      button.setAttribute("aria-pressed", String(index === 0));
      button.textContent = `${outcome.label}  ${outcome.displayValue || formatCents(outcome.price)}`;
      sideRow.append(button);
    }

    const amountRow = document.createElement("label");
    amountRow.className = "trade-amount-row";
    const input = document.createElement("input");
    input.className = "trade-amount-input";
    input.dataset.tradeAmount = "true";
    input.inputMode = "decimal";
    input.value = "$100";
    input.setAttribute("aria-label", "Trade amount");
    const maxButton = document.createElement("button");
    maxButton.type = "button";
    maxButton.className = "trade-max-button";
    maxButton.dataset.tradeMax = "true";
    maxButton.textContent = "MAX";
    amountRow.append(input, maxButton);

    const buyButton = document.createElement("button");
    buyButton.type = "button";
    buyButton.className = "trade-buy-button";
    buyButton.dataset.tradeBuy = "true";
    buyButton.textContent = `Buy ${outcomes[0].label}`;

    const estimate = document.createElement("div");
    estimate.className = "trade-estimate";
    estimate.dataset.tradeEstimate = "true";
    estimate.textContent = `Est. ${outcomes[0].unitName || "shares"}: ${formatShareCount(100 / outcomes[0].price)}`;

    ticket.append(sideRow, amountRow, buyButton, estimate);
    return ticket;
  }

  function orderRows(price, side, seedText) {
    const seed = hashText(seedText);
    const numericPrice = Number(price);
    if (Number.isFinite(numericPrice) && numericPrice > 1) {
      const step = numericPrice >= 1000 ? Math.max(1, Math.round(numericPrice * 0.0005)) : numericPrice >= 10 ? 0.05 : 0.01;
      return Array.from({ length: 5 }, (_, index) => {
        const level = side === "bid"
          ? Math.max(step, numericPrice - step * (index + 1))
          : numericPrice + step * (index + 1);
        const shares = 10800 + ((seed >> (index * 3)) & 8191) + index * 2350;
        return {
          price: formatAssetPrice(level),
          shares,
          total: shares + index * 15870
        };
      });
    }
    const center = Math.round(numericPrice * 100);
    return Array.from({ length: 5 }, (_, index) => {
      const cent = side === "bid"
        ? Math.max(1, center - index - 1)
        : Math.min(99, center + index + 1);
      const shares = 10800 + ((seed >> (index * 3)) & 8191) + index * 2350;
      return {
        price: `${cent}\u00a2`,
        shares,
        total: shares + index * 15870
      };
    });
  }

  function createOrderBook(candidate, outcomes) {
    const book = document.createElement("section");
    book.className = "trade-order-book";
    book.setAttribute("aria-label", "Order book");

    for (const side of ["bid", "ask"]) {
      const column = document.createElement("div");
      column.className = `trade-book-column trade-book-${side}`;
      const title = document.createElement("h3");
      title.textContent = side === "bid" ? "Bids" : "Asks";
      const header = document.createElement("div");
      header.className = "trade-book-header";
      for (const label of ["Price", "Shares", "Total"]) {
        const span = document.createElement("span");
        span.textContent = label;
        header.append(span);
      }
      const rows = document.createElement("div");
      rows.className = "trade-book-rows";
      rows.dataset.tradeBookSide = side;
      const rowData = orderRows(outcomes[0].price, side, `${marketKey(candidate)}:${side}`);
      const maxShares = Math.max(...rowData.map((row) => row.shares));
      for (const row of rowData) {
        const line = document.createElement("div");
        line.className = "trade-book-row";
        line.style.setProperty("--depth", `${Math.max(22, Math.round((row.shares / maxShares) * 100))}%`);
        for (const value of [row.price, row.shares.toLocaleString("en-US"), row.total.toLocaleString("en-US")]) {
          const span = document.createElement("span");
          span.textContent = value;
          line.append(span);
        }
        rows.append(line);
      }
      column.append(title, header, rows);
      book.append(column);
    }
    return book;
  }

  function appendOutcomeRows(main, candidate) {
    const outcomes = candidateOutcomeOptions(candidate);
    const primary = outcomes[0] || { label: "Yes", price: null, percent: null };
    const secondary = outcomes[1] || { label: "No", price: null, percent: null };

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
    main.append(odds);
    return outcomes.slice(2);
  }

  function expandedRows(candidate) {
    const displayRows = marketDisplayDetailRows(candidate);
    if (displayRows.length) {
      return displayRows;
    }

    const markets = Array.isArray(candidate.markets) ? candidate.markets : [];
    if (markets.length > 1) {
      return markets.slice(0, 5).map((market) => {
        const marketDisplayRows = marketDisplayDetailRows(market);
        if (marketDisplayRows.length) {
          return marketDisplayRows[0];
        }
        const outcomes = candidateOutcomeOptions(market);
        const primary = outcomes[0] || { label: "Yes", price: market.primaryPrice, percent: market.primaryPercent };
        return {
          label: compactDate(market.endDate || market.endDateIso || (market.raw && (market.raw.endDate || market.raw.endDateIso || market.raw.endDateTime))) || market.title || primary.label,
          value: outcomeValue(primary),
          movement: market.movement
        };
      });
    }
    return candidateOutcomeOptions(candidate).slice(0, 5).map((outcome) => ({
      label: outcome.label,
      value: outcomeValue(outcome),
      movement: candidate.movement
    }));
  }

  function appendExpandedCardContents(card, candidate, titleText) {
    const top = document.createElement("div");
    top.className = "market-expanded-top";
    top.append(createMarketImage(candidate));

    const copy = document.createElement("div");
    copy.className = "market-copy";
    const title = document.createElement("p");
    title.className = "event-parent-title";
    title.textContent = titleText;
    copy.append(title, createSourceBadge(candidate));
    top.append(copy);

    const rowItems = expandedRows(candidate);
    card.dataset.expandedRowCount = String(rowItems.length);

    const rows = document.createElement("div");
    rows.className = "market-scenario-list";
    for (const item of rowItems) {
      const row = document.createElement("div");
      row.className = "market-scenario-row";
      const dot = document.createElement("span");
      dot.className = "scenario-dot";
      dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "scenario-label";
      label.textContent = item.label;
      const valueWrap = document.createElement("span");
      valueWrap.className = "scenario-value-wrap";
      const value = document.createElement("strong");
      value.className = "scenario-value";
      value.textContent = item.value;
      valueWrap.append(value);
      appendMovement(valueWrap, item.movement, { reserveSpace: true });
      row.append(dot, label, valueWrap);
      rows.append(row);
    }

    card.append(top, rows);
  }

  function appendCompactCardContents(card, candidate, titleText, options = {}) {
    card.append(createMarketImage(candidate));

    const main = document.createElement("div");
    main.className = "market-main";
    const title = document.createElement("p");
    title.className = options.parent ? "event-parent-title" : "market-title";
    title.textContent = titleText;
    main.append(title, createSourceBadge(candidate));

    const primary = candidateOutcomeOptions(candidate)[0] || { label: "Yes", price: candidate.primaryPrice, percent: candidate.primaryPercent };
    const quote = document.createElement("div");
    quote.className = "market-quote";
    const value = document.createElement("strong");
    value.textContent = candidateDisplayValue(candidate, primary);
    quote.append(value);
    appendMovement(quote, candidate.movement);

    const chevron = document.createElement("span");
    chevron.className = "market-chevron";
    chevron.setAttribute("aria-hidden", "true");
    card.append(main, quote, chevron);
  }

  function appendCardContents(card, candidate, options = {}) {
    const titleText = options.titleText || candidate.eventTitle || candidate.title || candidate.question || "Untitled market";

    if (options.expanded) {
      appendExpandedCardContents(card, candidate, titleText);
      return;
    }
    appendCompactCardContents(card, candidate, titleText, options);
  }

  function createMarketCard(candidate, options = {}) {
    const source = sourceName(candidate);
    const href = marketHref(candidate);
    const key = marketKey(candidate);
    const card = document.createElement("a");
    card.className = `market-card${options.parent ? " parent-event-card" : ""}${options.expanded ? " market-card-expanded" : ""}`;
    card.href = `#trade-${encodeURIComponent(key)}`;
    card.dataset.marketUrl = href;
    card.dataset.marketKey = key;
    card.dataset.marketSource = source;
    appendCardContents(card, candidate, options);
    return card;
  }

  function createParentEventCard(candidate, index = 0) {
    const childCount = Array.isArray(candidate.markets) ? candidate.markets.length : 0;
    const card = createMarketCard(candidate, {
      parent: true,
      expanded: index === 0,
      titleText: candidate.eventTitle || candidate.title || candidate.question || "Untitled event",
      childCount
    });
    card.setAttribute("aria-label", `Trade ${candidate.eventTitle || candidate.title || "market"} from ${sourceName(candidate)}`);
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
    for (const existing of root.querySelectorAll(".markets-heading, .market-card, .match-limit-note, .empty-state, .error-state, .trade-view")) {
      existing.remove();
    }
  }

  function renderHeading(root, title, detail) {
    const heading = document.createElement("div");
    heading.className = "markets-heading";
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
    heading.append(right);
    root.append(heading);
  }

  function renderResults(root, candidates, options = {}) {
    clearMarketSurface(root);
    const groups = groupRenderCandidates(candidates);
    const matchLimit = Number.isFinite(Number(options.matchLimit)) ? Number(options.matchLimit) : 3;
    renderHeading(root, options.title || "Related markets", options.detail || "Best match");
    const fragment = document.createDocumentFragment();
    for (const [index, candidate] of groups.entries()) {
      fragment.append(createParentEventCard(candidate, index));
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

  function renderTradeView(root, candidate = {}) {
    clearMarketSurface(root);
    const outcomes = tradeOutcomes(candidate);
    const volume = compactMoney(candidateVolume(candidate));
    const titleText = marketTitle(candidate);

    const view = document.createElement("section");
    view.className = "trade-view";
    view.dataset.marketUrl = marketHref(candidate);
    view.dataset.marketKey = marketKey(candidate);
    view.setAttribute("aria-label", `Trading view for ${titleText}`);

    const nav = document.createElement("div");
    nav.className = "trade-nav";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "trade-nav-button trade-back-button";
    back.dataset.tradeBack = "true";
    back.setAttribute("aria-label", "Back to markets");
    back.append(createInlineIcon("trade-nav-icon", ["M15 18 9 12l6-6"]));
    const more = document.createElement("button");
    more.type = "button";
    more.className = "trade-nav-button trade-more-button";
    more.dataset.tradeMenu = "true";
    more.setAttribute("aria-label", "More market actions");
    more.setAttribute("aria-expanded", "false");
    for (let index = 0; index < 3; index += 1) {
      const dot = document.createElement("span");
      dot.setAttribute("aria-hidden", "true");
      more.append(dot);
    }
    nav.append(back, more);

    const actionPopover = document.createElement("div");
    actionPopover.className = "trade-action-popover";
    actionPopover.dataset.tradeActions = "true";
    actionPopover.hidden = true;
    for (const action of [
      ["open-venue", "Open venue"],
      ["info", "Information"]
    ]) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "trade-action-item";
      item.dataset.tradeAction = action[0];
      item.textContent = action[1];
      actionPopover.append(item);
    }

    const hero = document.createElement("header");
    hero.className = "trade-hero";
    const media = document.createElement("div");
    media.className = "trade-image-wrap";
    media.append(createMarketImage(candidate), createSourceBadge(candidate));
    const copy = document.createElement("div");
    copy.className = "trade-hero-copy";
    const heading = document.createElement("h2");
    heading.textContent = titleText;
    const meta = document.createElement("p");
    meta.className = "trade-meta";
    meta.textContent = [volume ? `${volume} Vol` : "", formatEndDate(candidate)].filter(Boolean).join("  \u2022  ");
    copy.append(heading, meta);
    hero.append(media, copy);

    view.append(
      nav,
      actionPopover,
      hero,
      createTradeChart(candidate, outcomes[0]),
      createOrderTicket(outcomes),
      createOrderBook(candidate, outcomes)
    );
    root.append(view);
  }

  return {
    renderStatus,
    renderArticleContext,
    renderResults,
    renderTradeView,
    renderEmpty,
    renderError,
    marketKey,
    marketHref,
    formatPercent,
    formatPrice,
    formatProbability
  };
});
