#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createArgReader } = require("./cliArgs");

const { argValue, argNumber } = createArgReader(process.argv);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function latestPopupScreenshot() {
  const artifactDir = path.join(__dirname, "..", "test-artifacts");
  const prefix = "browser-smoke-popup-";
  const suffix = ".png";
  const entries = fs.readdirSync(artifactDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
    .map((entry) => {
      const file = path.join(artifactDir, entry.name);
      return {
        file,
        modifiedMs: fs.statSync(file).mtimeMs
      };
    })
    .sort((left, right) => right.modifiedMs - left.modifiedMs);

  if (!entries.length) {
    throw new Error(`No ${prefix}*${suffix} files found in ${artifactDir}. Run npm run test:browser first.`);
  }
  return entries[0].file;
}

function resolveImagePath(value, optionName) {
  if (value === "latest" && (optionName === "actual" || optionName === "reference")) {
    return latestPopupScreenshot();
  }
  if (!value) {
    return "";
  }
  return path.resolve(value);
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  if (upDistance <= upperLeftDistance) {
    return up;
  }
  return upperLeft;
}

function channelsForColorType(colorType) {
  if (colorType === 0) {
    return 1;
  }
  if (colorType === 2) {
    return 3;
  }
  if (colorType === 4) {
    return 2;
  }
  if (colorType === 6) {
    return 4;
  }
  throw new Error(`Unsupported PNG color type ${colorType}. Use a truecolor PNG reference.`);
}

function readPng(file) {
  const buffer = fs.readFileSync(file);
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${file} is not a PNG file.`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const dataChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      dataChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height) {
    throw new Error(`${file} is missing PNG dimensions.`);
  }
  if (bitDepth !== 8) {
    throw new Error(`${file} uses bit depth ${bitDepth}; only 8-bit PNGs are supported.`);
  }
  if (interlace !== 0) {
    throw new Error(`${file} is interlaced; save it as a non-interlaced PNG.`);
  }

  const channels = channelsForColorType(colorType);
  const bytesPerPixel = channels;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(dataChunks));
  const raw = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const previousRowOffset = rowOffset - stride;

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? raw[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[previousRowOffset + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? raw[previousRowOffset + x - bytesPerPixel] : 0;
      let reconstructed = value;

      if (filter === 1) {
        reconstructed = value + left;
      } else if (filter === 2) {
        reconstructed = value + up;
      } else if (filter === 3) {
        reconstructed = value + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        reconstructed = value + paeth(left, up, upperLeft);
      } else if (filter !== 0) {
        throw new Error(`${file} uses unsupported PNG filter ${filter}.`);
      }
      raw[rowOffset + x] = reconstructed & 255;
    }
    sourceOffset += stride;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0, out = 0; index < raw.length; index += channels, out += 4) {
    if (colorType === 0) {
      rgba[out] = raw[index];
      rgba[out + 1] = raw[index];
      rgba[out + 2] = raw[index];
      rgba[out + 3] = 255;
    } else if (colorType === 2) {
      rgba[out] = raw[index];
      rgba[out + 1] = raw[index + 1];
      rgba[out + 2] = raw[index + 2];
      rgba[out + 3] = 255;
    } else if (colorType === 4) {
      rgba[out] = raw[index];
      rgba[out + 1] = raw[index];
      rgba[out + 2] = raw[index];
      rgba[out + 3] = raw[index + 1];
    } else {
      rgba[out] = raw[index];
      rgba[out + 1] = raw[index + 1];
      rgba[out + 2] = raw[index + 2];
      rgba[out + 3] = raw[index + 3];
    }
  }

  return { file, width, height, rgba };
}

function resizeImage(image, width, height) {
  if (image.width === width && image.height === height) {
    return image;
  }

  const out = new Uint8Array(width * height * 4);
  const xScale = image.width / width;
  const yScale = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, (y + 0.5) * yScale - 0.5);
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(image.height - 1, y0 + 1);
    const yWeight = sourceY - y0;

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, (x + 0.5) * xScale - 0.5);
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(image.width - 1, x0 + 1);
      const xWeight = sourceX - x0;
      const outOffset = (y * width + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const topLeft = image.rgba[(y0 * image.width + x0) * 4 + channel];
        const topRight = image.rgba[(y0 * image.width + x1) * 4 + channel];
        const bottomLeft = image.rgba[(y1 * image.width + x0) * 4 + channel];
        const bottomRight = image.rgba[(y1 * image.width + x1) * 4 + channel];
        const top = topLeft + (topRight - topLeft) * xWeight;
        const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight;
        out[outOffset + channel] = Math.round(top + (bottom - top) * yWeight);
      }
    }
  }

  return {
    file: image.file,
    width,
    height,
    rgba: out
  };
}

function compareImages(reference, actual, options) {
  const resizedReference = resizeImage(reference, actual.width, actual.height);
  const pixelCount = actual.width * actual.height;
  let total = 0;
  let squared = 0;
  let max = 0;
  let changed = 0;

  for (let index = 0; index < actual.rgba.length; index += 4) {
    const red = Math.abs(resizedReference.rgba[index] - actual.rgba[index]);
    const green = Math.abs(resizedReference.rgba[index + 1] - actual.rgba[index + 1]);
    const blue = Math.abs(resizedReference.rgba[index + 2] - actual.rgba[index + 2]);
    const average = (red + green + blue) / 3;
    total += average;
    squared += average * average;
    max = Math.max(max, red, green, blue);
    if (average > options.changedThreshold) {
      changed += 1;
    }
  }

  return {
    meanAbsoluteError: total / pixelCount,
    rootMeanSquareError: Math.sqrt(squared / pixelCount),
    maxChannelError: max,
    changedPixelPercent: changed / pixelCount * 100
  };
}

function main() {
  const referencePath = argValue("reference");
  const actualPath = argValue("actual");
  const maxMean = argNumber("max-mean", 8);
  const maxChangedPercent = argNumber("max-changed-percent", 8);
  const maxAspectDiff = argNumber("max-aspect-diff", 0.01);
  const changedThreshold = argNumber("changed-threshold", 24);

  if (!referencePath || !actualPath) {
    fail("Usage: node scripts/compare-popup-reference.js --reference=reference.png --actual=latest");
    return;
  }

  const resolvedReferencePath = resolveImagePath(referencePath, "reference");
  const resolvedActualPath = resolveImagePath(actualPath, "actual");
  const reference = readPng(resolvedReferencePath);
  const actual = readPng(resolvedActualPath);
  const referenceAspect = reference.height / reference.width;
  const actualAspect = actual.height / actual.width;
  const aspectDiff = Math.abs(referenceAspect - actualAspect);
  const metrics = compareImages(reference, actual, { changedThreshold });

  const report = {
    reference: {
      file: resolvedReferencePath,
      width: reference.width,
      height: reference.height,
      aspect: Number(referenceAspect.toFixed(4))
    },
    actual: {
      file: resolvedActualPath,
      width: actual.width,
      height: actual.height,
      aspect: Number(actualAspect.toFixed(4))
    },
    thresholds: {
      maxMean,
      maxChangedPercent,
      maxAspectDiff,
      changedThreshold
    },
    metrics: {
      aspectDiff: Number(aspectDiff.toFixed(6)),
      meanAbsoluteError: Number(metrics.meanAbsoluteError.toFixed(4)),
      rootMeanSquareError: Number(metrics.rootMeanSquareError.toFixed(4)),
      maxChannelError: metrics.maxChannelError,
      changedPixelPercent: Number(metrics.changedPixelPercent.toFixed(4))
    }
  };

  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (aspectDiff > maxAspectDiff) {
    failures.push(`aspect diff ${aspectDiff.toFixed(4)} exceeds ${maxAspectDiff}`);
  }
  if (metrics.meanAbsoluteError > maxMean) {
    failures.push(`mean pixel error ${metrics.meanAbsoluteError.toFixed(2)} exceeds ${maxMean}`);
  }
  if (metrics.changedPixelPercent > maxChangedPercent) {
    failures.push(`changed pixels ${metrics.changedPixelPercent.toFixed(2)}% exceeds ${maxChangedPercent}%`);
  }

  if (failures.length) {
    fail(`Reference comparison failed: ${failures.join("; ")}.`);
  }
}

try {
  main();
} catch (error) {
  fail(error && error.stack ? error.stack : String(error));
}
