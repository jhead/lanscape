use crate::tailscale::TailscaleInfo;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use futures_util::Future;
use std::pin::Pin;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_candidate_type::RTCIceCandidateType;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use bytes::Bytes;

// Re-export types for use in other modules
pub use webrtc::ice_transport::ice_candidate::RTCIceCandidate;
pub use webrtc::data_channel::data_channel_state::RTCDataChannelState;
pub use webrtc::data_channel::data_channel_message::DataChannelMessage;

pub type OnDataChannelCallback = Box<dyn Fn(String, Arc<webrtc::data_channel::RTCDataChannel>) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>;
pub type OnPeerConnectedCallback = Box<dyn Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>;
pub type OnPeerClosedCallback = Box<dyn Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>;
pub type OnICECandidateCallback = Box<dyn Fn(String, RTCIceCandidate) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>;

/// WebRTCManager manages WebRTC peer connections
pub struct WebRTCManager {
    peers: Arc<RwLock<HashMap<String, Arc<PeerConnection>>>>,
    api: Arc<webrtc::api::API>,
    on_data_channel: Arc<RwLock<Option<OnDataChannelCallback>>>,
    on_peer_connected: Arc<RwLock<Option<OnPeerConnectedCallback>>>,
    on_peer_closed: Arc<RwLock<Option<OnPeerClosedCallback>>>,
    on_ice_candidate: Arc<RwLock<Option<OnICECandidateCallback>>>,
}

/// PeerConnection wraps a WebRTC peer connection
pub struct PeerConnection {
    pub id: String,
    pub pc: Arc<RTCPeerConnection>,
    pub data_channel: Arc<RwLock<Option<Arc<webrtc::data_channel::RTCDataChannel>>>>,
}

impl WebRTCManager {
    /// Create a new WebRTC manager
    pub fn new(tailscale_info: Option<TailscaleInfo>) -> Result<Self> {
        let mut m = MediaEngine::default();
        m.register_default_codecs()?;

        let mut registry = Registry::new();
        registry = register_default_interceptors(registry, &mut m)?;

        let mut setting_engine = webrtc::api::setting_engine::SettingEngine::default();
        
        // Configure NAT 1:1 IP mapping with Tailscale IP
        if let Some(ref ts_info) = tailscale_info {
            setting_engine.set_nat_1to1_ips(vec![ts_info.ip.to_string()], RTCIceCandidateType::Host);
            info!("Configured NAT 1:1 IP mapping: ip={}", ts_info.ip);
        }

        let api = APIBuilder::new()
            .with_media_engine(m)
            .with_interceptor_registry(registry)
            .with_setting_engine(setting_engine)
            .build();

        Ok(Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            api: Arc::new(api),
            on_data_channel: Arc::new(RwLock::new(None)),
            on_peer_connected: Arc::new(RwLock::new(None)),
            on_peer_closed: Arc::new(RwLock::new(None)),
            on_ice_candidate: Arc::new(RwLock::new(None)),
        })
    }

    /// Set callback for when a data channel is opened
    pub async fn set_on_data_channel(&self, callback: OnDataChannelCallback) {
        *self.on_data_channel.write().await = Some(callback);
    }

    /// Set callback for when a peer connects
    pub async fn set_on_peer_connected(&self, callback: OnPeerConnectedCallback) {
        *self.on_peer_connected.write().await = Some(callback);
    }

    /// Set callback for when a peer disconnects
    pub async fn set_on_peer_closed(&self, callback: OnPeerClosedCallback) {
        *self.on_peer_closed.write().await = Some(callback);
    }

    /// Set callback for when an ICE candidate is generated
    pub async fn set_on_ice_candidate(&self, callback: OnICECandidateCallback) {
        *self.on_ice_candidate.write().await = Some(callback);
    }

    /// Create a new peer connection
    pub async fn create_peer_connection(
        &self,
        peer_id: String,
        is_initiator: bool,
    ) -> Result<Arc<PeerConnection>> {
        let mut peers = self.peers.write().await;

        // Check if peer already exists
        if let Some(existing) = peers.get(&peer_id) {
            return Ok(existing.clone());
        }

        // Create peer connection configuration
        let config = RTCConfiguration {
            ice_servers: vec![],
            ..Default::default()
        };

        // Create peer connection
        let pc = Arc::new(
            self.api
                .new_peer_connection(config)
                .await
                .context("Failed to create peer connection")?,
        );

        let peer_conn = Arc::new(PeerConnection {
            id: peer_id.clone(),
            pc: pc.clone(),
            data_channel: Arc::new(RwLock::new(None)),
        });

        // Clone callbacks for use in closures
        let on_data_channel = self.on_data_channel.clone();
        let on_peer_connected = self.on_peer_connected.clone();
        let on_peer_closed = self.on_peer_closed.clone();
        let on_ice_candidate = self.on_ice_candidate.clone();
        let peers_map = self.peers.clone();

        // Create data channel if we're the initiator
        if is_initiator {
            let dc_arc = pc
                .create_data_channel("yjs-sync", None)
                .await
                .context("Failed to create data channel")?;

            *peer_conn.data_channel.write().await = Some(dc_arc.clone());
            self.setup_data_channel(&peer_id, dc_arc.clone()).await;

            // Notify bridge about the data channel
            if let Some(ref callback) = *on_data_channel.read().await {
                callback(peer_id.clone(), dc_arc.clone()).await;
            }
        }

        // Handle incoming data channels
        let peer_conn_clone = peer_conn.clone();
        let peer_id_clone = peer_id.clone();
        let on_data_channel_clone = on_data_channel.clone();
        pc.on_data_channel(Box::new(move |dc: Arc<webrtc::data_channel::RTCDataChannel>| {
            info!("Received data channel: peer={}", peer_id_clone);
            let dc_arc = dc;
            let peer_conn = peer_conn_clone.clone();
            let peer_id = peer_id_clone.clone();
            let on_data_channel = on_data_channel_clone.clone();
            
            Box::pin(async move {
                *peer_conn.data_channel.write().await = Some(dc_arc.clone());
                // Setup will be done in the callback
                if let Some(ref callback) = *on_data_channel.read().await {
                    callback(peer_id.clone(), dc_arc.clone()).await;
                }
            })
        }));

        // Handle connection state changes
        let peer_id_clone = peer_id.clone();
        let on_peer_connected_clone = on_peer_connected.clone();
        let on_peer_closed_clone = on_peer_closed.clone();
        let peers_map_clone = peers_map.clone();
        let peer_id_state = peer_id_clone.clone();
        pc.on_peer_connection_state_change(Box::new(move |s: RTCPeerConnectionState| {
            let peer_id_clone_inner = peer_id_state.clone();
            info!("Peer connection state changed: peer={}, state={:?}", peer_id_clone_inner, s);
            let peer_id = peer_id_clone_inner.clone();
            let on_peer_connected = on_peer_connected_clone.clone();
            let on_peer_closed = on_peer_closed_clone.clone();
            let peers_map = peers_map_clone.clone();

            Box::pin(async move {
                match s {
                    RTCPeerConnectionState::Connected => {
                        if let Some(ref callback) = *on_peer_connected.read().await {
                            callback(peer_id.clone()).await;
                        }
                    }
                    RTCPeerConnectionState::Closed | RTCPeerConnectionState::Failed => {
                        let mut peers = peers_map.write().await;
                        peers.remove(&peer_id);
                        if let Some(ref callback) = *on_peer_closed.read().await {
                            callback(peer_id.clone()).await;
                        }
                    }
                    _ => {}
                }
            })
        }));

        // Track ICE candidates and send via signaling
        let peer_id_clone = peer_id.clone();
        let on_ice_candidate_clone = on_ice_candidate.clone();
        pc.on_ice_candidate(Box::new(move |candidate: Option<RTCIceCandidate>| {
            if let Some(candidate) = candidate {
                debug!("ICE candidate: peer={}, candidate={}", peer_id_clone, candidate.to_string());
                let peer_id = peer_id_clone.clone();
                let candidate_clone = candidate;
                let on_ice_candidate = on_ice_candidate_clone.clone();
                
                Box::pin(async move {
                    if let Some(ref callback) = *on_ice_candidate.read().await {
                        callback(peer_id.clone(), candidate_clone).await;
                    }
                })
            } else {
                Box::pin(async {})
            }
        }));

        peers.insert(peer_id.clone(), peer_conn.clone());
        Ok(peer_conn)
    }

    /// Setup event handlers for a data channel
    async fn setup_data_channel(
        &self,
        peer_id: &str,
        dc: Arc<webrtc::data_channel::RTCDataChannel>,
    ) {
        let peer_id_open = peer_id.to_string();
        let peer_id_close = peer_id.to_string();
        let peer_id_error = peer_id.to_string();

        dc.on_open(Box::new(move || {
            let peer_id = peer_id_open.clone();
            
            Box::pin(async move {
                info!("Data channel opened: peer={}", peer_id);
            })
        }));

        dc.on_close(Box::new(move || {
            let peer_id = peer_id_close.clone();
            Box::pin(async move {
                info!("Data channel closed: peer={}", peer_id);
            })
        }));

        dc.on_error(Box::new(move |err: webrtc::Error| {
            let peer_id = peer_id_error.clone();
            Box::pin(async move {
                error!("Data channel error: peer={}, error={}", peer_id, err);
            })
        }));
    }

    /// Get an existing peer connection
    pub async fn get_peer_connection(&self, peer_id: &str) -> Result<Arc<PeerConnection>> {
        let peers = self.peers.read().await;
        peers
            .get(peer_id)
            .cloned()
            .context(format!("Peer not found: {}", peer_id))
    }

    /// Close a peer connection
    pub async fn close_peer(&self, peer_id: &str) {
        let mut peers = self.peers.write().await;
        if let Some(peer) = peers.remove(peer_id) {
            if let Some(dc) = peer.data_channel.read().await.clone() {
                let _ = dc.close().await;
            }
            let _ = peer.pc.close().await;
            info!("Closed peer connection: peer={}", peer_id);

            if let Some(ref callback) = *self.on_peer_closed.read().await {
                callback(peer_id.to_string()).await;
            }
        }
    }

    /// Close all peer connections
    pub async fn close_all(&self) {
        let mut peers = self.peers.write().await;
        for (peer_id, peer) in peers.drain() {
            if let Some(dc) = peer.data_channel.read().await.clone() {
                let _ = dc.close().await;
            }
            let _ = peer.pc.close().await;
            debug!("Closed peer connection: peer={}", peer_id);
        }
    }

    /// Create an SDP offer for a peer
    pub async fn create_offer(&self, peer_id: &str) -> Result<RTCSessionDescription> {
        let peer = self.get_peer_connection(peer_id).await?;
        let offer = peer
            .pc
            .create_offer(None)
            .await
            .context("Failed to create offer")?;

        peer.pc
            .set_local_description(offer.clone())
            .await
            .context("Failed to set local description")?;

        Ok(offer)
    }

    /// Set the remote SDP description
    pub async fn set_remote_description(
        &self,
        peer_id: &str,
        desc: RTCSessionDescription,
    ) -> Result<()> {
        let peer = self.get_peer_connection(peer_id).await?;
        peer.pc
            .set_remote_description(desc)
            .await
            .context("Failed to set remote description")
    }

    /// Create an SDP answer for a peer
    pub async fn create_answer(&self, peer_id: &str) -> Result<RTCSessionDescription> {
        let peer = self.get_peer_connection(peer_id).await?;
        let answer = peer
            .pc
            .create_answer(None)
            .await
            .context("Failed to create answer")?;

        peer.pc
            .set_local_description(answer.clone())
            .await
            .context("Failed to set local description")?;

        Ok(answer)
    }

    /// Add an ICE candidate to a peer connection
    pub async fn add_ice_candidate(
        &self,
        peer_id: &str,
        candidate: RTCIceCandidate,
    ) -> Result<()> {
        let peer = self.get_peer_connection(peer_id).await?;
        // Convert RTCIceCandidate to RTCIceCandidateInit
        // RTCIceCandidate has a to_json() method that returns RTCIceCandidateInit
        let candidate_init = candidate.to_json()
            .context("Failed to convert ICE candidate")?;
        peer.pc
            .add_ice_candidate(candidate_init)
            .await
            .context("Failed to add ICE candidate")
    }

    /// Send data to a peer via data channel
    pub async fn send_data(&self, peer_id: &str, data: &[u8]) -> Result<()> {
        let peer = self.get_peer_connection(peer_id).await?;
        let dc = peer
            .data_channel
            .read()
            .await
            .clone()
            .context(format!("Data channel not available for peer: {}", peer_id))?;

        if dc.ready_state() != RTCDataChannelState::Open {
            anyhow::bail!("Data channel not open for peer: {}", peer_id);
        }

        dc.send(&Bytes::from(data.to_vec()))
            .await
            .map(|_| ())
            .context("Failed to send data")
    }

    /// Broadcast data to all connected peers
    pub async fn broadcast_data(&self, data: &[u8]) {
        let peers = self.peers.read().await;
        for (peer_id, peer) in peers.iter() {
            if let Some(dc) = peer.data_channel.read().await.clone() {
                if dc.ready_state() == RTCDataChannelState::Open {
                    if let Err(e) = dc
                        .send(&Bytes::from(data.to_vec()))
                        .await
                    {
                        warn!("Failed to broadcast to peer: peer={}, error={}", peer_id, e);
                    }
                }
            }
        }
    }
}

