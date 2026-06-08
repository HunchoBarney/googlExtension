"use strict";

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 850;
let matcherWindowId = null;

function logExtensionError(message, error) {
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error(message, error);
  }
}

function popupUrl(tabId) {
  const params = new URLSearchParams({
    expanded: "1",
    sourceTabId: String(tabId || "")
  });
  return chrome.runtime.getURL(`src/popup/popup.html?${params.toString()}`);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function openMatcherWindow(sourceTab) {
  const tab = sourceTab && sourceTab.id ? sourceTab : await activeTab();
  if (!tab || !tab.id) {
    return;
  }
  const url = popupUrl(tab.id);

  if (matcherWindowId !== null) {
    try {
      const existing = await chrome.windows.get(matcherWindowId, { populate: true });
      const [matcherTab] = existing.tabs || [];
      if (matcherTab && matcherTab.id) {
        await chrome.tabs.update(matcherTab.id, { url });
      }
      await chrome.windows.update(matcherWindowId, { focused: true });
      return;
    } catch (error) {
      matcherWindowId = null;
    }
  }

  const created = await chrome.windows.create({
    url,
    type: "popup",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true
  });
  matcherWindowId = created && Number.isInteger(created.id) ? created.id : null;
}

chrome.action.onClicked.addListener((tab) => {
  openMatcherWindow(tab).catch((error) => {
    logExtensionError("Failed to open matcher window.", error);
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === matcherWindowId) {
    matcherWindowId = null;
  }
});
