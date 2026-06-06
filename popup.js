/**
 * popup.js — logic for the extension popup pill.
 *
 * Fetches current state from background on open,
 * and listens for live updates while the popup is visible.
 */

const STATES = {
  idle:           { label: 'Idle',                 icon: 'grey' },
  thinking:       { label: 'Claude is thinking…',  icon: 'active' },
  streaming_text: { label: 'Writing…',             icon: 'active' },
  streaming_code: { label: 'Writing code…',        icon: 'active' },
  error:          { label: 'Something went wrong', icon: 'error' },
  done:           { label: 'Done',                 icon: 'grey' },
  disconnected:   { label: 'Disconnected',         icon: 'grey' }
};

const pill = document.getElementById('pill-container');
const statusText = document.getElementById('status-text');
const sparkle = document.querySelector('.sparkle-svg');

function setState(state) {
  const config = STATES[state] || STATES.idle;

  pill.classList.remove('active', 'error');

  if (config.icon === 'active') {
    pill.classList.add('active');
    sparkle.style.fill = '';
  } else if (config.icon === 'error') {
    pill.classList.add('error');
    sparkle.style.fill = '';
  } else {
    sparkle.style.fill = '#7f7f7f';
  }

  statusText.textContent = config.label;
}

// Click → focus the Claude tab
pill.addEventListener('click', () => {
  chrome.tabs.query({ url: '*://*.claude.ai/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    }
  });
});

// Get current state on popup open
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (response && response.state) {
    setState(response.state);
  }
});

// Listen for live state updates while popup is open
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE' && msg.payload?.state) {
    setState(msg.payload.state);
  }
});

// Init
setState('idle');
