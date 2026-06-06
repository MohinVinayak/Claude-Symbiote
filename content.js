/**
 * content.js — runs inside every claude.ai page.
 *
 * Responsibilities:
 *  1. Detect generation state via DOM mutations + SSE stream interception
 *  2. Maintain local state machine
 *  3. Post messages to background service worker (which relays over WebSocket)
 */

// ── State machine ─────────────────────────────────────────────────────────────
const STATES = /** @type {const} */ ({
  IDLE: "idle",
  THINKING: "thinking",
  STREAMING_TEXT: "streaming_text",
  STREAMING_CODE: "streaming_code",
  ERROR: "error",
  DONE: "done",
});

let currentState = STATES.IDLE;
let lastChunkTime = 0;
let codeBlockOpen = false;
let streamingTimer = null;

function transition(newState, event, metadata = null) {
  if (currentState === newState && event !== "chunk") return;
  currentState = newState;

  send({
    state: newState,
    event,
    ts_ms: Date.now(),
    metadata,
  });
}

function send(payload) {
  chrome.runtime.sendMessage({ type: "CLAUDE_EVENT", payload });
}

// ── DOM sentinel selectors ────────────────────────────────────────────────────
// These target structural elements — more resilient than class names.
// claude.ai renders a "stop" button while generating; its presence = active stream.
const SELECTORS = {
  stopButton:    '[aria-label*="Stop"], button[data-testid*="stop"]',
  streamingText: '[data-is-streaming="true"], .font-claude-message',
  codeBlock:     'pre code, .code-block',
  errorMsg:      '[role="alert"], .error-message',
  thinkingDots:  '.loading-dots, [data-testid*="thinking"]',
};

// ── MutationObserver — watches DOM for state changes ─────────────────────────
const observer = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    if (mut.type === "childList") {
      handleMutations();
      break; // debounce — one scan per mutation batch
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: false, // avoid character-level noise
});

function handleMutations() {
  const stopBtn   = document.querySelector(SELECTORS.stopButton);
  const thinking  = document.querySelector(SELECTORS.thinkingDots);
  const codeBlock = document.querySelector(SELECTORS.codeBlock);
  const error     = document.querySelector(SELECTORS.errorMsg);

  if (error) {
    transition(STATES.ERROR, "network_error");
    return;
  }

  if (thinking && !stopBtn) {
    transition(STATES.THINKING, "state_change");
    return;
  }

  if (stopBtn) {
    // Active stream — check if inside a code block
    const isCode = codeBlock && isActivelyGrowing(codeBlock);
    if (isCode && !codeBlockOpen) {
      codeBlockOpen = true;
      transition(STATES.STREAMING_CODE, "code_block_open");
    } else if (!isCode && codeBlockOpen) {
      codeBlockOpen = false;
      transition(STATES.STREAMING_TEXT, "code_block_close");
    } else if (!isCode) {
      transition(STATES.STREAMING_TEXT, "state_change");
    }

    // Signal a chunk arrived
    const now = Date.now();
    if (now - lastChunkTime > 50) { // debounce 50ms
      lastChunkTime = now;
      send({ state: currentState, event: "chunk", ts_ms: now });
    }

    // Set a timer — if no mutation for 1.5s and stop btn gone = done
    clearTimeout(streamingTimer);
    streamingTimer = setTimeout(checkDone, 1500);
    return;
  }

  // No stop button, no error, no thinking — if we were streaming, we're done
  if (currentState !== STATES.IDLE && currentState !== STATES.DONE) {
    codeBlockOpen = false;
    transition(STATES.DONE, "state_change");
    setTimeout(() => transition(STATES.IDLE, "state_change"), 2000);
  }
}

function checkDone() {
  const stopBtn = document.querySelector(SELECTORS.stopButton);
  if (!stopBtn && currentState !== STATES.IDLE) {
    codeBlockOpen = false;
    transition(STATES.DONE, "state_change");
    setTimeout(() => transition(STATES.IDLE, "state_change"), 2000);
  }
}

/** Heuristic: a code block is "actively growing" if it gained chars recently */
const codeBlockSizes = new WeakMap();
function isActivelyGrowing(el) {
  const len = el.textContent?.length ?? 0;
  const prev = codeBlockSizes.get(el) ?? 0;
  codeBlockSizes.set(el, len);
  return len > prev;
}

// ── SSE stream interception ───────────────────────────────────────────────────
// Intercept fetch to catch the SSE stream URL — gives us precise chunk timing.
// Injected as a page script to access window.fetch.
const pageScript = document.createElement("script");
pageScript.textContent = `
(function() {
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const resp = await origFetch.apply(this, arguments);
    if (url.includes("/api/") && url.includes("stream")) {
      const clone = resp.clone();
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (text.includes("data:")) {
            window.dispatchEvent(new CustomEvent("__symbiote_chunk__", {
              detail: { ts: Date.now() }
            }));
          }
        }
      })().catch(() => {});
    }
    return resp;
  };
})();
`;
(document.head || document.documentElement).appendChild(pageScript);
pageScript.remove();

// Listen for SSE chunks from page script
window.addEventListener("__symbiote_chunk__", (e) => {
  const now = e.detail.ts;
  if (now - lastChunkTime > 30) {
    lastChunkTime = now;
    send({ state: currentState, event: "chunk", ts_ms: now });
  }
});

// ── Error interception ────────────────────────────────────────────────────────
window.addEventListener("unhandledrejection", (e) => {
  if (String(e.reason).toLowerCase().includes("fetch")) {
    transition(STATES.ERROR, "network_error", { msg: String(e.reason) });
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
transition(STATES.IDLE, "state_change");
