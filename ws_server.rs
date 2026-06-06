use std::net::SocketAddr;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};

/// Schema sent by the browser extension
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ExtensionEvent {
    pub state: String,        // "idle" | "thinking" | "streaming_text" | "streaming_code" | "error" | "done"
    pub event: String,        // "state_change" | "chunk" | "code_block_open" | "code_block_close" | "network_error"
    pub ts_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

pub async fn run<R: Runtime>(app: AppHandle<R>) {
    let addr: SocketAddr = "127.0.0.1:7429".parse().unwrap();

    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            log_debug("WS server listening on ws://127.0.0.1:7429");
            l
        }
        Err(e) => {
            eprintln!("[symbiote] WS bind error: {e}");
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                log_debug(&format!("extension connected from {peer}"));
                let handle = app.clone();
                tokio::spawn(handle_connection(stream, handle));
            }
            Err(e) => {
                eprintln!("[symbiote] accept error: {e}");
            }
        }
    }
}

async fn handle_connection<R: Runtime>(stream: TcpStream, app: AppHandle<R>) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[symbiote] WS handshake error: {e}");
            return;
        }
    };

    let (mut _tx, mut rx) = ws.split();

    // Notify frontend that extension is connected
    let _ = app.emit("extension-connected", ());

    while let Some(msg) = rx.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<ExtensionEvent>(&text) {
                    Ok(evt) => {
                        // Forward parsed event to frontend WebView
                        let _ = app.emit("claude-event", evt);
                    }
                    Err(e) => {
                        eprintln!("[symbiote] bad event JSON: {e} — raw: {text}");
                    }
                }
            }
            Ok(Message::Close(_)) | Err(_) => {
                log_debug("extension disconnected");
                let _ = app.emit("extension-disconnected", ());
                break;
            }
            _ => {} // ping/pong handled by tungstenite
        }
    }
}

fn log_debug(msg: &str) {
    #[cfg(debug_assertions)]
    eprintln!("[symbiote] {msg}");
}
