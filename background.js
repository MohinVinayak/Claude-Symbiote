/**
 * background.js — MV3 service worker.
 *
 * Stores the latest Claude state and serves it to the popup.
 * No WebSocket, no desktop app — fully self-contained.
 */

let currentState = { state: "idle", event: "init", ts_ms: Date.now() };

// ── Receive state from content scripts ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CLAUDE_EVENT") {
    currentState = msg.payload;
    // Notify popup if it's open
    chrome.runtime.sendMessage({ type: "STATE_UPDATE", payload: currentState }).catch(() => {});
  }

  if (msg.type === "GET_STATE") {
    sendResponse(currentState);
  }
});

// ── Keep service worker alive while monitoring ──────────────────────────────
chrome.alarms.create("keepalive", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    // Just a heartbeat — keeps SW alive
  }
});
