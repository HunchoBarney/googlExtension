const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const extractor = require("../src/lib/articleExtractor");

function makeDocument(body, url = "https://example.com/story") {
  return new JSDOM(`<!doctype html><html><head>
    <title>Fed signals inflation caution</title>
    <link rel="canonical" href="${url}">
    <meta name="description" content="A policy story">
    <meta property="og:site_name" content="Example News">
  </head><body>${body}</body></html>`, { url }).window.document;
}

test("extracts readable article content with metadata and headings", () => {
  const doc = makeDocument(`
    <nav>Home Markets Subscribe</nav>
    <article>
      <h1>Federal Reserve signals caution on inflation</h1>
      <p>The Federal Reserve held interest rates steady while Jerome Powell said inflation remains too high for comfort.</p>
      <p>Officials emphasized that incoming CPI and jobs data will guide whether another rate cut is likely this year.</p>
      <p>Investors moved Treasury yields lower after the central bank statement, while stock futures pared earlier gains.</p>
      <p>Economists said the decision keeps September and December meetings in focus for traders watching prediction markets.</p>
    </article>
    <aside>Buy a subscription and follow unrelated links.</aside>
  `);

  const article = extractor.extractArticleFromDocument(doc, { Readability });

  assert.equal(article.readable, true);
  assert.match(article.title, /Federal Reserve|Fed signals/);
  assert.match(article.cleanText, /Jerome Powell/);
  assert.doesNotMatch(article.cleanText, /Buy a subscription/);
  assert.equal(article.canonicalUrl, "https://example.com/story");
  assert.equal(article.siteName, "Example News");
  assert.ok(article.headings.some((heading) => heading.text.includes("Federal Reserve")));
});

test("uses semantic article areas instead of large sidebar noise", () => {
  const doc = makeDocument(`
    <main>
      <article class="story-body">
        <h1>Bitcoin rallies after ETF inflows accelerate</h1>
        <p>Bitcoin rose above a closely watched level as ETF inflows accelerated and traders returned to crypto markets.</p>
        <p>The move pushed BTC volatility higher before the next options expiry and renewed interest in year-end price targets.</p>
        <p>Analysts said liquidity improved across major exchanges as Ethereum and Solana also climbed during the session.</p>
        <p>Market makers pointed to stronger spot demand and falling exchange balances as reasons for the move.</p>
      </article>
      <aside>${"<p>Sidebar advertisement newsletter promo.</p>".repeat(30)}</aside>
    </main>
  `);

  const article = extractor.extractArticleFromDocument(doc, { Readability });

  assert.equal(article.readable, true);
  assert.match(article.cleanText, /Bitcoin rose/);
  assert.doesNotMatch(article.cleanText, /Sidebar advertisement/);
});

test("extracts blog post content from common post containers", () => {
  const doc = makeDocument(`
    <div class="site-nav">Archive About Contact</div>
    <div class="post-content">
      <h1>Why AI chip demand keeps surprising Wall Street</h1>
      <p>Nvidia suppliers reported stronger orders as cloud companies expanded artificial intelligence data center spending.</p>
      <p>The blog post explained that GPUs remain constrained even as semiconductor capacity improves.</p>
      <p>Investors are watching whether Nvidia earnings guidance will reflect another quarter of elevated AI infrastructure demand.</p>
      <p>Several analysts compared the current chip cycle with prior cloud computing investment waves.</p>
    </div>
    <div class="comments"><p>First comment unrelated to the post.</p></div>
  `);

  const article = extractor.extractArticleFromDocument(doc, { Readability });

  assert.equal(article.readable, true);
  assert.match(article.cleanText, /Nvidia suppliers/);
  assert.doesNotMatch(article.cleanText, /First comment/);
});

test("prefers selected text when it is the clearest readable input", () => {
  const doc = makeDocument(`
    <article>
      <h1>Live updates</h1>
      <p>Short update with little context.</p>
    </article>
  `);
  const selectionText = [
    "Nvidia shares climbed after a new AI chip report pointed to stronger data center demand.",
    "The article said Microsoft, Amazon, and Meta continued buying GPUs for artificial intelligence workloads.",
    "Analysts connected the demand to Nvidia earnings expectations and semiconductor supply constraints.",
    "Prediction markets were focused on whether Nvidia revenue would beat guidance this quarter."
  ].join(" ");

  const article = extractor.extractArticleFromDocument(doc, { Readability, selectionText });

  assert.equal(article.readable, true);
  assert.equal(article.source, "selection");
  assert.match(article.cleanText, /Nvidia shares/);
});

test("fails gracefully when no readable article body exists", () => {
  const doc = makeDocument(`
    <nav>Menu Home Markets About</nav>
    <section><a href="/one">One link</a><a href="/two">Two link</a></section>
    <footer>Copyright</footer>
  `);

  const article = extractor.extractArticleFromDocument(doc, { Readability });

  assert.equal(article.readable, false);
  assert.match(article.error, /enough readable article text/);
});
