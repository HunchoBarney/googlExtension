const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const extractor = require("../src/lib/articleExtractor");

const fixturesDir = path.join(__dirname, "fixtures", "articles");

function fixtureDocument(file) {
  const html = fs.readFileSync(path.join(fixturesDir, file), "utf8");
  return new JSDOM(html, {
    url: `https://fixture.test/${file}`,
    pretendToBeVisual: true
  }).window.document;
}

test("extracts saved representative article fixtures", () => {
  const cases = [
    {
      file: "clean-news.html",
      includes: /Federal Reserve officials/,
      excludes: /newsletter/
    },
    {
      file: "paywall-preview.html",
      includes: /Nvidia suppliers/,
      excludes: /Subscribe to continue/
    },
    {
      file: "blog-post.html",
      includes: /Bitcoin liquidity improved/,
      excludes: /First comment/
    },
    {
      file: "noisy-sidebar.html",
      includes: /Donald Trump/,
      excludes: /Advertisement newsletter/
    }
  ];

  for (const item of cases) {
    const article = extractor.extractArticleFromDocument(fixtureDocument(item.file), { Readability });
    assert.equal(article.readable, true, item.file);
    assert.match(article.cleanText, item.includes, item.file);
    assert.doesNotMatch(article.cleanText, item.excludes, item.file);
    assert.ok(article.canonicalUrl, item.file);
    assert.ok(article.headings.length >= 1, item.file);
  }
});

test("extracts selected text fixture when the page body is too short", () => {
  const selectionText = [
    "The Lakers and Celtics meet in an NBA game that could shift playoff seeding before the final week of the season.",
    "Coaches said both teams were monitoring injuries, while betting markets moved after Boston changed its starting lineup.",
    "The article focused on whether Los Angeles can win the matchup and how the result would affect postseason odds.",
    "Prediction markets also tracked whether the teams could meet again later in the playoffs."
  ].join(" ");

  const article = extractor.extractArticleFromDocument(fixtureDocument("selected-text.html"), {
    Readability,
    selectionText
  });

  assert.equal(article.readable, true);
  assert.equal(article.source, "selection");
  assert.match(article.cleanText, /Lakers and Celtics/);
});

test("fails gracefully on saved fixture with no readable body", () => {
  const article = extractor.extractArticleFromDocument(fixtureDocument("no-readable.html"), { Readability });

  assert.equal(article.readable, false);
  assert.match(article.error, /enough readable article text/);
  assert.equal(article.metadata.canonicalUrl, "https://fixture.test/markets-directory");
});
