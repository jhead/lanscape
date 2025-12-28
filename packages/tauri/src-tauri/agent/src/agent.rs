use crate::tailscale::{get_tailscale_info_optional, TailscaleInfo};
use crate::websocket::WebSocketServer;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

/// Config holds agent configuration
#[derive(Debug, Clone)]
pub struct Config {
    pub websocket_addr: String,
    pub signaling_url: String,
    pub topic: String,
    pub tailscale_info: Option<TailscaleInfo>,
}

impl Config {
    /// Create a new config with Tailscale info detection
    pub fn new(
        websocket_addr: String,
        signaling_url: String,
        topic: String,
    ) -> Self {
        let tailscale_info = get_tailscale_info_optional();
        Self {
            websocket_addr,
            signaling_url,
            topic,
            tailscale_info,
        }
    }
}

/// Agent orchestrates all components
pub struct Agent {
    ws_server: Arc<WebSocketServer>,
    tailscale_info: Option<TailscaleInfo>,
}

impl Agent {
    /// Create a new agent
    pub fn new(config: Config) -> Result<Self> {
        let ws_server = Arc::new(WebSocketServer::new(
            config.websocket_addr.clone(),
            config.signaling_url.clone(),
            config.topic.clone(),
            config.tailscale_info.clone(),
        ));

        Ok(Self {
            ws_server,
            tailscale_info: config.tailscale_info,
        })
    }

    /// Start the agent
    pub async fn start(&self) -> Result<()> {
        info!("Starting agent");

        // Start WebSocket server in background task
        let ws_server = self.ws_server.clone();
        tokio::spawn(async move {
            if let Err(e) = ws_server.start().await {
                tracing::error!("WebSocket server error: {}", e);
            }
        });

        // Wait a bit for server to start
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        info!("Agent started: websocket={}", self.ws_server.addr);

        Ok(())
    }

    /// Stop the agent
    pub async fn stop(&self) -> Result<()> {
        info!("Stopping agent");

        // Stop WebSocket server (this will disconnect all sessions)
        if let Err(e) = self.ws_server.stop().await {
            tracing::warn!("Error stopping WebSocket server: {}", e);
        }

        Ok(())
    }

    /// Run the agent until interrupted
    pub async fn run(&self) -> Result<()> {
        self.start().await?;

        // Wait for interrupt signal
        tokio::signal::ctrl_c().await?;
        info!("Received interrupt signal");

        // Graceful shutdown
        let shutdown_timeout = tokio::time::Duration::from_secs(10);
        tokio::time::timeout(shutdown_timeout, self.stop())
            .await
            .unwrap_or_else(|_| {
                tracing::warn!("Shutdown timeout exceeded");
                Ok(())
            })
    }
}

