# Symbiote

Desktop overlay that bonds to your Claude.ai browser window and renders live generation state.

```
Extension (content.js)          background.js           Tauri (ws_server.rs)         Overlay (index.html)
┌─────────────────────┐       ┌──────────────┐       ┌─────────────────────┐       ┌──────────────────┐
│ DOM mutations        │──────▶│ MV3 service  │──WS──▶│ tokio-tungstenite   │──WS──▶│ CSS pill + SVG   │
│ SSE fetch intercept  │       │ worker       │◀──WS──│ broadcast relay     │◀──WS──│ click → focus    │
│ State machine (6 st) │       │ reconnect    │       │ port 7429           │       │ state animations │
└─────────────────────┘       └──────────────┘       └─────────────────────┘       └──────────────────┘
                                                              │
                                                     window_tracker.rs
                                                     Win32 EnumWindows / macOS osascript
                                                     10 Hz polling → overlay.bond_to_rect()
```

## How it works

1. **Content script** observes DOM mutations and intercepts SSE `fetch` streams on `claude.ai` to detect state transitions in real time — stop button presence, code block growth heuristics, and 1.5s silence timeout for stream-end detection.

2. **Background service worker** maintains a persistent WebSocket to `ws://127.0.0.1:7429` with exponential backoff reconnect (500ms → 5s cap). A 24-second keepalive alarm prevents MV3 service worker termination.

3. **Tauri WS server** (`tokio-tungstenite`) accepts multiple clients and broadcasts every message to all other connected peers — this is how extension state reaches the overlay, and how the overlay's `focus_claude` click command reaches back to the extension.

4. **Window tracker** polls `Win32::EnumWindows` (Windows) or `osascript` (macOS) at 10 Hz, locates the browser window whose title contains "Claude", and positions the transparent always-on-top overlay pill at its bottom edge.

5. **Clicking the pill** sends `{ command: "focus_claude" }` back through the WS bridge → extension calls `chrome.tabs.update()` to bring the Claude tab into focus.

## State machine

```
IDLE → THINKING → STREAMING_TEXT ↔ STREAMING_CODE → DONE → IDLE
             ↘ ERROR ↗
```

| State | Trigger | Visual |
|---|---|---|
| `idle` | No stop button, no error | Muted icon, "Idle" |
| `thinking` | Thinking dots visible, no stop button | Animated gradient text + spinning icon |
| `streaming_text` | Stop button present, no active code block | Pulsing icon, "Writing…" |
| `streaming_code` | Stop button + code block actively growing | Gold icon, "Writing code…" |
| `error` | `[role="alert"]` detected or fetch rejection | Red icon, "Something went wrong" |
| `done` | Stop button disappears → 2s → idle | "Done ✓" then fades to idle |

## Stack

| Layer | Tech | Why |
|---|---|---|
| Desktop app | Tauri 2.0 (Rust) | 3MB binary, native window control, no Electron bloat |
| Window tracking | Win32 `EnumWindows` / macOS `osascript` | Zero-dependency OS window rect polling |
| IPC | `tokio-tungstenite` on port 7429 | Async bidirectional relay, <1ms latency |
| State detection | MV3 content script | DOM observer + SSE intercept — no page injection |
| Overlay UI | Vanilla HTML/CSS/SVG | Zero JS dependencies in production |

## Quick start

### Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri CLI
cargo install tauri-cli --version "^2.0"

# Windows: WebView2 (pre-installed on Win11)
# macOS: Xcode Command Line Tools
xcode-select --install
```

### Development

```bash
cargo tauri dev
```

### Production build

```bash
# Windows — NSIS installer
cargo tauri build --bundles nsis

# macOS — DMG
cargo tauri build --bundles dmg
```

Binaries land in `src-tauri/target/release/bundle/`.

### Browser extension

1. `chrome://extensions` → Developer mode → **Load unpacked**
2. Select the project root (where `manifest.json` lives)
3. Navigate to `claude.ai` — the extension activates automatically

## Project structure

```
symbiote/
├── src-tauri/src/
│   ├── lib.rs              # Tauri app setup, tray icon, event wiring
│   ├── overlay.rs          # Window position, click-through, show/hide
│   ├── ws_server.rs        # tokio-tungstenite WS server — broadcast relay
│   └── window_tracker.rs   # OS window polling (Win32 / osascript)
├── index.html              # Overlay UI — pill + state animations
├── manifest.json           # MV3 extension manifest
├── content.js              # DOM observer + SSE intercept + state machine
└── background.js           # Service worker — WS client + tab focus handler
```

## Cargo release profile

```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = "symbols"

[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
  "Win32_Foundation",
  "Win32_UI_WindowsAndMessaging",
]}
```

## Known limitations

- macOS `osascript` window detection has ~100ms latency — a `CGWindowListCopyWindowInfo` C binding would be faster
- Linux not supported — Wayland transparent overlays require compositor-specific APIs
- Extension icons are placeholders — need production icon assets at 16/48/128px

## License

MIT
