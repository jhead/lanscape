use crate::protocol::{AgentMessage, BrowserMessage};
use crate::session::BrowserSession;
use crate::tailscale::TailscaleInfo;
use anyhow::{Context, Result};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
    routing::get,
    Router,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// WebSocketServer handles browser WebSocket connections
pub struct WebSocketServer {
    pub addr: String,
    signaling_url: String,
    topic: String,
    tailscale_info: Option<TailscaleInfo>,
    sessions: Arc<RwLock<HashMap<String, Arc<BrowserSession>>>>,
}

impl WebSocketServer {
    /// Create a new WebSocket server
    pub fn new(
        addr: String,
        signaling_url: String,
        topic: String,
        tailscale_info: Option<TailscaleInfo>,
    ) -> Self {
        Self {
            addr,
            signaling_url,
            topic,
            tailscale_info,
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start the WebSocket server
    pub async fn start(&self) -> Result<()> {
        let sessions = self.sessions.clone();
        let signaling_url = self.signaling_url.clone();
        let topic = self.topic.clone();
        let tailscale_info = self.tailscale_info.clone();

        let app = Router::new()
            .route("/", get(handle_websocket))
            .with_state(ServerState {
                sessions: sessions.clone(),
                signaling_url: signaling_url.clone(),
                topic: topic.clone(),
                tailscale_info: tailscale_info.clone(),
            });

        let addr: SocketAddr = self.addr.parse().context("Invalid address")?;
        info!("Starting WebSocket server: addr={}", addr);

        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .context("Failed to bind to address")?;

        axum::serve(listener, app)
            .await
            .context("Server error")?;

        Ok(())
    }

    /// Stop the WebSocket server
    pub async fn stop(&self) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        for (_, session) in sessions.drain() {
            if let Err(e) = session.stop().await {
                warn!("Error stopping session: {}", e);
            }
        }
        Ok(())
    }
}

#[derive(Clone)]
struct ServerState {
    sessions: Arc<RwLock<HashMap<String, Arc<BrowserSession>>>>,
    signaling_url: String,
    topic: String,
    tailscale_info: Option<TailscaleInfo>,
}

async fn handle_websocket(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: ServerState) {
    let (sender, mut receiver) = socket.split();
    let session_id = uuid::Uuid::new_v4().to_string();

    // Create a new browser session for this connection
    let session = match BrowserSession::new(
        state.signaling_url.clone(),
        state.topic.clone(),
        state.tailscale_info.clone(),
    )
    .await
    {
        Ok(s) => Arc::new(s),
        Err(e) => {
            error!("Failed to create browser session: {}", e);
            let sender_wrapped = Arc::new(tokio::sync::Mutex::new(sender));
            let mut sender_guard = sender_wrapped.lock().await;
            let _ = sender_guard
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 1011u16.into(),
                    reason: "Failed to create session".into(),
                })))
                .await;
            return;
        }
    };

    // Set up bridge to send messages to this browser
    let bridge = session.get_bridge();
    let sender = Arc::new(tokio::sync::Mutex::new(sender));
    let sender_for_bridge = sender.clone();
    bridge
        .set_browser_send(Box::new(move |msg: AgentMessage| -> Result<()> {
            let sender = sender_for_bridge.clone();
            tokio::spawn(async move {
                match serde_json::to_string(&msg) {
                    Ok(text) => {
                        let mut sender_guard = sender.lock().await;
                        if let Err(e) = sender_guard.send(Message::Text(text)).await {
                            error!("Failed to send message to browser: {}", e);
                        }
                    }
                    Err(e) => {
                        error!("Failed to serialize message: {}", e);
                    }
                }
            });
            Ok(())
        }))
        .await;

    // Connect to signaling server
    if let Err(e) = session.connect().await {
        error!("Failed to connect to signaling: {}", e);
        let mut sender_guard = sender.lock().await;
        let _ = sender_guard
            .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                code: 1011u16.into(),
                reason: "Failed to connect to signaling".into(),
            })))
            .await;
        return;
    }

    state
        .sessions
        .write()
        .await
        .insert(session_id.clone(), session.clone());

    let sender_for_errors = sender.clone();
    info!("Browser connected, waiting for signaling welcome");

    // Handle messages from browser
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<BrowserMessage>(&text) {
                    Ok(browser_msg) => {
                        if let Err(e) = bridge.handle_browser_message(browser_msg).await {
                            warn!("Failed to handle browser message: {}", e);
                            let error_msg = AgentMessage::error(e.to_string());
                            if let Ok(text) = serde_json::to_string(&error_msg) {
                                let mut sender_guard = sender_for_errors.lock().await;
                                let _ = sender_guard.send(Message::Text(text)).await;
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse browser message: {}", e);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                debug!("Browser disconnected");
                break;
            }
            Err(e) => {
                debug!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    state.sessions.write().await.remove(&session_id);
    session.disconnect().await;
    info!("Browser disconnected");
}

use futures_util::{SinkExt, StreamExt};

