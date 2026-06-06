use tauri::{AppHandle, Runtime};
use tokio::time::{sleep, Duration};

/// Polls every 100ms for a browser window whose title contains "Claude"
/// On bond: calls overlay::bond_to_rect
/// On loss: calls overlay::unbond
pub async fn run<R: Runtime>(app: AppHandle<R>) {
    let mut bonded = false;
    let mut last_rect: Option<(i32, i32, u32, u32)> = None;

    loop {
        sleep(Duration::from_millis(100)).await;

        match find_claude_window().await {
            Some(rect) => {
                // A4 FIX: Only call bond_to_rect when the rect actually changed
                if last_rect.as_ref() != Some(&rect) {
                    let (x, y, w, h) = rect;
                    crate::overlay::bond_to_rect(&app, x, y, w, h);
                    last_rect = Some(rect);
                }
                bonded = true;
            }
            None => {
                if bonded {
                    crate::overlay::unbond(&app);
                    bonded = false;
                    last_rect = None;
                }
            }
        }
    }
}

/// Returns (x, y, width, height) of the Claude browser window, or None.
/// Platform-specific implementations below.
async fn find_claude_window() -> Option<(i32, i32, u32, u32)> {
    #[cfg(target_os = "windows")]
    return tokio::task::spawn_blocking(windows_find_claude).await.ok().flatten();

    #[cfg(target_os = "macos")]
    return macos_find_claude().await;

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    None
}

// ─── Windows ────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn windows_find_claude() -> Option<(i32, i32, u32, u32)> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowRect, GetWindowTextW, IsWindowVisible,
    };

    struct FindState {
        result: Option<(i32, i32, u32, u32)>,
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam.0 as *mut FindState);

        if IsWindowVisible(hwnd).as_bool() {
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut buf);
            if len > 0 {
                let title = OsString::from_wide(&buf[..len as usize])
                    .to_string_lossy()
                    .to_lowercase();
                if title.contains("claude") {
                    let mut rect = RECT::default();
                    if GetWindowRect(hwnd, &mut rect).is_ok() {
                        let w = (rect.right - rect.left) as u32;
                        let h = (rect.bottom - rect.top) as u32;
                        if w > 400 && h > 300 {
                            state.result = Some((rect.left, rect.top, w, h));
                            return BOOL(0); // stop enumeration
                        }
                    }
                }
            }
        }
        BOOL(1) // continue
    }

    let mut state = FindState { result: None };
    unsafe {
        let _ = EnumWindows(
            Some(enum_callback),
            LPARAM(&mut state as *mut _ as isize),
        );
    }
    state.result
}

// ─── macOS ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
async fn macos_find_claude() -> Option<(i32, i32, u32, u32)> {
    use tokio::process::Command;
    use tokio::time::timeout;

    // Use AppleScript to find frontmost browser window with "Claude" in title
    let script = r#"
        tell application "System Events"
            set browserApps to {"Google Chrome", "Arc", "Firefox"}
            repeat with appName in browserApps
                if exists (application process appName) then
                    tell application process appName
                        repeat with w in windows
                            if title of w contains "Claude" then
                                set pos to position of w
                                set sz to size of w
                                return (item 1 of pos) & "," & (item 2 of pos) & "," & (item 1 of sz) & "," & (item 2 of sz)
                            end if
                        end repeat
                    end tell
                end if
            end repeat
        end tell
        return ""
    "#;

    // A1 FIX: tokio::process::Command (non-blocking) + 200ms timeout guard
    let output = timeout(
        Duration::from_millis(200),
        Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output(),
    )
    .await
    .ok()?  // timeout elapsed → None
    .ok()?; // process error → None

    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        return None;
    }

    // Parse "x,y,w,h"
    let parts: Vec<i64> = s.split(',')
        .filter_map(|p| p.trim().parse().ok())
        .collect();

    if parts.len() == 4 {
        Some((parts[0] as i32, parts[1] as i32, parts[2] as u32, parts[3] as u32))
    } else {
        None
    }
}
