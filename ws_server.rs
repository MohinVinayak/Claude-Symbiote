use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, mpsc};
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

type Clients = Arc<Mutex<HashMap<SocketAddr, mpsc::UnboundedSender<Message>>>>;

pub async fn run<R: Runtime>(app: AppHandle<R>) {
    let addr: SocketAddr = "127.0.0.1:7429".parse().unwrap();
    let clients: Clients = Arc::new(Mutex::new(HashMap::new()));

    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            log_debug("WS server listening on ws://127.0.0.1:7429");
            l
        }
        Err(e) => {
            eprintln!("[symbiote] WS bind error: {e}");
            let _ = app.emit("ws-bind-error", e.to_string());
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                log_debug(&format!("client connected from {peer}"));
                let handle = app.clone();
                let clients = clients.clone();
                tokio::spawn(handle_connection(stream, peer, handle, clients));
            }
            Err(e) => {
                eprintln!("[symbiote] accept error: {e}");
            }
        }
    }
}

async fn handle_connection<R: Runtime>(
    stream: TcpStream,
    peer: SocketAddr,
    app: AppHandle<R>,
    clients: Clients,
) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[symbiote] WS handshake error: {e}");
            return;
        }
    };

    let (mut ws_tx, mut ws_rx) = ws.split();

    // Create a channel for sending messages TO this client
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register this client
    {
        let mut map = clients.lock().await;
        map.insert(peer, tx);
    }

    // Notify frontend that a client connected
    let _ = app.emit("extension-connected", ());

    // Spawn a task to forward channel messages to the WS sink
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Read incoming messages
    while let Some(msg) = ws_rx.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                // Try to parse as an ExtensionEvent (from the browser extension)
                if let Ok(evt) = serde_json::from_str::<ExtensionEvent>(&text) {
                    // Forward parsed event to frontend WebView
                    let _ = app.emit("claude-event", evt);
                }

                // Broadcast to ALL OTHER connected clients.
                // A5 FIX: collect senders under lock, release, then send.
                let targets: Vec<_> = {
                    let map = clients.lock().await;
                    map.iter()
                        .filter(|(addr, _)| **addr != peer)
                        .map(|(_, tx)| tx.clone())
                        .collect()
                };
                for tx in targets {
                    let _ = tx.send(Message::Text(text.clone()));
                }
            }
            Ok(Message::Close(_)) | Err(_) => {
                log_debug(&format!("client {peer} disconnected"));
                break;
            }
            _ => {} // ping/pong handled by tungstenite
        }
    }

    // Cleanup
    {
        let mut map = clients.lock().await;
        map.remove(&peer);
    }
    let _ = app.emit("extension-disconnected", ());
    send_task.abort();
}

fn log_debug(msg: &str) {
    #[cfg(debug_assertions)]
    eprintln!("[symbiote] {msg}");
}
