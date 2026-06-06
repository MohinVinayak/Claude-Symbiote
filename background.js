/**
 * background.js — MV3 service worker.
 *
 * Stores the latest Claude state and serves it to the global UI.
 * Broadcasts state updates to all tabs so the overlay updates everywhere.
 */

let tabStates = {};
let currentState = { state: "idle", event: "init", ts_ms: Date.now() };
let isVisible = true;

const STATE_PRIORITY = {
  streaming_code: 6,
  streaming_text: 5,
  thinking: 4,
  error: 3,
  done: 2,
  idle: 1,
  disconnected: 0
};

function getDominantState() {
  let bestState = { state: "idle", event: "init", ts_ms: Date.now() };
  let maxPrio = -1;
  let mostRecent = 0;

  for (const stateObj of Object.values(tabStates)) {
    const prio = STATE_PRIORITY[stateObj.state] || 0;
    if (prio > maxPrio || (prio === maxPrio && stateObj.ts_ms > mostRecent)) {
      maxPrio = prio;
      mostRecent = stateObj.ts_ms;
      bestState = stateObj;
    }
  }
  return bestState;
}

function updateAndBroadcastState() {
  const domState = getDominantState();
  currentState = domState;
  
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATE", payload: currentState }, () => chrome.runtime.lastError);
      } catch (e) {}
    }
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabStates[tabId]) {
    delete tabStates[tabId];
    updateAndBroadcastState();
  }
});

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
    if (sender.tab) {
      tabStates[sender.tab.id] = msg.payload;
    } else {
      // Fallback if no tab id (unlikely for content script)
      tabStates['unknown'] = msg.payload;
    }
    updateAndBroadcastState();
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
