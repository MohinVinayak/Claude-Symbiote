/**
 * global_ui.js — runs on ALL tabs.
 * 
 * Injects the Symbiote floating pill overlay.
 * Listens to background.js for state updates.
 * Supports dragging, drag-to-dismiss, and Picture-in-Picture.
 */

let ui = null;
let currentGlobalState = "idle"; // keep track of state for PiP sync

function injectUI() {
  if (document.getElementById("symbiote-overlay-root")) return null;

  const container = document.createElement("div");
  container.id = "symbiote-overlay-root";
  container.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; /* max z-index */
    pointer-events: none;
    display: none;
  `;

  const shadow = container.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    #pill-container {
      position: absolute;
      top: 24px;
      right: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #1a1a1a;
      padding: 12px 18px 12px 18px;
      border-radius: 50px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
      font-family: -apple-system, 'SF Pro Display', 'Inter', sans-serif;
      user-select: none;
      touch-action: none;
      cursor: grab;
      overflow: hidden;
      pointer-events: auto;
      transform: translate(0px, 0px) scale(1);
    }
    #pill-container:active {
      cursor: grabbing;
      transform: translate(0px, 0px) scale(0.97);
    }
    #pill-container.dragging {
      transition: none;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
      opacity: 0.9;
    }
    #pill-container.dismissing {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transform: scale(0) !important;
      opacity: 0;
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

    #pip-btn {
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.4;
      transition: opacity 0.2s;
      padding: 4px;
      border-radius: 4px;
    }
    #pip-btn:hover {
      opacity: 1;
      background: rgba(255,255,255,0.1);
    }
    #pip-btn svg {
      width: 14px;
      height: 14px;
      fill: #fff;
    }

    /* Dismiss Zone */
    #dismiss-zone {
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(8px);
    }
    #dismiss-zone.visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    #dismiss-zone.hover {
      background: rgba(224, 82, 82, 0.9);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateX(-50%) scale(1.2);
    }
    #dismiss-zone svg {
      width: 24px;
      height: 24px;
      fill: #ffffff;
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
      <button id="pip-btn" title="Pop out">
        <svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 0H3V5h18v14z"/></svg>
      </button>
    </div>
    <div id="dismiss-zone">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </div>
  `;

  shadow.appendChild(style);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  shadow.appendChild(wrapper);

  document.documentElement.appendChild(container);

  const pill = shadow.getElementById('pill-container');
  const dismissZone = shadow.getElementById('dismiss-zone');
  const pipBtn = shadow.getElementById('pip-btn');
  
  // Dragging state
  let isDragging = false;
  let hasMoved = false; // to distinguish click from drag
  let startX = 0, startY = 0;
  let currentX = 0, currentY = 0;
  let isPipActive = false;
  let pipWindowObj = null;

  pipBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!('documentPictureInPicture' in window)) {
      alert("Your browser does not support Document Picture-in-Picture.");
      return;
    }

    if (isPipActive) return;

    try {
      pipWindowObj = await window.documentPictureInPicture.requestWindow({
        width: 170,
        height: 48,
      });
      isPipActive = true;

      // Make PiP background perfectly match the pill
      pipWindowObj.document.body.style.margin = "0";
      pipWindowObj.document.body.style.padding = "0";
      pipWindowObj.document.body.style.background = "#1a1a1a";
      pipWindowObj.document.body.style.display = "flex";
      pipWindowObj.document.body.style.alignItems = "center";
      pipWindowObj.document.body.style.justifyContent = "center";
      pipWindowObj.document.body.style.overflow = "hidden";

      // Inject styles into PiP
      const pipStyle = document.createElement('style');
      pipStyle.textContent = style.textContent;
      // Override pill styles inside PiP so it fills the window cleanly without shadows/borders
      pipStyle.textContent += `
        #pill-container {
          position: static;
          border: none;
          box-shadow: none;
          transform: none !important;
          cursor: default;
          width: 100%;
          height: 100%;
          border-radius: 0;
        }
        #pip-btn { display: none; }
      `;
      pipWindowObj.document.head.appendChild(pipStyle);

      // Move pill to PiP
      pipWindowObj.document.body.appendChild(pill);
      container.style.display = 'none'; // hide our main container

      // Listen for PiP close to bring it back
      pipWindowObj.addEventListener("pagehide", (event) => {
        isPipActive = false;
        wrapper.appendChild(pill); // put it back
        container.style.display = 'block'; // show our container again
      });
    } catch (err) {
      console.error("Failed to open PiP:", err);
      alert("Failed to pop out: " + err.message);
    }
  });

  pill.addEventListener('pointerdown', (e) => {
    if (isPipActive) return; // Don't allow dragging inside PiP
    if (e.button !== 0) return; // Only left click
    isDragging = true;
    hasMoved = false;
    startX = e.clientX - currentX;
    startY = e.clientY - currentY;
    
    pill.setPointerCapture(e.pointerId);
    pill.classList.add('dragging');
    dismissZone.classList.add('visible');
  });

  pill.addEventListener('pointermove', (e) => {
    if (!isDragging || isPipActive) return;
    
    if (Math.abs(e.clientX - startX - currentX) > 3 || Math.abs(e.clientY - startY - currentY) > 3) {
      hasMoved = true;
    }
    
    if (hasMoved) {
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      
      pill.style.transform = `translate(${currentX}px, ${currentY}px)`;

      const pillRect = pill.getBoundingClientRect();
      const dismissRect = dismissZone.getBoundingClientRect();
      
      const isColliding = !(
        pillRect.right < dismissRect.left ||
        pillRect.left > dismissRect.right ||
        pillRect.bottom < dismissRect.top ||
        pillRect.top > dismissRect.bottom
      );

      if (isColliding) {
        dismissZone.classList.add('hover');
      } else {
        dismissZone.classList.remove('hover');
      }
    }
  });

  pill.addEventListener('pointerup', (e) => {
    if (!isDragging || isPipActive) return;
    isDragging = false;
    pill.releasePointerCapture(e.pointerId);
    pill.classList.remove('dragging');
    dismissZone.classList.remove('visible');
    
    const isHoveringDismiss = dismissZone.classList.contains('hover');
    dismissZone.classList.remove('hover');

    if (isHoveringDismiss) {
      pill.classList.add('dismissing');
      
      try {
        if (chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({ type: "SET_VISIBILITY", payload: false }, () => chrome.runtime.lastError);
        }
      } catch (err) {}
      
      setTimeout(() => {
        pill.classList.remove('dismissing');
        currentX = 0; currentY = 0;
        pill.style.transform = `translate(0px, 0px) scale(1)`;
      }, 300);
      return;
    }

    if (!hasMoved) {
      try {
        if (chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({ type: 'FOCUS_CLAUDE' }, () => chrome.runtime.lastError);
        }
      } catch (err) {}
    }
  });

  return {
    container,
    pill,
    statusText: shadow.getElementById('status-text'),
    sparkle: shadow.querySelector('.sparkle-svg')
  };
}

const STATE_CONFIGS = {
  idle:           { label: 'Idle',                 icon: 'grey' },
  thinking:       { label: 'Claude is thinking…',  icon: 'active' },
  streaming_text: { label: 'Writing…',             icon: 'active' },
  streaming_code: { label: 'Writing code…',        icon: 'active' },
  error:          { label: 'Something went wrong', icon: 'error' },
  done:           { label: 'Done',                 icon: 'grey' },
  disconnected:   { label: 'Disconnected',         icon: 'grey' }
};

function updateUI(state) {
  if (!ui) return;
  currentGlobalState = state.state;
  const config = STATE_CONFIGS[state.state] || STATE_CONFIGS.idle;

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

function setVisibility(isVisible) {
  if (!ui) return;
  // If PiP is active, we don't touch the container visibility, 
  // but if it's inactive, we respect the global state.
  if (!document.pictureInPictureElement) {
     ui.container.style.display = isVisible ? 'block' : 'none';
  }
}

// Init
ui = injectUI();

try {
  if (chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response) {
        if (response.state) updateUI(response.state);
        if (response.isVisible !== undefined) setVisibility(response.isVisible);
      }
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATE' && msg.payload?.state) {
        updateUI(msg.payload);
      }
      if (msg.type === 'VISIBILITY_UPDATE') {
        setVisibility(msg.payload);
      }
    });
  }
} catch (e) {}
