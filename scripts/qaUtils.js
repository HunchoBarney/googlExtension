"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const extractor = require("../src/lib/articleExtractor");

const DEFAULT_HEADERS = {
  "user-agent": "PredMarketExtension QA/0.1 (+https://local.test)",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.7"
};

const FEEDS = [
  {
    category: "politics/elections",
    source: "BBC Politics",
    url: "https://feeds.bbci.co.uk/news/politics/rss.xml",
    expectedStrongMatch: true
  },
  {
    category: "crypto",
    source: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    expectedStrongMatch: true
  },
  {
    category: "economy/markets",
    source: "CNBC Economy",
    url: "https://www.cnbc.com/id/20910258/device/rss/rss.html",
    expectedStrongMatch: true
  },
  {
    category: "AI/technology",
    source: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    expectedStrongMatch: true
  },
  {
    category: "geopolitics",
    source: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    expectedStrongMatch: true
  },
  {
    category: "sports",
    source: "ESPN",
    url: "https://www.espn.com/espn/rss/news",
    expectedStrongMatch: true
  },
  {
    category: "entertainment",
    source: "Variety",
    url: "https://variety.com/feed/",
    expectedStrongMatch: false
  },
  {
    category: "weather/climate",
    source: "ScienceDaily Climate",
    url: "https://www.sciencedaily.com/rss/earth_climate.xml",
    expectedStrongMatch: false
  }
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function artifactPath(prefix, extension = "json") {
  const dir = path.join(__dirname, "..", "test-artifacts");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${prefix}-${timestamp()}.${extension}`);
}

function writeJsonReport(prefix, report) {
  const file = artifactPath(prefix);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function quietVirtualConsole() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    if (error && (error.type === "css parsing" || /Could not parse CSS stylesheet/.test(error.message))) {
      return;
    }
    console.warn(error && error.message ? error.message : error);
  });
  return virtualConsole;
}

async function fetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        ...DEFAULT_HEADERS,
        ...(options.headers || {})
      },
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return {
      url: response.url || url,
      status: response.status,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

function textOf(node, selector) {
  const found = node.querySelector(selector);
  return normalizeWhitespace(found && found.textContent);
}

function parseFeed(xml, feed) {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const doc = dom.window.document;
  const nodes = Array.from(doc.querySelectorAll("item, entry"));

  return nodes.map((node) => {
    let link = "";
    const linkNode = node.querySelector("link");
    if (linkNode) {
      link = normalizeWhitespace(linkNode.getAttribute("href") || linkNode.textContent);
    }
    if (!link) {
      link = textOf(node, "guid");
    }

    return {
      category: feed.category,
      source: feed.source,
      feedUrl: feed.url,
      feedTitle: textOf(node, "title"),
      url: link,
      expectedStrongMatch: Boolean(feed.expectedStrongMatch)
    };
  }).filter((item) => {
    if (!item.url || !/^https?:\/\//i.test(item.url)) {
      return false;
    }
    return !/\.(mp3|mp4|mov|jpg|jpeg|png|gif|webp)(\?|$)/i.test(item.url);
  });
}

async function discoverArticleLinks(options = {}) {
  const feeds = options.feeds || FEEDS;
  const perFeed = options.perFeed || 4;
  const limit = options.limit || feeds.length * perFeed;
  const seen = new Set();
  const articles = [];
  const feedReports = [];
  const buckets = [];

  for (const feed of feeds) {
    try {
      const response = await fetchText(feed.url, { timeoutMs: options.timeoutMs || 15000 });
      const items = parseFeed(response.text, feed).slice(0, perFeed);
      const report = {
        source: feed.source,
        category: feed.category,
        url: feed.url,
        status: "ok",
        found: items.length,
        accepted: 0
      };
      feedReports.push(report);
      buckets.push({ items, report });
    } catch (error) {
      feedReports.push({
        source: feed.source,
        category: feed.category,
        url: feed.url,
        status: "error",
        error: error && error.message ? error.message : String(error)
      });
    }
  }

  const maxItems = buckets.reduce((max, bucket) => Math.max(max, bucket.items.length), 0);
  for (let index = 0; index < maxItems && articles.length < limit; index += 1) {
    for (const bucket of buckets) {
      if (articles.length >= limit) {
        break;
      }
      const item = bucket.items[index];
      if (!item) {
        continue;
      }
      const key = item.url.replace(/[#?].*$/, "");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      articles.push(item);
      bucket.report.accepted += 1;
    }
  }

  return {
    articles: articles.slice(0, limit),
    feedReports
  };
}

function extractArticleFromHtml(html, url) {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    virtualConsole: quietVirtualConsole()
  });
  return extractor.extractArticleFromDocument(dom.window.document, { Readability });
}

module.exports = {
  FEEDS,
  artifactPath,
  discoverArticleLinks,
  extractArticleFromHtml,
  fetchText,
  normalizeWhitespace,
  timestamp,
  writeJsonReport
};
