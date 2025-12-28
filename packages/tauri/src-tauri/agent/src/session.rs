use crate::bridge::Bridge;
use crate::signaling::SignalingClient;
use crate::tailscale::TailscaleInfo;
use crate::webrtc::{WebRTCManager, RTCIceCandidate};
use anyhow::Result;
use std::sync::Arc;
use tracing::info;

/// BrowserSession represents a single browser connection with its own WebRTC and signaling
pub struct BrowserSession {
    webrtc: Arc<WebRTCManager>,
    signaling: Arc<SignalingClient>,
    bridge: Arc<Bridge>,
}

impl BrowserSession {
    /// Create a new browser session with its own WebRTC and signaling
    pub async fn new(
        signaling_url: String,
        topic: String,
        tailscale_info: Option<TailscaleInfo>,
    ) -> Result<Self> {
        // Create WebRTC manager for this session
        let webrtc = Arc::new(WebRTCManager::new(tailscale_info)?);

        // Create signaling client for this session
        let signaling = Arc::new(SignalingClient::new(
            signaling_url.clone(),
            topic.clone(),
            webrtc.clone(),
        ));

        // Create bridge
        let bridge = Arc::new(Bridge::new(webrtc.clone()));

        // Set up signaling callback to send welcome to browser when received
        let bridge_welcome = bridge.clone();
        signaling
            .set_on_welcome(Box::new(move |self_id: String| {
                let bridge = bridge_welcome.clone();
                tokio::spawn(async move {
                    bridge.send_welcome(self_id).await;
                });
            }))
            .await;

        // Set up ICE candidate callback
        let signaling_ice = signaling.clone();
        webrtc
            .set_on_ice_candidate(Box::new(move |peer_id: String, candidate: RTCIceCandidate| {
                let signaling = signaling_ice.clone();
                Box::pin(async move {
                    if let Err(e) = signaling.send_ice_candidate(&peer_id, candidate).await {
                        tracing::warn!("Failed to send ICE candidate: peer={}, error={}", peer_id, e);
                    }
                })
            }))
            .await;

        Ok(Self {
            webrtc,
            signaling,
            bridge,
        })
    }

    /// Connect to the signaling server
    pub async fn connect(&self) -> Result<()> {
        self.signaling.connect().await
    }

    /// Disconnect from signaling and close all peer connections
    pub async fn disconnect(&self) {
        self.signaling.disconnect().await;
        self.webrtc.close_all().await;
    }

    /// Get the bridge for this session
    pub fn get_bridge(&self) -> Arc<Bridge> {
        self.bridge.clone()
    }

    /// Get self peer ID from signaling
    pub async fn get_self_id(&self) -> Option<String> {
        self.signaling.get_self_id().await
    }

    /// Stop the session
    pub async fn stop(&self) -> Result<()> {
        self.disconnect().await;
        Ok(())
    }
}

