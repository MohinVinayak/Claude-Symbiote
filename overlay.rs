use tauri::{AppHandle, Emitter, Manager, Runtime, PhysicalPosition, PhysicalSize};

/// Show the overlay window
#[tauri::command]
pub fn show_overlay<R: Runtime>(app: AppHandle<R>) {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Hide the overlay — user goes to tray
#[tauri::command]
pub fn hide_overlay<R: Runtime>(app: AppHandle<R>) {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.hide();
    }
}

/// Toggle overlay visibility
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("overlay") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
        }
    }
}

/// Set overlay window position (called from Rust window tracker or frontend)
#[tauri::command]
pub fn set_position<R: Runtime>(app: AppHandle<R>, x: i32, y: i32) {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
}

/// Set overlay opacity 0.0–1.0 (used for disconnect dim)
#[tauri::command]
pub fn set_opacity<R: Runtime>(app: AppHandle<R>, opacity: f64) {
    // Emit to frontend — WebView handles CSS opacity transition
    let _ = app.emit("set-opacity", opacity);
}

/// Enable / disable click-through (pass mouse events to window below)
/// Windows: WS_EX_TRANSPARENT + WS_EX_LAYERED via raw HWND
/// macOS: ignoresMouseEvents
#[tauri::command]
pub fn set_click_through<R: Runtime>(app: AppHandle<R>, enabled: bool) {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.set_ignore_cursor_events(enabled);
    }
}

/// Called by window_tracker when it finds / loses the Claude window.
/// Positions the overlay pill at the bottom edge of the target window.
pub fn bond_to_rect<R: Runtime>(
    app: &AppHandle<R>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) {
    if let Some(win) = app.get_webview_window("overlay") {
        // Pill: 280px wide, 52px tall, centred on bottom edge
        let pill_w: u32 = 280;
        let pill_h: u32 = 52;
        let pill_x = x + (width as i32 / 2) - (pill_w as i32 / 2);
        let pill_y = y + height as i32 - pill_h as i32 - 8; // 8px inset from bottom

        let _ = win.set_position(PhysicalPosition::new(pill_x, pill_y));
        let _ = win.set_size(PhysicalSize::new(pill_w, pill_h));
        let _ = win.show();

        // Tell frontend about new geometry so spring physics can update
        let _ = app.emit("window-bonded", serde_json::json!({
            "x": pill_x, "y": pill_y,
            "targetW": width, "targetH": height,
        }));
    }
}

/// Called when Claude window disappears
pub fn unbond<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit("window-unbonded", ());
    hide_overlay(app.clone());
}
