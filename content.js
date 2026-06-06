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

// ── Floating UI Injection ─────────────────────────────────────────────────────
function injectUI() {
  if (document.getElementById("symbiote-overlay-root")) return;

  const container = document.createElement("div");
  container.id = "symbiote-overlay-root";
  container.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647; /* max z-index */
    pointer-events: auto;
    display: flex;
    justify-content: center;
  `;

  const shadow = container.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    #pill-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #1a1a1a;
      padding: 12px 24px 12px 18px;
      border-radius: 50px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.1s ease;
      font-family: -apple-system, 'SF Pro Display', 'Inter', sans-serif;
      user-select: none;
      cursor: pointer;
      overflow: hidden;
    }
    #pill-container:active {
      transform: scale(0.97);
    }
    
    .sparkle-wrapper {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sparkle-svg {
      width: 100%;
      height: 100%;
      fill: #7f7f7f;
      transition: fill 0.3s ease;
    }
    
    #pill-container.active .sparkle-svg {
      fill: #d97757;
      animation: spin 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
    #pill-container.error .sparkle-svg {
      fill: #e05252;
      animation: none;
    }
    
    @keyframes spin {
      0%   { transform: rotate(0deg) scale(1); }
      50%  { transform: rotate(90deg) scale(1.12); }
      100% { transform: rotate(180deg) scale(1); }
    }
    
    #status-text {
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.2px;
      color: #ffffff;
      white-space: nowrap;
    }
  `;

  const html = `
    <div id="pill-container">
      <div class="sparkle-wrapper">
        <svg class="sparkle-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
        </svg>
      </div>
      <span id="status-text">Idle</span>
    </div>
  `;

  shadow.appendChild(style);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  shadow.appendChild(wrapper);

  document.documentElement.appendChild(container);

  return {
    pill: shadow.getElementById('pill-container'),
    statusText: shadow.getElementById('status-text'),
    sparkle: shadow.querySelector('.sparkle-svg')
  };
}

const ui = injectUI();

const STATE_CONFIGS = {
  idle:           { label: 'Idle',                 icon: 'grey' },
  thinking:       { label: 'Claude is thinking…',  icon: 'active' },
  streaming_text: { label: 'Writing…',             icon: 'active' },
  streaming_code: { label: 'Writing code…',        icon: 'active' },
  error:          { label: 'Something went wrong', icon: 'error' },
  done:           { label: 'Done',                 icon: 'grey' }
};

function updateUI(state) {
  if (!ui) return;
  const config = STATE_CONFIGS[state] || STATE_CONFIGS.idle;

  ui.pill.classList.remove('active', 'error');

  if (config.icon === 'active') {
    ui.pill.classList.add('active');
    ui.sparkle.style.fill = '';
  } else if (config.icon === 'error') {
    ui.pill.classList.add('error');
    ui.sparkle.style.fill = '';
  } else {
    ui.sparkle.style.fill = '#7f7f7f';
  }

  ui.statusText.textContent = config.label;
}

// Intercept state changes directly in content.js to update the UI instantly
const originalTransition = transition;
transition = function(newState, event, metadata = null) {
  originalTransition(newState, event, metadata);
  updateUI(newState);
};

// Initial render
updateUI(currentState);

