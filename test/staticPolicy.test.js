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
  assert.doesNotMatch(source, /chrome\.windows\.create|chrome\.tabs\.create/);
  assert.doesNotMatch(source, /api\.openai\.com|anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai/i);
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
  assert.match(css, /\.menu-button\s*{[^}]*width:\s*50px;[^}]*height:\s*50px;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(css, /\.profile-avatar\s*{[^}]*width:\s*50px;[^}]*height:\s*50px;[^}]*overflow:\s*visible;/s);
  assert.match(css, /\.profile-avatar-status-core\s*{[^}]*fill:\s*url\("#profile-avatar-status"\);/s);
});

test("popup loader keeps the crisp inverse animation recipe", () => {
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");

  assert.match(css, /\.loader\s*{[^}]*width:\s*100px;[^}]*background:\s*#000;[^}]*filter:\s*blur\(5px\)\s+contrast\(10\);[^}]*mix-blend-mode:\s*screen;/s);
  assert.match(css, /\.loader::before,\s*\.loader::after\s*{[^}]*linear-gradient\(#fff 0 0\)[^}]*background-size:\s*20px\s+40px;/s);
  assert.match(css, /\.loader::after\s*{[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*background:\s*#fff;/s);
});

test("expanded popup keeps a taller anchored action height", () => {
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");

  assert.match(css, /html\[data-view-mode="expanded"\],\s*html\[data-view-mode="expanded"\]\s+body\s*{[^}]*width:\s*500px;[^}]*min-width:\s*500px;/s);
  assert.match(css, /html\[data-view-mode="expanded"\],\s*html\[data-view-mode="expanded"\]\s+body\s*{[^}]*height:\s*580px;[^}]*min-height:\s*580px;[^}]*max-height:\s*580px;/s);
  assert.doesNotMatch(css, /html\[data-view-mode="expanded"\],\s*html\[data-view-mode="expanded"\]\s+body\s*{[^}]*height:\s*850px;[^}]*min-height:\s*850px;/s);
});
