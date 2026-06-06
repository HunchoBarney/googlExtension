"use strict";

function createArgReader(argv = process.argv, options = {}) {
  const preferLastValue = options.preferLastValue === true;

  function argValue(name, fallback = "") {
    const prefix = `--${name}=`;
    const matches = argv.filter((arg) => arg.startsWith(prefix));
    if (!matches.length) {
      return fallback;
    }
    const found = preferLastValue ? matches[matches.length - 1] : matches[0];
    return found.slice(prefix.length);
  }

  function argNumber(name, fallback, numberOptions = {}) {
    const value = Number(argValue(name, String(fallback)));
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (numberOptions.positiveOnly && value <= 0) {
      return fallback;
    }
    return value;
  }

  function hasFlag(name) {
    return argv.includes(`--${name}`);
  }

  return {
    argValue,
    argNumber,
    hasFlag
  };
}

module.exports = {
  createArgReader
};
