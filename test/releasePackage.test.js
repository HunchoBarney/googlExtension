const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const packagerPath = path.join(root, "scripts", "package-release.js");

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(full, base);
    }
    return [path.relative(base, full).replaceAll("\\", "/")];
  });
}

test("release packager produces clean extension and public-source snapshots", () => {
  assert.ok(fs.existsSync(packagerPath), "release packager must exist");

  const { createRelease } = require(packagerPath);
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmex-release-test-"));
  try {
    const result = createRelease({ outputDir });
    const extensionFiles = listFiles(result.extensionDir);
    const sourceFiles = listFiles(result.sourceDir);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.extensionDir, "manifest.json"), "utf8"));
    const packageJson = JSON.parse(fs.readFileSync(path.join(result.sourceDir, "package.json"), "utf8"));
    const readme = fs.readFileSync(path.join(result.sourceDir, "README.md"), "utf8");

    assert.equal(packageJson.name, "pmex-market-matcher");
    assert.equal(packageJson.version, manifest.version);
    assert.equal(packageJson.license, "MIT");
    assert.match(readme, /^# PMEx Market Matcher/m);
    assert.match(manifest.description, /read-only/i);

    for (const required of [
      "manifest.json",
      "LICENSE",
      "PRIVACY.md",
      "THIRD_PARTY_NOTICES.md",
      "src/popup/popup.html",
      "src/popup/klinecharts.js",
      "src/vendor/klinecharts/LICENSE",
      "src/vendor/klinecharts/NOTICE",
      "src/popup/assets/fonts/OFL.txt"
    ]) {
      assert.ok(extensionFiles.includes(required), `extension snapshot missing ${required}`);
    }

    for (const required of [
      ".github/workflows/ci.yml",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "package-lock.json",
      "scripts/package-release.js",
      "test/releasePackage.test.js"
    ]) {
      assert.ok(sourceFiles.includes(required), `source snapshot missing ${required}`);
    }

    const forbidden = /(^|\/)(?:\.git|\.lazyweb|\.superpowers|node_modules|outputs|landing-assets|test-artifacts|dist)(?:\/|$)|marketMaker|tradingview/i;
    assert.equal(extensionFiles.some((file) => forbidden.test(file)), false);
    assert.equal(sourceFiles.some((file) => forbidden.test(file)), false);
    assert.equal(extensionFiles.some((file) => /^(?:test|scripts|docs)\//.test(file)), false);

    assert.ok(fs.statSync(result.extensionZip).size > 0);
    assert.ok(fs.statSync(result.sourceZip).size > 0);
    assert.equal(typeof result.checksumsPath, "string", "release packager must return a checksum manifest");
    const checksums = fs.readFileSync(result.checksumsPath, "utf8");
    for (const archive of [result.extensionZip, result.sourceZip]) {
      const digest = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
      assert.match(checksums, new RegExp(`^${digest}  ${path.basename(archive)}$`, "m"));
    }
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
