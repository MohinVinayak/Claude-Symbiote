/**
 * background.js — MV3 service worker.
 *
 * Stores the latest Claude state and serves it to the global UI.
 * Broadcasts state updates to all tabs so the overlay updates everywhere.
 */

let currentState = { state: "idle", event: "init", ts_ms: Date.now() };

// ── Receive state from content script & commands from UI ────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CLAUDE_EVENT") {
    currentState = msg.payload;
    
    // Broadcast the state update to ALL tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATE", payload: currentState }, () => {
            if (chrome.runtime.lastError) {
              // Ignore errors for tabs that don't have the content script injected (e.g., chrome:// pages)
            }
          });
        } catch (e) {
          // Ignore synchronous exceptions
        }
      }
    });
  }

  if (msg.type === "GET_STATE") {
    sendResponse(currentState);
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
