/**
 * background.js — MV3 service worker.
 *
 * Stores the latest Claude state and serves it to the global UI.
 * Broadcasts state updates to all tabs so the overlay updates everywhere.
 */

let currentState = { state: "idle", event: "init", ts_ms: Date.now() };
let isVisible = true;

// Load initial visibility state
chrome.storage.local.get(["isVisible"], (res) => {
  if (res.isVisible !== undefined) {
    isVisible = res.isVisible;
  }
});

function broadcastVisibility() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, { type: "VISIBILITY_UPDATE", payload: isVisible }, () => chrome.runtime.lastError);
      } catch (e) {}
    }
  });
}

// Toggle visibility when clicking the extension icon
chrome.action.onClicked.addListener((tab) => {
  isVisible = !isVisible;
  chrome.storage.local.set({ isVisible });
  broadcastVisibility();
});

// ── Receive state from content script & commands from UI ────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CLAUDE_EVENT") {
    currentState = msg.payload;
    
    // Broadcast the state update to ALL tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATE", payload: currentState }, () => chrome.runtime.lastError);
        } catch (e) {}
      }
    });
  }

  if (msg.type === "SET_VISIBILITY") {
    isVisible = msg.payload;
    chrome.storage.local.set({ isVisible });
    broadcastVisibility();
  }

  if (msg.type === "GET_STATE") {
    sendResponse({ state: currentState, isVisible });
  }

  if (msg.type === "FOCUS_CLAUDE") {
    chrome.tabs.query({ url: "*://*.claude.ai/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      }
    });
  }
});

// ── Keep service worker alive while monitoring ──────────────────────────────
chrome.alarms.create("keepalive", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    // Just a heartbeat — keeps SW alive
  }
});
