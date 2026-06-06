# Symbiote — Claude Monitor

Symbiote is a sleek, cross-browser extension (Chrome & Firefox) that monitors your Claude.ai generation state and displays it in a beautiful, globally-floating pill on your screen.

Never wonder if Claude has finished writing again! Keep working in your IDE or browsing other tabs while Symbiote keeps you informed.

## Features

- **Global Overlay:** A stunning, dark-themed floating pill injected into every tab.
- **Live Status:** Tracks `Idle`, `Thinking...`, `Writing...`, `Writing code...`, `Error`, and `Done`.
- **Smart "Done" State:** If Claude finishes while you are on another tab, the pill will display "Done" indefinitely until you switch back to the Claude tab, ensuring you never miss a completion.
- **Multi-Tab Support:** Have multiple Claude tabs open? Symbiote intelligently prioritizes actively generating tabs over idle ones.
- **Drag-to-Dismiss (Global Hide):** Click and drag the pill to move it around. Drag it to the bottom "Trash" zone to dismiss it. This hides the pill globally across all tabs!
- **Master Toggle:** Click the Symbiote extension icon in your browser toolbar to instantly hide or show the overlay globally.
- **Click-to-Focus:** Click the pill (without dragging) to instantly jump back to your active Claude tab.
- **Picture-in-Picture (Pop Out):** Click the "Pop Out" icon to spawn a real OS-level window that floats over your entire desktop (even over other apps like VS Code or Spotify!).

## Architecture

Symbiote is a 100% pure browser extension built with Manifest V3. It does not require any desktop companion apps to run.

- `content.js`: Injected into `claude.ai` to monitor DOM mutations for generation states.
- `intercept.js`: Injected into `claude.ai`'s `MAIN` world to intercept Server-Sent Events (SSE) for zero-latency chunk detection.
- `background.js`: The central Service Worker that manages global state, handles multi-tab logic, and broadcasts updates.
- `global_ui.js`: Injected into `<all_urls>` to render the Shadow DOM floating pill, drag logic, and PiP window management.

## Installation for Development

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the folder containing this repository.
4. Refresh your tabs to see the pill!

## Publishing to Web Stores

The `manifest.json` is configured to be cross-compatible with both Chrome and Firefox out of the box.

### Chrome Web Store
1. Zip the extension files: `manifest.json`, `background.js`, `content.js`, `intercept.js`, `global_ui.js`, and the `icons/` folder.
2. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
3. Create a **New Item**, upload the `.zip` file, and fill out the store listing details.
4. Under Privacy, declare the "Storage" and "Tabs" permissions.

### Firefox Add-ons (AMO)
1. Zip the exact same files as above.
2. Go to the [Firefox Extension Workshop Developer Hub](https://addons.mozilla.org/en-US/developers/).
3. Submit a new Add-on, upload the `.zip`, and wait for the automated linter to approve the pure JavaScript files.
4. Note: The `manifest.json` already contains the required `browser_specific_settings` block for Firefox.

## Permissions Required
- `tabs`: Used to query open tabs for broadcasting state updates and jumping to the active Claude tab.
- `storage`: Used to persist the global UI visibility state (so if you hide the pill, it stays hidden on reload).
- `alarms`: Used to keep the background service worker alive while Claude is generating.
- `host_permissions`: `<all_urls>` to inject the floating pill everywhere, and `*://*.claude.ai/*` for monitoring generation.
