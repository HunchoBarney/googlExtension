const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function listFiles(dir) {
  const full = path.join(root, dir);
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(relative);
    }
    return [relative];
  });
}

test("manifest keeps manual-activation MV3 permissions narrow", () => {
  const manifest = readJson("manifest.json");

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://gamma-api.polymarket.com/*",
    "https://data-api.polymarket.com/*",
    "https://clob.polymarket.com/*",
    "https://api.hyperliquid.xyz/*"
  ]);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.action.default_popup, "src/popup/popup.html");
  assert.equal(manifest.action.default_title, "Find market matches");
  assert.ok(manifest.background.service_worker.endsWith("src/background/serviceWorker.js"));

  const permissionText = JSON.stringify(manifest);
  assert.doesNotMatch(permissionText, /<all_urls>/);
  assert.doesNotMatch(permissionText, /\*:\/\/\*\//);
});

test("source does not include page monitoring or AI-service calls", () => {
  const source = listFiles("src")
    .filter((file) => /\.(js|html|css)$/.test(file))
    .map((file) => `${file}\n${fs.readFileSync(path.join(root, file), "utf8")}`)
    .join("\n");

  assert.doesNotMatch(source, /chrome\.tabs\.onUpdated/);
  assert.doesNotMatch(source, /chrome\.webNavigation/);
  assert.doesNotMatch(source, /chrome\.declarativeContent/);
  assert.doesNotMatch(source, /chrome\.windows\.create/);
  assert.doesNotMatch(source, /api\.openai\.com|anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai/i);

  const tabOpeners = listFiles("src")
    .filter((file) => /\.js$/.test(file))
    .filter((file) => /chrome\.tabs\.create/.test(fs.readFileSync(path.join(root, file), "utf8")));
  assert.deepEqual(tabOpeners, [path.join("src", "popup", "popup.js")]);

  const popup = fs.readFileSync(path.join(root, "src/popup/popup.js"), "utf8");
  assert.equal((popup.match(/chrome\.tabs\.create\s*\(/g) || []).length, 1);
  assert.match(popup, /host === "polymarket\.com" \|\| host\.endsWith\("\.polymarket\.com"\) \|\| host === "app\.hyperliquid\.xyz"/);
  assert.match(popup, /url\.protocol === "https:" && allowedHost/);
  assert.match(popup, /const venueUrl = trustedTradeVenueUrl\([\s\S]{0,500}chrome\.tabs\.create\(\{ url: venueUrl \}\)/);
});

test("popup packages KLineCharts locally with its required attribution before the adapter", () => {
  const popup = fs.readFileSync(path.join(root, "src/popup/popup.html"), "utf8");
  const scripts = Array.from(popup.matchAll(/<script\s+src="([^"]+)"/g), (match) => match[1]);
  const libraryPath = path.join(root, "src/vendor/klinecharts/klinecharts.min.js");
  const licensePath = path.join(root, "src/vendor/klinecharts/LICENSE");
  const noticePath = path.join(root, "src/vendor/klinecharts/NOTICE");
  const upstreamLicensePath = path.join(root, "src/vendor/klinecharts/licenses/LICENSE-lightweight-charts");

  assert.deepEqual(scripts.slice(-3), [
    "../vendor/klinecharts/klinecharts.min.js",
    "./klinecharts.js",
    "./popup.js"
  ]);
  assert.ok(fs.existsSync(libraryPath));
  assert.ok(fs.existsSync(licensePath));
  assert.ok(fs.existsSync(noticePath));
  assert.ok(fs.existsSync(upstreamLicensePath));
  assert.match(fs.readFileSync(libraryPath, "utf8"), /@license[\s\S]{0,120}KLineChart v10\.0\.1/);
});

test("popup packages the Manrope variable font locally with its license", () => {
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");
  const fontPath = path.join(root, "src/popup/assets/fonts/manrope-latin-variable.woff2");
  const licensePath = path.join(root, "src/popup/assets/fonts/OFL.txt");
  const font = fs.readFileSync(fontPath);

  assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2");
  assert.match(fs.readFileSync(licensePath, "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(css, /url\("\.\/assets\/fonts\/manrope-latin-variable\.woff2"\)\s+format\("woff2"\)/);
  assert.doesNotMatch(css, /fonts\.(?:googleapis|gstatic)\.com/);
});

test("popup visible controls have menu semantics and hidden utilities are not tabbable", () => {
  const popup = fs.readFileSync(path.join(root, "src/popup/popup.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");

  assert.match(popup, /id="menu-button"[^>]*aria-haspopup="menu"/);
  assert.match(popup, /id="menu-button"[^>]*aria-controls="action-menu"/);
  assert.match(popup, /id="menu-button"[^>]*aria-expanded="false"/);
  assert.match(popup, /id="menu-button"[^>]*aria-label="Profile menu"/);
  assert.match(popup, /class="profile-avatar"/);
  assert.match(popup, /id="profile-button"[^>]*role="menuitem"/);
  assert.match(popup, /id="profile-button"[\s\S]*?<span>Profile<\/span>/);
  assert.match(popup, /id="action-menu"[^>]*role="menu"/);
  assert.match(popup, /id="action-menu"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(popup, /trade-toggle-button|class="trade-toggle"/);
  assert.match(popup, /id="market-search-form"[^>]*role="search"/);
  assert.match(popup, /id="market-search-input"[^>]*placeholder="Search markets"/);
  assert.match(popup, /id="related-tab"[^>]*>\s*Relevant Markets\s*<\/button>/);
  assert.match(popup, /id="trending-tab"[^>]*>\s*Trending\s*<\/button>/);
  assert.match(popup, /id="watchlist-tab"[^>]*>\s*Watchlist\s*<\/button>/);
  assert.doesNotMatch(popup, /detected-topic|Detected topic|detected-topic-text/);
  assert.doesNotMatch(popup, /privacy-footer|Insights by|Updated just now|rainbow-mark|footer-updated|live-dot/);
  assert.doesNotMatch(css, /privacy-footer|rainbow-mark|footer-updated|live-dot/);
  assert.doesNotMatch(popup, /id="search-tab"|tabindex="-1"/);
  assert.doesNotMatch(popup, /class="menu-button"[\s\S]*?<span aria-hidden="true"><\/span>\s*<span aria-hidden="true"><\/span>\s*<span aria-hidden="true"><\/span>/);
  assert.match(popup, /<svg class="profile-avatar" viewBox="0 0 64 64"[^>]*>/);
  assert.match(popup, /<circle class="profile-avatar-outer-ring" cx="31" cy="31" r="28" \/>/);
  assert.match(popup, /<circle class="profile-avatar-head" cx="31" cy="23" r="7\.2" \/>/);
  assert.match(popup, /<path class="profile-avatar-body" d="M13\.5 52\.5C15\.2 40\.8 22 34\.6 31 34\.6s15\.8 6\.2 17\.5 17\.9Z" \/>/);
  assert.match(popup, /<circle class="profile-avatar-status-core" cx="50" cy="49" r="5" \/>/);
  assert.match(css, /\.profile-avatar-status-core\s*{[^}]*fill:\s*url\("#profile-avatar-status"\);/s);
});

test("popup loader keeps the crisp inverse animation recipe", () => {
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");

  assert.match(css, /\.loader\s*{[^}]*background:\s*#000;[^}]*filter:\s*blur\(5px\)\s+contrast\(10\);[^}]*mix-blend-mode:\s*screen;/s);
  assert.match(css, /\.loader::before,\s*\.loader::after\s*{[^}]*linear-gradient\(#fff 0 0\)[^}]*background-size:/s);
  assert.match(css, /\.loader::after\s*{[^}]*border-radius:\s*50%;[^}]*background:\s*#fff;[^}]*animation:\s*l10\s+1s\s+infinite;/s);
});

test("expanded popup keeps a taller anchored action height", () => {
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");

  assert.match(css, /html\[data-view-mode="expanded"\],\s*html\[data-view-mode="expanded"\]\s+body\s*{[^}]*width:\s*500px;[^}]*min-width:\s*500px;/s);
  assert.match(css, /html\[data-view-mode="expanded"\],\s*html\[data-view-mode="expanded"\]\s+body\s*{[^}]*height:\s*600px;[^}]*min-height:\s*600px;[^}]*max-height:\s*600px;/s);
  assert.doesNotMatch(css, /html\[data-view-mode="expanded"\],\s*html\[data-view-mode="expanded"\]\s+body\s*{[^}]*height:\s*min\([^}]*100vh/s);
  assert.doesNotMatch(css, /html\[data-view-mode="expanded"\],\s*html\[data-view-mode="expanded"\]\s+body\s*{[^}]*height:\s*850px;[^}]*min-height:\s*850px;/s);
});

test("live order-book depth bars animate real updates and respect reduced motion", () => {
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");

  assert.match(css, /\.trade-book-row::before\s*\{[^}]*transition:\s*width\s+\d+ms\s+ease-out;/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.trade-book-row::before\s*\{[^}]*transition:\s*none;/s);
});
