use crate::agent::protocol::{AgentMessage, BrowserMessage, MessageType};
use crate::agent::webrtc::WebRTCManager;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

pub type BrowserSendCallback = Box<dyn Fn(AgentMessage) -> Result<()> + Send + Sync>;

/// Bridge bridges WebRTC data channels to WebSocket messages
pub struct Bridge {
    data_channels: Arc<RwLock<std::collections::HashMap<String, Arc<webrtc::data_channel::RTCDataChannel>>>>,
    browser_send: Arc<RwLock<Option<BrowserSendCallback>>>,
    webrtc: Arc<WebRTCManager>,
}

impl Bridge {
    /// Create a new bridge
    pub fn new(webrtc: Arc<WebRTCManager>) -> Self {
        let bridge = Self {
            data_channels: Arc::new(RwLock::new(std::collections::HashMap::new())),
            browser_send: Arc::new(RwLock::new(None)),
            webrtc: webrtc.clone(),
        };

        // Set up WebRTC callbacks
        let data_channels = bridge.data_channels.clone();
        let browser_send = bridge.browser_send.clone();
        let webrtc_clone = webrtc.clone();

        tokio::spawn(async move {
            webrtc_clone
                .set_on_data_channel(Box::new(move |peer_id: String, dc: Arc<webrtc::data_channel::RTCDataChannel>| {
                    let data_channels = data_channels.clone();
                    let browser_send = browser_send.clone();
                    let peer_id_clone = peer_id.clone();
                    let dc_clone = dc.clone();

                    tokio::spawn(async move {
                        info!("Data channel registered: peer={}, state={:?}", peer_id, dc.ready_state());
                        
                        // Register the data channel
                        data_channels.write().await.insert(peer_id.clone(), dc_clone.clone());

                        // Set up message handler
                        let peer_id_msg = peer_id.clone();
                        let browser_send_msg = browser_send.clone();
                        dc.on_message(Box::new(move |msg: webrtc::data_channel::DataChannelMessage| {
                            let peer_id = peer_id_msg.clone();
                            let browser_send = browser_send_msg.clone();
                            
                            tokio::spawn(async move {
                                let data = match msg {
                                    webrtc::data_channel::DataChannelMessage::Binary(data) => data,
                                    webrtc::data_channel::DataChannelMessage::Text(text) => text.into_bytes(),
                                };
                                
                                info!("Received data channel message: peer={}, size={}", peer_id, data.len());
                                
                                let agent_msg = AgentMessage::data(peer_id.clone(), data);
                                if let Some(ref callback) = *browser_send.read().await {
                                    if let Err(e) = callback(agent_msg) {
                                        error!("Failed to send message to browser: {}", e);
                                    }
                                }
                            });
                        }));

                        // Check if already open
                        if dc.ready_state() == webrtc::data_channel::RTCDataChannelState::Open {
                            info!("Data channel already open: peer={}", peer_id);
                            let agent_msg = AgentMessage::peer_connected(peer_id.clone());
                            if let Some(ref callback) = *browser_send.read().await {
                                let _ = callback(agent_msg);
                            }
                        }

                        // Set up open handler
                        let peer_id_open = peer_id.clone();
                        let browser_send_open = browser_send.clone();
                        dc.on_open(Box::new(move || {
                            let peer_id = peer_id_open.clone();
                            let browser_send = browser_send_open.clone();
                            
                            tokio::spawn(async move {
                                info!("Data channel opened: peer={}", peer_id);
                                let agent_msg = AgentMessage::peer_connected(peer_id.clone());
                                if let Some(ref callback) = *browser_send.read().await {
                                    let _ = callback(agent_msg);
                                }
                            });
                        }));

                        // Set up close handler
                        let peer_id_close = peer_id.clone();
                        let browser_send_close = browser_send.clone();
                        let data_channels_close = data_channels.clone();
                        dc.on_close(Box::new(move || {
                            let peer_id = peer_id_close.clone();
                            let browser_send = browser_send_close.clone();
                            let data_channels = data_channels_close.clone();
                            
                            tokio::spawn(async move {
                                info!("Data channel closed: peer={}", peer_id);
                                data_channels.write().await.remove(&peer_id);
                                let agent_msg = AgentMessage::peer_disconnected(peer_id.clone());
                                if let Some(ref callback) = *browser_send.read().await {
                                    let _ = callback(agent_msg);
                                }
                            });
                        }));
                    });
                }))
                .await;
        });

        let webrtc_peer_connected = webrtc.clone();
        let browser_send_peer_connected = bridge.browser_send.clone();
        tokio::spawn(async move {
            webrtc_peer_connected
                .set_on_peer_connected(Box::new(move |peer_id: String| {
                    info!("Peer connected: peer={}", peer_id);
                    // Wait for data channel to be ready
                    // The data channel open event will send the peer-connected message
                }))
                .await;
        });

        let webrtc_peer_closed = webrtc.clone();
        let browser_send_peer_closed = bridge.browser_send.clone();
        let data_channels_peer_closed = bridge.data_channels.clone();
        tokio::spawn(async move {
            webrtc_peer_closed
                .set_on_peer_closed(Box::new(move |peer_id: String| {
                    let browser_send = browser_send_peer_closed.clone();
                    let data_channels = data_channels_peer_closed.clone();
                    
                    tokio::spawn(async move {
                        info!("Peer closed: peer={}", peer_id);
                        data_channels.write().await.remove(&peer_id);
                        let agent_msg = AgentMessage::peer_disconnected(peer_id.clone());
                        if let Some(ref callback) = *browser_send.read().await {
                            let _ = callback(agent_msg);
                        }
                    });
                }))
                .await;
        });

        bridge
    }

    /// Set the function to send messages to the browser
    pub async fn set_browser_send(&self, callback: BrowserSendCallback) {
        *self.browser_send.write().await = Some(callback);
    }

    /// Handle a message from the browser
    pub async fn handle_browser_message(&self, msg: BrowserMessage) -> Result<()> {
        info!(
            "Received browser message: type={}, peerId={:?}, dataSize={:?}",
            msg.message_type,
            msg.peer_id,
            msg.data.as_ref().map(|d| d.len())
        );

        match MessageType::from_str(&msg.message_type) {
            Some(MessageType::Data) => {
                let data = msg.data.unwrap_or_default();
                if data.is_empty() {
                    warn!("Received empty data message");
                    return Ok(());
                }

                let peer_id = msg.peer_id.clone();
                info!(
                    "Sending data to peer: peer={:?}, size={}, isBroadcast={}",
                    peer_id,
                    data.len(),
                    peer_id.is_none()
                );

                if let Some(ref pid) = peer_id {
                    // Send to specific peer
                    if let Err(e) = self.webrtc.send_data(pid, &data).await {
                        warn!("Failed to send data to peer: peer={}, error={}", pid, e);
                        return Err(e);
                    }
                } else {
                    // Broadcast to all peers
                    self.webrtc.broadcast_data(&data).await;
                }
            }
            _ => {
                warn!("Unknown browser message type: {}", msg.message_type);
            }
        }

        Ok(())
    }

    /// Send welcome message to the browser with self ID
    pub async fn send_welcome(&self, self_id: String) {
        let agent_msg = AgentMessage::welcome(self_id);
        if let Some(ref callback) = *self.browser_send.read().await {
            if let Err(e) = callback(agent_msg) {
                error!("Failed to send welcome message: {}", e);
            }
        }
    }

    /// Get connected peers
    pub async fn get_connected_peers(&self) -> Vec<String> {
        let data_channels = self.data_channels.read().await;
        data_channels
            .iter()
            .filter(|(_, dc)| dc.ready_state() == webrtc::data_channel::RTCDataChannelState::Open)
            .map(|(peer_id, _)| peer_id.clone())
            .collect()
    }
}

