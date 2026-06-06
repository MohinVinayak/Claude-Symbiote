# ⬡ Symbiote

> Liquid-glass desktop overlay that bonds to your Claude window and renders live generation state.

## Stack

| Layer | Tech |
|---|---|
| Desktop app | Tauri 2 (Rust + WebView2 / WKWebView) |
| Renderer | Three.js — WebGL refraction shader |
| IPC bridge | tokio-tungstenite WebSocket on `ws://127.0.0.1:7429` |
| Browser extension | MV3 (Chrome / Arc / Firefox) |
| Companion | Canvas 2D pixel-art sprite (48×64px) |

## Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri CLI
cargo install tauri-cli --version "^2.0"

# Node 18+
node --version

# macOS: Xcode Command Line Tools
xcode-select --install

# Windows: WebView2 (pre-installed on Win11, download for Win10)
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

## Development

```bash
# Install JS deps
npm install

# Run dev mode (hot-reload WebView + Rust watcher)
cargo tauri dev
```

## Build

```bash
# macOS — produces .dmg (notarized if signing identity set)
cargo tauri build

# Windows — produces NSIS .exe installer
cargo tauri build
```

Binaries land in `src-tauri/target/release/bundle/`.

## Browser Extension

1. Open `chrome://extensions` (or `about:debugging` in Firefox)
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Navigate to `claude.ai` — the extension activates automatically

### Firefox

Firefox requires a slight manifest tweak (already compatible with MV3):
```
about:debugging → This Firefox → Load Temporary Add-on → extension/manifest.json
```

## Project Structure

```
symbiote/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # entry point
│   │   ├── lib.rs           # app setup, tray, event wiring
│   │   ├── overlay.rs       # window position, click-through, opacity
│   │   ├── ws_server.rs     # tokio-tungstenite WS server (port 7429)
│   │   └── window_tracker.rs # OS window polling (Win32 / AppKit)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── ui/src/
│   ├── main.js              # frontend entry, Tauri event listeners
│   ├── pill.js              # Three.js liquid glass capsule + GLSL shader
│   ├── oscilloscope.js      # EKG canvas — one spike per token chunk
│   ├── companion.js         # pixel-art sprite, 6 animation states
│   └── settings.js          # opacity / position / companion toggle panel
├── extension/
│   ├── manifest.json        # MV3
│   ├── src/
│   │   ├── content.js       # DOM observer + SSE intercept + state machine
│   │   └── background.js    # service worker — WS client + reconnect
│   └── popup.html / popup.js
├── index.html
├── vite.config.js
└── package.json
```

## Windows-specific Cargo deps

Add to `src-tauri/Cargo.toml` for Win32 window enumeration:

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
  "Win32_Foundation",
  "Win32_UI_WindowsAndMessaging",
]}
```

## Known limitations / TODO

- [ ] macOS AppleScript window detection has ~100ms latency — replace with CGWindowList C bindings for accuracy
- [ ] Companion sprites are placeholder programmatic drawings — swap `_drawState()` for a real PNG spritesheet
- [ ] `set_pill_edge` Tauri command not yet implemented (settings panel edge selector is wired up, Rust side is a stub)
- [ ] Linux not supported (Wayland transparent overlay requires compositor-specific APIs)
- [ ] Extension popup status (`GET_STATUS` message) not yet handled in background.js — background needs a status cache

## License

MIT
