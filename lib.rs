use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{Menu, MenuItem},
};

mod ws_server;
mod window_tracker;
mod overlay;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;

            // Build tray icon — starts visible (overlay hidden)
            TrayIconBuilder::with_id("main")
                .tooltip("Symbiote")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    handle_tray_menu(app, event.id().as_ref());
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        overlay::toggle(app);
                    }
                })
                .build(app)?;

            // Start WebSocket server on port 7429 in background
            let ws_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                ws_server::run(ws_handle).await;
            });

            // Start window tracker — polls every 100ms for Claude browser window
            let tracker_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                window_tracker::run(tracker_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            overlay::set_position,
            overlay::set_opacity,
            overlay::set_click_through,
            overlay::show_overlay,
            overlay::hide_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("error running symbiote");
}

fn handle_tray_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "show" => overlay::toggle(app),
        "settings" => {
            // Emit event to frontend to open settings panel
            let _ = app.emit("open-settings", ());
        }
        "quit" => app.exit(0),
        _ => {}
    }
}
