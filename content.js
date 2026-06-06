/**
 * content.js — runs inside every claude.ai page (ISOLATED world).
 *
 * Responsibilities:
 *  1. Detect generation state via DOM mutations
 *  2. Listen for SSE chunk events from intercept.js (MAIN world)
 *  3. Post state to background service worker via chrome.runtime.sendMessage
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
  characterData: false,
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

    const now = Date.now();
    if (now - lastChunkTime > 50) {
      lastChunkTime = now;
      send({ state: currentState, event: "chunk", ts_ms: now });
    }

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

// ── SSE chunk listener (from intercept.js in MAIN world) ─────────────────────
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

