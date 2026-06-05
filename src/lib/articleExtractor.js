(function attachArticleExtractor(global, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMArticleExtractor = api;
})(typeof window !== "undefined" ? window : globalThis, function createArticleExtractor() {
  "use strict";

  const MIN_ARTICLE_CHARS = 300;
  const MIN_ARTICLE_WORDS = 45;
  const MIN_SELECTION_CHARS = 220;
  const MAX_TEXT_CHARS = 24000;
  const UNWANTED_SELECTOR = [
    "script",
    "style",
    "noscript",
    "nav",
    "footer",
    "header",
    "aside",
    "form",
    "button",
    "iframe",
    "svg",
    "[aria-hidden='true']",
    "[hidden]",
    ".ad",
    ".ads",
    ".advertisement",
    ".banner",
    ".comments",
    ".comment",
    ".newsletter",
    ".promo",
    ".related",
    ".share",
    ".social",
    ".sidebar",
    ".subscribe"
  ].join(",");

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function wordCount(value) {
    const matches = normalizeWhitespace(value).match(/[A-Za-z0-9][A-Za-z0-9'-]*/g);
    return matches ? matches.length : 0;
  }

  function firstMeta(doc, selectors) {
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      const value = node && (node.getAttribute("content") || node.getAttribute("href") || node.textContent);
      const normalized = normalizeWhitespace(value);
      if (normalized) {
        return normalized;
      }
    }
    return "";
  }

  function collectMetadata(doc) {
    const canonical = firstMeta(doc, ["link[rel='canonical']", "meta[property='og:url']"]);
    return {
      title: firstMeta(doc, [
        "meta[property='og:title']",
        "meta[name='twitter:title']",
        "meta[name='title']"
      ]) || normalizeWhitespace(doc.title),
      description: firstMeta(doc, [
        "meta[property='og:description']",
        "meta[name='twitter:description']",
        "meta[name='description']"
      ]),
      byline: firstMeta(doc, [
        "meta[name='author']",
        "meta[property='article:author']",
        "[rel='author']"
      ]),
      publishedTime: firstMeta(doc, [
        "meta[property='article:published_time']",
        "meta[name='date']",
        "time[datetime]"
      ]),
      siteName: firstMeta(doc, [
        "meta[property='og:site_name']",
        "meta[name='application-name']"
      ]),
      canonicalUrl: canonical || (doc.location && doc.location.href) || ""
    };
  }

  function collectHeadings(doc) {
    return Array.from(doc.querySelectorAll("h1, h2, h3"))
      .map((node) => ({
        level: Number(node.tagName.slice(1)),
        text: normalizeWhitespace(node.textContent)
      }))
      .filter((heading) => heading.text && heading.text.length <= 180)
      .slice(0, 12);
  }

  function cleanClone(node) {
    const clone = node.cloneNode(true);
    for (const unwanted of Array.from(clone.querySelectorAll(UNWANTED_SELECTOR))) {
      unwanted.remove();
    }
    return clone;
  }

  function paragraphText(root) {
    const paragraphs = Array.from(root.querySelectorAll("p, li, blockquote"))
      .map((node) => normalizeWhitespace(node.textContent))
      .filter((text) => text.length >= 35);
    if (paragraphs.length >= 2) {
      return normalizeWhitespace(paragraphs.join("\n\n"));
    }
    return normalizeWhitespace(root.textContent);
  }

  function scoreCandidate(node) {
    const text = paragraphText(node);
    const links = Array.from(node.querySelectorAll("a"))
      .map((link) => normalizeWhitespace(link.textContent).length)
      .reduce((sum, length) => sum + length, 0);
    const paragraphCount = node.querySelectorAll("p").length;
    const headingCount = node.querySelectorAll("h1, h2, h3").length;
    const textLength = text.length;
    const linkDensity = textLength ? links / textLength : 1;
    return {
      node,
      text,
      score: textLength + paragraphCount * 90 + headingCount * 40 - linkDensity * 900
    };
  }

  function extractSemanticFallback(doc) {
    const candidates = Array.from(doc.querySelectorAll([
      "article",
      "main",
      "[role='main']",
      ".article",
      ".article-body",
      ".content",
      ".entry-content",
      ".post",
      ".post-content",
      ".story",
      ".story-body"
    ].join(",")));

    const best = candidates
      .map((node) => scoreCandidate(cleanClone(node)))
      .filter((candidate) => candidate.text.length >= MIN_ARTICLE_CHARS)
      .sort((a, b) => b.score - a.score)[0];

    return best ? best.text : "";
  }

  function getSelectionText(doc) {
    const selection = doc.defaultView && doc.defaultView.getSelection ? doc.defaultView.getSelection() : null;
    return normalizeWhitespace(selection ? selection.toString() : "");
  }

  function runReadability(doc, ReadabilityCtor) {
    if (!ReadabilityCtor) {
      return null;
    }

    try {
      const clone = doc.cloneNode(true);
      for (const unwanted of Array.from(clone.querySelectorAll(UNWANTED_SELECTOR))) {
        unwanted.remove();
      }
      const article = new ReadabilityCtor(clone, {
        charThreshold: MIN_ARTICLE_CHARS,
        keepClasses: false
      }).parse();
      if (!article) {
        return null;
      }
      return {
        title: normalizeWhitespace(article.title),
        text: normalizeWhitespace(article.textContent),
        excerpt: normalizeWhitespace(article.excerpt),
        byline: normalizeWhitespace(article.byline),
        siteName: normalizeWhitespace(article.siteName),
        publishedTime: normalizeWhitespace(article.publishedTime),
        length: Number(article.length) || normalizeWhitespace(article.textContent).length
      };
    } catch (error) {
      return null;
    }
  }

  function chooseText(readabilityText, fallbackText, selectionText) {
    let source = "readability";
    let text = readabilityText;

    if (!text || text.length < MIN_ARTICLE_CHARS || wordCount(text) < MIN_ARTICLE_WORDS) {
      if (fallbackText && fallbackText.length > text.length) {
        source = "semantic";
        text = fallbackText;
      }
    }

    if (selectionText.length >= MIN_SELECTION_CHARS && (!text || text.length < MIN_ARTICLE_CHARS || selectionText.length > text.length * 1.15)) {
      source = "selection";
      text = selectionText;
    }

    return {
      source,
      text: normalizeWhitespace(text).slice(0, MAX_TEXT_CHARS)
    };
  }

  function extractArticleFromDocument(doc, options = {}) {
    if (!doc || !doc.documentElement) {
      return {
        readable: false,
        error: "No document was available."
      };
    }

    const metadata = collectMetadata(doc);
    const headings = collectHeadings(doc);
    const selectionText = normalizeWhitespace(options.selectionText || getSelectionText(doc));
    const readability = runReadability(doc, options.Readability);
    const fallbackText = extractSemanticFallback(doc);
    const chosen = chooseText(readability ? readability.text : "", fallbackText, selectionText);
    const count = wordCount(chosen.text);

    if (chosen.text.length < MIN_ARTICLE_CHARS || count < MIN_ARTICLE_WORDS) {
      return {
        readable: false,
        error: "The page does not contain enough readable article text.",
        title: metadata.title,
        headings,
        metadata
      };
    }

    return {
      readable: true,
      source: chosen.source,
      title: (readability && readability.title) || metadata.title || (headings[0] && headings[0].text) || "Untitled article",
      cleanText: chosen.text,
      text: chosen.text,
      excerpt: (readability && readability.excerpt) || metadata.description || chosen.text.slice(0, 220),
      byline: (readability && readability.byline) || metadata.byline,
      siteName: (readability && readability.siteName) || metadata.siteName,
      publishedTime: (readability && readability.publishedTime) || metadata.publishedTime,
      canonicalUrl: metadata.canonicalUrl,
      headings,
      metadata,
      selectionText,
      wordCount: count
    };
  }

  return {
    extractArticleFromDocument,
    normalizeWhitespace,
    wordCount,
    collectMetadata,
    collectHeadings
  };
});
