"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const extensionFiles = [
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "manifest.json",
  "src/background/serviceWorker.js",
  "src/content/runExtraction.js",
  "src/lib/articleAngleClassifierData.json",
  "src/lib/articleExtractor.js",
  "src/lib/articleSignals.js",
  "src/lib/hyperliquid.js",
  "src/lib/polymarket.js",
  "src/popup/assets/fonts/OFL.txt",
  "src/popup/assets/fonts/manrope-latin-variable.woff2",
  "src/popup/assets/hyperliquid-symbol.svg",
  "src/popup/assets/polymarket-icon.svg",
  "src/popup/klinecharts.js",
  "src/popup/popup.css",
  "src/popup/popup.html",
  "src/popup/popup.js",
  "src/popup/render.js",
  "src/vendor/READABILITY-LICENSE.md",
  "src/vendor/Readability.js",
  "src/vendor/klinecharts/LICENSE",
  "src/vendor/klinecharts/NOTICE",
  "src/vendor/klinecharts/README.md",
  "src/vendor/klinecharts/klinecharts.min.js",
  "src/vendor/klinecharts/licenses/LICENSE-lightweight-charts"
];

const sourceFiles = [
  ".gitattributes",
  ".gitignore",
  ".github/dependabot.yml",
  ".github/workflows/ci.yml",
  "CONTRIBUTING.md",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/release-verification.md",
  "manifest.json",
  "package-lock.json",
  "package.json"
];

const sourceDirectories = ["scripts", "src", "test", "test-support"];

function assertInside(parent, child) {
  const parentPath = path.resolve(parent);
  const childPath = path.resolve(child);
  if (childPath === parentPath || !childPath.startsWith(`${parentPath}${path.sep}`)) {
    throw new Error(`Refusing to modify a path outside the release output directory: ${childPath}`);
  }
}

function walk(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(full, base);
    }
    return [path.relative(base, full).replaceAll("\\", "/")];
  });
}

function copyFiles(files, destination) {
  for (const relative of files) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`Release input is missing: ${relative}`);
    }
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function directoryFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  return walk(directory).map((file) => `${relativeDirectory}/${file}`);
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function createArchive(sourceDirectory, archivePath) {
  fs.rmSync(archivePath, { force: true });
  let command;
  let args;
  let options = { stdio: "inherit" };

  if (process.platform === "win32") {
    command = "powershell";
    const source = quotePowerShell(sourceDirectory);
    const archive = quotePowerShell(archivePath);
    args = [
      "-NoProfile",
      "-Command",
      `$ErrorActionPreference='Stop'; $items=Get-ChildItem -LiteralPath ${source} -Force; Compress-Archive -Path $items.FullName -DestinationPath ${archive} -Force`
    ];
  } else {
    command = "zip";
    args = ["-qr", archivePath, "."];
    options = { ...options, cwd: sourceDirectory };
  }

  const result = spawnSync(command, args, options);
  if (result.status !== 0) {
    throw new Error(`Could not create release archive ${archivePath}`);
  }
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function validateMetadata() {
  const manifest = readJson("manifest.json");
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");

  if (packageJson.name !== "pmex-market-matcher") {
    throw new Error("package.json must use the release name pmex-market-matcher");
  }
  if (manifest.name !== "PMEx Market Matcher") {
    throw new Error("manifest.json must use the release name PMEx Market Matcher");
  }
  if (packageJson.version !== manifest.version || packageLock.version !== manifest.version) {
    throw new Error("package.json, package-lock.json, and manifest.json versions must match");
  }
  if (packageLock.name !== packageJson.name) {
    throw new Error("package-lock.json and package.json names must match");
  }
  if (packageJson.license !== "MIT" || !/^MIT License/m.test(license)) {
    throw new Error("Release metadata and LICENSE must use MIT");
  }
  return { manifest, packageJson };
}

function createRelease(options = {}) {
  const { manifest } = validateMetadata();
  const outputDir = path.resolve(options.outputDir || path.join(root, "dist"));
  const baseName = `pmex-market-matcher-${manifest.version}`;
  const extensionDir = path.join(outputDir, `${baseName}-extension`);
  const sourceDir = path.join(outputDir, `${baseName}-source`);
  const extensionZip = `${extensionDir}.zip`;
  const sourceZip = `${sourceDir}.zip`;
  const checksumsPath = path.join(outputDir, "SHA256SUMS.txt");

  fs.mkdirSync(outputDir, { recursive: true });
  for (const target of [extensionDir, sourceDir, extensionZip, sourceZip, checksumsPath]) {
    assertInside(outputDir, target);
  }
  fs.rmSync(extensionDir, { recursive: true, force: true });
  fs.rmSync(sourceDir, { recursive: true, force: true });
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });

  copyFiles(extensionFiles, extensionDir);
  const publicSourceFiles = [
    ...sourceFiles,
    ...sourceDirectories.flatMap(directoryFiles)
  ];
  copyFiles(publicSourceFiles, sourceDir);

  const forbidden = /(^|\/)(?:\.git|\.lazyweb|\.superpowers|node_modules|outputs|landing-assets|test-artifacts|dist)(?:\/|$)|marketMaker|tradingview/i;
  for (const [label, directory] of [["extension", extensionDir], ["source", sourceDir]]) {
    const bad = walk(directory).find((file) => forbidden.test(file));
    if (bad) {
      throw new Error(`${label} snapshot contains forbidden release file: ${bad}`);
    }
  }

  const popupSource = fs.readFileSync(path.join(extensionDir, "src/popup/popup.js"), "utf8");
  if (/No data leaves device/i.test(popupSource)) {
    throw new Error("Release contains the retired privacy claim");
  }

  if (options.createZip !== false) {
    createArchive(extensionDir, extensionZip);
    createArchive(sourceDir, sourceZip);
    const checksums = [extensionZip, sourceZip]
      .map((archive) => `${sha256(archive)}  ${path.basename(archive)}`)
      .join("\n");
    fs.writeFileSync(checksumsPath, `${checksums}\n`, "utf8");
  }

  return { extensionDir, sourceDir, extensionZip, sourceZip, checksumsPath };
}

if (require.main === module) {
  const result = createRelease();
  console.log(`Extension snapshot: ${result.extensionDir}`);
  console.log(`Extension archive: ${result.extensionZip}`);
  console.log(`Public-source snapshot: ${result.sourceDir}`);
  console.log(`Public-source archive: ${result.sourceZip}`);
  console.log(`Checksums: ${result.checksumsPath}`);
}

module.exports = { createRelease };
