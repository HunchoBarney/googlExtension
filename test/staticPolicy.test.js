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
    "https://data-api.polymarket.com/*"
  ]);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.action.default_title, "Find Polymarket matches");
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
  assert.doesNotMatch(source, /api\.openai\.com|anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai/i);
});
