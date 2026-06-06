/**
 * background.js — MV3 service worker.
 *
 * Maintains a WebSocket connection to the Symbiote desktop app (ws://127.0.0.1:7429).
 * Relays messages from content scripts over the socket.
 * Reconnects with exponential back-off (max 5s).
 */

const WS_URL = "ws://127.0.0.1:7429";
const MAX_BACKOFF = 5000;

let ws = null;
let reconnectDelay = 500;
let reconnectTimer = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[symbiote] connected to desktop app");
    reconnectDelay = 500; // reset back-off
    clearTimeout(reconnectTimer);
  };

  ws.onclose = () => {
    console.log("[symbiote] disconnected — reconnecting in", reconnectDelay, "ms");
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.warn("[symbiote] WS error", e);
    // onclose will fire next
  };

  ws.onmessage = (e) => {
    // Desktop app can send commands back (future: "set_position", "ping")
    try {
      const msg = JSON.parse(e.data);
      console.log("[symbiote] ← desktop:", msg);
    } catch (_) {}
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_BACKOFF);
    connect();
  }, reconnectDelay);
}

function sendToDesktop(payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
  // If not connected, drop — the overlay handles disconnected state visually
}

// ── Message relay from content scripts ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "CLAUDE_EVENT") {
    sendToDesktop(msg.payload);
  }
});

// ── Keep service worker alive while WebSocket is open ────────────────────────
// MV3 SWs terminate after ~30s of inactivity — use alarms to stay alive.
chrome.alarms.create("keepalive", { periodInMinutes: 0.4 }); // every 24s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    // Re-check connection on each tick
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      connect();
    }
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
connect();
